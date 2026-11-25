package com.musicmatch.jukebox;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.content.pm.PackageManager;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.media.audiofx.AudioEffect;
import android.media.audiofx.Visualizer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLConnection;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String TAG = "MusicMatch";
    private static final String APP_HOST = "jukebox.local";
    private static final String APP_ORIGIN = "https://" + APP_HOST;
    private static final String APP_URL = APP_ORIGIN + "/index.html";
    private static final String PREFERENCES = "musicmatch_settings";
    private static final String PLAYLISTS_KEY = "playlists";
    private static final int FILE_CHOOSER_REQUEST = 301;
    private static final int STORAGE_PERMISSION_REQUEST = 302;
    private static final int VISUALIZER_PERMISSION_REQUEST = 303;
    private static final String[] AUDIO_PROJECTION = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.YEAR,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.MIME_TYPE
    };

    private final Map<String, Uri> mediaResources = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private MediaPlayer nativePlayer;
    private Visualizer nativeVisualizer;
    private boolean nativePlayerPrepared;
    private boolean permissionRequestPending;
    private boolean visualizerPermissionRequestPending;
    private final Runnable reportPlaybackProgress = new Runnable() {
        @Override
        public void run() {
            MediaPlayer player = nativePlayer;
            if (player == null || !nativePlayerPrepared || !player.isPlaying()) return;

            String script = "window.MusicMatchNativeProgress&&window.MusicMatchNativeProgress("
                    + (player.getCurrentPosition() / 1000.0) + ","
                    + (player.getDuration() / 1000.0) + ");";
            if (webView != null) webView.evaluateJavascript(script, null);
            mainHandler.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildAppWindow();
        loadLocalApp();
    }

    private void buildAppWindow() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xff08121d);

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(12), 0, dp(8), 0);
        toolbar.setBackgroundColor(0xff1b2e41);

        TextView title = new TextView(this);
        title.setText("MUSICMATCH JUKEBOX");
        title.setTextColor(0xfff0f7fc);
        title.setTextSize(14);
        title.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));

        Button reloadButton = new Button(this);
        reloadButton.setText("Buscar músicas");
        reloadButton.setAllCaps(false);
        reloadButton.setOnClickListener(view -> {
            if (webView != null) webView.reload();
        });
        toolbar.addView(reloadButton, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)));

        webView = new WebView(this);
        webView.setBackgroundColor(0xff08121d);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebViewClient(new LocalAppWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (android.content.ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this, "Não há um seletor de arquivos disponível.",
                            Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        root.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));
        root.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    private void loadLocalApp() {
        if (hasAudioPermission()) {
            webView.loadUrl(APP_URL);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !permissionRequestPending) {
            permissionRequestPending = true;
            requestPermissions(requiredStoragePermissions(), STORAGE_PERMISSION_REQUEST);
        }
    }

    private void startNativeVisualizer() {
        MediaPlayer player = nativePlayer;
        if (!hasVisualizerPermission() || player == null || !nativePlayerPrepared) return;

        releaseNativeVisualizer();
        try {
            final Visualizer visualizer = new Visualizer(player.getAudioSessionId());
            nativeVisualizer = visualizer;
            int[] captureSizeRange = Visualizer.getCaptureSizeRange();
            int captureSizeStatus = visualizer.setCaptureSize(captureSizeRange[1]);
            if (captureSizeStatus != AudioEffect.SUCCESS) {
                throw new IllegalStateException("Visualizer rejected capture size: "
                        + captureSizeStatus);
            }
            visualizer.setDataCaptureListener(new Visualizer.OnDataCaptureListener() {
                @Override
                public void onWaveFormDataCapture(Visualizer source, byte[] waveform, int samplingRate) {
                    reportVisualizerLevel(visualizer, waveform);
                }

                @Override
                public void onFftDataCapture(Visualizer source, byte[] fft, int samplingRate) {
                }
            }, Visualizer.getMaxCaptureRate(), true, false);

            int enableStatus = visualizer.setEnabled(true);
            if (enableStatus != AudioEffect.SUCCESS) {
                throw new IllegalStateException("Visualizer could not be enabled: " + enableStatus);
            }
        } catch (IllegalArgumentException | IllegalStateException | SecurityException
                 | UnsupportedOperationException error) {
            Visualizer failedVisualizer = nativeVisualizer;
            nativeVisualizer = null;
            if (failedVisualizer != null) failedVisualizer.release();
            Log.w(TAG, "Não foi possível iniciar o VU sincronizado.", error);
            Toast.makeText(this, "Não foi possível sincronizar o VU; a animação continuará.",
                    Toast.LENGTH_LONG).show();
        }
    }

    private void reportVisualizerLevel(Visualizer source, byte[] waveform) {
        if (waveform.length == 0) return;
        long sumSquares = 0;
        for (byte sample : waveform) {
            int centeredSample = (sample & 0xff) - 128;
            sumSquares += (long) centeredSample * centeredSample;
        }
        double rms = Math.sqrt((double) sumSquares / waveform.length);
        double level = Math.min(1.0, rms / 64.0);
        WebView currentWebView = webView;
        if (currentWebView == null) return;

        String script = "window.MusicMatchNativeVU&&window.MusicMatchNativeVU(" + level + ");";
        currentWebView.post(() -> {
            if (nativeVisualizer == source) currentWebView.evaluateJavascript(script, null);
        });
    }

    private void releaseNativeVisualizer() {
        Visualizer visualizer = nativeVisualizer;
        nativeVisualizer = null;
        if (visualizer != null) {
            visualizer.setEnabled(false);
            visualizer.release();
        }
    }

    private boolean hasAudioPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        String permission = Build.VERSION.SDK_INT >= 33
                ? Manifest.permission.READ_MEDIA_AUDIO
                : Manifest.permission.READ_EXTERNAL_STORAGE;
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasVisualizerPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestNativeVisualizerPermission() {
        if (hasVisualizerPermission()) {
            startNativeVisualizer();
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !visualizerPermissionRequestPending) {
            visualizerPermissionRequestPending = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},
                    VISUALIZER_PERMISSION_REQUEST);
        }
    }

    private String[] requiredStoragePermissions() {
        List<String> permissions = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33) {
            permissions.add(Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            if (Build.VERSION.SDK_INT <= 28) {
                permissions.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
        }
        return permissions.toArray(new String[0]);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == VISUALIZER_PERMISSION_REQUEST) {
            visualizerPermissionRequestPending = false;
            if (hasVisualizerPermission()) {
                startNativeVisualizer();
            } else {
                Toast.makeText(this, "O VU continuará animado, mas sem sincronização com o áudio.",
                        Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode != STORAGE_PERMISSION_REQUEST) return;
        permissionRequestPending = false;
        if (!hasAudioPermission()) {
            Toast.makeText(this, "Permita o acesso aos arquivos de áudio para buscar músicas.",
                    Toast.LENGTH_LONG).show();
        }
        webView.loadUrl(APP_URL);
    }

    private List<String> audioVolumes() {
        Set<String> volumes = new LinkedHashSet<>();
        if (Build.VERSION.SDK_INT >= 29) {
            volumes.addAll(MediaStore.getExternalVolumeNames(this));
        } else {
            volumes.add("external");
            volumes.add("external_sd");
        }
        return new ArrayList<>(volumes);
    }

    private Uri audioCollection(String volume) {
        return Uri.parse("content://media/" + Uri.encode(volume) + "/audio/media");
    }

    private JSONObject scanMusic() {
        JSONObject result = new JSONObject();
        JSONArray tracks = new JSONArray();
        JSONArray errors = new JSONArray();
        Set<String> seenPaths = new LinkedHashSet<>();
        int scannedVolumes = 0;
        mediaResources.clear();

        if (!hasAudioPermission()) {
            return errorJson("Acesso ao armazenamento negado. Permita o acesso aos arquivos de áudio.");
        }

        for (String volume : audioVolumes()) {
            Uri collection = audioCollection(volume);
            try (Cursor cursor = getContentResolver().query(
                    collection,
                    AUDIO_PROJECTION,
                    MediaStore.Audio.Media.IS_MUSIC + " != 0",
                    null,
                    MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC")) {
                if (cursor == null) {
                    errors.put(volume + ": biblioteca indisponível");
                    continue;
                }
                scannedVolumes++;

                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int durationColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DURATION);
                int trackColumn = cursor.getColumnIndex(MediaStore.Audio.Media.TRACK);
                int yearColumn = cursor.getColumnIndex(MediaStore.Audio.Media.YEAR);
                int pathColumn = cursor.getColumnIndex(MediaStore.Audio.Media.DATA);
                int albumIdColumn = cursor.getColumnIndex(MediaStore.Audio.Media.ALBUM_ID);
                int mimeColumn = cursor.getColumnIndex(MediaStore.Audio.Media.MIME_TYPE);

                while (cursor.moveToNext()) {
                    long mediaId = cursor.getLong(idColumn);
                    Uri contentUri = ContentUris.withAppendedId(collection, mediaId);
                    String mediaKey = volume + "_" + mediaId;

                    String path = pathColumn >= 0 ? cursor.getString(pathColumn) : null;
                    if (path == null || path.isEmpty()) path = contentUri.toString();
                    if (!seenPaths.add(path)) continue;
                    mediaResources.put(mediaKey, contentUri);
                    String title = cursor.getString(titleColumn);
                    String filename = path.substring(path.lastIndexOf('/') + 1);
                    if (filename.isEmpty()) filename = title;

                    JSONObject track = new JSONObject();
                    track.put("id", "android_" + mediaKey);
                    track.put("filename", filename);
                    track.put("fullPath", path);
                    track.put("contentUri", contentUri.toString());
                    track.put("folder", path.contains("/")
                            ? path.substring(0, path.lastIndexOf('/'))
                            : "Armazenamento do tablet");
                    track.put("streamUrl", APP_ORIGIN + "/media/" + Uri.encode(mediaKey));
                    track.put("title", title);
                    track.put("artist", cursor.getString(artistColumn));
                    track.put("album", cursor.getString(albumColumn));
                    track.put("duration", durationColumn >= 0 ? cursor.getLong(durationColumn) / 1000.0 : 0);
                    track.put("track", trackColumn >= 0 ? cursor.getString(trackColumn) : "");
                    track.put("year", yearColumn >= 0 ? cursor.getString(yearColumn) : "");
                    track.put("genre", "");
                    track.put("mimeType", mimeColumn >= 0 ? cursor.getString(mimeColumn) : "audio/mpeg");

                    long albumId = albumIdColumn >= 0 ? cursor.getLong(albumIdColumn) : -1;
                    if (albumId >= 0) {
                        String coverKey = "cover_" + mediaKey.substring(0, mediaKey.lastIndexOf('_') + 1) + albumId;
                        Uri coverUri = Uri.parse("content://media/" + Uri.encode(volume)
                                + "/audio/albumart/" + albumId);
                        mediaResources.put(coverKey, coverUri);
                        track.put("coverUrl", APP_ORIGIN + "/cover/" + Uri.encode(coverKey));
                    } else {
                        track.put("coverUrl", JSONObject.NULL);
                    }
                    tracks.put(track);
                }
            } catch (SecurityException error) {
                errors.put(volume + ": sem permissão");
                Log.w(TAG, "Sem permissão para consultar volume " + volume, error);
            } catch (RuntimeException | JSONException error) {
                errors.put(volume + ": " + error.getMessage());
                Log.w(TAG, "Falha ao consultar volume " + volume, error);
            }
        }

        if (scannedVolumes == 0) {
            return errorJson(errors.length() > 0
                    ? errors.optString(0)
                    : "Nenhum armazenamento de músicas disponível.");
        }

        try {
            Log.i(TAG, "Biblioteca local: " + tracks.length() + " músicas em "
                    + scannedVolumes + " armazenamento(s).");
            result.put("success", true);
            result.put("storageCount", scannedVolumes);
            result.put("count", tracks.length());
            result.put("tracks", tracks);
            result.put("scanErrorCount", errors.length());
            result.put("scanErrors", errors);
            return result;
        } catch (JSONException error) {
            return errorJson("Não foi possível montar a biblioteca: " + error.getMessage());
        }
    }

    private JSONObject errorJson(String message) {
        JSONObject result = new JSONObject();
        try {
            result.put("success", false);
            result.put("error", message);
        } catch (JSONException ignored) {
            Log.e(TAG, "Não foi possível criar resposta de erro.", ignored);
        }
        return result;
    }

    private WebResourceResponse interceptRequest(Uri requestUri, Map<String, String> requestHeaders) {
        if (!APP_HOST.equals(requestUri.getHost())) return null;
        String path = requestUri.getPath();

        if (path.startsWith("/media/") || path.startsWith("/cover/")) {
            String prefix = path.startsWith("/media/") ? "/media/" : "/cover/";
            Uri contentUri = mediaResources.get(Uri.decode(path.substring(prefix.length())));
            String range = null;
            for (Map.Entry<String, String> header : requestHeaders.entrySet()) {
                if ("range".equalsIgnoreCase(header.getKey())) {
                    range = header.getValue();
                    break;
                }
            }
            return contentUri == null
                    ? missingMediaResponse()
                    : openMediaResponse(contentUri, range);
        }

        String assetPath = path.startsWith("/") ? path.substring(1) : path;
        if (assetPath.isEmpty()) assetPath = "index.html";
        if (assetPath.contains("../") || assetPath.equals("..")) {
            return response(403, "Forbidden", "text/plain", "Caminho inválido");
        }
        try {
            InputStream stream = getAssets().open(assetPath);
            return new WebResourceResponse(mimeType(assetPath), "UTF-8", stream);
        } catch (IOException error) {
            return response(404, "Not Found", "text/plain", "Recurso não encontrado");
        }
    }

    private WebResourceResponse openMediaResponse(Uri uri, String rangeHeader) {
        try {
            AssetFileDescriptor descriptor = getContentResolver().openAssetFileDescriptor(uri, "r");
            if (descriptor == null) return response(404, "Not Found", "text/plain", "Mídia indisponível");

            long length = descriptor.getLength();
            InputStream stream = descriptor.createInputStream();
            String mime = getContentResolver().getType(uri);
            if (mime == null) mime = "application/octet-stream";
            Log.i(TAG, "Servindo áudio local: tipo=" + mime + ", tamanho=" + length
                    + ", intervalo=" + (rangeHeader == null ? "não" : "sim"));

            Map<String, String> headers = new ConcurrentHashMap<>();
            headers.put("Accept-Ranges", "bytes");
            if (length >= 0) headers.put("Content-Length", String.valueOf(length));

            if (rangeHeader != null && length >= 0) {
                long[] range = parseRange(rangeHeader, length);
                if (range == null) {
                    stream.close();
                    return response(416, "Range Not Satisfiable", "text/plain", "Intervalo inválido");
                }
                skipFully(stream, range[0]);
                long rangeLength = range[1] - range[0] + 1;
                headers.put("Content-Length", String.valueOf(rangeLength));
                headers.put("Content-Range", "bytes " + range[0] + "-" + range[1] + "/" + length);
                return new WebResourceResponse(mime, null, 206, "Partial Content",
                        headers, new BoundedInputStream(stream, rangeLength));
            }
            return new WebResourceResponse(mime, null, 200, "OK", headers, stream);
        } catch (SecurityException error) {
            return response(403, "Forbidden", "text/plain", "Sem permissão para ler este arquivo");
        } catch (IOException error) {
            Log.w(TAG, "Falha ao abrir mídia " + uri, error);
            return response(404, "Not Found", "text/plain", "Não foi possível abrir o arquivo");
        }
    }

    private WebResourceResponse missingMediaResponse() {
        Log.w(TAG, "Solicitação de áudio sem mapeamento local.");
        return response(404, "Not Found", "text/plain", "Arquivo não encontrado");
    }

    private long[] parseRange(String header, long length) {
        Matcher matcher = Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(header.trim());
        if (!matcher.matches() || length <= 0) return null;
        try {
            long start;
            long end;
            if (matcher.group(1).isEmpty()) {
                long suffixLength = Long.parseLong(matcher.group(2));
                if (suffixLength <= 0) return null;
                start = Math.max(0, length - suffixLength);
                end = length - 1;
            } else {
                start = Long.parseLong(matcher.group(1));
                end = matcher.group(2).isEmpty()
                        ? length - 1
                        : Math.min(Long.parseLong(matcher.group(2)), length - 1);
            }
            return start <= end && start < length ? new long[]{start, end} : null;
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private void skipFully(InputStream stream, long count) throws IOException {
        long remaining = count;
        while (remaining > 0) {
            long skipped = stream.skip(remaining);
            if (skipped > 0) {
                remaining -= skipped;
            } else if (stream.read() == -1) {
                throw new IOException("Fim inesperado do arquivo.");
            } else {
                remaining--;
            }
        }
    }

    private WebResourceResponse response(int status, String reason, String mime, String message) {
        byte[] body = message.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Map<String, String> headers = Collections.singletonMap("Content-Length", String.valueOf(body.length));
        return new WebResourceResponse(mime, "UTF-8", status, reason, headers,
                new ByteArrayInputStream(body));
    }

    private String mimeType(String path) {
        String guessed = URLConnection.guessContentTypeFromName(path);
        if (guessed != null) return guessed;
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }

    private String savedPlaylists() {
        return getSharedPreferences(PREFERENCES, MODE_PRIVATE)
                .getString(PLAYLISTS_KEY, "[]");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileChooserCallback != null) {
            Uri[] results = resultCode == RESULT_OK && data != null
                    ? WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                    : null;
            fileChooserCallback.onReceiveValue(results);
            fileChooserCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        releaseNativePlayer();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean isKnownAudioUri(Uri uri) {
        if (!"media".equals(uri.getAuthority())) return false;
        for (Map.Entry<String, Uri> resource : mediaResources.entrySet()) {
            if (!resource.getKey().startsWith("cover_") && uri.equals(resource.getValue())) return true;
        }
        return false;
    }

    private void startNativePlayback(Uri uri, float volume) {
        releaseNativePlayer();
        MediaPlayer player = new MediaPlayer();
        nativePlayer = player;
        nativePlayerPrepared = false;
        player.setAudioStreamType(AudioManager.STREAM_MUSIC);
        float safeVolume = Float.isNaN(volume) ? 1f : Math.max(0f, Math.min(volume, 1f));
        player.setVolume(safeVolume, safeVolume);
        player.setOnPreparedListener(preparedPlayer -> {
            if (nativePlayer != preparedPlayer) return;
            nativePlayerPrepared = true;
            preparedPlayer.start();
            startNativeVisualizer();
            notifyWebPlayback("playing", "");
            mainHandler.removeCallbacks(reportPlaybackProgress);
            mainHandler.post(reportPlaybackProgress);
        });
        player.setOnCompletionListener(completedPlayer -> {
            if (nativePlayer != completedPlayer) return;
            nativePlayerPrepared = false;
            releaseNativeVisualizer();
            mainHandler.removeCallbacks(reportPlaybackProgress);
            notifyWebPlayback("ended", "");
        });
        player.setOnErrorListener((failedPlayer, what, extra) -> {
            if (nativePlayer == failedPlayer) {
                releaseNativePlayer();
                notifyWebPlayback("error", "Falha de áudio (" + what + ", " + extra + ").");
            }
            return true;
        });

        try {
            player.setDataSource(this, uri);
            player.prepareAsync();
        } catch (IOException | IllegalArgumentException | SecurityException error) {
            releaseNativePlayer();
            notifyWebPlayback("error", "Não foi possível abrir este arquivo de áudio.");
            Log.w(TAG, "Falha ao iniciar reprodução nativa de áudio.", error);
        }
    }

    private void pauseNativePlayback() {
        MediaPlayer player = nativePlayer;
        if (player == null || !nativePlayerPrepared || !player.isPlaying()) return;
        player.pause();
        mainHandler.removeCallbacks(reportPlaybackProgress);
        notifyWebPlayback("paused", "");
    }

    private void stopNativePlayback() {
        releaseNativePlayer();
        notifyWebPlayback("stopped", "");
    }

    private void seekNativePlayback(float seconds) {
        MediaPlayer player = nativePlayer;
        if (player == null || !nativePlayerPrepared || Float.isNaN(seconds)) return;
        int position = Math.max(0, Math.min((int) (seconds * 1000), player.getDuration()));
        player.seekTo(position);
    }

    private void setNativePlaybackVolume(float volume) {
        MediaPlayer player = nativePlayer;
        if (player == null || Float.isNaN(volume)) return;
        float safeVolume = Math.max(0f, Math.min(volume, 1f));
        player.setVolume(safeVolume, safeVolume);
    }

    private void releaseNativePlayer() {
        mainHandler.removeCallbacks(reportPlaybackProgress);
        releaseNativeVisualizer();
        MediaPlayer player = nativePlayer;
        nativePlayer = null;
        nativePlayerPrepared = false;
        if (player != null) {
            player.setOnPreparedListener(null);
            player.setOnCompletionListener(null);
            player.setOnErrorListener(null);
            player.release();
        }
    }

    private void notifyWebPlayback(String state, String message) {
        WebView currentWebView = webView;
        if (currentWebView == null) return;
        String script = "window.MusicMatchNativeAudio&&window.MusicMatchNativeAudio("
                + JSONObject.quote(state) + "," + JSONObject.quote(message) + ");";
        currentWebView.post(() -> currentWebView.evaluateJavascript(script, null));
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public String scanMusic() {
            return MainActivity.this.scanMusic().toString();
        }

        @JavascriptInterface
        public String getPlaylists() {
            JSONObject result = new JSONObject();
            try {
                result.put("success", true);
                result.put("playlists", new JSONArray(savedPlaylists()));
            } catch (JSONException error) {
                return errorJson("As playlists salvas estão inválidas.").toString();
            }
            return result.toString();
        }

        @JavascriptInterface
        public String savePlaylists(String playlistsJson) {
            try {
                JSONArray playlists = new JSONArray(playlistsJson);
                boolean saved = getSharedPreferences(PREFERENCES, MODE_PRIVATE).edit()
                        .putString(PLAYLISTS_KEY, playlists.toString())
                        .commit();
                JSONObject result = new JSONObject();
                result.put("success", saved);
                if (!saved) result.put("error", "Não foi possível salvar as playlists no tablet.");
                result.put("playlists", playlists);
                return result.toString();
            } catch (JSONException error) {
                return errorJson("Dados de playlist inválidos.").toString();
            }
        }

        @JavascriptInterface
        public void playTrack(String contentUri, float volume) {
            Uri uri = Uri.parse(contentUri);
            if (!isKnownAudioUri(uri)) {
                notifyWebPlayback("error", "Faixa inválida. Atualize a biblioteca de músicas.");
                return;
            }
            runOnUiThread(() -> startNativePlayback(uri, volume));
        }

        @JavascriptInterface
        public void pauseTrack() {
            runOnUiThread(MainActivity.this::pauseNativePlayback);
        }

        @JavascriptInterface
        public void stopTrack() {
            runOnUiThread(MainActivity.this::stopNativePlayback);
        }

        @JavascriptInterface
        public void seekTrack(float seconds) {
            runOnUiThread(() -> seekNativePlayback(seconds));
        }

        @JavascriptInterface
        public void setTrackVolume(float volume) {
            runOnUiThread(() -> setNativePlaybackVolume(volume));
        }

        @JavascriptInterface
        public void requestVisualizerPermission() {
            runOnUiThread(MainActivity.this::requestNativeVisualizerPermission);
        }

        @JavascriptInterface
        public String saveTrack(String contentUri, String base64Audio) {
            Uri uri = Uri.parse(contentUri);
            if (!"media".equals(uri.getAuthority()) || !mediaResources.containsValue(uri)) {
                return errorJson("Arquivo de música inválido. Faça uma nova busca na biblioteca.").toString();
            }
            if (Build.VERSION.SDK_INT >= 29) {
                return errorJson("O Android não permite sobrescrever este arquivo diretamente.").toString();
            }

            try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                if (output == null) throw new IOException("Não foi possível abrir o arquivo para gravação.");
                output.write(Base64.decode(base64Audio, Base64.DEFAULT));
                JSONObject result = new JSONObject();
                result.put("success", true);
                return result.toString();
            } catch (SecurityException error) {
                return errorJson("Sem permissão para alterar este arquivo.").toString();
            } catch (JSONException error) {
                return errorJson("Falha ao criar a confirmação do salvamento.").toString();
            } catch (IOException | IllegalArgumentException error) {
                return errorJson("Falha ao salvar o arquivo: " + error.getMessage()).toString();
            }
        }
    }

    private final class LocalAppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !APP_HOST.equals(request.getUrl().getHost());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return !APP_HOST.equals(Uri.parse(url).getHost());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return interceptRequest(request.getUrl(), request.getRequestHeaders());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return interceptRequest(Uri.parse(url), Collections.<String, String>emptyMap());
        }
    }

    private static final class BoundedInputStream extends InputStream {
        private final InputStream source;
        private long remaining;

        BoundedInputStream(InputStream source, long length) {
            this.source = source;
            this.remaining = length;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = source.read();
            if (value != -1) remaining--;
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            if (remaining <= 0) return -1;
            int read = source.read(buffer, offset, (int) Math.min(length, remaining));
            if (read > 0) remaining -= read;
            return read;
        }

        @Override
        public void close() throws IOException {
            source.close();
        }
    }
}

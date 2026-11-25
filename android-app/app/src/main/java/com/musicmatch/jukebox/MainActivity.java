package com.musicmatch.jukebox;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFERENCES = "musicmatch_settings";
    private static final String SERVER_URL_KEY = "server_url";
    private static final int FILE_CHOOSER_REQUEST = 301;

    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String serverUrl = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(6, 63, 112));
        getWindow().setNavigationBarColor(Color.rgb(7, 63, 112));

        SharedPreferences preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);
        serverUrl = preferences.getString(SERVER_URL_KEY, "");
        buildAppWindow();

        if (serverUrl.isEmpty()) {
            showServerDialog("");
        } else {
            loadServer();
        }
    }

    private void buildAppWindow() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(222, 227, 232));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(12), 0, dp(8), 0);
        toolbar.setBackgroundColor(Color.rgb(6, 63, 112));

        TextView title = new TextView(this);
        title.setText("MUSICMATCH JUKEBOX");
        title.setTextColor(Color.WHITE);
        title.setTextSize(14);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));

        Button serverButton = createToolbarButton("Servidor");
        serverButton.setOnClickListener(view -> showServerDialog(serverUrl));
        toolbar.addView(serverButton);

        Button reloadButton = createToolbarButton("Recarregar");
        reloadButton.setOnClickListener(view -> loadServer());
        LinearLayout.LayoutParams reloadParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(38));
        reloadParams.leftMargin = dp(6);
        toolbar.addView(reloadButton, reloadParams);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(222, 227, 232));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.equals(serverUrl)) {
                    Toast.makeText(MainActivity.this,
                            "Não foi possível conectar. Confira o endereço e se o servidor do PC está iniciado.",
                            Toast.LENGTH_LONG).show();
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
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

    private Button createToolbarButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.rgb(15, 54, 82));
        button.setTextSize(12);
        button.setAllCaps(false);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setPadding(dp(10), 0, dp(10), 0);
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(235, 242, 247));
        background.setCornerRadius(dp(4));
        background.setStroke(dp(1), Color.rgb(135, 164, 185));
        button.setBackground(background);
        return button;
    }

    private void showServerDialog(String currentValue) {
        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("http://192.168.1.50:8081");
        input.setText(currentValue);
        input.setSelectAllOnFocus(true);
        input.setPadding(dp(16), dp(10), dp(16), dp(10));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(22), dp(8), dp(22), 0);

        TextView instructions = new TextView(this);
        instructions.setText("Inicie o MusicMatch no PC. No tablet, conecte-se à mesma rede Wi-Fi e informe o IPv4 do computador com a porta 8081. No Windows, veja o IPv4 com o comando ipconfig.");
        instructions.setTextColor(Color.rgb(54, 70, 84));
        instructions.setTextSize(14);
        content.addView(instructions);

        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        inputParams.topMargin = dp(12);
        content.addView(input, inputParams);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Conectar ao servidor do PC")
                .setView(content)
                .setPositiveButton("Conectar", null)
                .setNegativeButton("Cancelar", (createdDialog, which) -> {
                    if (serverUrl.isEmpty()) {
                        finish();
                    }
                })
                .create();

        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                String normalizedUrl = normalizeServerUrl(input.getText().toString());
                if (normalizedUrl == null) {
                    input.setError("Informe o IP do PC, por exemplo 192.168.1.50");
                    return;
                }
                serverUrl = normalizedUrl;
                getSharedPreferences(PREFERENCES, MODE_PRIVATE).edit()
                        .putString(SERVER_URL_KEY, serverUrl).apply();
                dialog.dismiss();
                loadServer();
            });
        });

        dialog.show();
        dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
    }

    private String normalizeServerUrl(String value) {
        String candidate = value == null ? "" : value.trim();
        if (candidate.isEmpty()) {
            return null;
        }
        if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
            candidate = "http://" + candidate;
        }

        Uri parsed = Uri.parse(candidate);
        if (parsed.getHost() == null) {
            return null;
        }
        if (parsed.getPort() == -1) {
            parsed = parsed.buildUpon()
                    .encodedAuthority(parsed.getHost() + ":8081")
                    .build();
        }
        String normalized = parsed.toString();
        return normalized.endsWith("/") ? normalized : normalized + "/";
    }

    private void loadServer() {
        if (webView != null && !serverUrl.isEmpty()) {
            webView.loadUrl(serverUrl);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
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
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}

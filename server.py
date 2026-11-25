#!/usr/bin/env python3
"""
MusicMatch Jukebox Web - Local HTTP Server
Features:
- Range Requests (HTTP 206) for smooth audio seeking on PC & Tablets
- Music Library Scanner (automatically scans local storage for audio)
- Direct In-Place File Overwrite API (zero duplicates)
- Audio Streaming & Cover Art Extraction API
"""

import os
import sys
import json
import struct
import urllib.parse
import subprocess
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def prepare_output_stream(stream):
    if stream is None:
        return open(os.devnull, "w", encoding="utf-8")
    reconfigure = getattr(stream, "reconfigure", None)
    if reconfigure:
        reconfigure(errors="backslashreplace")
    return stream

sys.stdout = prepare_output_stream(sys.stdout)
sys.stderr = prepare_output_stream(sys.stderr)

PORT = 8081
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(DIRECTORY, "config.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
                config.pop("music_folder", None)
                config.pop("recursive", None)
                return config
        except Exception:
            pass
    return {"playlists": []}

def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False

def filesystem_path(path):
    if os.name != "nt":
        return path

    absolute_path = os.path.abspath(path)
    if absolute_path.startswith("\\\\?\\") or len(absolute_path) < 248:
        return path
    if absolute_path.startswith("\\\\"):
        return "\\\\?\\UNC\\" + absolute_path[2:]
    return "\\\\?\\" + absolute_path

SUPPORTED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}
LOCAL_FILESYSTEM_TYPES = {
    "apfs", "btrfs", "exfat", "ext2", "ext3", "ext4", "f2fs", "fat", "hfs",
    "hfsplus", "iso9660", "ntfs", "ntfs3", "udf", "vfat", "xfs", "zfs", "fuseblk"
}
SKIPPED_DIRECTORY_NAMES = {
    "$Recycle.Bin", "AppData", "node_modules", "Program Files", "Program Files (x86)",
    "ProgramData", "Recovery", "System Volume Information", "Windows", ".cache", ".git",
    ".gradle", ".local", ".npm", ".Trash-1000", "lost+found"
}
SKIPPED_SYSTEM_MOUNTS = ("/boot", "/dev", "/proc", "/run", "/sys", "/tmp", "/usr", "/var")

def _decode_mount_path(path):
    return path.replace("\\040", " ").replace("\\011", "\t").replace("\\134", "\\")

def get_local_music_roots():
    home = os.path.abspath(os.path.expanduser("~"))
    roots = [home]

    if os.name == "nt":
        import ctypes

        drive_mask = ctypes.windll.kernel32.GetLogicalDrives()
        drive_roots = []
        for index in range(26):
            if not drive_mask & (1 << index):
                continue
            drive = f"{chr(ord('A') + index)}:\\"
            drive_type = ctypes.windll.kernel32.GetDriveTypeW(drive)
            if drive_type in (2, 3) and os.path.isdir(drive):
                drive_roots.append(drive)
        home_drive = os.path.splitdrive(home)[0].lower()
        if not any(os.path.splitdrive(drive)[0].lower() == home_drive for drive in drive_roots):
            drive_roots.append(home)
        roots = drive_roots
    elif sys.platform == "darwin":
        mount_output = subprocess.run(
            ["mount"], check=True, capture_output=True, text=True
        ).stdout
        for line in mount_output.splitlines():
            if " on /Volumes/" not in line:
                continue
            mount_path = line.split(" on ", 1)[1].split(" (", 1)[0]
            filesystem_type = line.rsplit("(", 1)[-1].split(",", 1)[0]
            if filesystem_type in LOCAL_FILESYSTEM_TYPES and os.path.isdir(mount_path):
                roots.append(mount_path)
    else:
        try:
            with open("/proc/mounts", "r", encoding="utf-8") as mounts_file:
                mounts = mounts_file.readlines()
        except OSError:
            mounts = []

        home_prefix = home.rstrip(os.sep) + os.sep
        for line in mounts:
            fields = line.split()
            if len(fields) < 3 or fields[2] not in LOCAL_FILESYSTEM_TYPES:
                continue
            mount_path = os.path.abspath(_decode_mount_path(fields[1]))
            if mount_path == "/" or mount_path == home or home.startswith(mount_path.rstrip(os.sep) + os.sep):
                continue
            is_run_media = mount_path.startswith("/run/media/")
            if not is_run_media and any(
                mount_path == path or mount_path.startswith(path + os.sep)
                for path in SKIPPED_SYSTEM_MOUNTS
            ):
                continue
            if os.path.isdir(mount_path):
                roots.append(mount_path)

    unique_roots = []
    seen = set()
    for root in roots:
        normalized = os.path.normcase(os.path.realpath(root))
        if normalized not in seen:
            seen.add(normalized)
            unique_roots.append(root)
    return unique_roots

def scan_music_roots(roots):
    tracks = []
    scan_errors = []

    def record_error(error):
        scan_errors.append({"path": error.filename or "", "message": str(error)})

    def process_file(full_path):
        _, extension = os.path.splitext(full_path)
        if extension.lower() not in SUPPORTED_AUDIO_EXTENSIONS or os.path.islink(full_path):
            return
        try:
            size = os.path.getsize(filesystem_path(full_path))
            tags = fast_parse_id3(full_path)
            stream_path = urllib.parse.quote(full_path)
            tracks.append({
                "id": f"lib_{len(tracks)}",
                "filename": os.path.basename(full_path),
                "fullPath": full_path,
                "folder": os.path.dirname(full_path),
                "size": size,
                "streamUrl": f"/api/stream?path={stream_path}",
                "coverUrl": f"/api/cover?path={stream_path}" if tags["hasCover"] else None,
                "title": tags["title"],
                "artist": tags["artist"],
                "album": tags["album"],
                "year": tags["year"],
                "genre": tags["genre"],
                "track": tags["track"]
            })
        except OSError as error:
            record_error(error)

    for root in roots:
        if not os.path.isdir(filesystem_path(root)):
            scan_errors.append({"path": root, "message": "Armazenamento indisponível"})
            continue
        for current_root, dirs, files in os.walk(root, onerror=record_error):
            dirs[:] = [
                directory for directory in sorted(dirs)
                if directory not in SKIPPED_DIRECTORY_NAMES
                and not os.path.islink(os.path.join(current_root, directory))
                and not getattr(os.path, "isjunction", lambda path: False)(
                    os.path.join(current_root, directory)
                )
                and not os.path.ismount(os.path.join(current_root, directory))
            ]
            for filename in sorted(files):
                process_file(os.path.join(current_root, filename))

    return tracks, scan_errors

# Fast pure-Python ID3 parser for lightning-fast library scanning
ID3_GENRES = [
    "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop",
    "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae",
    "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks",
    "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion",
    "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip",
    "Gospel", "Noise", "AlternRock", "Bass", "Soul", "Punk", "Space", "Meditative"
]

def fast_parse_id3(filepath):
    tags = {
        "title": os.path.splitext(os.path.basename(filepath))[0],
        "artist": "Desconhecido",
        "album": "Álbum Desconhecido",
        "year": "",
        "genre": "",
        "track": "",
        "hasCover": False
    }
    try:
        with open(filesystem_path(filepath), "rb") as f:
            # Read first 128KB for ID3v2
            head = f.read(131072)
            if len(head) >= 10 and head[:3] == b"ID3":
                ver = head[3]
                synch_size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f)
                limit = min(10 + synch_size, len(head))
                offset = 10
                while offset + 10 <= limit:
                    fid = head[offset:offset+4].decode('latin1', errors='ignore')
                    if ord(fid[0]) == 0:
                        break
                    if ver == 4:
                        fsize = ((head[offset+4] & 0x7f) << 21) | ((head[offset+5] & 0x7f) << 14) | ((head[offset+6] & 0x7f) << 7) | (head[offset+7] & 0x7f)
                    else:
                        fsize = struct.unpack('>I', head[offset+4:offset+8])[0]
                    
                    if fsize <= 0 or offset + 10 + fsize > len(head):
                        break
                    
                    fdata = head[offset+10:offset+10+fsize]
                    if len(fdata) > 1:
                        enc = fdata[0]
                        def decode_text(raw, encoding):
                            try:
                                if encoding == 0: return raw.decode('latin1', errors='ignore').rstrip('\x00').strip()
                                elif encoding == 1: return raw.decode('utf-16', errors='ignore').rstrip('\x00').strip()
                                elif encoding == 2: return raw.decode('utf-16be', errors='ignore').rstrip('\x00').strip()
                                elif encoding == 3: return raw.decode('utf-8', errors='ignore').rstrip('\x00').strip()
                            except Exception: pass
                            return ""

                        if fid == "TIT2":
                            t = decode_text(fdata[1:], enc)
                            if t: tags["title"] = t
                        elif fid == "TPE1":
                            a = decode_text(fdata[1:], enc)
                            if a: tags["artist"] = a
                        elif fid == "TALB":
                            al = decode_text(fdata[1:], enc)
                            if al: tags["album"] = al
                        elif fid in ("TYER", "TDRC"):
                            y = decode_text(fdata[1:], enc)
                            if y: tags["year"] = y[:4]
                        elif fid == "TRCK":
                            tr = decode_text(fdata[1:], enc).split('/')[0].strip()
                            if tr: tags["track"] = tr
                        elif fid == "TCON":
                            g = decode_text(fdata[1:], enc)
                            if g.startswith("(") and ")" in g:
                                try:
                                    idx = int(g[1:g.index(")")])
                                    if 0 <= idx < len(ID3_GENRES):
                                        g = ID3_GENRES[idx]
                                except Exception: pass
                            tags["genre"] = g
                        elif fid == "APIC":
                            tags["hasCover"] = True
                    offset += 10 + fsize

            # Fallback to ID3v1 at end
            f.seek(0, os.SEEK_END)
            flen = f.tell()
            if flen >= 128:
                f.seek(flen - 128)
                v1 = f.read(128)
                if v1[:3] == b"TAG":
                    def v1_str(start, length):
                        return v1[start:start+length].decode('latin1', errors='ignore').rstrip('\x00').strip()
                    if tags["artist"] == "Desconhecido":
                        a = v1_str(33, 30)
                        if a: tags["artist"] = a
                    if tags["album"] == "Álbum Desconhecido":
                        al = v1_str(63, 30)
                        if al: tags["album"] = al
                    if not tags["year"]:
                        tags["year"] = v1_str(93, 4)
                    if not tags["track"] and v1[125] == 0 and v1[126] != 0:
                        tags["track"] = str(v1[126])
                    if not tags["genre"]:
                        g_idx = v1[127]
                        if 0 <= g_idx < len(ID3_GENRES):
                            tags["genre"] = ID3_GENRES[g_idx]
    except Exception as e:
        print(f"Error parsing tags for {filepath}: {e}")
    return tags

class MusicMatchHTTPRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename, X-Filepath")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.OK)
        self.end_headers()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)

        if parsed_url.path == "/api/save_playlists":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_len).decode("utf-8")
                data = json.loads(body)
                playlists = data.get("playlists") if isinstance(data, dict) else None
                if not isinstance(playlists, list):
                    self._send_json({"success": False, "error": "A lista de playlists é inválida."}, HTTPStatus.BAD_REQUEST)
                    return

                normalized = []
                for item in playlists:
                    if not isinstance(item, dict):
                        self._send_json({"success": False, "error": "Uma playlist possui formato inválido."}, HTTPStatus.BAD_REQUEST)
                        return
                    playlist_id = item.get("id")
                    name = item.get("name")
                    track_paths = item.get("trackPaths")
                    if (
                        not isinstance(playlist_id, str)
                        or not playlist_id.strip()
                        or not isinstance(name, str)
                        or not name.strip()
                        or not isinstance(track_paths, list)
                        or not track_paths
                        or not all(isinstance(path, str) and path for path in track_paths)
                    ):
                        self._send_json({"success": False, "error": "Nome, identificador ou faixas da playlist inválidos."}, HTTPStatus.BAD_REQUEST)
                        return
                    normalized.append({
                        "id": playlist_id.strip(),
                        "name": name.strip(),
                        "trackPaths": track_paths
                    })

                cfg = load_config()
                cfg["playlists"] = normalized
                if not save_config(cfg):
                    self._send_json({"success": False, "error": "Não foi possível salvar config.json."}, HTTPStatus.INTERNAL_SERVER_ERROR)
                    return
                self._send_json({"success": True, "playlists": normalized})
            except json.JSONDecodeError as e:
                self._send_json({"success": False, "error": f"JSON inválido: {e}"}, HTTPStatus.BAD_REQUEST)
            except Exception as e:
                self._send_json({"success": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # API: Direct file saving (overwrites file on disk without creating duplicates)
        if parsed_url.path == "/api/save_direct":
            try:
                content_len = int(self.headers.get("Content-Length", 0))
                if content_len == 0:
                    self._send_json({"success": False, "error": "Corpo da requisição vazio"}, HTTPStatus.BAD_REQUEST)
                    return

                file_bytes = self.rfile.read(content_len)

                raw_filename = self.headers.get("X-Filename", "")
                filename = urllib.parse.unquote(raw_filename) if raw_filename else ""

                raw_filepath = self.headers.get("X-Filepath", "")
                filepath = urllib.parse.unquote(raw_filepath) if raw_filepath else ""

                target_path = None

                # 1. Check if explicit filepath was given and exists
                if filepath and os.path.isfile(filesystem_path(filepath)):
                    target_path = filepath
                
                # 2. Otherwise search common local music directories
                if not target_path and filename:
                    clean_name = os.path.basename(filename)
                    search_roots = [
                        os.path.expanduser("~/Downloads"),
                        os.path.expanduser("~/Música"),
                        os.path.expanduser("~/Music"),
                        DIRECTORY,
                        os.path.expanduser("~")
                    ]

                    for root_dir in search_roots:
                        if not root_dir or not os.path.exists(filesystem_path(root_dir)):
                            continue
                        candidate = os.path.join(root_dir, clean_name)
                        if os.path.isfile(filesystem_path(candidate)):
                            target_path = candidate
                            break

                    if not target_path:
                        for s_dir in [
                            os.path.expanduser("~/Downloads"),
                            os.path.expanduser("~/Música"),
                            os.path.expanduser("~/Music")
                        ]:
                            if not s_dir or not os.path.exists(filesystem_path(s_dir)):
                                continue
                            for r, _, files in os.walk(s_dir):
                                if clean_name in files:
                                    target_path = os.path.join(r, clean_name)
                                    break
                                if r.count(os.sep) - s_dir.count(os.sep) >= 3:
                                    break
                            if target_path:
                                break

                # 3. Fallback to Downloads
                if not target_path:
                    base = os.path.expanduser("~/Downloads")
                    clean_name = os.path.basename(filename) if filename else "musica.mp3"
                    target_path = os.path.join(base, clean_name)

                with open(filesystem_path(target_path), "wb") as f:
                    f.write(file_bytes)

                print(f"[Direct Save] Arquivo salvo em: {target_path} ({len(file_bytes)} bytes)")
                self._send_json({
                    "success": True,
                    "path": target_path,
                    "filename": os.path.basename(target_path)
                })

            except Exception as e:
                print(f"[Direct Save Error] {e}")
                self._send_json({"success": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Endpoint não encontrado")

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)

        # API: Get saved music folder & config
        if parsed_url.path == "/api/get_config":
            cfg = load_config()
            self._send_json({"success": True, "config": cfg})
            return

        if parsed_url.path == "/api/get_playlists":
            cfg = load_config()
            playlists = cfg.get("playlists", [])
            if not isinstance(playlists, list):
                self._send_json({"success": False, "error": "A configuração de playlists é inválida."}, HTTPStatus.INTERNAL_SERVER_ERROR)
                return
            self._send_json({"success": True, "playlists": playlists})
            return

        # API: Scan local storage devices for music
        if parsed_url.path == "/api/library":
            try:
                roots = get_local_music_roots()
                tracks, scan_errors = scan_music_roots(roots)
                self._send_json({
                    "success": True,
                    "storageCount": len(roots),
                    "count": len(tracks),
                    "tracks": tracks,
                    "scanErrorCount": len(scan_errors),
                    "scanErrors": scan_errors[:10]
                })
            except Exception as e:
                self._send_json({"success": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # API: Stream audio file with Range Request support
        if parsed_url.path == "/api/stream":
            query = urllib.parse.parse_qs(parsed_url.query)
            target_path = query.get("path", [""])[0]
            if not target_path or not os.path.isfile(filesystem_path(target_path)):
                self.send_error(HTTPStatus.NOT_FOUND, "Arquivo de áudio não encontrado")
                return

            self._serve_range_file(target_path, "audio/mpeg")
            return

        # API: Extract and serve cover art
        if parsed_url.path == "/api/cover":
            query = urllib.parse.parse_qs(parsed_url.query)
            target_path = query.get("path", [""])[0]
            if not target_path or not os.path.isfile(filesystem_path(target_path)):
                self.send_error(HTTPStatus.NOT_FOUND, "Arquivo não encontrado")
                return

            try:
                cover_bytes, mime = self._extract_cover(target_path)
                if cover_bytes:
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", mime)
                    self.send_header("Content-Length", str(len(cover_bytes)))
                    self.send_header("Cache-Control", "public, max-age=86400")
                    self.end_headers()
                    self.wfile.write(cover_bytes)
                    return
            except Exception:
                pass
            # Fallback to default cover
            self.send_response(HTTPStatus.MOVED_PERMANENTLY)
            self.send_header("Location", "/assets/default-cover.svg")
            self.end_headers()
            return

        # Regular static files
        return super().do_GET()

    def _extract_cover(self, filepath):
        with open(filesystem_path(filepath), "rb") as f:
            head = f.read(262144) # Read up to 256KB for cover
            if len(head) >= 10 and head[:3] == b"ID3":
                ver = head[3]
                synch_size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f)
                limit = min(10 + synch_size, len(head))
                offset = 10
                while offset + 10 <= limit:
                    fid = head[offset:offset+4].decode('latin1', errors='ignore')
                    if ord(fid[0]) == 0: break
                    fsize = struct.unpack('>I', head[offset+4:offset+8])[0] if ver != 4 else (((head[offset+4] & 0x7f) << 21) | ((head[offset+5] & 0x7f) << 14) | ((head[offset+6] & 0x7f) << 7) | (head[offset+7] & 0x7f))
                    if fsize <= 0 or offset + 10 + fsize > len(head): break
                    if fid == "APIC":
                        fdata = head[offset+10:offset+10+fsize]
                        enc = fdata[0]
                        p = 1
                        mime = ""
                        while p < len(fdata) and fdata[p] != 0:
                            mime += chr(fdata[p])
                            p += 1
                        p += 1 # skip null
                        p += 1 # skip picture type (0x03)
                        # skip description
                        if enc in (0, 3):
                            while p < len(fdata) and fdata[p] != 0: p += 1
                            p += 1
                        else:
                            while p + 1 < len(fdata) and not (fdata[p] == 0 and fdata[p+1] == 0): p += 2
                            p += 2
                        if p < len(fdata):
                            return fdata[p:], mime or "image/jpeg"
                    offset += 10 + fsize
        return None, None

    def _serve_range_file(self, filepath, default_ctype="audio/mpeg"):
        try:
            f = open(filesystem_path(filepath), 'rb')
            fs = os.fstat(f.fileno())
            total_length = fs[6]
            ctype = self.guess_type(filepath) or default_ctype

            range_header = self.headers.get("Range")
            if range_header and range_header.startswith("bytes="):
                try:
                    ranges = range_header[6:].split("-")
                    start = int(ranges[0]) if ranges[0] else 0
                    end = int(ranges[1]) if ranges[1] else total_length - 1
                    if start >= total_length or end >= total_length or start > end:
                        raise ValueError()

                    length = end - start + 1
                    self.send_response(HTTPStatus.PARTIAL_CONTENT)
                    self.send_header("Content-Type", ctype)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{total_length}")
                    self.send_header("Content-Length", str(length))
                    self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
                    self.end_headers()

                    f.seek(start)
                    self.copyfile(f, self.wfile)
                    f.close()
                    return
                except Exception:
                    pass

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(total_length))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            self.copyfile(f, self.wfile)
            f.close()
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "Arquivo não encontrado")

    def _send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def run():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server_address = ('', port)
    
    with ThreadingHTTPServer(server_address, MusicMatchHTTPRequestHandler) as httpd:
        print("=" * 60)
        print(" 🎵 MUSICMATCH JUKEBOX WEB SERVER ATIVO!")
        print("=" * 60)
        print(f" Pasta Raiz App   : {DIRECTORY}")
        print(" Armazenamentos   : discos locais e removíveis")
        print(f" Acesse Local     : http://localhost:{port}")
        print(f" Acesse no Tablet : http://<IP-DO-PC>:{port}")
        print(" Recursos         : Auto-Scan da Biblioteca + Range Requests + In-Place Save")
        print("=" * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor finalizado.")

if __name__ == "__main__":
    run()

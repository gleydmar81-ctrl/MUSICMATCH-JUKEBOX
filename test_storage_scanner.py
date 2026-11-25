import os
import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server


class StorageScannerTests(unittest.TestCase):
    def test_scans_supported_audio_recursively_and_skips_cache_folders(self):
        with tempfile.TemporaryDirectory() as storage:
            album = os.path.join(storage, "Music", "Album")
            cache = os.path.join(storage, ".cache")
            os.makedirs(album)
            os.makedirs(cache)
            mp3_path = os.path.join(album, "track.mp3")
            aac_path = os.path.join(storage, "Music", "voice.aac")
            ignored_path = os.path.join(storage, "Music", "notes.txt")
            cached_path = os.path.join(cache, "cached.mp3")

            for path in (mp3_path, aac_path, ignored_path, cached_path):
                with open(path, "wb") as audio_file:
                    audio_file.write(b"test")

            tracks, errors = server.scan_music_roots([storage])

            self.assertEqual({track["fullPath"] for track in tracks}, {mp3_path, aac_path})
            self.assertEqual({track["folder"] for track in tracks}, {album, os.path.join(storage, "Music")})
            self.assertEqual(errors, [])

    def test_library_endpoint_returns_tracks_from_detected_storage(self):
        with tempfile.TemporaryDirectory() as storage:
            track_path = os.path.join(storage, "track.mp3")
            with open(track_path, "wb") as audio_file:
                audio_file.write(b"test")

            httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.MusicMatchHTTPRequestHandler)
            thread = threading.Thread(target=httpd.serve_forever)
            thread.start()
            try:
                with patch("server.get_local_music_roots", return_value=[storage]):
                    with urllib.request.urlopen(f"http://127.0.0.1:{httpd.server_port}/api/library") as response:
                        result = json.load(response)
            finally:
                httpd.shutdown()
                thread.join()
                httpd.server_close()

            self.assertTrue(result["success"])
            self.assertEqual(result["storageCount"], 1)
            self.assertEqual(result["count"], 1)
            self.assertEqual(result["tracks"][0]["fullPath"], track_path)


if __name__ == "__main__":
    unittest.main()

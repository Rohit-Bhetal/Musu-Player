"""Resolves a YouTube video id to its audio stream and streams the bytes back.

Both halves have to happen here: googlevideo pins every URL it hands out to the
IP that asked for it, so a service that only returned the URL would 403 on the
phone's first byte. Streaming here also means the audio reaches the app from one
origin it controls, which is what makes a YouTube track downloadable offline.

Only ever reachable through the app's Pages Function, which holds EXTRACTOR_TOKEN.
"""

import os
import re
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("EXTRACTOR_TOKEN", "")
PORT = int(os.environ.get("PORT", "8080"))
VIDEO_ID = re.compile(r"^[\w-]{11}$")
RANGE_HEADER = re.compile(r"^bytes=(\d+)-(\d*)$")

# itag 140 (m4a/AAC) first: iOS Safari cannot decode the webm/opus formats that
# "bestaudio" otherwise prefers.
YDL_OPTS = {
    "format": "bestaudio[ext=m4a]/bestaudio",
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
    "cachedir": False,
}

# Measured: one open-ended request is throttled to ~32 KB/s (a whole song takes
# longer than the song), while 1 MiB range requests run at ~3 MB/s. So every
# read from googlevideo is a range, however the app asked for it.
CHUNK_BYTES = 1 << 20

# Resolving costs ~2.5s of yt-dlp, and a seeking Safari issues many range
# requests per track, so the URL — and the size/type probe below — are reused
# until shortly before the URL expires.
_cache: dict[str, dict[str, object]] = {}
_lock = threading.Lock()
EXPIRY_MARGIN_SEC = 300


def expiry_of(url: str) -> float:
    """googlevideo states its own deadline in the URL; fall back to 30 minutes."""
    found = re.search(r"[?&]expire=(\d+)", url)
    return float(found.group(1)) - EXPIRY_MARGIN_SEC if found else time.time() + 1800


def parse_range(header: str | None, total: int) -> tuple[int, int, bool]:
    """-> (start, end inclusive, client asked). Anything odd serves the whole file,
    which HTTP allows: a server may always ignore a Range it does not like."""
    match = RANGE_HEADER.match(header or "")
    if not match:
        return 0, total - 1, False
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else total - 1
    if start >= total:
        return 0, total - 1, False
    return start, min(end, total - 1), True


def chunks(start: int, end: int, size: int = CHUNK_BYTES) -> list[tuple[int, int]]:
    """Inclusive byte windows covering [start, end], each at most `size` long."""
    return [(at, min(at + size - 1, end)) for at in range(start, end + 1, size)]


def resolve(video_id: str) -> str:
    with _lock:
        hit = _cache.get(video_id)
        if hit and hit["expiry"] > time.time():
            return hit["url"]

    from yt_dlp import YoutubeDL  # imported late so this module loads without it

    with YoutubeDL(YDL_OPTS) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
    url = info.get("url")
    if not url:
        raise RuntimeError("no audio stream for this video")

    with _lock:
        _cache[video_id] = {"url": url, "expiry": expiry_of(url), "total": None, "content_type": None}
    return url


def forget(video_id: str) -> None:
    with _lock:
        _cache.pop(video_id, None)


def open_range(url: str, start: int, end: int):
    request = urllib.request.Request(url)
    request.add_header("Range", f"bytes={start}-{end}")
    return urllib.request.urlopen(request, timeout=30)


def metadata(video_id: str, url: str) -> tuple[int, str]:
    """(total bytes, content type) for `url`, probed once and cached. A seeking
    Safari issues many range requests per track; without this cache every one
    of them paid a second googlevideo round trip just to re-learn the same
    file size and content type the first request already found out."""
    with _lock:
        entry = _cache.get(video_id)
        if entry and entry.get("url") == url and entry.get("total") is not None:
            return entry["total"], entry["content_type"]  # type: ignore[return-value]

    with open_range(url, 0, 0) as probe:
        total = int(probe.headers["Content-Range"].rpartition("/")[2])
        content_type = probe.headers.get("Content-Type", "audio/mp4")

    with _lock:
        entry = _cache.get(video_id)
        if entry and entry.get("url") == url:
            entry["total"] = total
            entry["content_type"] = content_type
    return total, content_type


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args: object) -> None:  # one line per request, not three
        pass

    def _fail(self, status: int, message: str) -> None:
        body = message.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler's name
        if TOKEN and self.headers.get("Authorization") != f"Bearer {TOKEN}":
            return self._fail(403, "forbidden")

        if self.path.startswith("/health"):
            return self._fail(200, "ok")

        video_id = self.path.partition("?v=")[2].partition("&")[0]
        if not VIDEO_ID.match(video_id):
            return self._fail(400, "a youtube video id is required")

        try:
            url = resolve(video_id)
        except Exception as error:  # yt-dlp raises many shapes; the app shows this text
            return self._fail(502, f"could not resolve: {error}"[:300])

        try:
            total, content_type = metadata(video_id, url)
        except Exception:
            forget(video_id)  # most likely the URL went stale early
            return self._fail(502, "upstream would not answer")

        start, end, asked = parse_range(self.headers.get("Range"), total)

        self.send_response(206 if asked else 200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(end - start + 1))
        if asked:
            self.send_header("Content-Range", f"bytes {start}-{end}/{total}")
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

        try:
            for at, until in chunks(start, end):
                with open_range(url, at, until) as part:
                    while piece := part.read(64 * 1024):
                        self.wfile.write(piece)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the phone skipped to the next track mid-stream
        except Exception:
            forget(video_id)
            self.close_connection = True  # headers are already out; cut it short


if __name__ == "__main__":
    if not TOKEN:
        print("WARNING: EXTRACTOR_TOKEN is empty — anyone who finds this host can use it")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()

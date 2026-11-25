import hmac, os, re, socket, subprocess, threading, time, urllib.error, urllib.request, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# --- Configuration ---
TOKEN = os.environ.get("EXTRACTOR_TOKEN", "")
PORT = int(os.environ.get("PORT", "8080"))
VIDEO_ID_RE = re.compile(r"^[\w-]{11}$")
RANGE_HEADER = re.compile(r"^bytes=(\d+)-(\d*)$")

POT_SERVER_PORT = 4416
VPN_DIR = "/tmp/vpn"
VPN_CONFIG_PATH = os.environ.get("VPN_CONFIG_PATH", "/etc/vpn/wg.conf")  # a real WireGuard config, mounted read-only
VPN_PROXY_PORT = 1080
VPN_PROXY = f"http://127.0.0.1:{VPN_PROXY_PORT}"  # wireproxy's [http] section — no PySocks dependency needed

os.environ["YT_DLP_POT_PROVIDER_URL"] = f"http://127.0.0.1:{POT_SERVER_PORT}"
# shortcut: insurance against a future env-var-based proxy (ALL_PROXY etc.)
# hijacking the local bgutil/VPN calls themselves — not currently in play
# since proxying here goes through the explicit YDL_OPTS "proxy" key, not env vars.
os.environ.setdefault("NO_PROXY", "127.0.0.1,localhost")

COOKIES_FILE = os.environ.get("YOUTUBE_COOKIES_FILE", "")

# Client rotation fallback chains
CLIENT_CHAINS = [
    ["web", "android_vr", "tv_downgraded"],
    ["tv_downgraded", "web", "android_vr"],
    ["android_vr", "tv_downgraded", "web"],
    ["web_creator", "tv_downgraded", "android_vr"],
    ["mweb", "tv_downgraded", "web"],
]

CHUNK_BYTES = 1 << 20
_cache: dict[str, dict[str, object]] = {}
_lock = threading.Lock()
_request_semaphore = threading.Semaphore(5)
_opener = urllib.request.urlopen  # replaced with a VPN-proxied opener in __main__, if it comes up

EXPIRY_MARGIN_SEC = 300

def expiry_of(url: str) -> float:
    found = re.search(r"[?&]expire=(\d+)", url)
    return float(found.group(1)) - EXPIRY_MARGIN_SEC if found else time.time() + 1800

def parse_range(header: str | None, total: int) -> tuple[int, int, bool]:
    match = RANGE_HEADER.match(header or "")
    if not match:
        return 0, total - 1, False
    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else total - 1
    if start >= total:
        return 0, total - 1, False
    return start, min(end, total - 1), True

def chunks(start: int, end: int, size: int = CHUNK_BYTES) -> list[tuple[int, int]]:
    return [(at, min(at + size - 1, end)) for at in range(start, end + 1, size)]

def resolve(video_id: str) -> tuple[str, dict[str, str]]:
    """Resolves the video URL using client rotation and POT solver.
    Returns the URL alongside the http_headers yt-dlp attached to this format —
    some clients' URLs are pinned to the User-Agent they were requested with,
    so a plain urllib request without them gets a 403 from googlevideo."""
    now = time.time()
    with _lock:
        hit = _cache.get(video_id)
        if hit and hit["expiry"] > now:
            return hit["url"], hit["headers"]
        for key in [k for k, v in _cache.items() if v["expiry"] <= now]:
            del _cache[key]

    from yt_dlp import YoutubeDL

    base_opts = {
        # YouTube now force-SABRs most audio-only formats; SABR responses are a
        # protobuf-framed stream this proxy can't parse, so excluding "sabr" here
        # keeps the result to a plain byte-rangeable URL, falling back to a
        # combined (video+audio) progressive format if that's all that's left.
        "format": "bestaudio[ext=m4a][protocol!*=sabr]/bestaudio[protocol!*=sabr]/best[protocol!*=sabr]",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "cachedir": False,
        "proxy": VPN_PROXY,  # set to None in __main__ if the VPN never comes up, so this isn't a dead reference
        "extractor_args": {
            "youtubepot-bgutilhttp": {"base_url": [f"http://127.0.0.1:{POT_SERVER_PORT}"]},
            "youtube": {"player_skip": ["webpage"]},
        },
        "js_runtimes": {"node": {}},  # dict of {runtime: config}, not a bare list
        "remote_components": ["ejs:github"],
    }
    
    if COOKIES_FILE:
        base_opts["cookiefile"] = COOKIES_FILE

    last_error = None
    for client_chain in CLIENT_CHAINS:
        opts = base_opts.copy()
        opts["extractor_args"]["youtube"]["player_client"] = client_chain
        
        try:
            with _request_semaphore:
                with YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            
            url = info.get("url")
            if url:
                headers = info.get("http_headers") or {}
                with _lock:
                    _cache[video_id] = {"url": url, "headers": headers, "expiry": expiry_of(url)}
                return url, headers
        except Exception as e:
            last_error = e
            continue

    raise last_error or Exception("All client chains failed")

def start_bgutil():
    """Starts the bgutil POT server in a background thread."""
    def run_bgutil():
        try:
            # Adjust path to your actual bgutil binary
            subprocess.run(["node", "/opt/bgutil/server/build/main.js"], check=True)
        except Exception as e:
            print(f"bgutil failed: {e}", file=sys.stderr)

    t = threading.Thread(target=run_bgutil, daemon=True)
    t.start()


def wait_for_pot_server(timeout: float = 10.0) -> None:
    """Blocks until bgutil's port actually accepts connections — a fixed
    sleep races its ~1-2s Node.js startup on a cold instance."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", POT_SERVER_PORT), timeout=0.5):
                return
        except OSError:
            time.sleep(0.2)
    print("WARNING: bgutil POT server did not come up in time; resolves may 403", file=sys.stderr)


def setup_vpn() -> bool:
    """Starts wireproxy as a local HTTP proxy over a real WireGuard config
    (ProtonVPN or any other provider's) mounted read-only at VPN_CONFIG_PATH.
    Returns False (continuing un-proxied) if no config is mounted or anything
    here fails — an unreachable proxy should degrade, not crash the extractor."""
    if not os.path.exists(VPN_CONFIG_PATH):
        print(f"No VPN config at {VPN_CONFIG_PATH}; continuing un-proxied", file=sys.stderr)
        return False
    try:
        os.makedirs(VPN_DIR, exist_ok=True)
        profile = os.path.join(VPN_DIR, "wg.conf")
        with open(VPN_CONFIG_PATH) as src, open(profile, "w") as dst:
            dst.write(src.read())
            dst.write(f"\n[http]\nBindAddress = 127.0.0.1:{VPN_PROXY_PORT}\n")
        subprocess.Popen(["wireproxy", "-c", profile])
        deadline = time.time() + 15.0
        while time.time() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", VPN_PROXY_PORT), timeout=0.5):
                    return True
            except OSError:
                time.sleep(0.3)
        print("WARNING: VPN proxy did not come up in time; continuing un-proxied", file=sys.stderr)
    except Exception as error:
        print(f"WARNING: VPN setup failed ({error}); continuing un-proxied", file=sys.stderr)
    return False

class ExtractorHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _fail(self, status: int, message: str) -> None:
        # Not send_error(status, message): that puts message in the HTTP
        # reason phrase, which http.server encodes as latin-1 — yt-dlp's
        # real error text (curly quotes etc.) crashes the whole connection
        # there instead of just reporting the error.
        body = message.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # Parse URL: /audio?v=ID or /audio/ID
        parsed = urllib.parse.urlparse(self.path)
        path_parts = parsed.path.strip("/").split("/")
        query_params = urllib.parse.parse_qs(parsed.query)
        
        video_id = None
        
        # Check path segments first
        if len(path_parts) == 2 and path_parts[0] == "audio":
            video_id = path_parts[1]
        # Check query string
        elif "v" in query_params:
            video_id = query_params["v"][0]
            
        if not video_id or not VIDEO_ID_RE.match(video_id):
            self._fail(400, "Invalid Video ID")
            return

        # Auth Check
        if TOKEN:
            auth_header = self.headers.get("Authorization", "")
            expected = f"Bearer {TOKEN}"
            if not hmac.compare_digest(auth_header, expected):
                self._fail(403, "Forbidden")
                return

        try:
            url, media_headers = resolve(video_id)
        except Exception as e:
            self._fail(500, f"Extraction failed: {e}")
            return

        # Streamed through _opener, the same path (proxied or not) that resolved
        # the URL — googlevideo pins the URL to whichever IP requested it, and to
        # the User-Agent/headers it was issued with.
        req = urllib.request.Request(url, headers=media_headers)
        range_header = self.headers.get("Range")
        if range_header:
            req.add_header("Range", range_header)

        try:
            with _opener(req, timeout=30) as response:
                status = response.status
                headers = dict(response.headers)
                
                self.send_response(status)
                for header, value in headers.items():
                    if header.lower() not in ("transfer-encoding", "content-encoding"):
                        self.send_header(header, value)
                
                self.end_headers()
                
                content_length = int(headers.get("Content-Length", 0))
                if content_length:
                    start, end, _ = parse_range(range_header, content_length)
                    for s, e in chunks(start, end):
                        chunk_req = urllib.request.Request(url, headers=media_headers)
                        chunk_req.add_header("Range", f"bytes={s}-{e}")
                        with _opener(chunk_req, timeout=30) as chunk_response:
                            while True:
                                chunk = chunk_response.read(8192)
                                if not chunk:
                                    break
                                self.wfile.write(chunk)
                else:
                    while True:
                        chunk = response.read(8192)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
        except Exception as e:
            self._fail(502, f"Proxy error: {e}")

if __name__ == "__main__":
    if not TOKEN:
        print("WARNING: EXTRACTOR_TOKEN is empty — anyone who finds this host can use it", file=sys.stderr)

    start_bgutil()
    wait_for_pot_server()

    if setup_vpn():
        _opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": VPN_PROXY, "https": VPN_PROXY})).open
    else:
        VPN_PROXY = None  # stop resolve() from handing yt-dlp a dead proxy reference

    server = ThreadingHTTPServer(("0.0.0.0", PORT), ExtractorHandler)
    print(f"Server running on port {PORT}")
    server.serve_forever()
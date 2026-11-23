"""Self-check for the byte maths. Run: python extractor/test_server.py

Needs no yt-dlp and no network — resolve() imports yt-dlp lazily for this reason.
"""

from unittest.mock import patch

from server import _cache, chunks, expiry_of, metadata, parse_range

# A Range the app sent is honoured and clamped to the file.
assert parse_range("bytes=0-4095", 3216302) == (0, 4095, True)
assert parse_range("bytes=100-", 1000) == (100, 999, True)
assert parse_range("bytes=0-99999", 1000) == (0, 999, True)

# No Range, or one we will not serve, means the whole file as a plain 200.
assert parse_range(None, 1000) == (0, 999, False)
assert parse_range("bytes=-500", 1000) == (0, 999, False)  # suffix range
assert parse_range("bytes=2000-", 1000) == (0, 999, False)  # past the end
assert parse_range("rubbish", 1000) == (0, 999, False)

# Chunks cover the window exactly, with no gap and no overlap.
assert chunks(0, 9, size=4) == [(0, 3), (4, 7), (8, 9)]
assert chunks(5, 5, size=4) == [(5, 5)]
window = chunks(0, 4250166)
assert window[0][0] == 0 and window[-1][1] == 4250166
assert all(b[0] == a[1] + 1 for a, b in zip(window, window[1:]))
assert sum(end - at + 1 for at, end in window) == 4250167

# The URL states its own deadline; a margin keeps us off the edge.
assert expiry_of("https://x/videoplayback?expire=2000000000&n=1") == 2000000000 - 300
assert expiry_of("https://x/videoplayback?no-expiry=1") > 0

# A seeking Safari issues many range requests per track; metadata() must only
# probe googlevideo once per resolved URL, not once per request.
class _FakeProbe:
    headers = {"Content-Range": "bytes 0-0/4250167", "Content-Type": "audio/mp4"}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


_cache.clear()
_cache["vid1"] = {"url": "https://u/1", "expiry": 9e18, "total": None, "content_type": None}
with patch("server.open_range", return_value=_FakeProbe()) as probe:
    first = metadata("vid1", "https://u/1")
    second = metadata("vid1", "https://u/1")
    assert first == (4250167, "audio/mp4")
    assert second == first
    assert probe.call_count == 1, f"probed {probe.call_count} times, want 1"

# A different resolved URL for the same id (the old one expired and a fresh
# one was fetched) must not reuse the stale probe result.
_cache["vid1"] = {"url": "https://u/2", "expiry": 9e18, "total": None, "content_type": None}
with patch("server.open_range", return_value=_FakeProbe()) as probe:
    metadata("vid1", "https://u/2")
    assert probe.call_count == 1

print("extractor self-check passed")

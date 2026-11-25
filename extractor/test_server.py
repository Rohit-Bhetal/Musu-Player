"""Self-check for the byte maths and the auth/POT wiring. Run: python extractor/test_server.py

Needs no yt-dlp and no network — resolve() imports yt-dlp lazily for this reason.
"""

import inspect

from server import CLIENT_CHAINS, chunks, expiry_of, parse_range, resolve, ExtractorHandler

# The POT provider must be wired in, or every resolve from a datacenter IP
# hits YouTube's bot-check with nothing to get past it.
assert "youtubepot-bgutilhttp" in inspect.getsource(resolve)

# The client rotation list must actually contain client names to try.
assert CLIENT_CHAINS and all(chain for chain in CLIENT_CHAINS)

# The token check must still gate every request, or this becomes an open
# proxy for anyone who finds the URL.
assert "compare_digest" in inspect.getsource(ExtractorHandler.do_GET)

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

print("extractor self-check passed")

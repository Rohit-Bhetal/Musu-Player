FROM python:3.12-slim

# Mainline yt-dlp cannot decode YouTube's SABR streaming protocol at all
# (open core limitation, github.com/yt-dlp/yt-dlp/pull/13515 — unmerged as of
# Nov 2026). That PR's own dev branch, from an actual yt-dlp maintainer, adds
# the real decoder and has user reports of working; installed from its exact
# commit (not the branch name, which can move) so this rebuild is reproducible.
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates \
    && pip install --no-cache-dir bgutil-ytdlp-pot-provider \
    && pip install --no-cache-dir --force-reinstall --no-deps \
         "yt-dlp @ git+https://github.com/coletdjnz/yt-dlp-dev.git@b7685f01f1c9b61c9b1293bf86ac4400d3748f0f" \
    && pip install --no-cache-dir protobug

# bgutil's companion token server mints the proof-of-origin token cloud hosts
# need to get past YouTube's bot-check; it's Node.js-only, no pure-Python
# option exists (see docs/MUSIC_SOURCE.md).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && git clone --depth 1 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
    && cd /opt/bgutil/server && npm ci && npx tsc \
    && apt-get purge -y --auto-remove curl git && rm -rf /var/lib/apt/lists/*

# wireproxy (userspace WireGuard, no NET_ADMIN/root needed) runs any real
# WireGuard config — e.g. a ProtonVPN one, mounted read-only at runtime via
# VPN_CONFIG_PATH — as a local HTTP proxy, exiting yt-dlp's traffic through
# that provider's IP instead of this host's own, which YouTube's bot-check
# flags. Cloudflare WARP was tried first (free, no account needed) but its
# IP pool turned out to already be broadly pre-flagged by YouTube.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL "https://github.com/windtf/wireproxy/releases/download/v1.1.3/wireproxy_linux_amd64.tar.gz" | tar -xz -C /usr/local/bin wireproxy \
    && apt-get purge -y --auto-remove curl && rm -rf /var/lib/apt/lists/*

COPY server.py /app/server.py
WORKDIR /app

ENV PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]

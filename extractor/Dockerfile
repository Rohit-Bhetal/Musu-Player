FROM python:3.12-slim

# yt-dlp breaks whenever YouTube changes; pinning would guarantee it breaks and
# stays broken, so rebuild this image to pick up a fix.
RUN pip install --no-cache-dir "yt-dlp>=2026.10.26"

COPY server.py /app/server.py
WORKDIR /app

ENV PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]

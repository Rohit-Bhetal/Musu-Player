# Unified YouTube search and playback

The Search screen uses the existing music catalog and YouTube's official Data
API v3 `search.list` endpoint. Results share one list. Selecting a YouTube
result opens it in YouTube's official IFrame Player API; direct YouTube URLs and
video IDs can also be entered in the same search field.

## API key setup

Enable YouTube Data API v3 in Google Cloud and set `YOUTUBE_API_KEY` as a
**secret server-side environment variable**. Never add the key to frontend
source or a `VITE_` variable. The Pages Function reads the key and does not
return it to the browser.

For Cloudflare Pages, add `YOUTUBE_API_KEY` under the project's environment
variables/secrets. Restrict the key to YouTube Data API v3 and monitor its
quota. The endpoint is public, so consider a Cloudflare rate limit before
launching broadly.

For local development, copy `.dev.vars.example` to `.dev.vars`, put your key in
that ignored local file, and run `npm run dev:pages`. The local app and function
share `http://localhost:8788`. `APP_ORIGIN` must match the exact origin used to
open the app.

The official embed is separate from the app's offline audio queue: YouTube
controls playback, and embedded videos are not downloaded or saved offline.

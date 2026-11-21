# YouTube Music player proxy

The React app sends player requests to `/api/youtubei/v1/player`. On Cloudflare
Pages, `functions/api/youtubei/v1/player.ts` forwards that fixed route to the
YouTube Music player endpoint and adds the mobile client headers on the server.
The function accepts requests only from the configured app origin; it is not a
general-purpose URL proxy.

Set the `APP_ORIGIN` environment variable in the Cloudflare Pages project to the
exact deployed origin, for example `https://music.example.com`. For local Pages
development, use the local app origin (for example `http://localhost:8788`).
Run the app through the Pages runtime so the `functions/` route is available;
plain Vite dev/preview serves only static assets and does not execute Pages
Functions.

The server-side User-Agent works around the browser restriction on setting that
header: the browser calls the same-origin function, and the function makes the
upstream request with the mobile User-Agent and YouTube client headers. This
only proxies the player response; it does not implement signature decryption
or make the returned media URLs downloadable offline. Use of YouTube endpoints
and content remains subject to YouTube's terms and applicable rights.

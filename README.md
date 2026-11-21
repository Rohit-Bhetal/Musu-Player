# Offline Music

An iPhone-first music PWA: install from Safari, download songs, play them with no
network, with Dynamic Island / Lock Screen controls.

Client-side only — no server of its own. Built with Vite + React + TypeScript
(strict) and `vite-plugin-pwa` (`injectManifest`, custom `src/sw.ts`).

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
```

`predev`/`prebuild` run `scripts/gen-assets.mjs`, which generates the app icons
and six royalty-free tone tracks with cover art and LRC lyrics into
`public/icons/` and `public/mock/`. Those folders are **generated, never
committed** — no copyrighted media lives in this repo.

```bash
npm run typecheck
npm test
npm run build
```

## Testing the production build on an iPhone from Ubuntu

The service worker, `display-mode: standalone` and Add to Home Screen all need
HTTPS, so `http://<your-lan-ip>` will not do. Use a tunnel:

```bash
npm run build && npm run preview          # serves dist/ on :4173
cloudflared tunnel --url http://localhost:4173
```

Open the printed `https://<something>.trycloudflare.com` URL on the iPhone, then
**Share → Add to Home Screen**. `preview.allowedHosts` in `vite.config.ts`
already allows `*.trycloudflare.com` (plus ngrok and localtunnel), so no edit is
needed per run.

> Downloads belong to one origin. Every `cloudflared` run hands out a **new**
> hostname, so the installed app starts with an empty library each time you
> change the URL. For repeated testing use a named tunnel with a stable
> hostname, or deploy once and test against that.

Data is also **not shared between the Safari tab and the installed app** — they
are separate storage contexts on iOS. Download inside the installed app.

## Debugging without a Mac

Settings → **Debug console** lazy-loads [eruda](https://github.com/liriliri/eruda)
(console, network, storage) directly on the phone. The choice is remembered.
Settings → **Diagnostics** shows standalone / service-worker / network state and
the last 50 player and Media Session events.

## Deploy

Static `dist/` with an SPA fallback. See `docs/` (added in P7).

# Musu Player

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

## Where the music comes from

`mockSource` today. See [docs/MUSIC_SOURCE.md](docs/MUSIC_SOURCE.md) for which
real sources clear the cross-origin-fetch bar (verified with real requests) and
which do not.

Audius, YouTube and internet radio all answer through one `MusicSource`, so
Search returns a single list and every row is an ordinary track: same audio
element, same queue, same Dynamic Island controls, same offline download.

YouTube needs two things on the server side. Search needs a `YOUTUBE_API_KEY`,
and audio needs the small container in [`extractor/`](extractor/) running
somewhere you control — YouTube no longer hands stream URLs to an anonymous
caller, so nothing client-side can replace it.
[docs/MUSIC_SOURCE.md](docs/MUSIC_SOURCE.md) has the measurements, the deploy
steps, and the terms-of-service caveat. Copy `.dev.vars.example` to `.dev.vars`
and run `npm run dev:pages`.

## Downloads, lyrics and volume

Tap the arrow beside any song to keep it on the device: audio, cover art and
lyrics, two at a time, resumable after a restart, with cancel, retry and delete.
A downloaded song plays from its blob, so it needs no network and costs no
bandwidth — Home shows a **Downloaded** row, and offline that is the only row.
Live radio has no end, so it is the one thing that cannot be downloaded.

Now Playing has a **Lyrics** toggle: synced LRC lines highlight and follow the
song, tapping a line seeks to it, and auto-scroll steps aside for three seconds
after you scroll. Lyrics come from LRCLIB and are saved with each download, so
they work offline too. Unsynced lyrics still show, just without the highlight.

The volume slider appears under the transport controls **except on iPhone**,
where iOS ignores any attempt to set volume and gives it to the hardware buttons
instead. The control is feature-tested rather than assumed, so it is simply
absent where it would do nothing.

## Cloud backup (optional)

Settings → **Sign in with Google** backs up playlists and play history to
Firestore, and restores them after a reinstall or on a second device. Nothing
about offline playback or downloads depends on this — it only ever adds a
cloud mirror on top of what IndexedDB already has, and Firestore's own offline
cache means an edit made while offline still queues and flushes once back
online, same as every other write in this app.

To turn it on:

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Build → Authentication → Sign-in method** → enable **Google**.
3. **Build → Firestore Database** → create a database (any region), then
   **Rules** tab → paste in [`firestore.rules`](firestore.rules) → Publish.
   It scopes every document to `users/{the signed-in user's own uid}`, which is
   the only thing actually stopping one user from reading another's data.
4. **Project settings → General → Your apps** → add a **Web app** → copy the
   config values into `.env.local` (gitignored; `.env.example` has the keys).
   These values are not secret — they identify the project, not authorize
   access to it — but a per-project default should not get committed.
5. **Authentication → Settings → Authorized domains** → add whatever origin
   you actually open the app from (`localhost` is already there; add your
   deployed domain).

Unset entirely, the Account row in Settings just does not appear.

## Deploy

Static `dist/` with an SPA fallback — Cloudflare Pages or GitHub Pages. Written
up in P7.

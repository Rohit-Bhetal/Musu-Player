# Picking a music source

`src/source/MusicSource.ts` is the only seam that knows where music comes from.
`apiSource` is wired up today and answers for every backend at once — Audius,
YouTube (audio only) and Radio Browser — told apart by an id prefix
(`audius:`, `youtube:`, `radio:`). One search, one list, one `<audio>` element.
`mockSource` is still there and replaces it by changing one line in
`src/source/index.ts`. No screen changes either way.

## The bar a source has to clear

The app downloads audio for offline playback, so it is not enough for a URL to
play in `<audio src>`. The bytes must be fetchable cross-origin:

```js
const res = await fetch(streamUrl)        // needs Access-Control-Allow-Origin
const blob = await res.blob()             // this is what gets stored
```

A URL that only works as `<audio src>` can be streamed but can **never** be
downloaded. That single requirement rules out most of the obvious options.

## Verified on 2026-11-21

Checked with `curl -H 'Origin: https://music.example.com' -D-`. CORS headers are
server-sent, so this is a sound test — but it is not Mobile Safari, and ITP may
still treat a third-party origin differently inside an installed PWA. Confirm
with one `fetch()` from the phone before building on it.

### Audius — works, fully client-side

| hop | status | header |
| --- | --- | --- |
| `api.audius.co/v1/tracks/{id}/stream` | 302 | `access-control-allow-origin: *` |
| `creatornode.audius.co/tracks/cidstream/…` | 307 | `access-control-allow-origin: *` |
| Cloudflare R2 presigned URL | 206 | `Access-Control-Allow-Origin: *` |

The final hop returned `Content-Type: audio/mpeg`, `Accept-Ranges: bytes`,
`Content-Range: bytes 0-2047/8486541` — a real 8.4 MB file. Search
(`/v1/tracks/search?query=&app_name=`) and artwork (`…/480x480.jpg`) are also
`ACAO: *`. No API key; `app_name` is just a label.

**Use the `/v1/tracks/{id}/stream` URL itself, never the resolved R2 link** —
that one is presigned with `X-Amz-Expires=300`. Caching it would break downloads
five minutes later. Letting the browser follow the redirect chain avoids this
entirely.

Trade-off: independent-artist catalog. Legal and reliable, but no Top-40.

### LRCLIB — works, use for lyrics

`https://lrclib.net/api/get?track_name=&artist_name=&album_name=&duration=`
returns `access-control-allow-origin: *`, no key. `syncedLyrics` is ready for
`src/lyrics/lrc.ts`; `plainLyrics` is the fallback. Also `/api/search?q=`.
Rate limit is per-IP; send a real `User-Agent`.

### Lyrica — optional, tried first when you run one

[`Wilooper/Lyrica`](https://github.com/Wilooper/Lyrica) is a self-hosted lyrics
aggregator (LRCLIB, Genius, Musixmatch, Apple Music, NetEase and others behind
one endpoint) — same shape as the YouTube extractor: it needs CORS and a stable
address it doesn't advertise, so `functions/api/lyrics.ts` proxies to it rather
than the browser calling it directly, and the function converts its
`timed_lyrics` (`{text, start_time_ms}[]`) into plain `[mm:ss.xx]` LRC text so
`src/lyrics/lrc.ts` needs no second parser. `apiSource.getLyrics` tries it first
for every track regardless of which backend streams it, and falls through to
LRCLIB untouched when `LYRICA_URL` is unset — the default is unchanged.

Run it with `docker compose up -d` (port 7860) or `python run.py` (port 9999),
set `LYRICA_URL` to that address, and `.dev.vars.example` has the local entry.

### Internet Archive — not dependable for audio

`advancedsearch.php` and `/metadata/{id}` are `ACAO: *`. The `/download/` path
is not: one probe returned `302` then `401`, another returned a `302` carrying
**no** ACAO header at all. Fine for metadata, unusable as a download source.

### YouTube — works, no box to run

Previously served by `extractor/`, a yt-dlp container you had to deploy and
keep fighting YouTube's bot-check from (SABR, PO tokens, IP reputation — see
git history on this file and on `extractor/` for that whole fight). Replaced
on 2026-11-25 by resolving through public Piped instances (docs.piped.video)
instead — no box to run, no bot-check to fight. No server-side cache: for
personal use, a track you care about replaying is what the app's own offline
download feature is for, so the only reliability lever here is retrying
across instances rather than storing results. `extractor/` is kept in the
repo as a reference/self-host fallback but is not deployed anywhere.

Measured on 2026-11-22, end to end against the (now retired) live extractor —
the facts below about IP-pinning and throttling still hold regardless of
whose infrastructure resolves the bytes first.

**Titles**: `functions/api/youtube/search.ts` calls Data API v3 `search.list`.
Needs `YOUTUBE_API_KEY` as a **server-side secret** — never a `VITE_` variable.

**Home's catalogue**: the same route with `?chart=music` calls `videos.list`
(`chart=mostPopular`, `videoCategoryId=10`) instead — scraping a page was the
obvious idea, but this is the supported endpoint, and at **1 quota unit against
`search.list`'s 100** it is the difference between a free home screen and
burning the daily allowance on browsing.

It charts several countries, one Home row each. The fan-out happens in the
function, so the phone makes **one request** rather than one per country —
measured at 0.36 s for five regions, and the response is cached for half an
hour because charts move daily. A country that fails is dropped and the rest
still render; only all of them failing is an error.

Which countries: `CHART_REGIONS` (comma-separated, e.g. `IN,US,GB,KR`) wins if
set. Otherwise it is the listener's own country from `request.cf.country`
followed by `US,GB,KR,BR` — deduplicated, so a British listener does not get two
UK rows, and capped at six to bound the quota. **Set it locally**: Cloudflare
reports its own edge in `wrangler pages dev`, which answered `HK` here.
`src/ui/home.ts` turns the code into a row title with `Intl.DisplayNames`.

**Audio**: `getStreamUrl('youtube:<id>')` returns `/api/youtube/audio?v=<id>`,
nothing else. That route rotates through public Piped instances (the
published list rots constantly — see TeamPiped/Piped#3760 — so it's fetched
live and edge-cached for 10 minutes, with a couple of confirmed-working
instances as a last-resort fallback, up to `MAX_ATTEMPTS` instances tried
before giving up) until one resolves the track, then streams that straight
through — `Range` included, so seeking stays a cheap partial fetch rather
than pulling the whole file.

Three measured facts forced that shape:

1. **Innertube alone no longer works.** Every client was tried against four
   videos, with and without `visitorData`: `ANDROID_VR` answers `Sign in to
   confirm you're not a bot`, `ANDROID_UNPLUGGED`/`ANDROID_CREATOR`/
   `IOS_UNPLUGGED` answer `Please sign in`, `TVHTML5_SIMPLY_EMBEDDED_PLAYER`
   answers `YouTube is no longer supported in this app`, `WEB`/`WEB_REMIX`/
   `MWEB` answer `Sign in to confirm you're not a bot`, and `IOS`/`ANDROID`
   return HTTP 400 `Precondition check failed`. Playback now needs a PO token
   from Google's BotGuard attestation, which means running their obfuscated JS —
   a server with a real runtime, not a Pages Function (Workers forbid `eval`).
   The public fallbacks are gone too: all six Piped instances answered
   403/500/525 or failed TLS, and the Invidious instances returned HTML error
   pages instead of audio. yt-dlp handles all of this and still works.
2. **Stream URLs are IP-pinned.** Every googlevideo URL carries an `ip=`
   parameter tying it to whoever resolved it, so a service that returned the URL
   would 403 on the phone's first byte. The extractor fetches the bytes itself.
3. **Resolving costs ~2.5 s.** A seeking Safari issues many range requests per
   track, so the extractor caches each resolved URL until shortly before its own
   `expire=` deadline. Measured: 2.5 s cold, **49 ms** warm.
4. **One open-ended read is throttled; ranges are not.** Asking googlevideo for
   a whole file gets ~32 KB/s — a 4.25 MB song took **131 s**, longer than the
   song. The same bytes pulled as 1 MiB ranges took **2.9 s**. So the extractor
   always reads upstream in `CHUNK_BYTES` ranges, whatever the app asked for.
   Without this the download queue would be unusable, which is easy to miss
   because playback alone looks fine either way.

Because the audio arrives same-origin, a YouTube track is an ordinary track:
`<audio>` plays it, Media Session puts it on the **Lock Screen and Dynamic
Island**, it keeps playing when the phone locks, and the P3 download queue can
read it as a Blob for **offline** use.

Verified end to end through `wrangler pages dev` against a running container:
search for "daft punk instant crush" returned the official video, a seek came
back `206 Content-Range: bytes 0-65535/5500539`, and the whole track downloaded
as 5,500,539 complete bytes of valid `ftyp/moov/sidx/moof/mdat` fragmented MP4 —
itag 140, AAC ~130 kbps, the one format iOS Safari decodes. An unknown origin
gets `403`, a bad id `400`, and the extractor's token never appears in anything
the browser receives.

**shortcut:** depends on public Piped instances staying up — their uptime is
inherently volatile (hobbyist-run, no SLA), which is exactly what the live
instance list, the hardcoded fallback hosts, and trying up to `MAX_ATTEMPTS`
of them are there to absorb. If playback starts failing across the board,
check whether the whole candidate list has gone dark before suspecting
anything in this repo. No server-side cache means a flaky instance costs a
failed/retried request rather than corrupting anything stored — upgrade to a
shared cache (R2 or similar) if this ever needs to serve more than one person.

**Running it.** Nothing to run, nothing to deploy. No token, no box, no IP to
worry about getting blocked.

**What this is.** Downloading YouTube content is against YouTube's Terms of
Service, and whether a given track is yours to keep offline is a copyright
question, not a technical one. The app makes it possible; it does not make it
permitted.

`getTrack('youtube:<id>')` uses the public, CORS-open **oEmbed** endpoint
straight from the browser — no key, no function. Artwork is
`i.ytimg.com/vi/<id>/mqdefault.jpg`, which needs no lookup at all.

Locally: copy `.dev.vars.example` to `.dev.vars` (gitignored), fill it in, and
run `npm run dev:pages` — plain `npm run dev` serves static assets only, so
`/api/` 404s and no YouTube rows appear. `APP_ORIGIN` must match the origin you
open exactly, which for `dev:pages` is `http://localhost:8788`.

## Ruled out (from research, not personally header-tested)

| | why |
| --- | --- |
| yt-dlp, Spotui `innertube` | native/server-side extractors. Cannot run in a browser. |
| Spotube | Kotlin Multiplatform app (`composeApp`/`iosApp`), no network service to call. Its resolvers are **JavaScript** plugins in a Zipline sandbox — readable as reference, but a sandbox is not subject to CORS and a browser is, so the logic does not transfer. |
| Cobalt | public API retired Nov 2024, self-host only. |
| Invidious | same idea as Piped but instances were all down or serving HTML error pages when checked; not revisited since Piped started working. |
| go-music-api | self-host only, wants real streaming-account cookies. |
| Jamendo, Deezer | no CORS. |
| Free Music Archive | API shut down. |

## If mainstream catalog is required

This was the open question, and `functions/api/youtube/audio.ts` is the
answer: a **CORS reflector on your own origin** backed by public Piped
instances, because a reflector alone has nothing left to reflect. It carries
YouTube-ToS risk on a public URL — an explicit choice, not a free lunch.

## Fallback order

1. Your own backend, if there is one — takes priority over everything.
2. Audius and YouTube together, interleaved in one list. YouTube rows always
   appear; whether they play depends on some Piped instance resolving the
   track on that request.
3. Whatever is already downloaded — offline, that is the whole library.
4. `mockSource` — always available, no network at all.

A backend that fails is logged to Settings > Diagnostics and dropped from the
results; it never takes the other one down with it.

Lyrics resolve from LRCLIB independently of which audio source answers.

# Picking a music source

`src/source/MusicSource.ts` is the only seam that knows where music comes from.
`mockSource` is wired up today; `apiSource` replaces it by changing one line in
`src/source/index.ts`. No screen changes.

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

### Internet Archive — not dependable for audio

`advancedsearch.php` and `/metadata/{id}` are `ACAO: *`. The `/download/` path
is not: one probe returned `302` then `401`, another returned a `302` carrying
**no** ACAO header at all. Fine for metadata, unusable as a download source.

## Ruled out (from research, not personally header-tested)

| | why |
| --- | --- |
| yt-dlp, Spotui `innertube` | native/server-side extractors. Cannot run in a browser. |
| Spotube | Kotlin Multiplatform app (`composeApp`/`iosApp`), no network service to call. Its resolvers are **JavaScript** plugins in a Zipline sandbox — readable as reference, but a sandbox is not subject to CORS and a browser is, so the logic does not transfer. |
| Cobalt | public API retired Nov 2024, self-host only. |
| Invidious / Piped | googlevideo sends no CORS headers; playback rides a third party's proxy. Instance count degrading, real ToS exposure. |
| go-music-api | self-host only, wants real streaming-account cookies. |
| Jamendo, Deezer | no CORS. |
| Free Music Archive | API shut down. |

## If mainstream catalog is required

The only honest path is a **Cloudflare Worker CORS reflector** in front of a
Piped instance — server-to-server fetch has no CORS restriction, so the Worker
re-emits the bytes under your own origin. Free tier is 100k requests/day with no
egress charge. This is self-hosted and carries YouTube-ToS risk on a public
Pages/Workers URL. Not a default; an explicit choice.

## Planned fallback order

1. Your own backend, if there is one — takes priority over everything.
2. Audius.
3. `mockSource` — always available, works offline.

Lyrics resolve from LRCLIB independently of which audio source answers.

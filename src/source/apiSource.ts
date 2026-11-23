import type { Lyrics, MusicSource, Track } from './MusicSource'
import { searchYouTubeVideos, type YouTubeVideo } from './youtubeSearch'
import { logEvent } from '../diagnostics'

/**
 * One source behind every screen: Audius for its own catalogue, YouTube for
 * everything else (audio only — no video embed), LRCLIB for lyrics, Radio
 * Browser for live stations. A track's backend is its id prefix, nothing else.
 *
 * youtube: audio arrives through our own Pages function, which is what makes it
 * CORS-fetchable and therefore downloadable; it needs the extractor box in
 * extractor/ behind it. See docs/MUSIC_SOURCE.md. The Piped code below is kept,
 * working and tested, but unreachable: search() never produces a piped:-prefixed
 * id, by design, not by accident.
 */
const AUDIUS_API = 'https://api.audius.co/v1'
const APP_NAME = 'spothub'
const PIPED_INSTANCES = ['https://pipedapi.kavin.rocks', 'https://pipedapi-libre.kavin.rocks']
const LRCLIB_API = 'https://lrclib.net/api'
/** Served by functions/api/lyrics.ts — see docs/MUSIC_SOURCE.md. 503s (and so
 * falls through to LRCLIB below) whenever no Lyrica instance is configured. */
const LYRICA_PATH = '/api/lyrics'
/** Served by functions/api/youtube/audio.ts — see docs/MUSIC_SOURCE.md. */
const YT_AUDIO_PATH = '/api/youtube/audio'
const RADIO_API = 'https://de1.api.radio-browser.info/json'

type Backend = 'audius' | 'youtube' | 'piped' | 'radio'

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const withId = (backend: Backend, rawId: string): string => `${backend}:${rawId}`

function splitId(id: string): [Backend, string] {
  const i = id.indexOf(':')
  // Without this, a colon-less id falls through to slice(0, -1) — "drop the
  // last character" — not "not found", so e.g. "audiusX" was silently read
  // as backend "audius" with the whole original string as its id, instead of
  // throwing here with a clear error.
  if (i < 0) throw new Error(`unknown track id ${id}`)
  const backend = id.slice(0, i)
  if (backend !== 'audius' && backend !== 'youtube' && backend !== 'piped' && backend !== 'radio') {
    throw new Error(`unknown track id ${id}`)
  }
  return [backend, id.slice(i + 1)]
}

/* ------------------------------------------------------------- audius --- */

interface AudiusTrack {
  id: string
  title: string
  user: { name: string }
  duration: number
  artwork?: Record<string, string>
}

function fromAudius(t: AudiusTrack): Track {
  return {
    id: withId('audius', t.id),
    title: t.title,
    artist: t.user.name,
    durationSec: t.duration,
    artworkUrl: t.artwork?.['480x480'] ?? t.artwork?.['150x150'],
  }
}

async function audiusGet<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${AUDIUS_API}${path}${sep}app_name=${APP_NAME}`)
  if (!res.ok) throw new Error(`audius ${res.status}`)
  return (await res.json()) as T
}

/* ------------------------------------------------------------ youtube --- */

/** No round trip needed — YouTube serves this for every video id. */
const ytThumbnail = (videoId: string): string => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`

export const fromYouTubeVideo = (v: YouTubeVideo): Track => ({
  id: withId('youtube', v.videoId),
  title: v.title,
  artist: v.channelTitle,
  artworkUrl: v.thumbnailUrl ?? ytThumbnail(v.videoId),
})

// Shared tokenizer: lowercase, split on anything that isn't a letter/digit.
// Every word-based check below runs off this one pass instead of its own.
const wordsOf = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

// A title saying it plainly ("Official Video"/"Official Audio"/"Official
// Music Video") is the strongest signal there is — stronger than a channel
// merely looking authoritative, since a reposting channel can't fake this
// phrase without YouTube's own copyright matching catching it.
const OFFICIAL_AUDIO_VIDEO = /\bofficial\s+(music\s+)?(video|audio)\b/i

// Whole title *words* that mark a cover/alternate version rather than the
// original — a Set so checking a title is a handful of O(1) lookups against
// its tokens, not N substring scans. Word-boundary tokenizing also means
// "coverage" or "recovery" in a title never false-matches "cover".
const COVER_WORDS = new Set([
  'cover',
  'covers',
  'karaoke',
  'tribute',
  'unplugged',
  'acoustic',
  'reprise',
  'instrumental',
  'remix',
  'edit',
  'parody',
  'nightcore',
  'slowed',
  'sped',
])

// Channel-name *substrings* (no word boundaries to rely on — "VEVO"/"Topic"
// are glued onto a channel name, not separate words) that mark an upload as
// the authoritative source: a label's own channel, YouTube's auto-generated
// "Artist - Topic" channel, or an "Official"-branded one.
const AUTHORITATIVE_CHANNEL_MARKERS = ['vevo', 'official', '- topic', 'records', 'music company']

const isCoverTitle = (title: string): boolean => wordsOf(title).some((word) => COVER_WORDS.has(word))

const isAuthoritativeChannel = (channelTitle: string): boolean => {
  const lower = channelTitle.toLowerCase()
  return AUTHORITATIVE_CHANNEL_MARKERS.some((marker) => lower.includes(marker))
}

/** Fraction (0-1) of the typed query's own words that show up in this title —
 * a search for "kalank title song" should rank a title that actually says
 * "Kalank" and "Title" above one that only matched by looser relevance. Set
 * membership again, not a substring scan per query word. */
const queryOverlap = (title: string, queryWords: Set<string>): number => {
  if (queryWords.size === 0) return 0
  const titleWords = wordsOf(title)
  const hits = titleWords.filter((w) => queryWords.has(w)).length
  return hits / queryWords.size
}

/** YouTube's own relevance ranking regularly puts a cover/karaoke/remix
 * upload ahead of the actual official upload, or ahead of a title that more
 * plainly says what was typed — this reorders for that, but only ever moves
 * a result backward or forward a tier, never drops it. "official video/
 * audio" is the strongest tier; covers/remixes/edits are the weakest; query
 * word overlap breaks ties within a tier; a stable sort keeps YouTube's own
 * relevance order intact beneath all of that. */
function rankYouTubeResults(videos: YouTubeVideo[], query: string): YouTubeVideo[] {
  const queryWords = new Set(wordsOf(query))
  const tierOf = (v: YouTubeVideo): number =>
    (OFFICIAL_AUDIO_VIDEO.test(v.title) ? -2 : 0) +
    (isCoverTitle(v.title) ? 1 : 0) -
    (isAuthoritativeChannel(v.channelTitle) ? 1 : 0) -
    queryOverlap(v.title, queryWords) * 0.5
  return [...videos].sort((a, b) => tierOf(a) - tierOf(b))
}

/** oEmbed is public, CORS-open and needs no key — enough to name a pasted link.
 * It carries no duration; the audio element reports that once the track loads. */
async function youtubeTrack(videoId: string): Promise<Track> {
  const watch = `https://www.youtube.com/watch?v=${videoId}`
  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`)
  if (!res.ok) throw new Error(`youtube ${res.status}`) // 401/404 = private or removed
  const data = (await res.json()) as { title?: string; author_name?: string }
  return {
    id: withId('youtube', videoId),
    title: data.title ?? 'YouTube track',
    artist: data.author_name ?? 'YouTube',
    artworkUrl: ytThumbnail(videoId),
  }
}

/* -------------------------------------------------------------- piped --- */

interface PipedStream {
  title: string
  uploader: string
  thumbnailUrl: string
  duration: number
  audioStreams: { url: string; bitrate: number }[]
}

function fromPipedStream(videoId: string, s: PipedStream): Track {
  return {
    id: withId('piped', videoId),
    title: s.title,
    artist: s.uploader,
    durationSec: s.duration,
    artworkUrl: s.thumbnailUrl,
  }
}

/** shortcut: no memory of which instances were down, so a dead instance is retried on
 * every call; upgrade to a short-lived health cache if the pool grows past a couple
 * of entries or a dead instance's timeout starts costing real latency. */
async function pipedFetch<T>(path: string): Promise<T> {
  let lastError: unknown
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}${path}`)
      if (!res.ok) throw new Error(`piped ${res.status}`)
      return (await res.json()) as T
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('all piped instances failed')
}

const pipedStream = (videoId: string): Promise<PipedStream> => pipedFetch(`/streams/${videoId}`)

/* -------------------------------------------------------------- radio --- */

interface RadioStation {
  stationuuid: string
  name: string
  url_resolved: string
  tags: string
  country: string
  favicon: string
}

function fromRadioStation(s: RadioStation): Track {
  return {
    id: withId('radio', s.stationuuid),
    title: s.name.trim() || 'Radio station',
    artist: s.tags || s.country || 'Live radio',
    durationSec: undefined,
    artworkUrl: s.favicon || undefined,
  }
}

async function radioLookup(uuid: string): Promise<RadioStation> {
  const res = await fetch(`${RADIO_API}/stations/byuuid?uuids=${uuid}`)
  if (!res.ok) throw new Error(`radio ${res.status}`)
  const [station] = (await res.json()) as RadioStation[]
  if (!station) throw new Error(`unknown station ${uuid}`)
  return station
}

// Mixed content: plenty of listed stations are still bare http:// and silently fail
// to load from this https:// app, so only https stations are offered at all.
const isPlayable = (s: RadioStation): boolean => s.url_resolved.startsWith('https://')

export async function searchRadioStations(query: string): Promise<Track[]> {
  const q = query.trim()
  const path = q
    ? `/stations/search?name=${encodeURIComponent(q)}&limit=30&hidebroken=true&order=clickcount&reverse=true`
    : `/stations/topclick/30?hidebroken=true`
  try {
    const res = await fetch(`${RADIO_API}${path}`)
    if (!res.ok) throw new Error(`radio ${res.status}`)
    const stations = (await res.json()) as RadioStation[]
    return stations.filter(isPlayable).map(fromRadioStation)
  } catch {
    return []
  }
}

// Reuses COVER_WORDS: a "(Karaoke Version)"/"(Cover)" annotation is exactly
// as much noise for a lyrics lookup as "(Official Video)" is, and the two
// titles need to normalize to the same core name for Search's grouping below.
const YT_TITLE_NOISE = new RegExp(
  `\\b(official( music)?( video| audio)?|lyrics?( video)?|visualizer|mv|hd|4k|${[...COVER_WORDS].join('|')})\\b`,
  'i',
)

/** Strips a bracketed "(Official Video)"/"ft. X" credit — noise LRCLIB's own
 * metadata never has, and a lyrics lookup was failing even when the song is
 * on LRCLIB under its plain name. */
function stripYouTubeNoise(title: string): string {
  return (
    title
      .replace(/[([][^)\]]*[)\]]/g, (bracketed) => (YT_TITLE_NOISE.test(bracketed) ? '' : bracketed))
      .replace(/\s*[([]?\s*\b(ft\.?|feat\.?|featuring)\b.*$/i, '')
      .trim() || title
  )
}

/** Everything before the first "-"/"|": harmless for a clean title, but the
 * difference between finding and not finding a film-channel upload, whose
 * title is routinely "Song Name - Tag | Cast | Singer | Composer" (verified
 * live against LRCLIB: the full title+credits string finds nothing, the song
 * name alone does) — trying to also guess which side of a dash is the
 * *artist* was a previous approach, and it silently swapped title/artist on
 * exactly this shape of title, so this never attempts that. */
const truncateAtSeparator = (title: string): string => title.split(/\s*[-–|]\s*/)[0]?.trim() || title

/** The song's "core" name with YouTube's noise stripped and truncated down to
 * just the title — used to tell whether two search results (an official
 * upload, a lyrics re-post, a cover, the same song again from Audius) are
 * actually the same underlying song, for Search's "N more versions" group. */
export function coreSongTitle(title: string): string {
  return truncateAtSeparator(stripYouTubeNoise(title)).toLowerCase()
}

function cleanForLyrics(track: Track): { title: string; artist: string; shortTitle: string } {
  const artist = track.artist.replace(/\s*[-–]\s*Topic$/i, '').replace(/VEVO$/i, '').trim() || track.artist
  const title = stripYouTubeNoise(track.title)
  const shortTitle = truncateAtSeparator(title)
  return { title, artist, shortTitle }
}

/** null on any failure — missing config, network error, or no match — so the
 * caller's LRCLIB fallback is the only place that has to handle "no lyrics". */
async function lyricaLyrics(track: Track): Promise<Lyrics | null> {
  if (!track.title || !track.artist) return null
  const { title, artist, shortTitle } = cleanForLyrics(track)
  const ask = async (song: string): Promise<Lyrics | null> => {
    const res = await fetch(`${LYRICA_PATH}?${new URLSearchParams({ artist, song })}`)
    if (!res.ok) return null
    const data = (await res.json()) as { kind?: 'lrc' | 'plain'; text?: string }
    return data.kind && data.text ? ({ kind: data.kind, text: data.text } satisfies Lyrics) : null
  }
  return (await ask(title)) ?? (shortTitle !== title ? ask(shortTitle) : null)
}

const lyricsFrom = (raw: { syncedLyrics?: string; plainLyrics?: string }): Lyrics | null => {
  if (raw.syncedLyrics) return { kind: 'lrc', text: raw.syncedLyrics }
  if (raw.plainLyrics) return { kind: 'plain', text: raw.plainLyrics }
  return null
}

async function lrclibSearch(q: string): Promise<Lyrics | null> {
  const searched = await fetch(`${LRCLIB_API}/search?${new URLSearchParams({ q })}`)
  if (!searched.ok) return null
  const results = (await searched.json()) as { syncedLyrics?: string; plainLyrics?: string }[]
  for (const result of results) {
    const found = lyricsFrom(result)
    if (found) return found
  }
  return null
}

async function lrclibLyrics(track: Track): Promise<Lyrics | null> {
  const { title, artist, shortTitle } = cleanForLyrics(track)
  const params = new URLSearchParams({ track_name: title, artist_name: artist })
  if (track.durationSec) params.set('duration', String(Math.round(track.durationSec)))

  const exact = await fetch(`${LRCLIB_API}/get?${params}`)
  if (exact.ok) {
    const found = lyricsFrom(await exact.json())
    if (found) return found
  }

  // /get still needs an exact match; cleaning narrows the gap but doesn't
  // close it, so this falls back to the same fuzzy /search LRCLIB's own site
  // uses, first with the full cleaned title+artist (right for "Artist -
  // Title" channels). The second attempt drops the artist entirely and
  // searches shortTitle alone — verified live against LRCLIB: a channel name
  // appended to an already-short query was *more* likely to bury the real
  // song than help, since a reposting channel is rarely the actual artist.
  return (await lrclibSearch(`${title} ${artist}`)) ?? (shortTitle !== title ? lrclibSearch(shortTitle) : null)
}

/* --------------------------------------------------------------- track --- */

export async function audiusTrending(): Promise<Track[]> {
  try {
    const { data } = await audiusGet<{ data: AudiusTrack[] }>('/tracks/trending')
    return data.map(fromAudius)
  } catch (e) {
    logEvent('source:audius-failed', message(e))
    return []
  }
}

async function audiusSearch(q: string): Promise<Track[]> {
  try {
    const { data } = await audiusGet<{ data: AudiusTrack[] }>(`/tracks/search?query=${encodeURIComponent(q)}`)
    return data.map(fromAudius)
  } catch (e) {
    logEvent('source:audius-failed', message(e))
    return []
  }
}

async function youtubeSearch(q: string): Promise<Track[]> {
  if (q.length < 2) return [] // the search function refuses anything shorter
  try {
    return rankYouTubeResults(await searchYouTubeVideos(q), q).map(fromYouTubeVideo)
  } catch (e) {
    // one list means one silent failure; Settings > Diagnostics is where a
    // missing YOUTUBE_API_KEY shows up
    logEvent('source:youtube-failed', message(e))
    return []
  }
}

async function resolveTrack(id: string): Promise<Track> {
  const [backend, raw] = splitId(id)
  if (backend === 'audius') {
    const { data } = await audiusGet<{ data: AudiusTrack }>(`/tracks/${raw}`)
    return fromAudius(data)
  }
  if (backend === 'youtube') return youtubeTrack(raw)
  if (backend === 'radio') return fromRadioStation(await radioLookup(raw))
  return fromPipedStream(raw, await pipedStream(raw))
}

export const apiSource: MusicSource = {
  async search(query) {
    const q = query.trim()
    // Browsing "everything" is Home's job now (src/ui/home.ts:homeRows), which
    // shows per-country chart rows search() has no way to represent in a flat
    // list. An empty query here used to re-run that whole fan-out a second
    // time — Search fired it on every mount, at 6 YouTube quota units apiece.
    if (!q) return []

    const [audius, youtube] = await Promise.all([audiusSearch(q), youtubeSearch(q)])
    // YouTube first: for a song someone's actually naming, YouTube has the
    // real/official upload far more often than Audius's independent-artist
    // catalogue does, so Audius results rank below every YouTube one rather
    // than interleaving with them.
    return [...youtube, ...audius]
  },

  getTrack: resolveTrack,

  async getStreamUrl(id) {
    const [backend, raw] = splitId(id)
    if (backend === 'audius') return `${AUDIUS_API}/tracks/${raw}/stream?app_name=${APP_NAME}`
    // our own route, never a googlevideo URL: those are pinned to the IP that
    // resolved them, so the bytes come back through the extractor and the function
    if (backend === 'youtube') return `${YT_AUDIO_PATH}?v=${raw}`
    if (backend === 'radio') return (await radioLookup(raw)).url_resolved
    const best = [...(await pipedStream(raw)).audioStreams].sort((a, b) => b.bitrate - a.bitrate)[0]
    if (!best) throw new Error(`no audio stream for ${id}`)
    return best.url
  },

  async getArtworkUrl(id, size) {
    const [backend, raw] = splitId(id)
    if (backend === 'audius') {
      const { data } = await audiusGet<{ data: AudiusTrack }>(`/tracks/${raw}`)
      return (size <= 150 ? data.artwork?.['150x150'] : data.artwork?.['480x480']) ?? null
    }
    if (backend === 'youtube') return ytThumbnail(raw)
    if (backend === 'radio') return (await radioLookup(raw)).favicon || null
    return (await pipedStream(raw)).thumbnailUrl ?? null
  },

  async getLyrics(id) {
    const track = await resolveTrack(id)

    // Lyrica (self-hosted, see docs/MUSIC_SOURCE.md) aggregates 8 sources and
    // is tried first when configured — same track, any backend, since lyrics
    // are looked up by title/artist, not by the id that resolved them.
    const fromLyrica = await lyricaLyrics(track).catch(() => null)
    if (fromLyrica) return fromLyrica

    return lrclibLyrics(track).catch(() => null)
  },

  // listAlbum/listPlaylist skipped: optional on MusicSource, no current caller, and
  // neither backend maps cleanly onto "album" the way the mock catalogue did.
}

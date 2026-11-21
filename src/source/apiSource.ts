import type { Lyrics, MusicSource, Track } from './MusicSource'

/**
 * Audius first: real audio, CORS-friendly, no key, lowest legal risk — but an
 * indie-only catalogue, so most mainstream searches come back empty. Piped is
 * the fallback for catalogue coverage (anything on YouTube), at the cost of
 * relying on third-party public instances of unknown uptime.
 */
const AUDIUS_API = 'https://api.audius.co/v1'
const APP_NAME = 'spothub'
const PIPED_INSTANCES = ['https://pipedapi.kavin.rocks', 'https://pipedapi-libre.kavin.rocks']
const LRCLIB_API = 'https://lrclib.net/api'

type Backend = 'audius' | 'piped'

const withId = (backend: Backend, rawId: string): string => `${backend}:${rawId}`

function splitId(id: string): [Backend, string] {
  const i = id.indexOf(':')
  const backend = id.slice(0, i)
  if (backend !== 'audius' && backend !== 'piped') throw new Error(`unknown track id ${id}`)
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

interface PipedSearchItem {
  url: string
  title: string
  uploaderName: string
  thumbnail: string
  duration: number
  type: string
}

async function pipedSearch(query: string): Promise<Track[]> {
  const { items } = await pipedFetch<{ items: PipedSearchItem[] }>(
    `/search?q=${encodeURIComponent(query)}&filter=music_songs`,
  )
  return items
    .filter((it) => it.type === 'stream' && it.url.includes('v='))
    .map((it) => ({
      id: withId('piped', it.url.split('v=')[1] ?? ''),
      title: it.title,
      artist: it.uploaderName,
      durationSec: it.duration,
      artworkUrl: it.thumbnail,
    }))
}

/* --------------------------------------------------------------- track --- */

async function resolveTrack(id: string): Promise<Track> {
  const [backend, raw] = splitId(id)
  if (backend === 'audius') {
    const { data } = await audiusGet<{ data: AudiusTrack }>(`/tracks/${raw}`)
    return fromAudius(data)
  }
  return fromPipedStream(raw, await pipedStream(raw))
}

export const apiSource: MusicSource = {
  async search(query) {
    const q = query.trim()

    if (!q) {
      // empty query browses "everything" — there is no such thing from an internet
      // catalogue, so trending stands in for it, same as Library's old mock browse.
      try {
        const { data } = await audiusGet<{ data: AudiusTrack[] }>('/tracks/trending')
        return data.map(fromAudius)
      } catch {
        return []
      }
    }

    try {
      const { data } = await audiusGet<{ data: AudiusTrack[] }>(`/tracks/search?query=${encodeURIComponent(q)}`)
      if (data.length > 0) return data.map(fromAudius)
    } catch {
      // fall through to Piped
    }

    try {
      return await pipedSearch(q)
    } catch {
      return []
    }
  },

  getTrack: resolveTrack,

  async getStreamUrl(id) {
    const [backend, raw] = splitId(id)
    if (backend === 'audius') return `${AUDIUS_API}/tracks/${raw}/stream?app_name=${APP_NAME}`
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
    return (await pipedStream(raw)).thumbnailUrl ?? null
  },

  async getLyrics(id) {
    const track = await resolveTrack(id)
    const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist })
    if (track.durationSec) params.set('duration', String(Math.round(track.durationSec)))

    const res = await fetch(`${LRCLIB_API}/get?${params}`)
    if (!res.ok) return null
    const lyrics = (await res.json()) as { syncedLyrics?: string; plainLyrics?: string }
    if (lyrics.syncedLyrics) return { kind: 'lrc', text: lyrics.syncedLyrics } satisfies Lyrics
    if (lyrics.plainLyrics) return { kind: 'plain', text: lyrics.plainLyrics } satisfies Lyrics
    return null
  },

  // listAlbum/listPlaylist skipped: optional on MusicSource, no current caller, and
  // neither backend maps cleanly onto "album" the way the mock catalogue did.
}

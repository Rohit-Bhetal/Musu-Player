import type { Lyrics, MusicSource, Track } from './MusicSource'

/**
 * Audius only, live — see docs/MUSIC_SOURCE.md. googlevideo (Piped/Invidious)
 * sends no CORS headers on the audio bytes themselves, so nothing fetched
 * through it can ever become a Blob for offline download, which this app
 * requires. The Piped code below (pipedStream/fromPipedStream and the
 * getters' 'piped' branch) is kept, working and tested, but unreachable:
 * search() never produces a piped:-prefixed id, by design, not by accident.
 */
const AUDIUS_API = 'https://api.audius.co/v1'
const APP_NAME = 'spothub'
const PIPED_INSTANCES = ['https://pipedapi.kavin.rocks', 'https://pipedapi-libre.kavin.rocks']
const LRCLIB_API = 'https://lrclib.net/api'
const RADIO_API = 'https://de1.api.radio-browser.info/json'

type Backend = 'audius' | 'piped' | 'radio'

const withId = (backend: Backend, rawId: string): string => `${backend}:${rawId}`

function splitId(id: string): [Backend, string] {
  const i = id.indexOf(':')
  const backend = id.slice(0, i)
  if (backend !== 'audius' && backend !== 'piped' && backend !== 'radio') throw new Error(`unknown track id ${id}`)
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

/* --------------------------------------------------------------- track --- */

async function resolveTrack(id: string): Promise<Track> {
  const [backend, raw] = splitId(id)
  if (backend === 'audius') {
    const { data } = await audiusGet<{ data: AudiusTrack }>(`/tracks/${raw}`)
    return fromAudius(data)
  }
  if (backend === 'radio') return fromRadioStation(await radioLookup(raw))
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
      return data.map(fromAudius)
    } catch {
      // Audius down — ruled out reaching for Piped here, see file header.
      return []
    }
  },

  getTrack: resolveTrack,

  async getStreamUrl(id) {
    const [backend, raw] = splitId(id)
    if (backend === 'audius') return `${AUDIUS_API}/tracks/${raw}/stream?app_name=${APP_NAME}`
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
    if (backend === 'radio') return (await radioLookup(raw)).favicon || null
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

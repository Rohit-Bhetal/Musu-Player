import type { Lyrics, MusicSource, Track } from './MusicSource'

interface CatalogTrack extends Track {
  streamUrl: string
  lyricsUrl: string
}

interface Catalog {
  tracks: CatalogTrack[]
  albums: { id: string; name: string; trackIds: string[] }[]
}

/** public/mock is written by scripts/gen-assets.mjs — generated tones, never copyrighted media. */
let catalogPromise: Promise<Catalog> | null = null

function load(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = fetch('/mock/catalog.json')
      .then((r) => {
        if (!r.ok) throw new Error(`catalog ${r.status}`)
        return r.json() as Promise<Catalog>
      })
      .catch((e: unknown) => {
        catalogPromise = null // let the next call retry
        throw e
      })
  }
  return catalogPromise
}

async function find(id: string): Promise<CatalogTrack> {
  const track = (await load()).tracks.find((t) => t.id === id)
  if (!track) throw new Error(`unknown track ${id}`)
  return track
}

const strip = ({ streamUrl: _s, lyricsUrl: _l, ...track }: CatalogTrack): Track => track

export const mockSource: MusicSource = {
  async search(query) {
    const q = query.trim().toLowerCase()
    const { tracks } = await load()
    return tracks
      .filter((t) => !q || `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(q))
      .map(strip)
  },

  async getTrack(id) {
    return strip(await find(id))
  },

  async getStreamUrl(id) {
    return (await find(id)).streamUrl
  },

  async getArtworkUrl(id) {
    // the generated covers are already 512x512, so `size` has nothing to pick from
    return (await find(id)).artworkUrl ?? null
  },

  async getLyrics(id) {
    const { lyricsUrl } = await find(id)
    const res = await fetch(lyricsUrl)
    if (!res.ok) return null
    const text = await res.text()
    return { kind: lyricsUrl.endsWith('.lrc') ? 'lrc' : 'plain', text } satisfies Lyrics
  },

  async listAlbum(id) {
    const catalog = await load()
    const album = catalog.albums.find((a) => a.id === id)
    if (!album) return []
    return album.trackIds
      .map((tid) => catalog.tracks.find((t) => t.id === tid))
      .filter((t): t is CatalogTrack => Boolean(t))
      .map(strip)
  },
}

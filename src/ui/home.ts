import type { Track } from '../source/MusicSource'

/** Row titles for tracks the source gives no album for — the API source never sets one. */
const BROWSE_TITLES = ['Trending now', 'Fresh finds', 'More to explore', 'Keep listening']
const ROW_SIZE = 8

/** Home's carousels: one per album, plus evenly sized browse rows for albumless tracks. */
export function sections(tracks: readonly Track[]): [string, Track[]][] {
  const albums = new Map<string, Track[]>()
  const loose: Track[] = []
  for (const t of tracks) {
    if (!t.album) {
      loose.push(t)
      continue
    }
    const list = albums.get(t.album)
    if (list) list.push(t)
    else albums.set(t.album, [t])
  }

  const browse: [string, Track[]][] = []
  for (let i = 0; i < loose.length; i += ROW_SIZE) {
    // titles must stay unique: Library keys its sections by title, so cycling a
    // fixed list would collide once there are more than BROWSE_TITLES * ROW_SIZE
    // albumless tracks — which is every track once a real API source is on
    const n = i / ROW_SIZE
    browse.push([BROWSE_TITLES[n] ?? `More music ${n - BROWSE_TITLES.length + 1}`, loose.slice(i, i + ROW_SIZE)])
  }
  return [...browse, ...albums]
}

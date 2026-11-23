import type { Track } from '../source/MusicSource'
import { coreSongTitle } from '../source/apiSource'

export interface TrackGroup {
  primary: Track
  /** Index into the original, already-ranked list — onPlay needs this, not a group-local index. */
  primaryIndex: number
  alternates: { track: Track; index: number }[]
}

/** Search results for the same song routinely arrive several times over — an
 * official upload, a lyrics re-post, a cover, the same song again from
 * Audius — each already individually ranked by apiSource.search(). Grouping
 * by the song's core title keeps the first (best-ranked) one of each group
 * visible and tucks the rest behind a disclosure, in arrival order. */
export function groupDuplicates(tracks: Track[]): TrackGroup[] {
  const groups = new Map<string, TrackGroup>()
  const order: string[] = []

  tracks.forEach((track, index) => {
    const key = coreSongTitle(track.title)
    const group = groups.get(key)
    if (group) {
      group.alternates.push({ track, index })
    } else {
      groups.set(key, { primary: track, primaryIndex: index, alternates: [] })
      order.push(key)
    }
  })

  return order.map((key) => groups.get(key)!)
}

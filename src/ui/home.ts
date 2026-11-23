import type { Track } from '../source/MusicSource'
import { audiusTrending, fromYouTubeVideo } from '../source/apiSource'
import { fetchYouTubeCharts } from '../source/youtubeSearch'
import { downloadedTracks, isDownloaded } from '../storage/downloads'
import { history } from '../storage/history'

/** A track's backend is its id prefix; see src/source/apiSource.ts. */
const BACKEND_ROWS: Record<string, string> = {
  youtube: 'Trending on YouTube',
  audius: 'Trending on Audius',
  radio: 'Live radio',
}

const UNLABELLED = 'More music'

// Audius trending alone returns 100 tracks; a strip that long is a chore to
// scroll and 100 images to decode. Home is a sampler — Search is the catalogue.
const ROW_MAX = 20

/**
 * Home's carousels: one row per album where the source has albums, otherwise one
 * per backend. A `.strip` scrolls sideways, so a row holds its tracks rather than
 * being sliced into numbered leftovers — up to ROW_MAX of them.
 */
export function sections(tracks: readonly Track[]): [string, Track[]][] {
  const rows = new Map<string, Track[]>()
  for (const track of tracks) {
    const backend = track.id.includes(':') ? track.id.slice(0, track.id.indexOf(':')) : ''
    const title = track.album ?? BACKEND_ROWS[backend] ?? UNLABELLED
    const row = rows.get(title)
    if (!row) rows.set(title, [track])
    else if (row.length < ROW_MAX) row.push(track)
  }
  // Map keys are unique by construction, which Library needs: it keys by title.
  return [...rows]
}

/** 'IN' -> 'India'. English on purpose: every other string on screen is too. */
function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code
  } catch {
    return code // an unknown or malformed code is still a usable row title
  }
}

/**
 * Everything Home shows: what is on the device, a chart row per country, then
 * what Audius is playing. A backend that fails drops its rows instead of
 * emptying the screen; offline, only the downloaded row is reachable at all.
 */
export async function homeRows(isOnline: boolean): Promise<[string, Track[]][]> {
  // Downloads first and always: offline, they are the only row that works.
  const onDevice = await downloadedTracks().catch(() => [])
  const downloadedRow: [string, Track[]][] =
    onDevice.length > 0 ? [['Downloaded', onDevice.slice(0, ROW_MAX)]] : []

  // Local, like downloads — but offline, a track that streamed last time and
  // is not saved would just fail to tap, so it is filtered out the same way
  // the rest of this function already drops anything that would not play.
  const recent = history.get()
  const playableRecent = isOnline ? recent : recent.filter((t) => isDownloaded(t.id))
  const recentRow: [string, Track[]][] =
    playableRecent.length > 0 ? [['Recently played', [...playableRecent].slice(0, ROW_MAX)]] : []

  if (!isOnline) return [...downloadedRow, ...recentRow]

  const [charts, trending] = await Promise.all([
    fetchYouTubeCharts().catch(() => []),
    audiusTrending(),
  ])

  const byCountry: [string, Track[]][] = charts
    .filter((section) => section.items.length > 0)
    .map((section) => [
      `Trending in ${regionName(section.region)}`,
      section.items.slice(0, ROW_MAX).map(fromYouTubeVideo),
    ])

  return [...downloadedRow, ...recentRow, ...byCountry, ...sections(trending)]
}

import type { Track } from '../source/MusicSource'
import { createStore, type Store } from '../ui/store'
import { listHistory, saveHistory, clearHistoryStore } from './db'

/** Enough for Home's row to feel like "recent", not a whole listening log. */
const MAX_HISTORY = 30

export const history: Store<readonly Track[]> = createStore<readonly Track[]>([])

function put(track: Track): void {
  const rest = history.get().filter((t) => t.id !== track.id)
  history.set([track, ...rest].slice(0, MAX_HISTORY))
}

export async function initHistory(): Promise<void> {
  const saved = await listHistory().catch(() => [])
  history.set(
    [...saved]
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, MAX_HISTORY)
      .map((r) => r.track),
  )
}

/** Called once per track change. Keyed by trackId (not an append-only log),
 * so replaying a song moves it back to the top instead of listing it twice. */
export async function recordPlay(track: Track): Promise<void> {
  put(track)
  await saveHistory({ trackId: track.id, track, playedAt: Date.now() }).catch(() => undefined)
}

export async function clearHistory(): Promise<void> {
  history.set([])
  await clearHistoryStore().catch(() => undefined)
}

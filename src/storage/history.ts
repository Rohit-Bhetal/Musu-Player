import type { Track } from '../source/MusicSource'
import { createStore, type Store } from '../ui/store'
import { listHistory, saveHistory, clearHistoryStore, type HistoryRecord } from './db'

/** Enough for Home's row to feel like "recent", not a whole listening log. */
const MAX_HISTORY = 30

export const history: Store<readonly Track[]> = createStore<readonly Track[]>([])

function put(track: Track): void {
  const rest = history.get().filter((t) => t.id !== track.id)
  history.set([track, ...rest].slice(0, MAX_HISTORY))
}

function applyRecords(records: readonly HistoryRecord[]): void {
  history.set(
    [...records]
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, MAX_HISTORY)
      .map((r) => r.track),
  )
}

type HistoryListener = (record: HistoryRecord) => void
const changeListeners = new Set<HistoryListener>()
const clearListeners = new Set<() => void>()

/** Fires once per recorded play, after it is persisted. Lets cloud sync
 * mirror writes to Firestore without storage/ needing to know sync exists. */
export function onHistoryChange(fn: HistoryListener): () => void {
  changeListeners.add(fn)
  return () => void changeListeners.delete(fn)
}

export function onHistoryClear(fn: () => void): () => void {
  clearListeners.add(fn)
  return () => void clearListeners.delete(fn)
}

export async function initHistory(): Promise<void> {
  const saved = await listHistory().catch(() => [])
  applyRecords(saved)
}

/** Called once per track change. Keyed by trackId (not an append-only log),
 * so replaying a song moves it back to the top instead of listing it twice. */
export async function recordPlay(track: Track): Promise<void> {
  put(track)
  const record: HistoryRecord = { trackId: track.id, track, playedAt: Date.now() }
  try {
    await saveHistory(record)
    for (const fn of changeListeners) fn(record)
  } catch {
    // local write failed; nothing to mirror to the cloud either
  }
}

export async function clearHistory(): Promise<void> {
  history.set([])
  await clearHistoryStore().catch(() => undefined)
  for (const fn of clearListeners) fn()
}

/** Merges cloud history into local — cloud only wins where it is newer (by
 * playedAt), same policy as importPlaylists in storage/playlists.ts. */
export async function importHistory(remote: readonly HistoryRecord[]): Promise<void> {
  const local = await listHistory().catch(() => [])
  const byId = new Map(local.map((r) => [r.trackId, r]))
  const changed: HistoryRecord[] = []
  for (const incoming of remote) {
    const existing = byId.get(incoming.trackId)
    if (!existing || incoming.playedAt > existing.playedAt) {
      byId.set(incoming.trackId, incoming)
      changed.push(incoming)
    }
  }
  if (changed.length === 0) return
  await Promise.all(changed.map(saveHistory))
  applyRecords([...byId.values()])
}

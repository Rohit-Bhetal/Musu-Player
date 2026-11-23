import { createStore, type Store } from './store'

const KEY = 'search:recent'
const MAX = 8

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

export const recentSearches: Store<readonly string[]> = createStore<readonly string[]>(load())

/** Most-recent-first, deduped case-insensitively, capped — a quick-tap list,
 * not a full history. */
export function recordSearch(query: string): void {
  const q = query.trim()
  if (!q) return
  const next = [q, ...recentSearches.get().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX)
  recentSearches.set(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode — the list just will not stick */
  }
}

export function clearRecentSearches(): void {
  recentSearches.set([])
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* private mode — nothing was stuck anyway */
  }
}

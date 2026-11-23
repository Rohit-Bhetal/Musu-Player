export type RepeatMode = 'off' | 'all' | 'one'

export const identityOrder = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

/**
 * Play order for `n` tracks with `first` pinned at the front, so turning shuffle
 * on never interrupts the song already playing. `first` < 0 shuffles everything.
 */
export function shuffledOrder(n: number, first: number, random: () => number = Math.random): number[] {
  const rest = identityOrder(n).filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = rest[i]
    rest[i] = rest[j]
    rest[j] = tmp
  }
  return first >= 0 && first < n ? [first, ...rest] : rest
}

export function nextPos(pos: number, len: number, wrap: boolean): number | null {
  if (len === 0) return null
  if (pos + 1 < len) return pos + 1
  return wrap ? 0 : null
}

export function prevPos(pos: number, len: number, wrap: boolean): number | null {
  if (len === 0) return null
  if (pos - 1 >= 0) return pos - 1
  return wrap ? len - 1 : null
}

/**
 * Whether a mid-playback media error should re-resolve and resume the same track
 * rather than skip it: only once per error episode (else a dead URL loops), and
 * only after real progress so a track that never loaded still skips.
 */
export const shouldRecover = (positionSec: number, alreadyRetried: boolean): boolean =>
  !alreadyRetried && positionSec > 0

/* --------------------------------------------------------- Up Next -----
 * Pure array edits on `order` (indices into `queue`, in play order) for the
 * queue-management actions — kept separate from PlayerEngine so they're
 * testable with no Audio element/DOM in the loop. */

/** "Play next": inserted right after whatever is currently playing. */
export const insertAfter = (order: readonly number[], afterPos: number, queueIndex: number): number[] => {
  const next = [...order]
  next.splice(afterPos + 1, 0, queueIndex)
  return next
}

/** "Add to queue": appended to the end, after everything already lined up. */
export const appendOrder = (order: readonly number[], queueIndex: number): number[] => [...order, queueIndex]

/** Reorders Up Next only — `from`/`to` must both be strictly after
 * `currentIndex`, so the currently playing position can neither move nor be
 * displaced by a drop. A no-op (a copy of `order`, unchanged) on anything
 * out of range rather than throwing: a stale position from a UI that hasn't
 * re-rendered yet should be ignored, not crash the player. */
export function moveOrder(order: readonly number[], currentIndex: number, from: number, to: number): number[] {
  if (from <= currentIndex || to <= currentIndex) return [...order]
  if (from < 0 || from >= order.length || to < 0 || to >= order.length) return [...order]
  const next = [...order]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) return [...order]
  next.splice(to, 0, moved)
  return next
}

/** Drops one Up Next position — `pos` must be strictly after `currentIndex`;
 * the track actually playing can never be removed this way. */
export function removeOrder(order: readonly number[], currentIndex: number, pos: number): number[] {
  if (pos <= currentIndex || pos >= order.length) return [...order]
  return order.filter((_, i) => i !== pos)
}

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

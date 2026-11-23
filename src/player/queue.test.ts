import { describe, expect, it } from 'vitest'
import {
  appendOrder,
  identityOrder,
  insertAfter,
  moveOrder,
  nextPos,
  prevPos,
  removeOrder,
  shouldRecover,
  shuffledOrder,
} from './queue'

/** Deterministic stand-in for Math.random. */
function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

describe('identityOrder', () => {
  it('counts up', () => {
    expect(identityOrder(4)).toEqual([0, 1, 2, 3])
    expect(identityOrder(0)).toEqual([])
  })
})

describe('shuffledOrder', () => {
  it('keeps the current track first so shuffling never cuts a song off', () => {
    expect(shuffledOrder(6, 3, seeded(1))[0]).toBe(3)
  })

  it('is a permutation of every index', () => {
    expect([...shuffledOrder(8, 5, seeded(7))].sort((a, b) => a - b)).toEqual(identityOrder(8))
  })

  it('shuffles everything when nothing is playing', () => {
    const order = shuffledOrder(5, -1, seeded(3))
    expect([...order].sort((a, b) => a - b)).toEqual(identityOrder(5))
  })

  it('actually reorders', () => {
    expect(shuffledOrder(20, 0, seeded(42))).not.toEqual(identityOrder(20))
  })

  it('survives a one-track queue', () => {
    expect(shuffledOrder(1, 0, seeded(1))).toEqual([0])
  })
})

describe('nextPos', () => {
  it('advances inside the queue', () => {
    expect(nextPos(0, 3, false)).toBe(1)
  })

  it('stops at the end without repeat', () => {
    expect(nextPos(2, 3, false)).toBeNull()
  })

  it('wraps with repeat', () => {
    expect(nextPos(2, 3, true)).toBe(0)
  })

  it('has nowhere to go in an empty queue', () => {
    expect(nextPos(0, 0, true)).toBeNull()
  })
})

describe('prevPos', () => {
  it('steps back', () => {
    expect(prevPos(2, 3, false)).toBe(1)
  })

  it('stops at the start without repeat', () => {
    expect(prevPos(0, 3, false)).toBeNull()
  })

  it('wraps to the last track with repeat', () => {
    expect(prevPos(0, 3, true)).toBe(2)
  })

  it('has nowhere to go in an empty queue', () => {
    expect(prevPos(0, 0, true)).toBeNull()
  })
})

describe('shouldRecover', () => {
  it('retries a mid-song drop once, then skips', () => {
    expect(shouldRecover(42, false)).toBe(true) // playing, not yet retried
    expect(shouldRecover(42, true)).toBe(false) // already retried this episode
  })

  it('skips a track that never started playing', () => {
    expect(shouldRecover(0, false)).toBe(false)
  })
})

describe('insertAfter', () => {
  it('inserts right after the given position, leaving everything before untouched', () => {
    expect(insertAfter([5, 2, 8], 0, 9)).toEqual([5, 9, 2, 8])
  })

  it('appends when inserting after the last position', () => {
    expect(insertAfter([5, 2, 8], 2, 9)).toEqual([5, 2, 8, 9])
  })
})

describe('appendOrder', () => {
  it('adds to the end', () => {
    expect(appendOrder([5, 2], 9)).toEqual([5, 2, 9])
  })
})

describe('moveOrder', () => {
  it('moves an upcoming track to a later position', () => {
    expect(moveOrder([5, 2, 8, 1], 0, 1, 3)).toEqual([5, 8, 1, 2])
  })

  it('moves an upcoming track to an earlier position', () => {
    expect(moveOrder([5, 2, 8, 1], 0, 3, 1)).toEqual([5, 1, 2, 8])
  })

  it('refuses to move the currently playing position', () => {
    expect(moveOrder([5, 2, 8], 1, 1, 2)).toEqual([5, 2, 8])
  })

  it('refuses to move something to before or at the current position', () => {
    expect(moveOrder([5, 2, 8], 1, 2, 0)).toEqual([5, 2, 8])
  })

  it('ignores an out-of-range position instead of throwing', () => {
    expect(moveOrder([5, 2, 8], 0, 1, 99)).toEqual([5, 2, 8])
  })
})

describe('removeOrder', () => {
  it('drops one upcoming position', () => {
    expect(removeOrder([5, 2, 8, 1], 0, 2)).toEqual([5, 2, 1])
  })

  it('refuses to drop the currently playing position', () => {
    expect(removeOrder([5, 2, 8], 1, 1)).toEqual([5, 2, 8])
  })

  it('ignores an out-of-range position instead of throwing', () => {
    expect(removeOrder([5, 2, 8], 0, 99)).toEqual([5, 2, 8])
  })
})

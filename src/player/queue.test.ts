import { describe, expect, it } from 'vitest'
import { identityOrder, nextPos, prevPos, shouldRecover, shuffledOrder } from './queue'

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

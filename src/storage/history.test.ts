import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Track } from '../source/MusicSource'

const {
  clearHistory,
  history,
  importHistory,
  initHistory,
  onHistoryChange,
  onHistoryClear,
  recordPlay,
} = await import('./history')
const { idbClear, idbGetAll, saveHistory } = await import('./db')

const track = (id: string): Track => ({ id, title: id, artist: 'Someone' })

beforeEach(() => {
  history.set([])
})

afterEach(async () => {
  // fake-indexeddb persists across `it` blocks in one file; without this, a
  // later test's "what's in storage" assertion sees every earlier test's rows.
  await idbClear('history')
})

describe('recordPlay', () => {
  it('moves a replayed track back to the top instead of listing it twice', async () => {
    await recordPlay(track('a'))
    await recordPlay(track('b'))
    await recordPlay(track('a'))

    expect(history.get().map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('onHistoryChange / onHistoryClear', () => {
  it('fires once per persisted play, and once on clear', async () => {
    const played: string[] = []
    const stopChange = onHistoryChange((record) => played.push(record.trackId))
    let cleared = 0
    const stopClear = onHistoryClear(() => cleared++)

    await recordPlay(track('a'))
    await recordPlay(track('b'))
    await clearHistory()
    stopChange()
    stopClear()

    expect(played).toEqual(['a', 'b'])
    expect(cleared).toBe(1)
  })
})

describe('importHistory', () => {
  it('adds a cloud record that does not exist locally', async () => {
    await importHistory([{ trackId: 'cloud-1', track: track('cloud-1'), playedAt: 1 }])

    expect(history.get().map((t) => t.id)).toContain('cloud-1')
    const saved = await idbGetAll<{ trackId: string }>('history')
    expect(saved.some((r) => r.trackId === 'cloud-1')).toBe(true)
  })

  it('keeps the local play when it is newer than the incoming one', async () => {
    await recordPlay(track('a'))
    const [local] = await idbGetAll<{ trackId: string; track: Track; playedAt: number }>('history')

    await importHistory([{ ...local!, track: track('stale'), playedAt: local!.playedAt - 1000 }])

    expect(history.get()[0]?.title).toBe('a')
  })

  it('takes the incoming play when it is newer than the local one', async () => {
    await recordPlay(track('a'))
    const [local] = await idbGetAll<{ trackId: string; track: Track; playedAt: number }>('history')

    await importHistory([{ ...local!, track: { ...local!.track, title: 'Newer' }, playedAt: local!.playedAt + 1000 }])

    expect(history.get()[0]?.title).toBe('Newer')
  })
})

describe('initHistory', () => {
  it('loads whatever was saved from a previous session, most recent first', async () => {
    await recordPlay(track('a'))
    await recordPlay(track('b'))
    // recordPlay uses Date.now(), which two calls in the same test can tie at
    // millisecond resolution — pin distinct playedAt values explicitly so the
    // sort order this test checks does not depend on real-clock timing.
    const saved = await idbGetAll<{ trackId: string; track: Track; playedAt: number }>('history')
    await Promise.all(saved.map((r) => saveHistory({ ...r, playedAt: r.trackId === 'b' ? 2 : 1 })))
    history.set([]) // simulate a fresh reload before the store repopulates

    await initHistory()

    expect(history.get().map((t) => t.id)).toEqual(['b', 'a'])
  })
})

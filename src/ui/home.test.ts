import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Track } from '../source/MusicSource'
import { homeRows, sections } from './home'
import { history } from '../storage/history'
import { downloads } from '../storage/downloads'

const track = (id: string, album?: string): Track => ({
  id,
  title: `t${id}`,
  artist: 'a',
  ...(album ? { album } : {}),
})

const shape = (tracks: Track[]): [string, string[]][] =>
  sections(tracks).map(([title, t]) => [title, t.map((x) => x.id)])

describe('sections', () => {
  it('is empty for no tracks', () => {
    expect(sections([])).toEqual([])
  })

  it('names a row per backend, in the order the source returned them', () => {
    expect(
      shape([track('youtube:a'), track('audius:b'), track('youtube:c'), track('radio:d')]),
    ).toEqual([
      ['Trending on YouTube', ['youtube:a', 'youtube:c']],
      ['Trending on Audius', ['audius:b']],
      ['Live radio', ['radio:d']],
    ])
  })

  it('makes one row per album, in first-seen order', () => {
    expect(shape([track('1', 'A'), track('2', 'B'), track('3', 'A')])).toEqual([
      ['A', ['1', '3']],
      ['B', ['2']],
    ])
  })

  it('prefers the album over the backend when a track has one', () => {
    expect(shape([track('audius:1', 'A')])).toEqual([['A', ['audius:1']]])
  })

  it('caps a row rather than building a strip of a hundred tiles', () => {
    const many = Array.from({ length: 100 }, (_, i) => track(`audius:${i}`))
    const rows = sections(many)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.[1]).toHaveLength(20)
    expect(rows[0]?.[1][0]?.id).toBe('audius:0') // keeps the most popular ones
  })

  it('falls back to one labelled row for ids with no backend', () => {
    expect(shape([track('mock-1'), track('mock-2')])).toEqual([['More music', ['mock-1', 'mock-2']]])
  })

  it('keeps row titles unique, since Library keys its sections by title', () => {
    const titles = sections([
      track('youtube:a'),
      track('audius:b'),
      track('1', 'A'),
      track('2', 'A'),
      track('mock'),
    ]).map(([title]) => title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})

const video = (id: string) => ({ videoId: id, title: `v${id}`, channelTitle: 'c' })

/** Both backends answer through fetch, so one stub drives the whole screen. */
function stubHome(charts: unknown, audius: unknown, chartsOk = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: typeof url === 'string' && url.startsWith('/api/youtube/search') ? chartsOk : true,
      status: 200,
      json: async () => (typeof url === 'string' && url.startsWith('/api/youtube/search') ? charts : audius),
    })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  history.set([])
  downloads.set([])
})

describe('homeRows', () => {
  it('shows recently played, online, regardless of download status', async () => {
    stubHome({ sections: [] }, { data: [] })
    history.set([track('youtube:a'), track('youtube:b')])

    const rows = await homeRows(true)
    expect(rows.find(([title]) => title === 'Recently played')?.[1].map((t) => t.id)).toEqual([
      'youtube:a',
      'youtube:b',
    ])
  })

  it('offline, only shows recently played tracks that are actually downloaded', async () => {
    history.set([track('youtube:a'), track('youtube:b')])
    downloads.set([{ trackId: 'youtube:a', status: 'done', bytesDone: 1, bytesTotal: 1 }])

    const rows = await homeRows(false)
    expect(rows.find(([title]) => title === 'Recently played')?.[1].map((t) => t.id)).toEqual(['youtube:a'])
  })

  it('has no recently-played row at all when nothing has been played yet', async () => {
    stubHome({ sections: [] }, { data: [] })
    const rows = await homeRows(true)
    expect(rows.some(([title]) => title === 'Recently played')).toBe(false)
  })

  it('names a row per country, listener first, then Audius', async () => {
    stubHome(
      {
        sections: [
          { region: 'IN', items: [video('aaaaaaaaaaa')] },
          { region: 'KR', items: [video('bbbbbbbbbbb')] },
        ],
      },
      { data: [{ id: 'x', title: 'S', user: { name: 'A' }, duration: 1 }] },
    )

    expect((await homeRows(true)).map(([title]) => title)).toEqual([
      'Trending in India',
      'Trending in South Korea',
      'Trending on Audius',
    ])
  })

  it('drops a country that returned nothing rather than showing an empty strip', async () => {
    stubHome({ sections: [{ region: 'IN', items: [] }, { region: 'JP', items: [video('ccccccccccc')] }] }, { data: [] })

    expect((await homeRows(true)).map(([title]) => title)).toEqual(['Trending in Japan'])
  })

  it('still shows the charts when Audius is down, and vice versa', async () => {
    stubHome({ sections: [{ region: 'BR', items: [video('ddddddddddd')] }] }, null)
    expect((await homeRows(true)).map(([title]) => title)).toEqual(['Trending in Brazil'])

    stubHome({ error: 'no key' }, { data: [{ id: 'x', title: 'S', user: { name: 'A' }, duration: 1 }] }, false)
    expect((await homeRows(true)).map(([title]) => title)).toEqual(['Trending on Audius'])
  })

  it('caps a country row the same as any other', async () => {
    const many = Array.from({ length: 40 }, (_, i) => video(`v${String(i).padStart(10, '0')}`))
    stubHome({ sections: [{ region: 'IN', items: many }] }, { data: [] })

    const rows = await homeRows(true)
    expect(rows[0]?.[1]).toHaveLength(20)
  })
})

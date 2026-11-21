import { describe, expect, it } from 'vitest'
import type { Track } from '../source/MusicSource'
import { sections } from './home'

const track = (id: number, album?: string): Track => ({
  id: String(id),
  title: `t${id}`,
  artist: 'a',
  ...(album ? { album } : {}),
})

describe('sections', () => {
  it('is empty for no tracks', () => {
    expect(sections([])).toEqual([])
  })

  it('makes one row per album, in first-seen order', () => {
    const rows = sections([track(1, 'A'), track(2, 'B'), track(3, 'A')])
    expect(rows.map(([title, t]) => [title, t.map((x) => x.id)])).toEqual([
      ['A', ['1', '3']],
      ['B', ['2']],
    ])
  })

  it('slices albumless tracks into titled rows of 8 and keeps every track', () => {
    const loose = Array.from({ length: 19 }, (_, i) => track(i))
    const rows = sections(loose)
    expect(rows.map(([title, t]) => [title, t.length])).toEqual([
      ['Trending now', 8],
      ['Fresh finds', 8],
      ['More to explore', 3],
    ])
    expect(rows.flatMap(([, t]) => t.map((x) => x.id))).toEqual(loose.map((t) => t.id))
  })

  it('keeps row titles unique past the named ones, since Library keys by title', () => {
    const titles = sections(Array.from({ length: 60 }, (_, i) => track(i))).map(([title]) => title)
    expect(titles.length).toBe(8)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('puts browse rows before album rows', () => {
    expect(sections([track(1, 'A'), track(2)]).map(([title]) => title)).toEqual(['Trending now', 'A'])
  })
})

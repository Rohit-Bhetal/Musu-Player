import { describe, expect, it } from 'vitest'
import { activeLine, parseLrc, parseLyrics } from './lrc'

describe('parseLrc', () => {
  it('reads mm:ss with and without fractions', () => {
    expect(parseLrc('[00:12]a\n[00:17.5]b\n[01:02.25]c\n[01:30.500]d')).toEqual([
      { timeSec: 12, text: 'a' },
      { timeSec: 17.5, text: 'b' },
      { timeSec: 62.25, text: 'c' },
      { timeSec: 90.5, text: 'd' },
    ])
  })

  it('accepts a colon before the fraction, as some files use', () => {
    expect(parseLrc('[00:12:50]a')).toEqual([{ timeSec: 12.5, text: 'a' }])
  })

  it('repeats a line carrying several timestamps, in time order', () => {
    expect(parseLrc('[00:30.00][00:10.00]chorus\n[00:20.00]verse')).toEqual([
      { timeSec: 10, text: 'chorus' },
      { timeSec: 20, text: 'verse' },
      { timeSec: 30, text: 'chorus' },
    ])
  })

  it('shifts every line by [offset:], in either direction, never below zero', () => {
    expect(parseLrc('[offset:+500]\n[00:10.00]a')).toEqual([{ timeSec: 10.5, text: 'a' }])
    expect(parseLrc('[offset:-500]\n[00:10.00]a')).toEqual([{ timeSec: 9.5, text: 'a' }])
    expect(parseLrc('[offset:-20000]\n[00:10.00]a')).toEqual([{ timeSec: 0, text: 'a' }])
  })

  it('drops metadata tags and blank lines, keeping only sung text', () => {
    expect(parseLrc('[ar:Artist]\n[ti:Title]\n\n[00:10.00]only this\n[00:20.00]   ')).toEqual([
      { timeSec: 10, text: 'only this' },
    ])
  })

  it('is empty for text with no timestamps at all', () => {
    expect(parseLrc('just words\nmore words')).toEqual([])
  })
})

describe('parseLyrics', () => {
  it('keeps plain lyrics as untimed lines', () => {
    expect(parseLyrics({ kind: 'plain', text: 'one\n\ntwo ' })).toEqual([
      { timeSec: null, text: 'one' },
      { timeSec: null, text: 'two' },
    ])
  })

  it('falls back to plain when the LRC has no usable timestamps', () => {
    expect(parseLyrics({ kind: 'lrc', text: 'mislabelled\nplain text' })).toEqual([
      { timeSec: null, text: 'mislabelled' },
      { timeSec: null, text: 'plain text' },
    ])
  })
})

describe('activeLine', () => {
  const lines = parseLrc('[00:10.00]a\n[00:20.00]b\n[00:30.00]c')

  it('is -1 before the first line, then the line being sung', () => {
    expect(activeLine(lines, 0)).toBe(-1)
    expect(activeLine(lines, 9.9)).toBe(-1)
    expect(activeLine(lines, 10)).toBe(0)
    expect(activeLine(lines, 19.9)).toBe(0)
    expect(activeLine(lines, 25)).toBe(1)
    expect(activeLine(lines, 9999)).toBe(2)
  })

  it('never highlights untimed plain lyrics', () => {
    expect(activeLine(parseLyrics({ kind: 'plain', text: 'a\nb' }), 50)).toBe(-1)
  })

  it('handles no lyrics at all', () => {
    expect(activeLine([], 10)).toBe(-1)
  })
})

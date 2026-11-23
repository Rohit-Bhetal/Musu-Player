import type { Lyrics } from '../source/MusicSource'

export interface LyricLine {
  /** null for plain lyrics, which have no timing to seek to. */
  timeSec: number | null
  text: string
}

/** [mm:ss.xx] or [mm:ss.xxx] or [mm:ss]; a line may carry several. */
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
/** Shifts every timestamp, in milliseconds, and may be negative. */
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]/im

function hundredths(fraction: string | undefined): number {
  if (!fraction) return 0
  // ".5" is five tenths, ".50" is fifty hundredths, ".500" is milliseconds
  return Number(fraction) / 10 ** fraction.length
}

/**
 * Parses LRC into lines sorted by time. Tags other than [offset:] are dropped,
 * and so is any line with no text, which is what metadata tags leave behind.
 */
export function parseLrc(text: string): LyricLine[] {
  const offsetSec = Number(OFFSET.exec(text)?.[1] ?? 0) / 1000
  const lines: LyricLine[] = []

  for (const raw of text.split(/\r?\n/)) {
    STAMP.lastIndex = 0
    const stamps = [...raw.matchAll(STAMP)]
    if (stamps.length === 0) continue

    const body = raw.replace(STAMP, '').trim()
    if (!body) continue

    for (const [, minutes, seconds, fraction] of stamps) {
      const at = Number(minutes) * 60 + Number(seconds) + hundredths(fraction) + offsetSec
      lines.push({ timeSec: Math.max(0, at), text: body })
    }
  }

  return lines.sort((a, b) => (a.timeSec ?? 0) - (b.timeSec ?? 0))
}

/** LRC that parsed to nothing falls back to plain text, so lyrics still show. */
export function parseLyrics(lyrics: Lyrics): LyricLine[] {
  if (lyrics.kind === 'lrc') {
    const lines = parseLrc(lyrics.text)
    if (lines.length > 0) return lines
  }
  return lyrics.text
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ timeSec: null, text }))
}

/** Index of the line being sung at `positionSec`, or -1 before the first one. */
export function activeLine(lines: readonly LyricLine[], positionSec: number): number {
  let active = -1
  for (let i = 0; i < lines.length; i += 1) {
    const at = lines[i]?.timeSec
    if (at === null || at === undefined || at > positionSec) break
    active = i
  }
  return active
}

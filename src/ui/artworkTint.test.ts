import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  estimateArtworkBackground,
  luminance,
  onColor,
  onColorSecondary,
  pageBackground,
  tintFrom,
  type RGB,
} from './artworkTint'

const GRID = 64

/** A GRID x GRID RGBA buffer whose top quarter is `top` and the rest `rest`. */
function cover(top: RGB, rest: RGB): Uint8ClampedArray {
  const px = new Uint8ClampedArray(GRID * GRID * 4)
  for (let i = 0; i < GRID * GRID; i++) {
    const c = i < (GRID / 4) * GRID ? top : rest
    px.set([c[0], c[1], c[2], 255], i * 4)
  }
  return px
}

describe('estimateArtworkBackground', () => {
  it('returns the dominant colour of the top quarter', () => {
    const [r, g, b] = estimateArtworkBackground(cover([30, 90, 200], [250, 10, 10]))
    // bucketed to 32 levels, so the answer is the bucket mean, not the exact input
    expect(r).toBeCloseTo(30, -1)
    expect(g).toBeCloseTo(90, -1)
    expect(b).toBeCloseTo(200, -1)
  })

  it('skips the black bucket so a letterboxed cover is not read as black', () => {
    const px = cover([0, 0, 0], [0, 0, 0])
    // one stripe of colour in an otherwise black top quarter
    for (let x = 0; x < GRID; x++) px.set([200, 40, 120, 255], x * 4)
    const [r, g, b] = estimateArtworkBackground(px)
    expect(r).toBeGreaterThan(150)
    expect(g).toBeLessThan(80)
    expect(b).toBeGreaterThan(80)
  })

  it('falls back to the weighted mean when every pixel is black', () => {
    expect(estimateArtworkBackground(cover([0, 0, 0], [0, 0, 0]))).toEqual([0, 0, 0])
  })
})

describe('pageBackground', () => {
  it('leaves an already-dark colour alone', () => {
    const dark: RGB = [20, 20, 30]
    expect(luminance(dark)).toBeLessThanOrEqual(0.1)
    expect(pageBackground(dark)).toEqual(dark)
  })

  it('darkens a bright colour by its luminance', () => {
    const bright: RGB = [240, 240, 240]
    const out = pageBackground(bright)
    expect(out[0]).toBeLessThan(120)
    expect(luminance(out)).toBeLessThan(luminance(bright))
  })

  it('never produces a colour lighter than its input', () => {
    for (const c of [[255, 0, 0], [0, 255, 0], [120, 200, 60], [9, 9, 9]] as RGB[]) {
      expect(luminance(pageBackground(c))).toBeLessThanOrEqual(luminance(c) + 1e-9)
    }
  })
})

describe('contrast ladder', () => {
  const samples: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
    [30, 60, 160],
    [200, 180, 40],
    [128, 128, 128],
    [90, 20, 110],
  ]

  it('gives primary text at least 4.5:1 on every background', () => {
    for (const bg of samples) expect(contrastRatio(onColor(bg), bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('gives secondary text at least 4.5:1 too', () => {
    for (const bg of samples) expect(contrastRatio(onColorSecondary(bg), bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('picks light ink on a dark tint and dark ink on a light one', () => {
    expect(luminance(onColor([10, 10, 20]))).toBeGreaterThan(0.5)
    expect(luminance(onColor([240, 240, 230]))).toBeLessThan(0.2)
  })
})

describe('tintFrom', () => {
  it('returns three parseable hex colours', () => {
    const { tint, ink, ink2 } = tintFrom([60, 120, 220])
    for (const c of [tint, ink, ink2]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    expect(tint).not.toBe(ink)
  })
})

import { describe, expect, it } from 'vitest'
import { CAMEO_SIZE, cameoSpot, marginBands, type Box } from './cameo'

/** The desktop layout that broke this twice: .nowplaying covers the whole
 * viewport but its content box is the ~430px card in the middle, so a badge
 * placed against the viewport lands hundreds of px outside the visible player. */
const card: Box = { top: 72, left: 745, width: 386, height: 756 }
const art: Box = { top: 240, left: 745, width: 386, height: 386 }

describe('marginBands', () => {
  it('only offers strips clear of the art, inside the box', () => {
    const bands = marginBands(card, art)

    expect(bands.length).toBeGreaterThan(0)
    for (const b of bands) {
      expect(b.top).toBeGreaterThanOrEqual(card.top)
      expect(b.left).toBeGreaterThanOrEqual(card.left)
      expect(b.top + b.height).toBeLessThanOrEqual(card.top + card.height)
      expect(b.left + b.width).toBeLessThanOrEqual(card.left + card.width)
      const clearOfArt =
        b.top + b.height <= art.top ||
        b.top >= art.top + art.height ||
        b.left + b.width <= art.left ||
        b.left >= art.left + art.width
      expect(clearOfArt).toBe(true)
    }
  })

  it('gives nothing when the art fills the box', () => {
    expect(marginBands(card, card)).toEqual([])
  })
})

describe('cameoSpot', () => {
  it('always lands fully inside the box, never on the same character twice', () => {
    let prev: number | null = null
    for (let i = 0; i < 500; i++) {
      const spot = cameoSpot(card, art, prev, 7)
      expect(spot).not.toBeNull()
      expect(spot!.index).not.toBe(prev)
      expect(spot!.topPx).toBeGreaterThanOrEqual(card.top)
      expect(spot!.leftPx).toBeGreaterThanOrEqual(card.left)
      expect(spot!.topPx + CAMEO_SIZE).toBeLessThanOrEqual(card.top + card.height)
      expect(spot!.leftPx + CAMEO_SIZE).toBeLessThanOrEqual(card.left + card.width)
      prev = spot!.index
    }
  })

  it('hides rather than covering the art when there is no margin', () => {
    expect(cameoSpot(card, card, null, 7)).toBeNull()
  })
})

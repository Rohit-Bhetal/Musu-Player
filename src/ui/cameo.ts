/** Where the Now Playing character badge is allowed to sit. Pure geometry,
 * split out of NowPlaying.tsx so it can be checked without a browser — the
 * previous DOM-inline version shipped broken twice with nothing to catch it. */

export const CAMEO_SIZE = 44 // px — matches .np-cameo's width/height in styles.css

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface CameoSpot {
  index: number
  topPx: number
  leftPx: number
}

/** The strips of `box` that fall outside `art` — above, below, left and right
 * of it — keeping only the ones wide/tall enough to hold the badge clear of
 * the art. Both boxes must be in the same coordinate space. */
export function marginBands(box: Box, art: Box): Box[] {
  const right = box.left + box.width
  const bottom = box.top + box.height
  const artRight = art.left + art.width
  const artBottom = art.top + art.height
  const bands: Box[] = []

  if (art.top - box.top >= CAMEO_SIZE) {
    bands.push({ top: box.top, left: box.left, width: box.width, height: art.top - box.top })
  }
  if (bottom - artBottom >= CAMEO_SIZE) {
    bands.push({ top: artBottom, left: box.left, width: box.width, height: bottom - artBottom })
  }
  if (art.left - box.left >= CAMEO_SIZE) {
    bands.push({ top: box.top, left: box.left, width: art.left - box.left, height: box.height })
  }
  if (right - artRight >= CAMEO_SIZE) {
    bands.push({ top: box.top, left: artRight, width: right - artRight, height: box.height })
  }

  return bands
}

/** A random point in a random margin band plus a character distinct from the
 * last — null when the art leaves no margin this tick, which hides the badge
 * rather than ever putting it over the art. The result is always inside `box`.
 */
export function cameoSpot(box: Box, art: Box, prevIndex: number | null, characterCount: number): CameoSpot | null {
  const bands = marginBands(box, art)
  if (bands.length === 0 || characterCount === 0) return null
  const band = bands[Math.floor(Math.random() * bands.length)]!

  let index = Math.floor(Math.random() * characterCount)
  if (prevIndex !== null && characterCount > 1 && index === prevIndex) index = (index + 1) % characterCount

  const top = band.top + Math.random() * Math.max(0, band.height - CAMEO_SIZE)
  const left = band.left + Math.random() * Math.max(0, band.width - CAMEO_SIZE)

  // belt and braces: a band narrower than the badge (possible only on the axis
  // the band is not chosen for) would otherwise let it hang past the box edge
  return {
    index,
    topPx: clamp(top, box.top, box.top + Math.max(0, box.height - CAMEO_SIZE)),
    leftPx: clamp(left, box.left, box.left + Math.max(0, box.width - CAMEO_SIZE)),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), Math.max(lo, hi))
}

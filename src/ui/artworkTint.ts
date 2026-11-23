/**
 * The Now Playing screen paints itself from the cover, which is the single most
 * recognisable thing about the Convx player.
 *
 * Direct port of Convx's `ArtworkColors` (feature/canvas/.../ArtworkColors.kt):
 * `estimateDirect` picks the artwork's background colour, `pageBackground`
 * darkens it into a page tint, and `onColor` / `onColorSecondary`
 * (ui/theme/AppleTokens.kt) pick text that belongs to that tint instead of being
 * flat white pasted on top of it.
 *
 * Pure maths over a pixel array, so it is unit-testable without a browser —
 * only `tintFor` needs a DOM.
 */

export interface Tint {
  /** Flat page background: the artwork's own colour, darkened by luminance. */
  tint: string
  /** Primary content colour on that tint. */
  ink: string
  /** Secondary content colour — subtitles, times, metadata. */
  ink2: string
}

const GRID = 64

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const hex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`

function linear(v: number): number {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export type RGB = [number, number, number]

/**
 * Edge-weighted 32-level bucket vote over the top quarter of the artwork, with
 * the black bucket skipped. `pixels` is RGBA, GRID x GRID — exactly what
 * `drawImage` into a 64x64 canvas produces, which is the downscale step
 * `estimateDirect` does by hand.
 */
export function estimateArtworkBackground(pixels: Uint8ClampedArray, grid = GRID): RGB {
  const levels = 32
  const rows = Math.max(1, Math.floor(grid / 4))
  const half = grid / 2
  const mass = new Map<number, [number, number, number, number]>()
  let total = 0
  let tr = 0
  let tg = 0
  let tb = 0
  let bestKey = -1
  let bestMass = 0

  for (let t = 0; t < rows * grid; t++) {
    const i = t * 4
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const nx = ((t % grid) - half) / half
    const ny = (Math.floor(t / grid) - half) / half
    const w = 1 + nx * nx + ny * ny
    total += w
    tr += w * r
    tg += w * g
    tb += w * b

    const k = ((r >> 3) * levels + (g >> 3)) * levels + (b >> 3)
    if (k === 0) continue // the black bucket never wins
    const acc = mass.get(k) ?? [0, 0, 0, 0]
    acc[0] += w
    acc[1] += w * r
    acc[2] += w * g
    acc[3] += w * b
    mass.set(k, acc)
    if (acc[0] > bestMass) {
      bestMass = acc[0]
      bestKey = k
    }
  }

  if (bestKey < 0 || bestMass <= 0) {
    const m = Math.max(1, total)
    return [Math.round(tr / m), Math.round(tg / m), Math.round(tb / m)]
  }
  const [m, sr, sg, sb] = mass.get(bestKey) as [number, number, number, number]
  return [Math.round(sr / m), Math.round(sg / m), Math.round(sb / m)]
}

// Fitted by Convx on 27 reference screenshots: worst channel error 2/255.
const DARKEN_PER_LUMINANCE = 165.9
const DARKEN_THRESHOLD = 0.1

/** Flat page background below the hero: the artwork colour darkened by luminance. */
export function pageBackground(c: RGB): RGB {
  const y = luminance(c)
  if (y <= DARKEN_THRESHOLD) return c
  const d = DARKEN_PER_LUMINANCE * y
  return [Math.round(c[0] - d), Math.round(c[1] - d), Math.round(c[2] - d)]
}

/* ------------------------------------------------------- contrast ladder -- */

function toHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = (max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4) / 6
  return [h, s, l]
}

function toRgb([h, s, l]: [number, number, number]): RGB {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => {
    const k = (n + h * 12) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

/** Luminance where black and white text have equal WCAG contrast. */
const LIGHT_CONTENT_MAX_LUMINANCE = 0.179
const MIN_TEXT_CONTRAST = 4.5

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Keeps `bg`'s hue and pushes lightness to a readable extreme, rather than
 * dropping to flat white/near-black, then walks toward that extreme until the
 * pair clears 4.5:1. Saturation is capped so body copy reads as white/black
 * that happens to be warm or cool, not as coloured text.
 */
function shiftedForContrast(bg: RGB, saturation: number, onDarkL: number, onLightL: number): RGB {
  const hsl = toHsl(bg)
  const onDark = luminance(bg) <= LIGHT_CONTENT_MAX_LUMINANCE
  const target = onDark ? onDarkL : onLightL
  if (hsl[1] < 0.08) {
    // No hue to carry (monochrome cover, or no artwork yet).
    hsl[1] = 0
    hsl[2] = target > 0.9 ? 1 : target < 0.12 ? 0.04 : target
  } else {
    hsl[1] = Math.min(hsl[1], saturation)
    hsl[2] = target
  }
  let out = toRgb(hsl)
  for (let i = 0; i < 12 && contrastRatio(out, bg) < MIN_TEXT_CONTRAST; i++) {
    hsl[2] = clamp(hsl[2] + (onDark ? 0.04 : -0.04), 0, 1)
    out = toRgb(hsl)
  }
  return out
}

export const onColor = (bg: RGB): RGB => shiftedForContrast(bg, 0.16, 0.96, 0.1)
export const onColorSecondary = (bg: RGB): RGB => shiftedForContrast(bg, 0.42, 0.76, 0.34)

/** The three CSS colours the player needs, from one artwork background colour. */
export function tintFrom(bg: RGB): Tint {
  const page = pageBackground(bg)
  return { tint: hex(...page), ink: hex(...onColor(page)), ink2: hex(...onColorSecondary(page)) }
}

/* ------------------------------------------------------------- browser -- */

const cache = new Map<string, Tint | null>()

/**
 * Null whenever the cover cannot be sampled — a cross-origin image without CORS
 * taints the canvas, and the player simply keeps its theme background.
 */
export async function tintFor(url: string | null | undefined): Promise<Tint | null> {
  if (!url) return null
  const hit = cache.get(url)
  if (hit !== undefined) return hit

  const result = await new Promise<Tint | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = GRID
        canvas.height = GRID
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, GRID, GRID)
        resolve(tintFrom(estimateArtworkBackground(ctx.getImageData(0, 0, GRID, GRID).data)))
      } catch {
        resolve(null) // tainted canvas
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })

  cache.set(url, result)
  return result
}

import { CHARACTER_IMAGES } from '../characters'

const CANVAS_SIZE = 512
// fraction of the canvas the character badge occupies, pinned to the corner
const CHARACTER_SCALE = 0.42
const CHARACTER_MARGIN = 10

/** Same track always shows the same character — deterministic, not random,
 * so it is at least reproducible if something ever looks wrong for one song. */
export function pickCharacter(trackId: string): string {
  let hash = 0
  for (let i = 0; i < trackId.length; i += 1) hash = (hash * 31 + trackId.charCodeAt(i)) | 0
  return CHARACTER_IMAGES[Math.abs(hash) % CHARACTER_IMAGES.length]!
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Both backends' CDNs send `Access-Control-Allow-Origin: *` (verified
    // directly against i.ytimg.com and Audius's content nodes) — without
    // this, drawing the image taints the canvas and toBlob() below throws.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${src}`))
    img.src = src
  })
}

/** object-fit: cover, by hand — the in-app <Artwork> gets this for free from
 * CSS, but the OS's own Lock Screen/Dynamic Island artwork renderer never
 * sees our CSS, so a landscape YouTube thumbnail (its thumbnails are always
 * 16:9, never square) shows stretched or letterboxed there unless the pixels
 * themselves are already square. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, size: number): void {
  const scale = Math.max(size / img.width, size / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
}

function drawBadge(ctx: CanvasRenderingContext2D, img: HTMLImageElement, canvasSize: number): void {
  const box = canvasSize * CHARACTER_SCALE
  const scale = Math.min(box / img.width, box / img.height)
  const w = img.width * scale
  const h = img.height * scale
  ctx.drawImage(img, canvasSize - w - CHARACTER_MARGIN, canvasSize - h - CHARACTER_MARGIN, w, h)
}

/** Square (512x512) artwork for the OS Lock Screen/Dynamic Island, with a
 * character badge composited into the corner — a single static frame, set
 * once per track, since re-pushing MediaSession metadata on an interval to
 * animate it would flicker the Lock Screen and cost battery for no real
 * gain. `characterUrl` null skips the badge. Falls back to the original,
 * uncropped URL on any failure (a source that refuses anonymous CORS, a
 * canvas that failed to initialize) rather than losing artwork entirely. */
export async function prepareMediaArtwork(artworkUrl: string, characterUrl: string | null): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return artworkUrl

  try {
    const art = await loadImage(artworkUrl)
    drawCover(ctx, art, CANVAS_SIZE)

    if (characterUrl) {
      const character = await loadImage(characterUrl)
      drawBadge(ctx, character, CANVAS_SIZE)
    }

    return await new Promise<string>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('canvas.toBlob failed'))),
        'image/png',
      )
    })
  } catch {
    return artworkUrl
  }
}

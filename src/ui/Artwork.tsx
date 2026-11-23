import type { CSSProperties, JSX } from 'react'
import { Icon } from './Icon'

// A hashed, stable two-colour gradient for the no-art placeholder, so a
// catalogue of tracks/playlists with no cover art reads as distinct coloured
// identities instead of a wall of identical grey boxes. >>> 0 keeps the hash
// unsigned so `% 360` never goes negative.
function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

/** Exported so anything with its own placeholder box — Playlists' row icon,
 * for one — can use the same hashed identity colour instead of a flat grey. */
export function placeholderGradient(seed: string): string {
  const hueA = hashHue(seed)
  const hueB = (hueA + 55) % 360
  return `linear-gradient(135deg, hsl(${hueA} 65% 55%), hsl(${hueB} 65% 42%))`
}

/** `size` is any CSS length; the box is always square. */
export function Artwork({
  src,
  size,
  alt = '',
  radius,
  seed,
}: {
  src?: string | null
  size: number | string
  alt?: string
  radius?: number
  /** Hashed into the no-art placeholder's gradient — pass a stable id
   * (track/playlist id), not the title, so the colour never changes between
   * renders. Omit to keep the plain muted-icon box. */
  seed?: string
}): JSX.Element {
  const style: CSSProperties = {
    width: size,
    aspectRatio: '1 / 1',
    borderRadius: radius ?? (typeof size === 'number' ? Math.max(6, size * 0.05) : 16),
  }
  if (!src) {
    return (
      <div
        className="art"
        style={{
          ...style,
          display: 'grid',
          placeItems: 'center',
          color: seed ? '#ffffffd9' : 'var(--muted)',
          background: seed ? placeholderGradient(seed) : undefined,
        }}
      >
        <Icon name="music" size={typeof size === 'number' ? Math.min(28, size * 0.4) : 48} />
      </div>
    )
  }
  return <img className="art" style={style} src={src} alt={alt} loading="lazy" decoding="async" />
}

import type { CSSProperties, JSX } from 'react'
import { Icon } from './Icon'

/** `size` is any CSS length; the box is always square. */
export function Artwork({
  src,
  size,
  alt = '',
  radius,
}: {
  src?: string | null
  size: number | string
  alt?: string
  radius?: number
}): JSX.Element {
  const style: CSSProperties = {
    width: size,
    aspectRatio: '1 / 1',
    borderRadius: radius ?? (typeof size === 'number' ? Math.max(6, size * 0.05) : 16),
  }
  if (!src) {
    return (
      <div className="art" style={{ ...style, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
        <Icon name="music" size={typeof size === 'number' ? Math.min(28, size * 0.4) : 48} />
      </div>
    )
  }
  return <img className="art" style={style} src={src} alt={alt} loading="lazy" decoding="async" />
}

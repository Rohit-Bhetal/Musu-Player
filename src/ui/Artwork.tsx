import type { JSX } from 'react'
import { Icon } from './Icon'

export function Artwork({
  src,
  size,
  alt = '',
  radius,
}: {
  src?: string | null
  size: number
  alt?: string
  radius?: number
}): JSX.Element {
  const style = { width: size, height: size, borderRadius: radius ?? Math.max(6, size * 0.05) }
  if (!src) {
    return (
      <div className="art" style={{ ...style, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
        <Icon name="music" size={Math.min(28, size * 0.4)} />
      </div>
    )
  }
  return <img className="art" style={style} src={src} alt={alt} loading="lazy" decoding="async" />
}

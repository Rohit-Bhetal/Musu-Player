import type { JSX, ReactNode } from 'react'
import type { Track } from '../source/MusicSource'
import { Artwork } from './Artwork'

export function formatTime(sec: number | undefined): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return '--:--'
  const m = Math.floor(sec / 60)
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export function TrackRow({
  track,
  artworkSrc,
  subtitle,
  onSelect,
  disabled = false,
  active = false,
  right,
}: {
  track: Track
  artworkSrc?: string | null
  subtitle?: string
  onSelect?: (track: Track) => void
  disabled?: boolean
  active?: boolean
  right?: ReactNode
}): JSX.Element {
  return (
    <div className="row" aria-disabled={disabled || undefined}>
      <button
        type="button"
        className="row-main"
        disabled={disabled}
        onClick={() => onSelect?.(track)}
        aria-label={`Play ${track.title} by ${track.artist}`}
      >
        <Artwork src={artworkSrc ?? track.artworkUrl} size={48} alt="" />
        <span className="row-text">
          <span className="row-title" style={active ? { color: 'var(--accent)' } : undefined}>
            {track.title}
          </span>
          <span className="row-sub">{subtitle ?? `${track.artist}${track.album ? ` · ${track.album}` : ''}`}</span>
        </span>
      </button>
      {right}
    </div>
  )
}

export function RowSkeleton(): JSX.Element {
  return (
    <div className="row" aria-hidden="true">
      <div className="skeleton" style={{ width: 48, height: 48, flex: '0 0 auto' }} />
      <span className="row-text">
        <span className="skeleton" style={{ display: 'block', width: '55%', height: 13, marginBottom: 7 }} />
        <span className="skeleton" style={{ display: 'block', width: '35%', height: 11 }} />
      </span>
    </div>
  )
}

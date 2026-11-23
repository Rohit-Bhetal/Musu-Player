import type { JSX, ReactNode } from 'react'
import type { Track } from '../source/MusicSource'
import { Artwork } from './Artwork'
import { Icon } from './Icon'

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
        {/* Dimensions.ListThumbnailSize 48dp, ListRowArtShape 5dp */}
        <Artwork src={artworkSrc ?? track.artworkUrl} size={48} alt="" radius={5} seed={track.id} />
        <span className="row-text">
          <span className="row-title" style={active ? { color: 'var(--accent-text)' } : undefined}>
            {track.title}
          </span>
          <span className="row-sub">{subtitle ?? `${track.artist}${track.album ? ` · ${track.album}` : ''}`}</span>
        </span>
      </button>
      {right}
    </div>
  )
}

/** The up/down pair a reorderable row shows in `right` — same shape in
 * Playlists and the play Queue, just wired to a different move function. */
export function ReorderButtons({
  label,
  disabledUp,
  disabledDown,
  onUp,
  onDown,
}: {
  label: string
  disabledUp: boolean
  disabledDown: boolean
  onUp: () => void
  onDown: () => void
}): JSX.Element {
  return (
    <>
      <button type="button" className="row-action" disabled={disabledUp} aria-label={`Move ${label} up`} onClick={onUp}>
        <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      <button type="button" className="row-action" disabled={disabledDown} aria-label={`Move ${label} down`} onClick={onDown}>
        <Icon name="chevron" size={18} />
      </button>
    </>
  )
}

export function RowSkeleton(): JSX.Element {
  return (
    <div className="row" aria-hidden="true">
      {/* the loading state is the brand mark, not an empty grey square */}
      <div className="skel-art" style={{ width: 48, height: 48, borderRadius: 5 }} />
      <span className="row-text">
        <span className="skeleton" style={{ display: 'block', width: '55%', height: 13, marginBottom: 6 }} />
        <span className="skeleton" style={{ display: 'block', width: '35%', height: 11 }} />
      </span>
    </div>
  )
}

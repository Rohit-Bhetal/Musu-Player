import type { JSX } from 'react'
import type { Track } from '../source/MusicSource'
import { canDownload, cancel, downloadOf, downloads, enqueue, remove, retry } from '../storage/downloads'
import { useStore } from './store'
import { Icon } from './Icon'

/** Round progress ring, so a long song does not need a wide row. */
function Ring({ done, total }: { done: number; total: number }): JSX.Element {
  const fraction = total > 0 ? Math.min(1, done / total) : 0
  const circumference = 2 * Math.PI * 9
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="dl-ring">
      <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <circle
        cx="11"
        cy="11"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform="rotate(-90 11 11)"
      />
    </svg>
  )
}

export function DownloadButton({ track }: { track: Track }): JSX.Element | null {
  useStore(downloads) // re-render as this track's record changes
  if (!canDownload(track)) return null

  const record = downloadOf(track.id)
  const status = record?.status

  if (status === 'done') {
    // Every row this button ever renders in is already a downloaded one —
    // Downloads only lists `done` records — so a checkmark here says nothing
    // a trash icon can't say better, and a tick that silently deletes on tap
    // reads as "mark done", not "delete". One unambiguous action instead.
    return (
      <button
        type="button"
        className="row-action"
        aria-label={`Delete download of ${track.title}`}
        onClick={() => {
          if (confirm(`Delete the downloaded copy of "${track.title}"?`)) void remove(track.id)
        }}
      >
        <Icon name="trash" size={20} />
      </button>
    )
  }

  if (status === 'queued' || status === 'downloading') {
    return (
      <button
        type="button"
        className="row-action"
        aria-label={`Cancel download of ${track.title}`}
        onClick={() => cancel(track.id)}
      >
        <Ring done={record?.bytesDone ?? 0} total={record?.bytesTotal ?? 0} />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={status === 'error' ? 'row-action error' : 'row-action'}
      aria-label={status === 'error' ? `Retry download of ${track.title}` : `Download ${track.title}`}
      onClick={() => (status === 'error' ? retry(track.id) : void enqueue(track))}
    >
      <Icon name={status === 'error' ? 'retry' : 'download'} size={20} />
    </button>
  )
}

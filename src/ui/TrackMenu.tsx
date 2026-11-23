import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Track } from '../source/MusicSource'
import {
  canDownload,
  cancel,
  downloadOf,
  downloads,
  enqueue,
  formatBytes,
  remove,
  retry,
} from '../storage/downloads'
import { saveTrack } from '../storage/db'
import { addToPlaylist, createPlaylist, isInPlaylist, playlists, removeFromPlaylist } from '../storage/playlists'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { Icon, type IconName } from './Icon'
import { toast } from './toast'
import { NewPlaylistForm } from './NewPlaylistForm'

/** The Web Share API opens the OS share sheet; without it (desktop Safari,
 * most non-Chromium desktop browsers), falling back to the clipboard still
 * gets the one thing share is really for — handing someone the song name. */
export async function shareTrack(track: Track): Promise<void> {
  const text = `${track.title} — ${track.artist}`
  if (navigator.share) {
    try {
      await navigator.share({ title: track.title, text })
      return
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return // user cancelled the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied to clipboard')
  } catch {
    toast('Could not share this song')
  }
}

interface Action {
  label: string
  note?: string
  icon: IconName
  danger?: boolean
  /** A normal, one-tap action. Absent only for "Add to playlist", which opens
   * a second sheet instead of running and closing. */
  run?: () => void
  openPlaylistPicker?: true
}

/** The download half of the menu — unchanged by playlists. */
function downloadActionsFor(track: Track): Action[] {
  if (!canDownload(track)) return [] // a live stream has no end to save
  const record = downloadOf(track.id)

  switch (record?.status) {
    case 'done':
      return [
        {
          label: 'Remove download',
          note: formatBytes(record.bytesTotal),
          icon: 'trash',
          danger: true,
          run: () => void remove(track.id),
        },
      ]
    case 'downloading':
      return [
        {
          label: 'Cancel download',
          note: record.bytesTotal
            ? `${formatBytes(record.bytesDone)} of ${formatBytes(record.bytesTotal)}`
            : formatBytes(record.bytesDone),
          icon: 'close',
          run: () => cancel(track.id),
        },
      ]
    case 'queued':
      return [{ label: 'Cancel download', note: 'Waiting…', icon: 'close', run: () => cancel(track.id) }]
    case 'error':
      return [
        { label: 'Retry download', note: record.error, icon: 'retry', run: () => retry(track.id) },
        { label: 'Remove', icon: 'trash', danger: true, run: () => void remove(track.id) },
      ]
    default:
      return [{ label: 'Download', icon: 'download', run: () => void enqueue(track) }]
  }
}

/** What this track offers right now — the menu only hides itself when this is
 * truly empty, which no longer happens for an ordinary track: there is always
 * at least "Add to playlist". `inPlaylistId` adds "Remove from this playlist"
 * when the menu is opened from inside that playlist's own screen. */
export function actionsFor(track: Track, inPlaylistId?: string): Action[] {
  const actions = downloadActionsFor(track)
  // Queuing the song already playing is a no-op worth hiding, not offering.
  if (currentTrackOf(player.state.get())?.id !== track.id) {
    actions.push({ label: 'Play next', icon: 'next', run: () => player.playNext(track) })
    actions.push({ label: 'Add to queue', icon: 'plus', run: () => player.addToQueue(track) })
  }
  if (inPlaylistId) {
    actions.push({
      label: 'Remove from this playlist',
      icon: 'close',
      danger: true,
      run: () => void removeFromPlaylist(inPlaylistId, track.id),
    })
  }
  actions.push({ label: 'Add to playlist', icon: 'playlist', openPlaylistPicker: true })
  actions.push({ label: 'Share', icon: 'share', run: () => void shareTrack(track) })
  return actions
}

/** The nested "which playlist" view: a checkable list plus "New playlist". */
function PlaylistPicker({
  track,
  onDone,
  onBack,
}: {
  track: Track
  onDone: () => void
  onBack: () => void
}): JSX.Element {
  const lists = useStore(playlists)
  const [creating, setCreating] = useState(false)

  async function toggle(id: string): Promise<void> {
    if (isInPlaylist(id, track.id)) await removeFromPlaylist(id, track.id)
    else {
      await saveTrack(track) // so the playlist can show this track with no network later
      await addToPlaylist(id, track.id)
    }
  }

  async function makeNewAndAdd(name: string): Promise<void> {
    const created = await createPlaylist(name)
    await saveTrack(track)
    await addToPlaylist(created.id, track.id)
    onDone()
  }

  if (creating) {
    return (
      <>
        <div className="sheet-head sheet-nav">
          <button type="button" className="sheet-back" onClick={() => setCreating(false)} aria-label="Back">
            <Icon name="chevron-left" size={20} />
          </button>
          <span className="sheet-title-group">
            <span className="sheet-title">New playlist</span>
          </span>
        </div>
        <NewPlaylistForm onCreate={(name) => void makeNewAndAdd(name)} />
      </>
    )
  }

  return (
    <>
      <div className="sheet-head sheet-nav">
        <button type="button" className="sheet-back" onClick={onBack} aria-label="Back to options">
          <Icon name="chevron-left" size={20} />
        </button>
        <span className="sheet-title-group">
          <span className="sheet-title">Add to playlist</span>
          <span className="sheet-sub">{track.title}</span>
        </span>
      </div>

      <button type="button" className="sheet-item sheet-item-accent" onClick={() => setCreating(true)}>
        <Icon name="plus" size={21} />
        <span className="sheet-item-text">New playlist</span>
      </button>

      {lists.length > 0 ? <div className="sheet-divider" /> : null}

      {lists.length === 0 ? (
        <p className="sheet-note" style={{ padding: '4px 14px 10px' }}>
          No playlists yet — make one above.
        </p>
      ) : (
        lists.map((list) => {
          const inList = isInPlaylist(list.id, track.id)
          return (
            <button
              key={list.id}
              type="button"
              className="sheet-item"
              aria-pressed={inList}
              onClick={() => void toggle(list.id)}
            >
              {inList ? <Icon name="check" size={21} /> : <span style={{ width: 21 }} aria-hidden="true" />}
              <span className="sheet-item-text">
                {list.name}
                <span className="sheet-note">{list.trackIds.length} tracks</span>
              </span>
            </button>
          )
        })
      )}

      <button type="button" className="sheet-cancel" onClick={onDone}>
        Done
      </button>
    </>
  )
}

/** The ⋯ on a row: an iOS-style sheet, because a popover near the bottom tab
 * bar is unreachable on a tall phone and a 44px target is not negotiable. */
export function TrackMenu({
  track,
  className = 'row-action',
  inPlaylistId,
}: {
  track: Track
  className?: string
  /** Set when this menu is rendered inside that playlist's own screen. */
  inPlaylistId?: string
}): JSX.Element | null {
  useStore(downloads) // the available actions change as the download progresses
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    sheet.current?.focus()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const close = (): void => {
    setOpen(false)
    setPicking(false)
    trigger.current?.focus() // never strand the keyboard at the top of the page
  }

  const actions = actionsFor(track, inPlaylistId)
  if (actions.length === 0) return null

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`More options for ${track.title}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="more" size={20} />
      </button>

      {open ? (
        <div className="sheet-backdrop" onClick={close}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={picking ? `Add ${track.title} to a playlist` : `Options for ${track.title}`}
            tabIndex={-1}
            ref={sheet}
            onClick={(event) => event.stopPropagation()}
          >
            {picking ? (
              <PlaylistPicker track={track} onDone={close} onBack={() => setPicking(false)} />
            ) : (
              <>
                <div className="sheet-head">
                  <span className="sheet-title">{track.title}</span>
                  <span className="sheet-sub">{track.artist}</span>
                </div>

                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className={action.danger ? 'sheet-item danger' : 'sheet-item'}
                    onClick={() => {
                      if (action.openPlaylistPicker) setPicking(true)
                      else {
                        action.run?.()
                        close()
                      }
                    }}
                  >
                    <Icon name={action.icon} size={21} />
                    <span className="sheet-item-text">
                      {action.label}
                      {action.note ? <span className="sheet-note">{action.note}</span> : null}
                    </span>
                  </button>
                ))}

                <button type="button" className="sheet-cancel" onClick={close}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../source/MusicSource'
import { player } from '../player'
import { activeLine, parseLyrics, type LyricLine } from '../lyrics/lrc'
import { source } from '../source'
import { getLyrics as storedLyrics, saveLyrics } from '../storage/db'
import { useStore } from './store'

/** Downloaded lyrics first, so a downloaded song shows them with no network. */
async function loadLyrics(trackId: string): Promise<LyricLine[] | null> {
  const stored = await storedLyrics(trackId).catch(() => undefined)
  if (stored) return parseLyrics(stored)

  const fetched = await source.getLyrics(trackId).catch(() => null)
  if (!fetched) return null
  void saveLyrics(trackId, fetched).catch(() => undefined) // worth keeping either way
  return parseLyrics(fetched)
}

const SCROLL_PAUSE_MS = 3000

export function Lyrics({ track }: { track: Track }): JSX.Element {
  const { positionSec } = useStore(player.progress)
  const [lines, setLines] = useState<LyricLine[] | null>(null)
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  // A user who scrolls wants to stay where they put it, briefly.
  const pausedUntil = useRef(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    setLines(null)
    void loadLyrics(track.id).then((found) => {
      if (!live) return
      setLines(found)
      setLoading(false)
    })
    return () => {
      live = false
    }
  }, [track.id])

  const current = lines ? activeLine(lines, positionSec) : -1

  useEffect(() => {
    if (current < 0 || Date.now() < pausedUntil.current) return
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [current])

  // `current` only changes at line boundaries, not every progress tick —
  // without this, playback re-renders every lyric line ~4x/sec for nothing.
  // Computed before the early returns below: hooks must run unconditionally
  // on every render, or React throws once `loading`/`lines` change and this
  // call starts/stops happening — which is exactly what blanked the screen.
  const rows = useMemo(
    () =>
      (lines ?? []).map((line, i) => (
        <button
          key={`${line.timeSec ?? 'x'}-${i}`}
          type="button"
          ref={i === current ? activeRef : undefined}
          className={i === current ? 'lyric on' : 'lyric'}
          // Untimed plain lyrics have nowhere to seek to.
          disabled={line.timeSec === null}
          aria-current={i === current ? 'true' : undefined}
          onClick={() => line.timeSec !== null && player.seekTo(line.timeSec)}
        >
          {line.text}
        </button>
      )),
    [lines, current],
  )

  if (loading) return <p className="lyrics-note">Looking for lyrics…</p>
  if (!lines || lines.length === 0) return <p className="lyrics-note">No lyrics for this song.</p>

  const timed = lines.some((line) => line.timeSec !== null)

  return (
    <div
      className="lyrics"
      ref={listRef}
      onScroll={() => {
        pausedUntil.current = Date.now() + SCROLL_PAUSE_MS
      }}
    >
      {rows}
      {!timed ? <p className="lyrics-note">Unsynced lyrics — tapping a line cannot seek.</p> : null}
    </div>
  )
}

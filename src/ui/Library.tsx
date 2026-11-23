import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { Track } from '../source/MusicSource'
import { isStandalone, online } from '../pwa/pwa'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { useAsync } from './useAsync'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { homeRows } from './home'

// Curated, not the literal list typed in chat — one frame there reads as a
// lewd ASCII gag, out of place as permanent app chrome next to the title.
const MASCOT_FRAMES = [
  '( •_•)',
  'ᗒᗣᗕ)՞',
  '( ͡° ͜ʖ ͡° )',
  'ʕ̡̢̡ʘ̅͟͜͡ʘ̲̅ʔ̢̡̢',
  '٩(＾◡＾)۶',
  '๑(◕‿◕)๑',
  '⁀⊙෴☉⁀',
  '༼ ༎ຶ ᆺ ༎ຶ༽',
]
const MASCOT_FRAME_MS = 2600

/** A little flipbook beside the title — one frame at a time, each one its own
 * element so the fade-in is a fresh mount, not a same-node text swap (which
 * CSS cannot transition). Reduced motion holds on the first frame, still. */
function Mascot(): JSX.Element {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % MASCOT_FRAMES.length), MASCOT_FRAME_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <span className="mascot" aria-hidden="true">
      <span key={frame} className="mascot-frame">
        {MASCOT_FRAMES[frame]}
      </span>
    </span>
  )
}

/** Green when there is a network, red when there isn't — color plus an
 * accessible name, since color alone never satisfies "convey information". */
function StatusPill({ isOnline }: { isOnline: boolean }): JSX.Element {
  return (
    <span
      className={isOnline ? 'status-pill online' : 'status-pill offline'}
      role="status"
      aria-label={isOnline ? 'Online' : 'Offline'}
    />
  )
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Convx's section header: title, inline chevron, and a trailing text action. */
function SectionHead({ title, action }: { title: string; action?: string }): JSX.Element {
  return (
    <div className="sec-head">
      <h2>{title}</h2>
      <Icon name="chevron-right" size={16} stroke={2.9} className="sec-chevron" />
      {action ? <span className="sec-count">{action}</span> : null}
    </div>
  )
}

/**
 * The "Top Picks for You" card. Its caption strip is the artwork again —
 * flipped, blurred and darkened — rather than a separate surface, which is
 * what makes the card read as one object (FigmaTopPickCard).
 */
function HeroCard({ track, onSelect }: { track: Track; onSelect: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="hero-card"
      onClick={onSelect}
      aria-label={`Play ${track.title} by ${track.artist}`}
    >
      <Artwork src={track.artworkUrl} size="100%" alt="" />
      <span className="hero-cap">
        {track.artworkUrl ? <img src={track.artworkUrl} alt="" aria-hidden="true" decoding="async" /> : null}
        <span className="hero-title">{track.title}</span>
        <span className="hero-sub">{track.artist}</span>
      </span>
    </button>
  )
}

function Tile({ track, active, onSelect }: { track: Track; active: boolean; onSelect: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="tile"
      onClick={onSelect}
      aria-label={`Play ${track.title} by ${track.artist}`}
    >
      <Artwork src={track.artworkUrl} size="100%" alt="" radius={10} />
      <span className="tile-title" style={active ? { color: 'var(--accent-text)' } : undefined}>
        {track.title}
      </span>
      <span className="tile-sub">{track.artist}</span>
    </button>
  )
}

/** Title widths differ so the placeholder reads as rows of text, not a grid. */
const SKELETON_ROWS = [168, 132, 196]

/** Mirrors the real layout — a hero rail then titled strips — so nothing jumps
 * when the charts arrive. Hidden from screen readers, which get the status
 * line instead. */
function HomeSkeleton(): JSX.Element {
  return (
    <>
      <p className="sr-only" role="status">
        Loading music…
      </p>
      <div aria-hidden="true">
        <div className="skeleton skeleton-title" style={{ width: 196 }} />
        <div className="hero-strip">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="hero-card">
              <div className="skel-art" style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 0 }} />
              <span className="hero-cap skel-cap" />
            </div>
          ))}
        </div>

        {SKELETON_ROWS.map((width) => (
          <section key={width}>
            <div className="skeleton skeleton-title" style={{ width }} />
            <div className="strip">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="tile">
                  <div className="skel-art" style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 10 }} />
                  <div className="skeleton skeleton-line" style={{ width: '82%' }} />
                  <div className="skeleton skeleton-line" style={{ width: '54%' }} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

export function Library({ onPlay }: { onPlay: (queue: Track[], index: number) => void }): JSX.Element {
  const isOnline = useStore(online)
  const playingId = currentTrackOf(useStore(player.state))?.id
  const [dismissed, setDismissed] = useState(false)
  const { data, error, loading } = useAsync(() => homeRows(isOnline), [isOnline])
  const rows = data ?? []
  // Convx's Home leads with a "Top Picks for You" hero rail and follows it with
  // ordinary shelves; the first row we have is the one that earns that slot.
  const [hero, ...shelves] = rows

  return (
    <>
      <div className="topbar">
        <span className="brand-mark" aria-hidden="true">
          <Icon name="brand" size={16} stroke={2.1} />
        </span>
        <span className="brand-name">Musu Player</span>
        <Mascot />
        <StatusPill isOnline={isOnline} />
      </div>
      <h1>{greeting()}</h1>

      {!isStandalone() && !dismissed ? (
        <div className="banner">
          <b>Add to Home Screen to install.</b> Tap Share, then Add to Home Screen. Downloads made in this Safari tab
          stay in Safari — the installed app starts with an empty library.
          <br />
          <button type="button" className="chip" style={{ marginTop: 10 }} onClick={() => setDismissed(true)}>
            Got it
          </button>
        </div>
      ) : null}

      {!isOnline ? <div className="banner">Offline — showing what is already on this device.</div> : null}

      {loading ? (
        <HomeSkeleton />
      ) : error ? (
        <p className="empty">Could not load the catalogue. {isOnline ? 'Pull down to retry.' : 'You are offline.'}</p>
      ) : !hero ? (
        <p className="empty">Nothing to play yet.</p>
      ) : (
        <>
          <section key={hero[0]}>
            <SectionHead title={hero[0]} action="Play all" />
            <div className="hero-strip">
              {hero[1].map((track, i) => (
                <HeroCard key={track.id} track={track} onSelect={() => onPlay(hero[1], i)} />
              ))}
            </div>
          </section>

          {shelves.map(([title, tracks]) => (
            <section key={title}>
              <SectionHead title={title} />
              <div className="strip">
                {tracks.map((track, i) => (
                  <Tile
                    key={track.id}
                    track={track}
                    active={track.id === playingId}
                    onSelect={() => onPlay(tracks, i)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  )
}

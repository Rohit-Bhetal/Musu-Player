import type { CSSProperties, JSX } from 'react'
import { useEffect, useState } from 'react'
import type { Track } from '../source/MusicSource'
import { isStandalone, online } from '../pwa/pwa'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { useAsync } from './useAsync'
import { Artwork } from './Artwork'
import { useArtworkTint } from './artworkTint'
import { Icon, type IconName } from './Icon'
import { homeRows } from './home'
import { currentUser } from '../sync/auth'
import { TrackRow } from './TrackRow'
import { NEXT_THEME, setTheme, theme, type ThemeMode } from './settings'

// This device's own history, from home.ts's homeRows — real cover art is how
// you recognise a specific past play, so these never get the gradient-banner
// treatment, unlike a chart/catalog row with nothing specific to recognise.
const PERSONAL_ROWS = new Set(['Downloaded', 'Recently played'])

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
 * CSS cannot transition). Deliberately ignores prefers-reduced-motion: it's a
 * few-px kaomoji swap, not the kind of motion that guard exists to protect
 * against, and every other animation in the app still respects it. */
function Mascot(): JSX.Element {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
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

const THEME_ICON: Record<ThemeMode, IconName> = { system: 'theme-auto', light: 'sun', dark: 'moon' }
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** Cycles system -> light -> dark -> system on tap (src/ui/settings.ts). */
function ThemeToggle(): JSX.Element {
  const mode = useStore(theme)
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Theme: ${THEME_LABEL[mode]} — tap to change`}
      onClick={() => setTheme(NEXT_THEME[mode])}
    >
      <Icon name={THEME_ICON[mode]} size={18} />
    </button>
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

function greeting(name: string | null): string {
  const h = new Date().getHours()
  const time = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${time}, ${name}` : time
}

/** Blank when signed out — a "you're backed up" indicator, not a sign-in
 * prompt (that lives in Settings > Account). Taps there to the same place. */
function AccountAvatar({ onOpenSettings }: { onOpenSettings: () => void }): JSX.Element | null {
  const user = useStore(currentUser)
  if (!user) return null
  const initial = (user.displayName ?? user.email ?? '?').trim().charAt(0).toUpperCase()

  return (
    <button type="button" className="account-avatar" aria-label="Account settings" onClick={onOpenSettings}>
      {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
    </button>
  )
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
 * The "Top Picks for You" rail. Its caption strip is the artwork again —
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
      <Artwork src={track.artworkUrl} size="100%" alt="" seed={track.id} />
      <span className="hero-cap">
        {track.artworkUrl ? <img src={track.artworkUrl} alt="" aria-hidden="true" decoding="async" /> : null}
        <span className="hero-title">{track.title}</span>
        <span className="hero-sub">{track.artist}</span>
      </span>
    </button>
  )
}

/** The one bold surface on Home, in an otherwise restrained design — earned
 * by using the featured track's own artwork colour (same useArtworkTint hook
 * Now Playing paints itself from), not an arbitrary decorative gradient. */
function FeaturedHero({ track, onSelect }: { track: Track; onSelect: () => void }): JSX.Element {
  const tint = useArtworkTint(track.artworkUrl)
  const themed = tint ? ({ '--fh-a': tint.tint } as CSSProperties) : undefined

  return (
    <div className="featured-hero" style={themed}>
      <span className="featured-hero-eyebrow">Featured</span>
      <h3 className="featured-hero-title">{track.title}</h3>
      <p className="featured-hero-sub">{track.artist}</p>
      <button type="button" className="featured-hero-btn" onClick={onSelect}>
        Play now
      </button>
    </div>
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
      <Artwork src={track.artworkUrl} size="100%" alt="" radius={10} seed={track.id} />
      <span className="tile-title" style={active ? { color: 'var(--accent-text)' } : undefined}>
        {track.title}
      </span>
      <span className="tile-sub">{track.artist}</span>
    </button>
  )
}

/** Title widths differ so the placeholder reads as rows of text, not a grid. */
const SKELETON_ROWS = [168, 132, 196]

/** Mirrors the real layout — a featured banner, a hero rail, then titled
 * strips — so nothing jumps when the charts arrive. Hidden from screen
 * readers, which get the status line instead. */
function HomeSkeleton(): JSX.Element {
  return (
    <>
      <p className="sr-only" role="status">
        Loading music…
      </p>
      <div aria-hidden="true">
        <div className="skeleton skeleton-title" style={{ width: 196 }} />
        <div className="skeleton" style={{ height: 150, borderRadius: 'var(--r-card-lg)', marginBottom: 'var(--section-gap)' }} />
        <div className="hero-strip">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="hero-card">
              <div className="skel-art" style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 0 }} />
              <span className="hero-cap" style={{ background: 'var(--skeleton)' }} />
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

export function Library({
  onPlay,
  onOpenSettings,
}: {
  onPlay: (queue: Track[], index: number) => void
  onOpenSettings: () => void
}): JSX.Element {
  const isOnline = useStore(online)
  const user = useStore(currentUser)
  const playingId = currentTrackOf(useStore(player.state))?.id
  const [dismissed, setDismissed] = useState(false)
  const { data, error, loading } = useAsync(() => homeRows(isOnline), [isOnline])
  const rows = data ?? []
  // "Downloaded" and "Recently played" are this device's own history — real
  // cover art is how you recognise a specific past play, so those always stay
  // plain Tile shelves. Only a chart/catalog row (no single track to
  // recognise, just browsing) gets the gradient-banner treatment: the first
  // one as the one bold Featured banner, any further ones as a smaller
  // gradient-card rail — never more than one full-size banner per screen.
  const firstCatalogIndex = rows.findIndex(([title]) => !PERSONAL_ROWS.has(title))

  return (
    <>
      <div className="topbar">
        <span className="brand-mark" aria-hidden="true">
          <img src="/icons/logo-128.png" alt="" />
        </span>
        <span className="brand-name">Musu Player</span>
        <Mascot />
        <ThemeToggle />
        <StatusPill isOnline={isOnline} />
        <AccountAvatar onOpenSettings={onOpenSettings} />
      </div>
      <h1>{greeting(user?.displayName?.split(' ')[0] ?? null)}</h1>

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
      ) : rows.length === 0 ? (
        <p className="empty">Nothing to play yet.</p>
      ) : (
        <>
          {rows.map(([title, tracks], i) => {
            if (PERSONAL_ROWS.has(title)) {
              return (
                <section key={title}>
                  <SectionHead title={title} />
                  <div className="strip">
                    {tracks.map((track, ti) => (
                      <Tile
                        key={track.id}
                        track={track}
                        active={track.id === playingId}
                        onSelect={() => onPlay(tracks, ti)}
                      />
                    ))}
                  </div>
                </section>
              )
            }

            if (i === firstCatalogIndex) {
              return (
                <section key={title}>
                  <SectionHead title={title} action="Play all" />
                  <FeaturedHero track={tracks[0]!} onSelect={() => onPlay(tracks, 0)} />
                  {tracks.length > 1 ? (
                    <div className="hero-strip">
                      {tracks.slice(1).map((track, ti) => (
                        <HeroCard key={track.id} track={track} onSelect={() => onPlay(tracks, ti + 1)} />
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            }

            // A chart can hold up to 20 tracks — a real photo per track reads
            // as a scannable list at that count; a gradient card per track
            // (the earlier version of this) was 20 identical blocks in a row.
            // The first 3 keep the same photo-rail treatment as the Featured
            // row's overflow (HeroCard, reused, not a new visual language);
            // the rest drop into a denser 2-column grid of real thumbnails.
            return (
              <section key={title}>
                <SectionHead title={title} />
                <div className="hero-strip">
                  {tracks.slice(0, 3).map((track, ti) => (
                    <HeroCard key={track.id} track={track} onSelect={() => onPlay(tracks, ti)} />
                  ))}
                </div>
                {tracks.length > 3 ? (
                  <div className="chart-grid">
                    {tracks.slice(3).map((track, ti) => (
                      <TrackRow
                        key={track.id}
                        track={track}
                        active={track.id === playingId}
                        onSelect={() => onPlay(tracks, ti + 3)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </>
      )}
    </>
  )
}

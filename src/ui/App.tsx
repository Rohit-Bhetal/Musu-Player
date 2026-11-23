import type { JSX } from 'react'
import { useState } from 'react'
import type { Track } from '../source/MusicSource'
import { player } from '../player'
import { currentTrackOf } from '../player/PlayerEngine'
import { useStore } from './store'
import { Library } from './Library'
import { Search } from './Search'
import { Radio } from './Radio'
import { Playlists } from './Playlists'
import { Downloads } from './Downloads'
import { Settings } from './Settings'
import { MiniPlayer } from './MiniPlayer'
import { NowPlaying } from './NowPlaying'
import { TabBar, type TabId } from './TabBar'
import { Toasts } from './Toast'

export function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>('library')
  const [expanded, setExpanded] = useState(false)
  // The dock floats over the screen, so only a class can tell the screen how
  // much to keep clear — the mini player adds a second pill when it is there.
  // Reserved regardless of Settings > "Hide mini player when paused": that
  // setting slides the pill away visually (MiniPlayer's own CSS), it does not
  // unmount it, so the dock never needs to resize out from under the tab bar.
  const hasMini = currentTrackOf(useStore(player.state)) !== null

  // straight from the tap: iOS only unlocks the audio element inside a gesture
  const onPlay = (queue: Track[], index: number): void => void player.playQueue(queue, index)

  return (
    <div className={hasMini ? 'app has-mini' : 'app'}>
      <main className="screen">
        {tab === 'library' ? <Library onPlay={onPlay} /> : null}
        {tab === 'search' ? <Search onPlay={onPlay} /> : null}
        {tab === 'radio' ? <Radio onPlay={onPlay} /> : null}
        {tab === 'playlists' ? <Playlists onPlay={onPlay} /> : null}
        {tab === 'downloads' ? <Downloads onPlay={onPlay} /> : null}
        {tab === 'settings' ? <Settings /> : null}
      </main>

      <Toasts />

      <div className="dock">
        <MiniPlayer onOpen={() => setExpanded(true)} />
        <TabBar tab={tab} onChange={setTab} />
      </div>

      {expanded ? <NowPlaying onClose={() => setExpanded(false)} /> : null}
    </div>
  )
}

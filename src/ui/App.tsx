import type { JSX } from 'react'
import { useState } from 'react'
import type { Track } from '../source/MusicSource'
import { player } from '../player'
import { Library } from './Library'
import { Search } from './Search'
import { Downloads } from './Downloads'
import { Settings } from './Settings'
import { MiniPlayer } from './MiniPlayer'
import { NowPlaying } from './NowPlaying'
import { TabBar, type TabId } from './TabBar'
import { Toasts } from './Toast'

export function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>('library')
  const [expanded, setExpanded] = useState(false)

  // straight from the tap: iOS only unlocks the audio element inside a gesture
  const onPlay = (queue: Track[], index: number): void => void player.playQueue(queue, index)

  return (
    <div className="app">
      <main className="screen">
        {tab === 'library' ? <Library onPlay={onPlay} /> : null}
        {tab === 'search' ? <Search onPlay={onPlay} /> : null}
        {tab === 'downloads' ? <Downloads /> : null}
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

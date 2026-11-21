import type { JSX } from 'react'
import { useState } from 'react'
import { Library } from './Library'
import { Search } from './Search'
import { Downloads } from './Downloads'
import { Settings } from './Settings'
import { TabBar, type TabId } from './TabBar'
import { Toasts } from './Toast'
import { toast } from './toast'

export function App(): JSX.Element {
  const [tab, setTab] = useState<TabId>('library')
  const onPlay = (): void => void toast('Playback arrives in P2.')

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
        <TabBar tab={tab} onChange={setTab} />
      </div>
    </div>
  )
}

import type { JSX } from 'react'
import { useState } from 'react'
import { isStandalone, online, swState } from '../pwa/pwa'
import { debugConsoleEnabled, setDebugConsole } from '../debug/eruda'
import { useStore } from './store'

function Value({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="card-row">
      <span>{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

export function Settings(): JSX.Element {
  const sw = useStore(swState)
  const isOnline = useStore(online)
  const [debug, setDebug] = useState(debugConsoleEnabled)

  return (
    <>
      <h1>Settings</h1>

      <h2>Debugging</h2>
      <div className="card">
        <div className="card-row">
          <span id="debug-label">Debug console</span>
          <button
            type="button"
            className="chip"
            role="switch"
            aria-checked={debug}
            aria-labelledby="debug-label"
            onClick={() => {
              const next = !debug
              setDebug(next)
              void setDebugConsole(next)
            }}
          >
            {debug ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <h2>Diagnostics</h2>
      <div className="card">
        <Value label="Installed (standalone)" value={isStandalone() ? 'Yes' : 'No — running in Safari'} />
        <Value label="Service worker" value={sw} />
        <Value label="Network" value={isOnline ? 'Online' : 'Offline'} />
      </div>
    </>
  )
}

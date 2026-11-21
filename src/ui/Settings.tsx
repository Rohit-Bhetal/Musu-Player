import type { JSX } from 'react'
import { useState } from 'react'
import { isStandalone, online, swState } from '../pwa/pwa'
import { debugConsoleEnabled, setDebugConsole } from '../debug/eruda'
import { diagEvents } from '../diagnostics'
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
  const events = useStore(diagEvents)
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

      <h2>Player log</h2>
      {events.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Nothing yet — play something.
        </p>
      ) : (
        <ol className="log">
          {[...events].reverse().map((e) => (
            <li key={`${e.at}-${e.kind}-${e.detail ?? ''}`}>
              <code>{new Date(e.at).toLocaleTimeString()}</code> {e.kind}
              {e.detail ? <span className="muted"> · {e.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

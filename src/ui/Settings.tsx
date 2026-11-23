import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { downloads, formatBytes, removeAll } from '../storage/downloads'
import { isStandalone, online, swState } from '../pwa/pwa'
import { debugConsoleEnabled, setDebugConsole } from '../debug/eruda'
import { diagEvents } from '../diagnostics'
import { useStore } from './store'
import { hideMiniWhenPaused, setHideMiniWhenPaused } from './settings'

function Value({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="card-row">
      <span>{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

function Storage(): JSX.Element {
  const records = useStore(downloads)
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    void navigator.storage?.estimate?.().then(setEstimate).catch(() => undefined)
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined)
  }, [records])

  const done = records.filter((r) => r.status === 'done')
  const downloadedBytes = done.reduce((total, r) => total + r.bytesTotal, 0)
  const used = estimate?.usage ?? 0
  const quota = estimate?.quota ?? 0

  return (
    <div className="card">
      <Value label="Downloaded songs" value={String(done.length)} />
      <Value label="Downloaded audio" value={formatBytes(downloadedBytes)} />
      <Value
        label="All app storage"
        value={quota > 0 ? `${formatBytes(used)} of ${formatBytes(quota)}` : formatBytes(used)}
      />
      <Value
        label="Persistent storage"
        // Without this iOS may evict downloads when space runs low.
        value={persisted === null ? 'Unknown' : persisted ? 'Granted' : 'Not granted'}
      />
      {done.length > 0 ? (
        <div className="card-row">
          <span>Delete all downloads</span>
          <button
            type="button"
            className="chip"
            onClick={() => {
              if (confirm('Delete every downloaded song from this device?')) void removeAll()
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function Settings(): JSX.Element {
  const sw = useStore(swState)
  const isOnline = useStore(online)
  const events = useStore(diagEvents)
  const [debug, setDebug] = useState(debugConsoleEnabled)
  const hideMini = useStore(hideMiniWhenPaused)

  return (
    <>
      <h1>Settings</h1>

      <h2>Playback</h2>
      <div className="card">
        <div className="card-row">
          <span id="hide-mini-label">Hide mini player when paused</span>
          <button
            type="button"
            className="chip"
            role="switch"
            aria-checked={hideMini}
            aria-labelledby="hide-mini-label"
            onClick={() => setHideMiniWhenPaused(!hideMini)}
          >
            {hideMini ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <h2>Storage</h2>
      <Storage />

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

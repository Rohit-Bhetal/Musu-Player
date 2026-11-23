import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { player } from '../player'
import { Icon } from './Icon'

/** Chrome's device-switch UI (desktop and Android) — there is no system
 * picker to call here the way Safari's AirPlay button has, so this lists
 * `setSinkId`-selectable outputs itself, reusing the app's existing sheet. */
export function OutputDeviceSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)

  useEffect(() => {
    let live = true
    void player.listOutputDevices().then((found) => live && setDevices(found))
    return () => {
      live = false
    }
  }, [])

  async function choose(deviceId: string): Promise<void> {
    await player.setOutputDevice(deviceId)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Choose playback device"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <span className="sheet-title">Playback device</span>
        </div>

        {devices === null ? (
          <p className="sheet-note" style={{ padding: '4px 14px 10px' }}>
            Looking for devices…
          </p>
        ) : devices.length === 0 ? (
          <p className="sheet-note" style={{ padding: '4px 14px 10px' }}>
            No other output devices found.
          </p>
        ) : (
          devices.map((device, i) => (
            <button key={device.deviceId} type="button" className="sheet-item" onClick={() => void choose(device.deviceId)}>
              <Icon name="airplay" size={21} />
              {/* blank without a prior mic/camera permission grant on this origin */}
              <span className="sheet-item-text">{device.label || `Output ${i + 1}`}</span>
            </button>
          ))
        )}

        <button type="button" className="sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

import { registerSW } from 'virtual:pwa-register'
import { createStore } from '../ui/store'
import { toast } from '../ui/toast'

/** iOS only persists downloads per-context, so Safari-tab and installed-app data are separate. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export const online = createStore(navigator.onLine)

/** Called when a fetch fails in a way navigator.onLine did not predict. */
export function markOffline(): void {
  online.set(false)
}

export const swState = createStore<'none' | 'registering' | 'ready' | 'update-waiting' | 'unsupported'>(
  'serviceWorker' in navigator ? 'none' : 'unsupported',
)

export function setupPWA(): void {
  window.addEventListener('online', () => online.set(true))
  window.addEventListener('offline', () => online.set(false))

  if (!('serviceWorker' in navigator)) return
  swState.set('registering')
  const updateSW = registerSW({
    onRegisteredSW: () => swState.set('ready'),
    onRegisterError: () => swState.set('none'),
    onNeedRefresh() {
      swState.set('update-waiting')
      toast('Update available', { label: 'Reload', run: () => void updateSW(true) })
    },
  })
}

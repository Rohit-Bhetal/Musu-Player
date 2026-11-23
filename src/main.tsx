import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { setupPWA } from './pwa/pwa'
import { restoreDebugConsole } from './debug/eruda'
import { initPlaylists } from './storage/playlists'
import { initHistory } from './storage/history'
import { initAuth } from './sync/auth'
import { initCloudSync } from './sync/cloudSync'
import { initTheme } from './ui/settings'
import './ui/styles.css'

initTheme() // before first paint, so there is no flash of the system theme
setupPWA()
restoreDebugConsole()

// Local stores finish loading before cloud sync starts — otherwise a pull
// landing before initPlaylists()/initHistory() finish would have its merge
// overwritten by the plain on-disk load that follows it.
void Promise.all([initPlaylists(), initHistory()]).then(() => {
  void initAuth()
  initCloudSync()
})

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

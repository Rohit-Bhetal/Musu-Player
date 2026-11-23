import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { setupPWA } from './pwa/pwa'
import { restoreDebugConsole } from './debug/eruda'
import { initPlaylists } from './storage/playlists'
import { initHistory } from './storage/history'
import './ui/styles.css'

setupPWA()
restoreDebugConsole()
void initPlaylists()
void initHistory()

const root = document.getElementById('root')
if (!root) throw new Error('#root missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

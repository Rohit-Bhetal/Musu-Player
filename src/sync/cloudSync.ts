import type { HistoryRecord } from '../storage/db'
import { listHistory } from '../storage/db'
import { importHistory, onHistoryChange, onHistoryClear } from '../storage/history'
import { importPlaylists, onPlaylistChange, playlists, type Playlist } from '../storage/playlists'
import { logEvent } from '../diagnostics'
import { currentUser } from './auth'
import { firebaseConfigured, firestoreDb } from './firebase'

async function pull(uid: string): Promise<void> {
  const [{ collection, getDocs }, db] = await Promise.all([import('firebase/firestore'), firestoreDb()])
  const [playlistSnap, historySnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'playlists')),
    getDocs(collection(db, 'users', uid, 'history')),
  ])
  importPlaylists(playlistSnap.docs.map((d) => d.data() as Playlist))
  await importHistory(historySnap.docs.map((d) => d.data() as HistoryRecord))
}

/** Uploads everything currently local — the merge result of `pull()` plus
 * anything that only ever existed on this device — so a first sign-in on a
 * device that already had playlists does not wait for the next edit to back
 * them up. */
async function fullPush(uid: string): Promise<void> {
  const [{ doc, setDoc }, db] = await Promise.all([import('firebase/firestore'), firestoreDb()])
  const historyRecords = await listHistory().catch(() => [])
  await Promise.all([
    ...playlists.get().map((p) => setDoc(doc(db, 'users', uid, 'playlists', p.id), p)),
    ...historyRecords.map((r) => setDoc(doc(db, 'users', uid, 'history', r.trackId), r)),
  ])
}

let stopPlaylistPush: (() => void) | null = null
let stopHistoryPush: (() => void) | null = null
let stopHistoryClearPush: (() => void) | null = null

function stopPush(): void {
  stopPlaylistPush?.()
  stopHistoryPush?.()
  stopHistoryClearPush?.()
  stopPlaylistPush = stopHistoryPush = stopHistoryClearPush = null
}

/** Starts mirroring local edits to the cloud — only after the initial pull and
 * catch-up push settle, so a fresh sign-in does not race its own restore. */
async function startPush(uid: string): Promise<void> {
  const [{ collection, deleteDoc, doc, getDocs, setDoc }, db] = await Promise.all([
    import('firebase/firestore'),
    firestoreDb(),
  ])
  stopPlaylistPush = onPlaylistChange((playlist, id) => {
    const ref = doc(db, 'users', uid, 'playlists', id)
    void (playlist ? setDoc(ref, playlist) : deleteDoc(ref)).catch((e: unknown) =>
      logEvent('sync:push-failed', String(e)),
    )
  })
  stopHistoryPush = onHistoryChange((record) => {
    void setDoc(doc(db, 'users', uid, 'history', record.trackId), record).catch((e: unknown) =>
      logEvent('sync:push-failed', String(e)),
    )
  })
  stopHistoryClearPush = onHistoryClear(() => {
    void getDocs(collection(db, 'users', uid, 'history'))
      .then((snap) => Promise.all(snap.docs.map((d) => deleteDoc(d.ref))))
      .catch((e: unknown) => logEvent('sync:push-failed', String(e)))
  })
}

// Bumped on every auth change, captured at the start of each pull/push chain
// below — if a newer auth change lands before an older chain's startPush, the
// older chain's captured value goes stale and it skips startPush entirely.
// Without this, a quick sign-in-then-sign-out (or a switch to a different
// account) left an orphaned chain that reached startPush with the OLD uid
// after the new state took over, mirroring every subsequent edit to the
// wrong account's Firestore.
let generation = 0

/** Backs up playlists and play history to Firestore while signed in, and
 * restores them on a fresh install or a second device — this device stays
 * fully offline-capable either way, cloud sync only ever adds a mirror on top.
 * Nothing in here imports the Firebase SDK at the top level, so a build with
 * no .env.local never fetches it, and a configured one only fetches it once
 * someone is actually signed in. */
export function initCloudSync(): void {
  if (!firebaseConfigured) return
  currentUser.subscribe(() => {
    const myGeneration = ++generation
    stopPush()
    const user = currentUser.get()
    if (!user) return
    void pull(user.uid)
      .then(() => fullPush(user.uid))
      .catch((e: unknown) => logEvent('sync:pull-failed', String(e)))
      .then(() => {
        if (myGeneration !== generation) return // superseded — do not mirror to a stale account
        void startPush(user.uid)
      })
  })
}

import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** Unset in a build with no .env.local — cloud backup is simply skipped, same
 * as every other optional backend (the extractor, Lyrica, ...). This is a
 * plain string check, not an import of the Firebase SDK, so an unconfigured
 * build never fetches a single byte of it. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId)

let appPromise: Promise<FirebaseApp> | null = null
let authPromise: Promise<Auth> | null = null
let dbPromise: Promise<Firestore> | null = null

// Firebase's SDK is ~190KB gzipped — loaded as its own chunk, only the first
// time one of these is actually awaited (a sign-in tap, or the session-restore
// check at boot when a project is configured), never inline with the app shell.
function ensureApp(): Promise<FirebaseApp> {
  if (!appPromise) appPromise = import('firebase/app').then(({ initializeApp }) => initializeApp(config))
  return appPromise
}

export function firebaseAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = Promise.all([ensureApp(), import('firebase/auth')]).then(([app, { getAuth }]) => getAuth(app))
  }
  return authPromise
}

export function firestoreDb(): Promise<Firestore> {
  if (!dbPromise) {
    dbPromise = Promise.all([ensureApp(), import('firebase/firestore')]).then(
      ([app, { initializeFirestore, persistentLocalCache, persistentMultipleTabManager }]) =>
        // Writes made while offline queue in this cache and flush once back
        // online — the same guarantee the rest of this app gives for local
        // storage, but for the cloud copy.
        initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }),
    )
  }
  return dbPromise
}

import type { User } from 'firebase/auth'
import { createStore, type Store } from '../ui/store'
import { logEvent } from '../diagnostics'
import { toast } from '../ui/toast'
import { firebaseAuth, firebaseConfigured } from './firebase'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export const currentUser: Store<AuthUser | null> = createStore<AuthUser | null>(null)

function toAuthUser(user: User | null): AuthUser | null {
  return user ? { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL } : null
}

/** Offline access never depends on this — it only ever adds a cloud copy of
 * what IndexedDB already has. */
export async function initAuth(): Promise<void> {
  if (!firebaseConfigured) return
  const [{ onAuthStateChanged }, auth] = await Promise.all([import('firebase/auth'), firebaseAuth()])
  onAuthStateChanged(auth, (user) => currentUser.set(toAuthUser(user)))
}

export async function signInWithGoogle(): Promise<void> {
  if (!firebaseConfigured) {
    toast('Cloud backup is not configured for this build.')
    return
  }
  try {
    const [{ GoogleAuthProvider, signInWithPopup }, auth] = await Promise.all([import('firebase/auth'), firebaseAuth()])
    await signInWithPopup(auth, new GoogleAuthProvider())
  } catch (error) {
    logEvent('auth:sign-in-failed', error instanceof Error ? error.message : String(error))
    toast('Sign-in failed.')
  }
}

export async function signOut(): Promise<void> {
  if (!firebaseConfigured) return
  const [{ signOut: firebaseSignOut }, auth] = await Promise.all([import('firebase/auth'), firebaseAuth()])
  await firebaseSignOut(auth).catch(() => undefined)
}

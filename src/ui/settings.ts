import { createStore, type Store } from './store'

const HIDE_MINI_KEY = 'settings:hideMiniWhenPaused'

function loadBoolean(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Some people want the mini player gone the instant nothing is actually
 * playing, not just when the queue is empty — off by default since losing
 * the one-tap "resume" affordance is a real cost most people don't want. */
export const hideMiniWhenPaused: Store<boolean> = createStore<boolean>(loadBoolean(HIDE_MINI_KEY))

export function setHideMiniWhenPaused(on: boolean): void {
  hideMiniWhenPaused.set(on)
  try {
    localStorage.setItem(HIDE_MINI_KEY, on ? '1' : '0')
  } catch {
    /* private mode — the toggle just will not stick */
  }
}

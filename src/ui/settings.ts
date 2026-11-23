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

export type ThemeMode = 'system' | 'light' | 'dark'
const THEME_KEY = 'settings:theme'
/** Tap order for the topbar theme button. */
export const NEXT_THEME: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }

function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

function applyTheme(mode: ThemeMode): void {
  if (mode === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', mode)
}

export const theme: Store<ThemeMode> = createStore<ThemeMode>(loadTheme())

/** Call once at boot, before the first paint — applies any saved override so
 * there is no flash of the system theme first. Deferred out of module scope
 * (rather than run on import) so importing this file stays safe in a DOM-less
 * test environment. */
export function initTheme(): void {
  applyTheme(theme.get())
}

export function setTheme(mode: ThemeMode): void {
  theme.set(mode)
  applyTheme(mode)
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* private mode — the choice just will not stick */
  }
}

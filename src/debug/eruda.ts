const KEY = 'debug-console'

let loaded = false

export function debugConsoleEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** eruda is ~500 KB, so it is only ever fetched when the toggle is on. */
export async function setDebugConsole(on: boolean): Promise<void> {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* private mode — the toggle just will not stick */
  }
  const eruda = (await import('eruda')).default
  if (on) {
    if (!loaded) {
      eruda.init()
      loaded = true
    }
    eruda.show()
  } else if (loaded) {
    eruda.destroy()
    loaded = false
  }
}

export function restoreDebugConsole(): void {
  if (debugConsoleEnabled()) void setDebugConsole(true)
}

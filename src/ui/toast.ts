import { createStore } from './store'

export interface ToastItem {
  id: number
  message: string
  /** When set the toast stays until tapped or dismissed. */
  action?: { label: string; run: () => void }
}

export const toasts = createStore<readonly ToastItem[]>([])

let nextId = 1

export function dismissToast(id: number): void {
  toasts.set(toasts.get().filter((t) => t.id !== id))
}

export function toast(message: string, action?: ToastItem['action']): number {
  const id = nextId++
  toasts.set([...toasts.get(), { id, message, action }])
  // bare setTimeout, not window's: this runs from the download manager too
  if (!action) setTimeout(() => dismissToast(id), 4000)
  return id
}

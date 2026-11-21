import { createStore } from './ui/store'

export interface DiagEvent {
  at: number
  kind: string
  detail?: string
}

const MAX = 50

export const diagEvents = createStore<readonly DiagEvent[]>([])

/** Ring buffer of the last 50 player / Media Session events, read by Settings. */
export function logEvent(kind: string, detail?: string): void {
  const next = [...diagEvents.get(), { at: Date.now(), kind, detail }]
  diagEvents.set(next.length > MAX ? next.slice(next.length - MAX) : next)
}

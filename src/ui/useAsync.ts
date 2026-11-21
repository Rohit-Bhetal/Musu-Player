import { useEffect, useState } from 'react'

export interface Async<T> {
  data: T | null
  error: Error | null
  loading: boolean
}

/** Runs `fn` on mount and whenever `deps` change; never blocks rendering. */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, error: null, loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error: unknown) =>
        live && setState({ data: null, error: error instanceof Error ? error : new Error(String(error)), loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

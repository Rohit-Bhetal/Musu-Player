import type { FormEvent, JSX } from 'react'
import { useEffect, useRef, useState } from 'react'

/** The "name this playlist" input — shared by Playlists' own "New playlist"
 * button and TrackMenu's "Add to playlist" picker, so creating one looks and
 * behaves the same everywhere it can happen, instead of a native
 * window.prompt() popping over this app's otherwise glass-sheet design. */
export function NewPlaylistForm({ onCreate }: { onCreate: (name: string) => void }): JSX.Element {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onCreate(trimmed)
  }

  return (
    <form className="sheet-form" onSubmit={submit}>
      <div className="search-field">
        <input
          ref={inputRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Playlist name"
          maxLength={60}
          aria-label="Playlist name"
        />
      </div>
      <button type="submit" className="sheet-cancel sheet-submit" disabled={!name.trim()}>
        Create
      </button>
    </form>
  )
}

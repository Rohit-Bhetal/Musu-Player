import type { JSX } from 'react'

const STROKE: Record<string, string[]> = {
  // the flat, minimal mark: the logo's three waves, no gradient and no disc —
  // the gradient orb stays as the real app/home-screen icon, not an in-app glyph
  brand: ['M3 8.5c2 1.6 4 1.6 6 0s4-1.6 6 0 4 1.6 6 0', 'M3 13.5c2 1.6 4 1.6 6 0s4-1.6 6 0 4 1.6 6 0', 'M3 18.5c2 1.6 4 1.6 6 0s4-1.6 6 0 4 1.6 6 0'],
  home: ['m3 11 9-7 9 7', 'M5.5 9.6V20h13V9.6', 'M9.8 20v-6h4.4v6'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-4-4'],
  download: ['M12 3v12', 'm7 11 5 5 5-5', 'M4 20h16'],
  settings: ['M4 8h8', 'M17 8h3', 'M4 16h4', 'M13 16h7', 'M14.5 8a2 2 0 1 0-4 0 2 2 0 0 0 4 0z', 'M10.5 16a2 2 0 1 0-4 0 2 2 0 0 0 4 0z'],
  shuffle: ['M3 18h2.1c1.3 0 2.5-.6 3.3-1.7l6.2-8.6c.8-1.1 2-1.7 3.3-1.7H21', 'm18 3 3 3-3 3', 'M3 6h2.1c1.4 0 2.7.7 3.5 1.9', 'M21 18h-3.1c-1.3 0-2.6-.7-3.4-1.9', 'm18 15 3 3-3 3'],
  repeat: ['m17 2 4 4-4 4', 'M3 12v-2a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 12v2a4 4 0 0 1-4 4H3'],
  'repeat-1': ['m17 2 4 4-4 4', 'M3 12v-2a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 12v2a4 4 0 0 1-4 4H3', 'M11 11h1v4'],
  chevron: ['m6 9 6 6 6-6'],
  'chevron-right': ['m9 5 7 7-7 7'],
  'chevron-left': ['m15 5-7 7 7 7'],
  // the player's bottom-row lyrics glyph: a speech bubble carrying quote marks
  lyrics: ['M4 5h16v11H9l-4 4v-4H4z', 'M8.6 8.8v1.8h1.8', 'M13.6 8.8v1.8h1.8'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'm6 7 1 13h10l1-13', 'M9 7V4h6v3'],
  close: ['m6 6 12 12', 'm18 6-12 12'],
  check: ['m5 13 4 4 10-10'],
  music: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  retry: ['M20 11a8 8 0 1 0-1.3 5.3', 'M20 5v6h-6'],
  'volume-low': ['M4 9.5h3L11 6v12l-4-3.5H4z', 'M15 10a3 3 0 0 1 0 4'],
  'volume-high': ['M4 9.5h3L11 6v12l-4-3.5H4z', 'M15 9a4 4 0 0 1 0 6', 'M18 6.5a8 8 0 0 1 0 11'],
  // three list lines, the shortest one capped by a small play-arrow outline
  playlist: ['M4 7h14', 'M4 12h14', 'M4 17h8', 'm16.5 15 4 2-4 2z'],
  plus: ['M12 4v16', 'M4 12h16'],
  // the iOS share-sheet glyph: an arrow out of an open box
  share: ['M12 15V3', 'm7 8 5-5 5 5', 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'],
  radio: [
    'M4.9 19.1C1 15.2 1 8.8 4.9 4.9',
    'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5',
    'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5',
    'M19.1 4.9C23 8.8 23 15.2 19.1 19.1',
  ],
}

const FILL: Record<string, string[]> = {
  more: [
    'M5 10.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
    'M12 10.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
    'M19 10.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
  ],
  play: ['M8 5.2v13.6L19 12z'],
  pause: ['M7.5 5h3.2v14H7.5z', 'M13.3 5h3.2v14h-3.2z'],
  next: ['M6 5.2v13.6L15 12z', 'M16.5 5H19v14h-2.5z'],
  prev: ['M18 5.2v13.6L9 12z', 'M5 5h2.5v14H5z'],
}

export type IconName = keyof typeof STROKE | keyof typeof FILL

export function Icon({
  name,
  size = 24,
  stroke = 1.9,
  className,
}: {
  name: IconName
  size?: number
  /** Convx draws some glyphs heavier than others — the section chevron is 2.6dp. */
  stroke?: number
  className?: string
}): JSX.Element {
  const filled = FILL[name]
  const paths = filled ?? STROKE[name] ?? []
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

import type { JSX } from 'react'

const STROKE: Record<string, string[]> = {
  library: ['M5 19V6', 'M10.5 19V6', 'm15.3 19.6 3.4-13'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-4-4'],
  download: ['M12 3v12', 'm7 11 5 5 5-5', 'M4 20h16'],
  settings: ['M4 8h8', 'M17 8h3', 'M4 16h4', 'M13 16h7', 'M14.5 8a2 2 0 1 0-4 0 2 2 0 0 0 4 0z', 'M10.5 16a2 2 0 1 0-4 0 2 2 0 0 0 4 0z'],
  shuffle: ['M3 18h2.1c1.3 0 2.5-.6 3.3-1.7l6.2-8.6c.8-1.1 2-1.7 3.3-1.7H21', 'm18 3 3 3-3 3', 'M3 6h2.1c1.4 0 2.7.7 3.5 1.9', 'M21 18h-3.1c-1.3 0-2.6-.7-3.4-1.9', 'm18 15 3 3-3 3'],
  repeat: ['m17 2 4 4-4 4', 'M3 12v-2a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 12v2a4 4 0 0 1-4 4H3'],
  'repeat-1': ['m17 2 4 4-4 4', 'M3 12v-2a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 12v2a4 4 0 0 1-4 4H3', 'M11 11h1v4'],
  chevron: ['m6 9 6 6 6-6'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'm6 7 1 13h10l1-13', 'M9 7V4h6v3'],
  close: ['m6 6 12 12', 'm18 6-12 12'],
  check: ['m5 13 4 4 10-10'],
  music: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  retry: ['M20 11a8 8 0 1 0-1.3 5.3', 'M20 5v6h-6'],
}

const FILL: Record<string, string[]> = {
  play: ['M8 5.2v13.6L19 12z'],
  pause: ['M7.5 5h3.2v14H7.5z', 'M13.3 5h3.2v14h-3.2z'],
  next: ['M6 5.2v13.6L15 12z', 'M16.5 5H19v14h-2.5z'],
  prev: ['M18 5.2v13.6L9 12z', 'M5 5h2.5v14H5z'],
}

export type IconName = keyof typeof STROKE | keyof typeof FILL

export function Icon({ name, size = 24 }: { name: IconName; size?: number }): JSX.Element {
  const filled = FILL[name]
  const paths = filled ?? STROKE[name] ?? []
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

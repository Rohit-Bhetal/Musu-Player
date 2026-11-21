import type { JSX } from 'react'
import { Icon, type IconName } from './Icon'

export const TABS = [
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'downloads', label: 'Downloads', icon: 'download' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[]

export type TabId = (typeof TABS)[number]['id']

export function TabBar({ tab, onChange }: { tab: TabId; onChange: (tab: TabId) => void }): JSX.Element {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={23} />
          {t.label}
        </button>
      ))}
    </nav>
  )
}

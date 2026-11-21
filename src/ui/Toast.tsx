import type { JSX } from 'react'
import { dismissToast, toasts } from './toast'
import { useStore } from './store'
import { Icon } from './Icon'

export function Toasts(): JSX.Element | null {
  const items = useStore(toasts)
  if (items.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.message}</span>
          {t.action ? (
            <button
              type="button"
              onClick={() => {
                dismissToast(t.id)
                t.action?.run()
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

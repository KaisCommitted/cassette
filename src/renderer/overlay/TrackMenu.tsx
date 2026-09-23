import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Icon } from '../shared/Icon'
import { arrive, leave } from '../shared/motion'

export interface TrackMenuItem {
  id: string
  label: string
  selected: boolean
}

export interface TrackMenuProps {
  title: string
  items: TrackMenuItem[]
  onPick: (id: string) => void
  onClose: () => void
  footer?: ReactNode
  /** A line of state above the items, e.g. a timer that is running. */
  note?: string | null
  /** Short choices, like speeds, sit in a grid rather than a list. */
  layout?: 'list' | 'grid'
}

export function TrackMenu({
  title,
  items,
  onPick,
  onClose,
  footer,
  note,
  layout = 'list'
}: TrackMenuProps) {
  // Rises out of the buttons it was opened from and sinks back into them.
  // Switching straight to another menu crosses the two over in place.
  return (
    <motion.div
      className="osd-menu"
      role="dialog"
      aria-label={title}
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: arrive }}
      exit={{ opacity: 0, y: 6, scale: 0.98, transition: leave }}
    >
      <div className="osd-menu-head">
        <h2 className="osd-menu-title">{title}</h2>
        <button className="osd-small" onClick={onClose} aria-label="Close" title="Close">
          <Icon name="close" />
        </button>
      </div>

      {note && <p className="osd-menu-note">{note}</p>}

      {items.length === 0 ? (
        <p className="osd-menu-empty">None available</p>
      ) : (
        <div className={layout === 'grid' ? 'osd-menu-items is-grid' : 'osd-menu-items'}>
          {items.map((item) => (
            <button
              key={item.id}
              className={item.selected ? 'osd-menu-item is-selected' : 'osd-menu-item'}
              aria-pressed={item.selected}
              onClick={() => onPick(item.id)}
            >
              <span className="osd-menu-label">{item.label}</span>
              {item.selected && layout === 'list' && <Icon name="tick" />}
            </button>
          ))}
        </div>
      )}

      {footer}
    </motion.div>
  )
}

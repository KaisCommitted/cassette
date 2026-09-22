import type { ReactNode } from 'react'

export interface TrackMenuItem {
  id: string
  label: string
  selected: boolean
}

export interface TrackMenuProps {
  title: string
  items: TrackMenuItem[]
  onPick: (id: string) => void
  footer?: ReactNode
}

export function TrackMenu({ title, items, onPick, footer }: TrackMenuProps) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 28,
        bottom: 74,
        minWidth: 232,
        maxHeight: 320,
        overflowY: 'auto',
        background: 'rgba(16,16,20,0.97)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        boxShadow: '0 12px 34px rgba(0,0,0,0.5)',
        overflowX: 'hidden'
      }}
    >
      <div
        style={{
          padding: '10px 12px 6px',
          fontSize: 11,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          opacity: 0.55
        }}
      >
        {title}
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '8px 12px 14px', fontSize: 12.5, opacity: 0.6 }}>
          None available
        </div>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            onClick={() => onPick(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              width: '100%',
              textAlign: 'left',
              padding: '9px 12px',
              border: 0,
              background: 'transparent',
              color: '#f4f4f6',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.09)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ width: 13, color: '#e50914' }}>{item.selected ? '●' : ''}</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {item.label}
            </span>
          </button>
        ))
      )}

      {footer}
    </div>
  )
}

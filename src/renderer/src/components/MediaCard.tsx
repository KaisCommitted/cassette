import type { ProgressRecord } from '@shared/types'

export interface MediaCardProps {
  title: string
  subtitle: string
  progress: ProgressRecord | null
  onPlay: () => void
}

export function MediaCard({ title, subtitle, progress, onPlay }: MediaCardProps) {
  const pct =
    progress && progress.durationSeconds > 0
      ? (progress.positionSeconds / progress.durationSeconds) * 100
      : 0

  return (
    <button
      onClick={onPlay}
      style={{
        display: 'block',
        textAlign: 'left',
        width: '100%',
        padding: 12,
        background: '#1b1b22',
        border: '1px solid #2a2a33',
        borderRadius: 6,
        color: '#eee',
        cursor: 'pointer',
        fontFamily: 'system-ui'
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{subtitle}</div>
      {pct > 0 && (
        <div style={{ height: 3, background: '#33333d', marginTop: 10, borderRadius: 2 }}>
          <div
            style={{ height: 3, width: `${pct}%`, background: '#e50914', borderRadius: 2 }}
          />
        </div>
      )}
    </button>
  )
}

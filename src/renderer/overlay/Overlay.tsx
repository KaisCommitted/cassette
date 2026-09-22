import { useEffect, useState } from 'react'
import type { PlaybackState } from '@shared/types'

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

export function Overlay() {
  const [state, setState] = useState<PlaybackState | null>(null)

  useEffect(() => window.mininetflix.onPlaybackState(setState), [])

  if (!state?.path) return null

  const pct =
    state.durationSeconds > 0 ? (state.positionSeconds / state.durationSeconds) * 100 : 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 'auto 0 0 0',
        padding: '16px 24px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
        color: '#fff',
        fontFamily: 'system-ui',
        pointerEvents: 'none'
      }}
    >
      <div style={{ fontSize: 15, marginBottom: 8 }}>{state.title}</div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.25)', borderRadius: 2 }}>
        <div
          style={{ height: 4, width: `${pct}%`, background: '#e50914', borderRadius: 2 }}
        />
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
        {formatTime(state.positionSeconds)} / {formatTime(state.durationSeconds)}
        {state.paused ? ' — paused' : ''}
        {state.subtitleDelayMs !== 0 ? ` — sub ${state.subtitleDelayMs}ms` : ''}
      </div>
    </div>
  )
}

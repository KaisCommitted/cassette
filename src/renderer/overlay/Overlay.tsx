import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaybackState } from '@shared/types'
import { ControlBar } from './ControlBar'
import { describeMouse } from './format'

/** Controls fade out after this long without pointer movement. */
const IDLE_HIDE_MS = 2600

export function Overlay() {
  const [state, setState] = useState<PlaybackState | null>(null)
  const [visible, setVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => window.cassette.onPlaybackState(setState), [])

  const playing = Boolean(state?.path)

  const wake = useCallback(() => {
    setVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), IDLE_HIDE_MS)
  }, [])

  // Cursor movement is reported by the main process rather than read from DOM
  // events: this window is click-through and non-focusable, so forwarded mouse
  // moves never reach it and the controls would stay hidden forever.
  useEffect(() => {
    if (!playing) return
    const off = window.cassette.onOverlayActivity(wake)
    wake()
    return () => {
      off()
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [playing, wake])

  // Keep the controls up while a menu is open, or it closes under the cursor.
  const shown = playing && (visible || menuOpen || Boolean(state?.paused))

  if (!state?.path) return null

  // Mouse input over the video resolves through the same binding table as the
  // keyboard, so anything bindable to a key is bindable to a button.
  const send = (descriptor: string): void => window.cassette.runInput(descriptor)

  return (
    <div
      onMouseDown={(e) => {
        if (e.currentTarget !== e.target) return
        send(describeMouse(e.nativeEvent))
      }}
      onDoubleClick={(e) => {
        if (e.currentTarget !== e.target) return
        send('mouse:double')
      }}
      onWheel={(e) => {
        if (e.currentTarget !== e.target) return
        send(e.deltaY < 0 ? 'mouse:wheelUp' : 'mouse:wheelDown')
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'auto',
        cursor: shown ? 'default' : 'none',
        fontFamily:
          'Inter, "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif'
      }}
    >
      {state.loading && <LoadingBadge label={state.label} />}
      <ControlBar
        state={state}
        shown={shown}
        onMenuOpenChange={setMenuOpen}
        onActivity={wake}
      />
    </div>
  )
}

function LoadingBadge({ label }: { label: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(8,8,11,0.82)',
        color: '#f4f4f6'
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 34,
            height: 34,
            margin: '0 auto 14px',
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.18)',
            borderTopColor: '#e50914',
            animation: 'cassette-spin 0.8s linear infinite'
          }}
        />
        <div style={{ fontSize: 14, letterSpacing: 0.2, opacity: 0.85 }}>{label}</div>
      </div>
      <style>{`@keyframes cassette-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

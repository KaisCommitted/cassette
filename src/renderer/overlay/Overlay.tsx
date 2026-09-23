import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaybackState } from '@shared/types'
import { ControlBar } from './ControlBar'
import { describeMouse } from './format'
import { useNowPlaying } from './useNowPlaying'
import { Icon, Logo } from '../shared/Icon'

/** Controls fade out after this long without pointer movement. */
const IDLE_HIDE_MS = 2600
/** How dark the night light gets at its deepest: 0.6 leaves 40% of the light. */
const NIGHT_DIM_MAX = 0.6
/** How long the subtitle delay stays on screen after the last change. */
const DELAY_TOAST_MS = 1600

export function Overlay() {
  const [state, setState] = useState<PlaybackState | null>(null)
  const [visible, setVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  /** True while the window changes between fullscreen and not. */
  const [dipped, setDipped] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => window.cassette.onPlaybackState(setState), [])
  useEffect(() => window.cassette.onScreenTransition((phase) => setDipped(phase === 'out')), [])

  const playing = Boolean(state?.path)
  const nowPlaying = useNowPlaying(state?.path ?? null, state?.label ?? '')
  const delayToast = useDelayToast(state?.subtitleDelayMs ?? null, state?.path ?? null)

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
      className={shown ? 'osd is-shown' : 'osd'}
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
    >
      {/* The sleep timer's night light: the darkening half. It covers the
          subtitles too, which mpv draws after the warming shader. The
          controls sit above it, so they stay readable when woken. */}
      <div
        className="osd-night"
        style={{ opacity: state.nightLight ? state.nightLight.dim * NIGHT_DIM_MAX : 0 }}
        aria-hidden="true"
      />

      {state.loading && <LoadingScreen title={nowPlaying.title} detail={nowPlaying.detail} />}

      {/* Nudging the subtitles is usually done by key with the controls
          hidden, so the new offset shows on its own, whatever the bar is doing. */}
      <div
        className={delayToast.visible ? 'osd-toast is-on' : 'osd-toast'}
        role="status"
        aria-live="polite"
      >
        <span className="osd-toast-label">Subtitles</span>
        <span className="osd-toast-value">{formatDelay(delayToast.valueMs)}</span>
      </div>

      {/* Only the button takes the pointer: the band itself lets presses
          through to the video, where they reach the bindings as before. */}
      <div className="osd-top">
        {/* Says where it goes: an episode's series, or the library for a
            film. Escape does the same, once out of fullscreen. */}
        <button
          className="osd-back"
          onClick={() => void window.cassette.stop()}
          title="Close the player (Esc)"
        >
          <Icon name="back-arrow" />
          <span className="osd-back-label">{nowPlaying.isEpisode ? nowPlaying.title : 'Library'}</span>
        </button>
        {/* The back button already names the series, so an episode shows only
            itself here; a film shows its title with the year above. */}
        <div className="osd-heading">
          {nowPlaying.isEpisode ? (
            <p className="osd-episode osd-episode-only">{nowPlaying.detail}</p>
          ) : (
            <>
              {nowPlaying.detail && <p className="osd-series">{nowPlaying.detail}</p>}
              <p className="osd-episode">{nowPlaying.title}</p>
            </>
          )}
        </div>
      </div>

      <ControlBar state={state} shown={shown} onMenuOpenChange={setMenuOpen} onActivity={wake} />

      {/* Covers the jump between window sizes; see toggleFullscreen in main. */}
      <div className={dipped ? 'osd-dip is-on' : 'osd-dip'} aria-hidden="true" />
    </div>
  )
}

/**
 * Shows the subtitle delay for a moment each time it changes.
 *
 * Only a change while the same file is playing counts: the first value to
 * arrive, and anything that comes with a new file, is the delay being
 * reported, not adjusted.
 */
function useDelayToast(delayMs: number | null, path: string | null): {
  visible: boolean
  valueMs: number
} {
  const [toast, setToast] = useState({ visible: false, valueMs: 0 })
  const last = useRef<{ delayMs: number | null; path: string | null }>({ delayMs, path })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const before = last.current
    last.current = { delayMs, path }
    if (delayMs === null || before.delayMs === null || before.path !== path) return
    if (delayMs === before.delayMs) return
    setToast({ visible: true, valueMs: delayMs })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), DELAY_TOAST_MS)
  }, [delayMs, path])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return toast
}

/** "+150 ms", "−50 ms", "0 ms": signed, with a real minus sign. */
function formatDelay(ms: number): string {
  if (ms === 0) return '0 ms'
  return `${ms > 0 ? '+' : '−'}${Math.abs(ms)} ms`
}

function LoadingScreen({ title, detail }: { title: string; detail: string | null }) {
  return (
    <div className="osd-loading" role="status">
      <Logo variant="mark" className="osd-loading-mark" />
      <span className="osd-spinner" aria-hidden="true" />
      <p className="osd-loading-title">{title}</p>
      {detail && <p className="osd-loading-detail">{detail}</p>}
    </div>
  )
}

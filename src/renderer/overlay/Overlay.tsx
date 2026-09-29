import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { VOLUME_MAX, type NightLightState, type PlaybackState, type VolumeStep } from '@shared/types'
import { Control, ControlBar } from './ControlBar'
import { PipControls, PipEdges, usePipMove } from './PipControls'
import { describeMouse, formatTime } from './format'
import { useNowPlaying } from './useNowPlaying'
import { Icon, Logo } from '../shared/Icon'
import { EASE_IN_OUT, EASE_OUT } from '../shared/motion'

/** Controls fade out after this long without pointer movement. */
const IDLE_HIDE_MS = 2600
/**
 * How much of the night light's darkening the controls take. They sit above
 * the black layer, so they would otherwise be the brightest thing in a dark
 * room; this keeps them readable without glaring.
 */
const NIGHT_CONTROLS_DIM = 0.5
/** How long the subtitle delay stays on screen after the last change. */
const DELAY_TOAST_MS = 1600
/** How long the landing spot stays on screen after Back/Forward 10s or 1min. */
const SEEK_TOAST_MS = 1600
/**
 * How long the volume stays on screen after the last press. Shorter than the
 * others: it is a level, read in a glance, and a held key keeps it up anyway.
 */
const VOLUME_TOAST_MS = 1300
/** Wheel travel in pixels that makes one step: one notch of a mouse wheel. */
const WHEEL_NOTCH = 100
/**
 * How long after a file reports itself open before its picture is brought
 * up: long enough for the resumed frame to be drawn, so what fades up is the
 * scene and not a flash of the first frame.
 */
const ARRIVE_SETTLE_MS = 220

export function Overlay() {
  const [state, setState] = useState<PlaybackState | null>(null)
  const [visible, setVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  /** True while the window changes between fullscreen and not. */
  const [dipped, setDipped] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Wheel travel not yet worth a step; see onWheel. */
  const wheelTravel = useRef(0)

  useEffect(() => window.cassette.onPlaybackState(setState), [])
  useEffect(() => window.cassette.onScreenTransition((phase) => setDipped(phase === 'out')), [])

  const playing = Boolean(state?.path)

  // Closing the player dips to black and never comes back up (the window is
  // hidden instead), so the next file must not open on a black screen.
  useEffect(() => {
    if (!playing) setDipped(false)
  }, [playing])

  // The player opens in the dark the library went down into, and its first
  // picture comes up out of it once there is one, rather than cutting in.
  const [arriving, setArriving] = useState(true)
  const loading = state?.loading ?? false
  useEffect(() => {
    if (!playing) {
      setArriving(true)
      return
    }
    if (loading) return
    const timer = setTimeout(() => setArriving(false), ARRIVE_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [playing, loading])

  const nowPlaying = useNowPlaying(state?.path ?? null, state?.label ?? '')
  const delayToast = useDelayToast(state?.subtitleDelayMs ?? null, state?.path ?? null)
  const seekToast = useSeekToast()
  const volumeToast = useVolumeToast()

  const wake = useCallback(() => {
    setVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setVisible(false), IDLE_HIDE_MS)
  }, [])

  const pip = state?.pip ?? false
  // In the small window a left press may be the start of a move, so it only
  // reaches the bindings once it has come up without becoming one.
  const pipMove = usePipMove(pip, () => window.cassette.runInput('mouse:left'))

  // The full player's menus go with it: one left open when the player went
  // small would otherwise hold the little window's controls up for good.
  useEffect(() => setMenuOpen(false), [pip])

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
  // The small window shows its controls only while the pointer is over it,
  // paused or not: they would otherwise cover most of what it is showing.
  const shown = playing && (visible || menuOpen || (Boolean(state?.paused) && !pip))

  if (!state?.path) return null

  // Mouse input over the video resolves through the same binding table as the
  // keyboard, so anything bindable to a key is bindable to a button.
  const send = (descriptor: string): void => window.cassette.runInput(descriptor)
  const night = state.nightLight.look

  return (
    <div
      className={['osd', shown && 'is-shown', pip && 'is-pip'].filter(Boolean).join(' ')}
      // The controls, toasts and loading screen take the night light's
      // colour too, so at its strongest nothing over the video gives off
      // blue. Off, there is no filter at all, so nothing is paid for it.
      style={night ? { filter: 'url(#osd-night-tint)' } : undefined}
      {...pipMove}
      onMouseLeave={() => {
        // Gone as soon as the pointer leaves the small window, rather than
        // hanging over the picture for the idle delay.
        if (!pip) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setVisible(false)
      }}
      onMouseDown={(e) => {
        if (e.currentTarget !== e.target) return
        if (pip && e.button === 0) return // see usePipMove
        send(describeMouse(e.nativeEvent))
      }}
      onDoubleClick={(e) => {
        if (e.currentTarget !== e.target) return
        send('mouse:double')
      }}
      onWheel={(e) => {
        if (e.currentTarget !== e.target) return
        // One step per notch of a wheel, however many events it arrives
        // in. A touchpad or free-spinning wheel fires dozens of small ones
        // per flick, and a step for each would throw the volume to its
        // maximum from one gesture.
        const travel = e.deltaMode === 0 ? e.deltaY : Math.sign(e.deltaY) * WHEEL_NOTCH
        if (Math.sign(travel) !== Math.sign(wheelTravel.current)) wheelTravel.current = 0
        wheelTravel.current += travel
        if (Math.abs(wheelTravel.current) < WHEEL_NOTCH) return
        wheelTravel.current = 0
        send(travel < 0 ? 'mouse:wheelUp' : 'mouse:wheelDown')
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <NightTint look={state.nightLight.look} />

      {/* The night light: the darkening half. It covers the subtitles as
          well as the picture. The controls sit above it, so they stay
          readable when woken. */}
      <div className="osd-night" style={{ opacity: night?.dim ?? 0 }} aria-hidden="true" />

      {/* Under the loading screen and the controls, so both show over it. */}
      <div className={arriving ? 'osd-dip is-on' : 'osd-dip'} aria-hidden="true" />

      <AnimatePresence>
        {state.loading && <LoadingScreen title={nowPlaying.title} detail={nowPlaying.detail} />}
      </AnimatePresence>

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

      {/* Back/Forward 10 seconds and 1 minute are usually pressed with the
          controls hidden, so where they landed shows on its own. */}
      <div
        className={seekToast.visible ? 'osd-toast osd-toast-seek is-on' : 'osd-toast osd-toast-seek'}
        role="status"
        aria-live="polite"
      >
        <span className="osd-toast-label">Skipped</span>
        <span className="osd-toast-value">{formatTime(seekToast.positionSeconds)}</span>
      </div>

      {/* Volume and mute keys, and the wheel: the level, standing up the
          right-hand side like a fader. The slider that would show it hides
          with the bar, and it is off to the side of the two toasts above, so
          it never covers them. */}
      <div
        className={volumeToast.visible ? 'osd-volume-toast is-on' : 'osd-volume-toast'}
        role="status"
        aria-live="polite"
      >
        <VolumeLevel step={volumeToast.step} />
      </div>

      {pip ? (
        <>
          <PipControls state={state} onActivity={wake} />
          <PipEdges />
        </>
      ) : (
        <FullControls
          state={state}
          shown={shown}
          nowPlaying={nowPlaying}
          onMenuOpenChange={setMenuOpen}
          onActivity={wake}
        />
      )}

      {/* Covers the jump between window sizes; see toggleFullscreen in main. */}
      <div className={dipped ? 'osd-dip is-on' : 'osd-dip'} aria-hidden="true" />
    </div>
  )
}

/** The full player's controls: the way out and what is playing, and the deck. */
function FullControls({
  state,
  shown,
  nowPlaying,
  onMenuOpenChange,
  onActivity
}: {
  state: PlaybackState
  shown: boolean
  nowPlaying: ReturnType<typeof useNowPlaying>
  onMenuOpenChange: (open: boolean) => void
  onActivity: () => void
}) {
  return (
    <>
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
        {/* Across from the way out, clear of the title: the other way of
            leaving this view, for the small window instead of the library. */}
        <div className="osd-top-end">
          <Control
            icon="pip"
            label="Picture in picture"
            onClick={() => void window.cassette.togglePip()}
          />
        </div>
      </div>

      <ControlBar state={state} shown={shown} onMenuOpenChange={onMenuOpenChange} onActivity={onActivity} />
    </>
  )
}

/**
 * The night light's colour, for the overlay's own controls: the same cut to
 * green and blue that mpv's shader applies to the picture, and part of its
 * darkening.
 *
 * Worked out on the colour values as they are, like the shader, rather than
 * on light (the SVG default), so the two match.
 */
function NightTint({ look }: { look: NightLightState['look'] }) {
  const k = 1 - NIGHT_CONTROLS_DIM * (look?.dim ?? 0)
  const r = k
  const g = k * (look?.green ?? 1)
  const b = k * (look?.blue ?? 1)
  return (
    <svg className="osd-night-defs" aria-hidden="true">
      <filter id="osd-night-tint" colorInterpolationFilters="sRGB">
        <feColorMatrix
          type="matrix"
          values={`${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`}
        />
      </filter>
    </svg>
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

/**
 * Shows where Back/Forward 10 seconds or 1 minute landed, for a moment.
 *
 * Every jump is shown — there is no first-value-on-load noise to filter out
 * here, unlike the subtitle delay: the main process only emits this from an
 * actual relative seek (mpvController.seekRelative), never from mpv simply
 * reporting where a new file starts.
 */
function useSeekToast(): { visible: boolean; positionSeconds: number } {
  const [toast, setToast] = useState({ visible: false, positionSeconds: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () =>
      window.cassette.onSeekJump((positionSeconds) => {
        setToast({ visible: true, positionSeconds })
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), SEEK_TOAST_MS)
      }),
    []
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return toast
}

/**
 * Shows the sound level for a moment after a volume or mute key.
 *
 * Each press restarts the timer rather than the toast, so a held key keeps it
 * up and the level simply moves. As with the seek toast, only a key press
 * sends this (mpvController.stepVolume and toggleMute); the slider, which
 * shows the level itself, does not.
 */
function useVolumeToast(): { visible: boolean; step: VolumeStep } {
  const [toast, setToast] = useState({ visible: false, step: { volume: 0, muted: false } })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () =>
      window.cassette.onVolumeStep((step) => {
        setToast({ visible: true, step })
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), VOLUME_TOAST_MS)
      }),
    []
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return toast
}

/**
 * The level as a fader: the number on top, the bar filling upward, and the
 * speaker underneath. The bar runs to the loudest the player goes, past 100,
 * with a notch where 100 falls so the amplified part reads as such. Muted,
 * the bar greys out but keeps its height: that is what unmuting goes back to.
 */
function VolumeLevel({ step }: { step: VolumeStep }) {
  const silent = step.muted || step.volume === 0
  return (
    <>
      <span className={step.muted ? 'osd-volume-value is-muted' : 'osd-volume-value'}>
        {step.muted ? 'Muted' : `${Math.round(step.volume)}%`}
      </span>
      <span
        className={step.muted ? 'osd-fader is-muted' : 'osd-fader'}
        style={
          {
            '--fill': `${(step.volume / VOLUME_MAX) * 100}%`,
            '--hundred': `${(100 / VOLUME_MAX) * 100}%`
          } as CSSProperties
        }
        aria-hidden="true"
      >
        <span className="osd-fader-fill" />
        <span className="osd-fader-mark" />
      </span>
      <Icon name={silent ? 'mute' : 'volume'} className="osd-volume-icon" />
    </>
  )
}

/**
 * What shows while a file opens. It comes up gently out of the dark the
 * library went down into, and when the picture arrives it fades away slowly,
 * so the first frame seems to surface through it rather than cut in.
 */
function LoadingScreen({ title, detail }: { title: string; detail: string | null }) {
  return (
    <motion.div
      className="osd-loading"
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.5, ease: EASE_OUT, delay: 0.08 } }}
      exit={{ opacity: 0, transition: { duration: 0.9, ease: EASE_IN_OUT } }}
    >
      <Logo variant="mark" className="osd-loading-mark" />
      <span className="osd-spinner" aria-hidden="true" />
      <p className="osd-loading-title">{title}</p>
      {detail && <p className="osd-loading-detail">{detail}</p>}
    </motion.div>
  )
}

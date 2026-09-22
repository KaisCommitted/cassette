import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaybackState } from '@shared/types'
import { formatTime, trackLabel } from './format'
import { SeekBar } from './SeekBar'
import { TrackMenu } from './TrackMenu'

export interface ControlBarProps {
  state: PlaybackState
  shown: boolean
  onMenuOpenChange: (open: boolean) => void
  onActivity: () => void
}

type MenuId = 'subs' | 'audio' | 'speed' | 'sleep' | null

const api = window.cassette

export function ControlBar({
  state,
  shown,
  onMenuOpenChange,
  onActivity
}: ControlBarProps) {
  const [menu, setMenu] = useState<MenuId>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => onMenuOpenChange(menu !== null), [menu, onMenuOpenChange])

  // Close any menu as soon as the bar hides, so it cannot linger invisibly.
  useEffect(() => {
    if (!shown) setMenu(null)
  }, [shown])

  // Whether the overlay accepts clicks is decided in the main process, which
  // polls the cursor: this window is click-through and non-focusable, so its
  // own enter/leave events are not reliable enough to gate that on.
  const leave = useCallback(() => setMenu(null), [])

  const subs = state.tracks.filter((t) => t.type === 'sub')
  const audio = state.tracks.filter((t) => t.type === 'audio')

  return (
    <div
      ref={ref}
      onMouseLeave={leave}
      onMouseMove={onActivity}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '56px 28px 20px',
        background:
          'linear-gradient(transparent, rgba(6,6,9,0.55) 38%, rgba(6,6,9,0.94))',
        color: '#f4f4f6',
        pointerEvents: shown ? 'auto' : 'none',
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(14px)',
        transition: 'opacity 180ms ease, transform 180ms ease'
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 560, marginBottom: 12 }}>{state.label}</div>

      <SeekBar
        position={state.positionSeconds}
        duration={state.durationSeconds}
        onSeek={(s) => void api.seekAbsolute(s)}
        onActivity={onActivity}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 10
        }}
      >
        <IconButton
          label={state.paused ? 'Play' : 'Pause'}
          onClick={() => void api.togglePause()}
        >
          {state.paused ? <PlayIcon /> : <PauseIcon />}
        </IconButton>

        <IconButton
          label="Previous episode"
          disabled={!state.hasPrevious}
          onClick={() => void api.previousEpisode()}
        >
          <SkipIcon direction="back" />
        </IconButton>

        <IconButton
          label="Next episode"
          disabled={!state.hasNext}
          onClick={() => void api.nextEpisode()}
        >
          <SkipIcon direction="forward" />
        </IconButton>

        <VolumeControl state={state} />

        <div
          style={{
            marginLeft: 8,
            fontSize: 12.5,
            fontVariantNumeric: 'tabular-nums',
            opacity: 0.82
          }}
        >
          {formatTime(state.positionSeconds)}
          <span style={{ opacity: 0.45 }}> / {formatTime(state.durationSeconds)}</span>
        </div>

        <div style={{ flex: 1 }} />

        {state.subtitleDelayMs !== 0 && (
          <Pill>
            Sub {state.subtitleDelayMs > 0 ? '+' : ''}
            {state.subtitleDelayMs} ms
          </Pill>
        )}
        {state.speed !== 1 && <Pill>{state.speed.toFixed(2)}×</Pill>}
        {state.sleepRemainingSeconds !== null && (
          <Pill>Sleep in {formatCountdown(state.sleepRemainingSeconds)}</Pill>
        )}
        {state.sleepAfterEpisode && <Pill>Stops after this episode</Pill>}

        <TextButton active={menu === 'subs'} onClick={() => setMenu(menu === 'subs' ? null : 'subs')}>
          Subtitles
        </TextButton>
        <TextButton active={menu === 'audio'} onClick={() => setMenu(menu === 'audio' ? null : 'audio')}>
          Audio
        </TextButton>
        <TextButton active={menu === 'speed'} onClick={() => setMenu(menu === 'speed' ? null : 'speed')}>
          Speed
        </TextButton>
        <TextButton active={menu === 'sleep'} onClick={() => setMenu(menu === 'sleep' ? null : 'sleep')}>
          Sleep
        </TextButton>

        <IconButton label="Fullscreen" onClick={() => void api.toggleFullscreen()}>
          <FullscreenIcon on={state.fullscreen} />
        </IconButton>

        <IconButton label="Close player" onClick={() => void api.stop()}>
          <CloseIcon />
        </IconButton>
      </div>

      {menu === 'subs' && (
        <TrackMenu
          title="Subtitles"
          items={[
            { id: 'off', label: 'Off', selected: state.subtitleTrackId === null },
            ...subs.map((t) => ({
              id: String(t.id),
              label: trackLabel(t),
              selected: t.id === state.subtitleTrackId
            }))
          ]}
          onPick={(id) => {
            void api.setSubtitleTrack(id === 'off' ? null : Number(id))
            setMenu(null)
          }}
          footer={
            <>
              <SubtitleSearch />
              <DelayAdjuster
                valueMs={state.subtitleDelayMs}
                onChange={(ms) => void api.setSubtitleDelay(ms)}
              />
            </>
          }
        />
      )}

      {menu === 'audio' && (
        <TrackMenu
          title="Audio"
          items={audio.map((t) => ({
            id: String(t.id),
            label: trackLabel(t),
            selected: t.id === state.audioTrackId
          }))}
          onPick={(id) => {
            void api.setAudioTrack(Number(id))
            setMenu(null)
          }}
        />
      )}

      {menu === 'sleep' && (
        <TrackMenu
          title="Pause playback in"
          items={[
            ...[15, 30, 45, 60, 90, 120].map((mins) => ({
              id: String(mins * 60),
              label: formatSleepOption(mins),
              selected: false
            })),
            {
              id: 'episode',
              label: 'At the end of this episode',
              selected: state.sleepAfterEpisode
            },
            { id: 'off', label: 'Cancel timer', selected: state.sleepRemainingSeconds === null && !state.sleepAfterEpisode }
          ]}
          onPick={(id) => {
            if (id === 'episode') void api.setSleepAfterEpisode()
            else if (id === 'off') void api.setSleepTimer(null)
            else void api.setSleepTimer(Number(id))
            setMenu(null)
          }}
        />
      )}

      {menu === 'speed' && (
        <TrackMenu
          title="Speed"
          items={[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => ({
            id: String(s),
            label: s === 1 ? 'Normal' : `${s}×`,
            selected: Math.abs(state.speed - s) < 0.01
          }))}
          onPick={(id) => {
            void api.setSpeed(Number(id))
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}

function VolumeControl({ state }: { state: PlaybackState }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
      <IconButton
        label={state.muted ? 'Unmute' : 'Mute'}
        onClick={() => void api.toggleMute()}
      >
        <VolumeIcon muted={state.muted || state.volume === 0} />
      </IconButton>
      <input
        type="range"
        min={0}
        max={130}
        value={state.muted ? 0 : state.volume}
        onChange={(e) => void api.setVolume(Number(e.target.value))}
        aria-label="Volume"
        style={{ width: 84, accentColor: '#e50914', cursor: 'pointer' }}
      />
    </div>
  )
}

/**
 * Fetches subtitles for the episode on screen, without leaving it.
 *
 * Realising the subtitles are wrong is something that happens a minute into
 * an episode, not before starting it, so the search belongs here rather than
 * only in the library. Anything found is added as another track, and the menu
 * this sits in lists it immediately.
 */
function SubtitleSearch() {
  const [status, setStatus] = useState<'idle' | 'searching' | string>('idle')

  const run = (): void => {
    if (status === 'searching') return
    setStatus('searching')
    void api
      .findSubtitlesNow()
      .then((result) => {
        if (!result) return setStatus('Nothing to search for')
        if (result.status === 'downloaded') return setStatus('Added — pick it above')
        if (result.status === 'failed') return setStatus(result.detail ?? 'Search failed')
        if (result.status === 'nothing-found') return setStatus('Nothing found')
        return setStatus('Already had subtitles')
      })
      .catch(() => setStatus('Search failed'))
  }

  return (
    <div
      style={{
        padding: '9px 12px',
        borderTop: '1px solid rgba(255,255,255,0.09)'
      }}
    >
      <button
        onClick={run}
        disabled={status === 'searching'}
        style={{
          width: '100%',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 6,
          padding: '6px 8px',
          fontSize: 12,
          fontFamily: 'inherit',
          background: 'transparent',
          color: '#f4f4f6',
          cursor: status === 'searching' ? 'default' : 'pointer'
        }}
      >
        {status === 'searching' ? 'Searching…' : 'Find subtitles online'}
      </button>
      {status !== 'idle' && status !== 'searching' && (
        <div style={{ marginTop: 6, fontSize: 11.5, opacity: 0.62 }}>{status}</div>
      )}
    </div>
  )
}

function DelayAdjuster({
  valueMs,
  onChange
}: {
  valueMs: number
  onChange: (ms: number) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 12px',
        borderTop: '1px solid rgba(255,255,255,0.09)'
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.7 }}>Delay</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <SmallButton onClick={() => onChange(valueMs - 50)}>−50 ms</SmallButton>
        <span
          style={{
            fontSize: 12,
            minWidth: 58,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {valueMs > 0 ? '+' : ''}
          {valueMs} ms
        </span>
        <SmallButton onClick={() => onChange(valueMs + 50)}>+50 ms</SmallButton>
      </div>
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
  disabled
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 34,
        height: 34,
        border: 0,
        borderRadius: 8,
        background: 'transparent',
        color: '#f4f4f6',
        opacity: disabled ? 0.28 : 0.9,
        cursor: disabled ? 'default' : 'pointer'
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function TextButton({
  children,
  onClick,
  active
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 0,
        borderRadius: 7,
        padding: '7px 11px',
        fontSize: 12.5,
        fontFamily: 'inherit',
        background: active ? 'rgba(255,255,255,0.16)' : 'transparent',
        color: '#f4f4f6',
        opacity: active ? 1 : 0.85,
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  )
}

function SmallButton({
  children,
  onClick
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 11.5,
        fontFamily: 'inherit',
        background: 'transparent',
        color: '#f4f4f6',
        cursor: 'pointer'
      }}
    >
      {children}
    </button>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        padding: '4px 9px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.13)',
        marginRight: 4,
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {children}
    </span>
  )
}

/* Icons kept inline as SVG: no icon font to load, and they inherit colour. */

function PlayIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.2v13.6a.6.6 0 0 0 .92.5l10.6-6.8a.6.6 0 0 0 0-1l-10.6-6.8A.6.6 0 0 0 8 5.2Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
    </svg>
  )
}

function SkipIcon({ direction }: { direction: 'back' | 'forward' }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ transform: direction === 'back' ? 'scaleX(-1)' : undefined }}
    >
      <path d="M5 5.6v12.8a.6.6 0 0 0 .93.5l9.2-6.4a.6.6 0 0 0 0-1l-9.2-6.4a.6.6 0 0 0-.93.5Z" />
      <rect x="16.6" y="5" width="2.6" height="14" rx="1.1" />
    </svg>
  )
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 9.5h3.4L12 5.6a.6.6 0 0 1 1 .46v11.9a.6.6 0 0 1-1 .46L7.4 14.5H4a.6.6 0 0 1-.6-.6v-3.8a.6.6 0 0 1 .6-.6Z" />
      {muted ? (
        <path
          d="M16 9.5l4.5 5M20.5 9.5l-4.5 5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M16.2 9.2a4 4 0 0 1 0 5.6M18.6 7a7.2 7.2 0 0 1 0 10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  )
}

function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {on ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}



/** "1:29:58" while a sleep timer counts down. */
function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? h + ':' + mm + ':' + ss : m + ':' + ss
}

function formatSleepOption(minutes: number): string {
  if (minutes < 60) return minutes + ' minutes'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return h === 1 ? '1 hour' : h + ' hours'
  return h + ' h ' + m + ' min'
}

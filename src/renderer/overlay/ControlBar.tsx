import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { PlaybackState } from '@shared/types'
import { formatTime, trackLabel } from './format'
import { SeekBar } from './SeekBar'
import { TrackMenu } from './TrackMenu'
import { Icon, type IconName } from '../shared/Icon'

export interface ControlBarProps {
  state: PlaybackState
  shown: boolean
  onMenuOpenChange: (open: boolean) => void
  onActivity: () => void
}

type MenuId = 'subs' | 'audio' | 'speed' | 'sleep' | null

const api = window.cassette

export function ControlBar({ state, shown, onMenuOpenChange, onActivity }: ControlBarProps) {
  const [menu, setMenu] = useState<MenuId>(null)

  useEffect(() => onMenuOpenChange(menu !== null), [menu, onMenuOpenChange])

  // Close any menu as soon as the bar hides, so it cannot linger invisibly.
  useEffect(() => {
    if (!shown) setMenu(null)
  }, [shown])

  // Whether the overlay accepts clicks is decided in the main process, which
  // polls the cursor: this window is click-through and non-focusable, so its
  // own enter/leave events are not reliable enough to gate that on.
  const leave = useCallback(() => setMenu(null), [])
  const toggle = (id: Exclude<MenuId, null>): void => setMenu(menu === id ? null : id)

  const subs = state.tracks.filter((t) => t.type === 'sub')
  const audio = state.tracks.filter((t) => t.type === 'audio')

  return (
    <div className="osd-bar" onMouseLeave={leave} onMouseMove={onActivity}>
      <div className="osd-times">
        <span>{formatTime(state.positionSeconds)}</span>
        <span className="osd-times-end">{formatTime(state.durationSeconds)}</span>
      </div>

      <SeekBar
        position={state.positionSeconds}
        duration={state.durationSeconds}
        onSeek={(s) => void api.seekAbsolute(s)}
        onActivity={onActivity}
      />

      <div className="osd-controls">
        <div className="osd-group">
          <Control icon="back-10s" label="Back 10 seconds" onClick={() => void api.seekRelative(-10)} />
          <Control
            icon={state.paused ? 'play' : 'pause'}
            label={state.paused ? 'Play' : 'Pause'}
            primary
            onClick={() => void api.togglePause()}
          />
          <Control
            icon="forward-30s"
            label="Forward 30 seconds"
            onClick={() => void api.seekRelative(30)}
          />
        </div>

        <div className="osd-group">
          <Control
            icon="previous"
            label="Previous episode"
            disabled={!state.hasPrevious}
            onClick={() => void api.previousEpisode()}
          />
          <Control
            icon="next"
            label="Next episode"
            disabled={!state.hasNext}
            onClick={() => void api.nextEpisode()}
          />
        </div>

        <VolumeControl state={state} />

        <div className="osd-spacer" />

        <div className="osd-pills">
          {state.subtitleDelayMs !== 0 && (
            <Pill>
              Subtitles {state.subtitleDelayMs > 0 ? '+' : ''}
              {state.subtitleDelayMs} ms
            </Pill>
          )}
          {state.speed !== 1 && <Pill>{formatSpeed(state.speed)}</Pill>}
          {state.sleepRemainingSeconds !== null && (
            <Pill icon="sleep-timer">Pauses in {formatCountdown(state.sleepRemainingSeconds)}</Pill>
          )}
          {state.sleepAfterEpisode && <Pill icon="sleep-timer">Stops after this episode</Pill>}
        </div>

        <div className="osd-group">
          <Control
            icon="subtitles"
            label="Subtitles"
            active={menu === 'subs'}
            expanded={menu === 'subs'}
            onClick={() => toggle('subs')}
          />
          <Control
            icon="audio-track"
            label="Audio"
            active={menu === 'audio'}
            expanded={menu === 'audio'}
            onClick={() => toggle('audio')}
          />
          <Control
            icon="speed"
            label="Speed"
            active={menu === 'speed' || state.speed !== 1}
            expanded={menu === 'speed'}
            onClick={() => toggle('speed')}
          />
          <Control
            icon="sleep-timer"
            label="Sleep timer"
            active={
              menu === 'sleep' || state.sleepRemainingSeconds !== null || state.sleepAfterEpisode
            }
            expanded={menu === 'sleep'}
            onClick={() => toggle('sleep')}
          />
          <Control
            icon={state.fullscreen ? 'fullscreen-exit' : 'fullscreen'}
            label={state.fullscreen ? 'Leave fullscreen' : 'Fullscreen'}
            onClick={() => void api.toggleFullscreen()}
          />
        </div>
      </div>

      {menu === 'subs' && (
        <TrackMenu
          title="Subtitles"
          onClose={() => setMenu(null)}
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
              <DelayAdjuster
                valueMs={state.subtitleDelayMs}
                onChange={(ms) => void api.setSubtitleDelay(ms)}
              />
              <SubtitleSearch />
            </>
          }
        />
      )}

      {menu === 'audio' && (
        <TrackMenu
          title="Audio"
          onClose={() => setMenu(null)}
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

      {menu === 'speed' && (
        <TrackMenu
          title="Speed"
          layout="grid"
          onClose={() => setMenu(null)}
          items={[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => ({
            id: String(s),
            label: s === 1 ? 'Normal' : formatSpeed(s),
            selected: Math.abs(state.speed - s) < 0.01
          }))}
          onPick={(id) => {
            void api.setSpeed(Number(id))
            setMenu(null)
          }}
        />
      )}

      {menu === 'sleep' && (
        <TrackMenu
          title="Pause playback in"
          onClose={() => setMenu(null)}
          note={
            state.sleepRemainingSeconds !== null
              ? `Pausing in ${formatCountdown(state.sleepRemainingSeconds)}`
              : state.sleepAfterEpisode
                ? 'Stopping after this episode'
                : null
          }
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
            {
              id: 'off',
              label: 'Cancel timer',
              selected: state.sleepRemainingSeconds === null && !state.sleepAfterEpisode
            }
          ]}
          onPick={(id) => {
            if (id === 'episode') void api.setSleepAfterEpisode()
            else if (id === 'off') void api.setSleepTimer(null)
            else void api.setSleepTimer(Number(id))
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}

function VolumeControl({ state }: { state: PlaybackState }) {
  const value = state.muted ? 0 : state.volume
  const silent = state.muted || state.volume === 0
  return (
    <div className="osd-volume">
      <Control
        icon={silent ? 'mute' : 'volume'}
        label={state.muted ? 'Unmute' : 'Mute'}
        onClick={() => void api.toggleMute()}
      />
      <input
        type="range"
        className="osd-range"
        min={0}
        max={130}
        value={value}
        style={{ '--fill': `${(value / 130) * 100}%` } as CSSProperties}
        onChange={(e) => void api.setVolume(Number(e.target.value))}
        aria-label="Volume"
        title={`Volume ${Math.round(value)}%`}
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
    <div className="osd-menu-section">
      <button className="osd-menu-action" onClick={run} disabled={status === 'searching'}>
        <Icon name="search" />
        {status === 'searching' ? 'Searching…' : 'Find subtitles online'}
      </button>
      {status !== 'idle' && status !== 'searching' && (
        <p className="osd-menu-status" role="status">
          {status}
        </p>
      )}
    </div>
  )
}

function DelayAdjuster({ valueMs, onChange }: { valueMs: number; onChange: (ms: number) => void }) {
  return (
    <div className="osd-menu-section osd-delay">
      <span className="osd-delay-label">Delay</span>
      <button
        className="osd-small"
        onClick={() => onChange(valueMs - 50)}
        aria-label="Subtitles 50 ms earlier"
        title="50 ms earlier"
      >
        <Icon name="minus" />
      </button>
      <span className="osd-delay-value">
        {valueMs > 0 ? '+' : ''}
        {valueMs} ms
      </span>
      <button
        className="osd-small"
        onClick={() => onChange(valueMs + 50)}
        aria-label="Subtitles 50 ms later"
        title="50 ms later"
      >
        <Icon name="plus" />
      </button>
    </div>
  )
}

function Control({
  icon,
  label,
  onClick,
  disabled,
  primary,
  active,
  expanded
}: {
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  active?: boolean
  expanded?: boolean
}) {
  const classes = ['osd-btn']
  if (primary) classes.push('is-primary')
  if (active) classes.push('is-active')
  return (
    <button
      className={classes.join(' ')}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
    >
      <Icon name={icon} />
    </button>
  )
}

function Pill({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <span className="osd-pill">
      {icon && <Icon name={icon} />}
      {children}
    </span>
  )
}

function formatSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}×`
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

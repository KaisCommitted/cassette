/* ===========================================================================
   Cassette — the player.
   The overlay floats over the picture and fades up like a dial lamp. Pills
   along the top only appear when something is set away from normal, so an
   ordinary night shows none of them.
   =========================================================================== */
import React, { useEffect, useRef, useState } from 'react'
import {
  TapeCounter, Rolling, clock, SpoolMark,
  IconPlay, IconPause, IconPrev, IconNext, IconVolume, IconMute,
  IconFullscreen, IconClose, IconSubtitles, IconAudio, IconSpeed, IconSleep,
  IconTick, IconPlus, IconMinus, IconSearch, IconWarn,
} from './icons'
import { SUBTITLE_TRACKS, AUDIO_TRACKS, SPEEDS, SLEEP_OPTIONS } from './data'

export type Playing = {
  title: string
  where: string
  elapsed: number
  total: number
  counter: number
}

type Menu = 'subs' | 'audio' | 'speed' | 'sleep' | null
type Fetch = 'idle' | 'searching' | 'added' | 'none'

export default function Player({ playing, onClose }: { playing: Playing; onClose: () => void }) {
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(playing.elapsed)
  const [volume, setVolume] = useState(72)
  const [muted, setMuted] = useState(false)
  const [menu, setMenu] = useState<Menu>(null)

  const [subTrack, setSubTrack] = useState('sub-1')
  const [audTrack, setAudTrack] = useState('aud-1')
  const [speed, setSpeed] = useState(1)
  const [sleep, setSleep] = useState('off')
  const [sleepLeft, setSleepLeft] = useState(0)
  const [delayMs, setDelayMs] = useState(0)
  const [fetchState, setFetchState] = useState<Fetch>('idle')
  const attempts = useRef(0)

  /* the picture runs, so the digits and the counter have something to do */
  useEffect(() => {
    if (paused) return
    const t = window.setInterval(() => {
      setElapsed((e) => Math.min(playing.total, e + 1))
      setSleepLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => window.clearInterval(t)
  }, [paused, playing.total])

  useEffect(() => {
    if (fetchState !== 'searching') return
    const t = window.setTimeout(() => {
      attempts.current += 1
      setFetchState(attempts.current % 2 === 1 ? 'added' : 'none')
    }, 1500)
    return () => window.clearTimeout(t)
  }, [fetchState])

  const pct = `${(elapsed / playing.total) * 100}%`
  const counter = (playing.counter + Math.floor(elapsed / 6)) % 1000
  const currentSub = SUBTITLE_TRACKS.find((t) => t.id === subTrack)
  const currentAud = AUDIO_TRACKS.find((t) => t.id === audTrack)

  const chooseSleep = (id: string) => {
    setSleep(id)
    setSleepLeft(id === '15' ? 900 : id === '30' ? 1800 : id === '60' ? 3600 : 0)
    setMenu(null)
  }

  const toggle = (m: Menu) => setMenu((cur) => (cur === m ? null : m))

  return (
    <div className="player">
      {/* the picture itself: a flat block in the right ratio */}
      <div className="stage">
        <div className="stage__block">
          <span className="slot__label">video 16:9</span>
        </div>
      </div>

      <div className="player__overlay" onClick={() => menu && setMenu(null)}>
        <div>
          <div className="player__top">
            <div className="player__titles">
              <h2 className="player__title">{playing.title}</h2>
              <p className="player__where">{playing.where}</p>
            </div>
            <div className="player__topright">
              <span className="counter__label">Counter</span>
              <TapeCounter value={counter} size="lg" label={`Tape counter ${counter}`} />
              <button className="key" onClick={onClose} aria-label="Close the player">
                <IconClose />
              </button>
            </div>
          </div>

          {/* pills: only what is not at its normal setting */}
          <div className="pills">
            {delayMs !== 0 && (
              <span className="pill">
                <IconSubtitles size={13} />
                Subtitles {delayMs > 0 ? '+' : '−'}
                <Rolling text={String(Math.abs(delayMs))} /> ms
              </span>
            )}
            {speed !== 1 && (
              <span className="pill">
                <IconSpeed size={13} />
                {speed}× speed
              </span>
            )}
            {sleep === 'ep' && (
              <span className="pill">
                <IconSleep size={13} />
                Stops after this episode
              </span>
            )}
            {sleepLeft > 0 && (
              <span className="pill">
                <IconSleep size={13} />
                Sleep in <Rolling text={clock(sleepLeft)} />
              </span>
            )}
            {muted && (
              <span className="pill pill--plain">
                <IconMute size={13} />
                Muted
              </span>
            )}
          </div>
        </div>

        <div className="player__bottom" onClick={(e) => e.stopPropagation()}>
          <div className="scrub">
            <span className="scrub__time">
              <Rolling text={clock(elapsed, true)} />
            </span>
            <button
              className="scrub__track"
              aria-label="Scrub"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setElapsed(Math.round(((e.clientX - r.left) / r.width) * playing.total))
              }}
            >
              <span className="scrub__groove">
                <span className="scrub__fill" style={{ ['--pct' as string]: pct }} />
              </span>
              <span className="scrub__head" style={{ ['--pct' as string]: pct }} />
            </button>
            <span className="scrub__time scrub__time--total">
              <Rolling text={clock(playing.total, true)} />
            </span>
          </div>

          <div className="transport">
            <button className="key" aria-label="Previous episode"><IconPrev /></button>
            <button
              className="key key--wide"
              aria-label={paused ? 'Play' : 'Pause'}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? <IconPlay /> : <IconPause />}
            </button>
            <button className="key" aria-label="Next episode"><IconNext /></button>

            <span className="volume">
              <button
                className={`key ${muted ? 'is-on' : ''}`}
                aria-label={muted ? 'Unmute' : 'Mute'}
                aria-pressed={muted}
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? <IconMute /> : <IconVolume />}
              </button>
              <span className="slider" style={{ flex: 1 }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false) }}
                  aria-label="Volume"
                />
              </span>
              <span className="mono faint" style={{ fontSize: 'var(--t-12)', minWidth: '3ch' }}>
                <Rolling text={String(muted ? 0 : volume).padStart(2, '0')} />
              </span>
            </span>

            <span className="transport__spacer" />

            {/* ---------------- subtitles ---------------- */}
            <span className="menuwrap">
              <button
                className={`key ${subTrack !== 'off' ? 'is-on' : ''}`}
                aria-label="Subtitles"
                aria-expanded={menu === 'subs'}
                onClick={() => toggle('subs')}
              >
                <IconSubtitles />
              </button>
              {menu === 'subs' && (
                <div className="menu" role="menu">
                  <div className="menu__head">Subtitles</div>
                  <div className="menu__list">
                    {SUBTITLE_TRACKS.map((t) => (
                      <button
                        key={t.id}
                        className="menu__item"
                        role="menuitemradio"
                        aria-checked={t.id === subTrack}
                        onClick={() => setSubTrack(t.id)}
                      >
                        <span className="menu__tick">{t.id === subTrack && <IconTick size={13} />}</span>
                        <span>
                          {t.name}
                          {t.detail && <span className="menu__sub">{t.detail}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="menu__foot">
                    <div className="menu__nudge">
                      <span>Delay</span>
                      <button className="key" onClick={() => setDelayMs((d) => d - 50)} aria-label="50 milliseconds earlier">
                        <IconMinus />
                      </button>
                      <span className="menu__nudgeval">
                        {delayMs > 0 ? '+' : delayMs < 0 ? '−' : ''}
                        <Rolling text={String(Math.abs(delayMs))} /> ms
                      </span>
                      <button className="key" onClick={() => setDelayMs((d) => d + 50)} aria-label="50 milliseconds later">
                        <IconPlus />
                      </button>
                    </div>
                    <button
                      className="btn"
                      onClick={() => setFetchState('searching')}
                      disabled={fetchState === 'searching'}
                    >
                      <IconSearch size={14} />
                      Find subtitles online
                    </button>
                    {fetchState === 'searching' && (
                      <span className="menu__status">
                        <SpoolMark size={18} running />
                        Searching OpenSubtitles and SubDL…
                      </span>
                    )}
                    {fetchState === 'added' && (
                      <span className="menu__status fade" style={{ color: 'var(--accent)' }}>
                        <IconTick size={13} />
                        Added English. Switched on.
                      </span>
                    )}
                    {fetchState === 'none' && (
                      <span className="menu__status fade">
                        <IconWarn size={13} />
                        Nothing found for this one. Try the series instead.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </span>

            {/* ---------------- audio ---------------- */}
            <span className="menuwrap">
              <button className="key" aria-label="Audio track" aria-expanded={menu === 'audio'} onClick={() => toggle('audio')}>
                <IconAudio />
              </button>
              {menu === 'audio' && (
                <div className="menu" role="menu">
                  <div className="menu__head">Audio — {currentAud?.name}</div>
                  <div className="menu__list">
                    {AUDIO_TRACKS.map((t) => (
                      <button
                        key={t.id}
                        className="menu__item"
                        role="menuitemradio"
                        aria-checked={t.id === audTrack}
                        onClick={() => { setAudTrack(t.id); setMenu(null) }}
                      >
                        <span className="menu__tick">{t.id === audTrack && <IconTick size={13} />}</span>
                        <span>
                          {t.name}
                          <span className="menu__sub">{t.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </span>

            {/* ---------------- speed ---------------- */}
            <span className="menuwrap">
              <button className={`key ${speed !== 1 ? 'is-on' : ''}`} aria-label="Speed" aria-expanded={menu === 'speed'} onClick={() => toggle('speed')}>
                <IconSpeed />
              </button>
              {menu === 'speed' && (
                <div className="menu" role="menu" style={{ width: 220 }}>
                  <div className="menu__head">Speed</div>
                  <div className="menu__list">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        className="menu__item"
                        role="menuitemradio"
                        aria-checked={s === speed}
                        onClick={() => { setSpeed(s); setMenu(null) }}
                      >
                        <span className="menu__tick">{s === speed && <IconTick size={13} />}</span>
                        <span className="mono">{s}×{s === 1 && <span className="menu__sub">normal</span>}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </span>

            {/* ---------------- sleep ---------------- */}
            <span className="menuwrap">
              <button className={`key ${sleep !== 'off' ? 'is-on' : ''}`} aria-label="Sleep" aria-expanded={menu === 'sleep'} onClick={() => toggle('sleep')}>
                <IconSleep />
              </button>
              {menu === 'sleep' && (
                <div className="menu" role="menu" style={{ width: 260 }}>
                  <div className="menu__head">Stop playing</div>
                  <div className="menu__list">
                    {SLEEP_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        className="menu__item"
                        role="menuitemradio"
                        aria-checked={o.id === sleep}
                        onClick={() => chooseSleep(o.id)}
                      >
                        <span className="menu__tick">{o.id === sleep && <IconTick size={13} />}</span>
                        <span>{o.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </span>

            <button className="key" aria-label="Fullscreen"><IconFullscreen /></button>
          </div>
        </div>
      </div>
    </div>
  )
}

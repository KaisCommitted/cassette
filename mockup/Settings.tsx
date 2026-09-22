/* ===========================================================================
   Cassette — settings.
   One long column, in the order you would actually need it: where the files
   are, how they play, how they read, what gets looked up, and what every
   key does.
   =========================================================================== */
import React, { useEffect, useState } from 'react'
import { Slot, IconFolder, IconRescan, IconTick, IconWarn } from './icons'
import {
  CONTROLS, controlCount, MEDIA_FOLDER, SUB_LANGUAGES, AUDIO_LANGUAGES,
} from './data'

/* --- small parts ---------------------------------------------------------- */

function Row({
  label, help, children, stack = false,
}: { label: string; help?: string; children?: React.ReactNode; stack?: boolean }) {
  return (
    <div className={`set-row ${stack ? 'set-row--stack' : ''}`}>
      <div>
        <p className="set-row__label">{label}</p>
        {help && <p className="set-row__help">{help}</p>}
        {stack && children}
      </div>
      {!stack && <div className="set-row__control">{children}</div>}
    </div>
  )
}

function Switch({
  on, onChange, onWord = 'On', offWord = 'Off', label,
}: { on: boolean; onChange: (v: boolean) => void; onWord?: string; offWord?: string; label: string }) {
  return (
    <>
      <span className="toggle-word">{on ? onWord : offWord}</span>
      <button
        className="toggle"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
      />
    </>
  )
}

function Segmented<T extends string | number>({
  value, options, onChange, label,
}: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* --- the screen ----------------------------------------------------------- */

const SUB_COLOURS = [
  { v: '#F4F1EA', label: 'Paper white' },
  { v: '#EDE8DF', label: 'Warm white' },
  { v: '#E5A83B', label: 'Amber' },
  { v: '#F2E48A', label: 'Straw' },
]

export default function Settings({
  onChangeFolder,
  onRescan,
  onCheckForUpdates,
}: { onChangeFolder: () => void; onRescan: () => void; onCheckForUpdates: () => void }) {
  const [minLength, setMinLength] = useState(4)
  const [autoNext, setAutoNext] = useState(true)
  const [levelVolume, setLevelVolume] = useState(true)
  const [subsOn, setSubsOn] = useState(false)
  const [everyLanguage, setEveryLanguage] = useState(false)

  const [subSize, setSubSize] = useState(34)
  const [subColour, setSubColour] = useState('#F4F1EA')
  const [subOutline, setSubOutline] = useState<'none' | 'thin' | 'heavy'>('thin')
  const [subBack, setSubBack] = useState<'none' | 'shadow' | 'box'>('shadow')
  const [subPos, setSubPos] = useState<'bottom' | 'middle' | 'top'>('bottom')

  const [listening, setListening] = useState<string | null>(null)
  const [bindings, setBindings] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      const named: Record<string, string> = {
        ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
        Escape: 'Esc', Backspace: 'Backspace', Enter: 'Enter',
      }
      const key = named[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        parts.push(key)
        setBindings((b) => ({ ...b, [listening]: parts }))
        setListening(null)
      }
    }
    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      const names = ['Left click', 'Middle click', 'Right click', 'Mouse 4', 'Mouse 5']
      setBindings((b) => ({ ...b, [listening]: [names[e.button] ?? 'Mouse'] }))
      setListening(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouse, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouse, true)
    }
  }, [listening])

  const captionStyle: React.CSSProperties = {
    ['--sub-size' as string]: subSize,
    color: subColour,
    textShadow:
      subOutline === 'none'
        ? subBack === 'shadow' ? '0 2px 6px rgba(0,0,0,0.9)' : 'none'
        : subOutline === 'thin'
          ? '0 0 2px #100F0E, 1px 1px 0 #100F0E, -1px 1px 0 #100F0E, 1px -1px 0 #100F0E, -1px -1px 0 #100F0E'
          : '0 0 3px #100F0E, 2px 2px 0 #100F0E, -2px 2px 0 #100F0E, 2px -2px 0 #100F0E, -2px -2px 0 #100F0E',
    background: subBack === 'box' ? 'rgba(16,15,14,0.72)' : 'transparent',
    padding: subBack === 'box' ? '0.12em 0.42em' : 0,
    borderRadius: subBack === 'box' ? 2 : 0,
  }

  return (
    <div className="settings">
      <h2 className="settings__title">Settings</h2>
      <p className="settings__lede">
        Everything here is kept on this computer, in a single file you can delete.
      </p>

      {/* ------------------------------------------------ where the files are */}
      <section className="set-group">
        <h3 className="set-group__title">Your files</h3>

        <Row label="Media folder" help="Cassette reads this folder and everything inside it. It never moves or renames anything." stack>
          <div className="path">
            <IconFolder size={16} />
            <span className="path__value">{MEDIA_FOLDER}</span>
            <button className="btn" onClick={onChangeFolder}>Change</button>
            <button className="btn" onClick={onRescan}>
              <IconRescan />
              Rescan
            </button>
          </div>
        </Row>

        <Row label="Ignore anything shorter than" help="Keeps trailers, samples and extras off the shelf.">
          <input
            className="field field--sm field--mono"
            type="number"
            min={0}
            max={60}
            value={minLength}
            onChange={(e) => setMinLength(Number(e.target.value))}
            aria-label="Minimum length in minutes"
          />
          <span className="muted">minutes</span>
        </Row>
      </section>

      {/* ------------------------------------------------------------ playing */}
      <section className="set-group">
        <h3 className="set-group__title">Playing</h3>

        <Row label="Play the next episode automatically" help="Starts the next one when the credits reach the end.">
          <Switch on={autoNext} onChange={setAutoNext} label="Play the next episode automatically" />
        </Row>

        <Row label="Even out loud and quiet scenes" help="Pulls the dialogue up and the explosions down. Useful at night.">
          <Switch on={levelVolume} onChange={setLevelVolume} label="Even out loud and quiet scenes" />
        </Row>
      </section>

      {/* ---------------------------------------------------------- subtitles */}
      <section className="set-group">
        <h3 className="set-group__title">Subtitles and audio</h3>

        <Row label="Turn subtitles on automatically" help="When a track in one of your languages is already in the file.">
          <Switch on={subsOn} onChange={setSubsOn} label="Turn subtitles on automatically" />
        </Row>

        <Row label="Preferred subtitle languages" help="Cassette takes the first one it can find, in this order." stack>
          <div className="chips">
            {SUB_LANGUAGES.map((l, i) => (
              <span className="chip" key={l}>
                <span className="chip__order">{i + 1}</span>
                {l}
                <button className="chip__x" aria-label={`Remove ${l}`}>×</button>
              </span>
            ))}
            <button className="btn btn--quiet">Add a language</button>
          </div>
        </Row>

        <Row label="Preferred audio languages" help="Used when a file carries more than one soundtrack." stack>
          <div className="chips">
            {AUDIO_LANGUAGES.map((l, i) => (
              <span className="chip" key={l}>
                <span className="chip__order">{i + 1}</span>
                {l}
                <button className="chip__x" aria-label={`Remove ${l}`}>×</button>
              </span>
            ))}
            <button className="btn btn--quiet">Add a language</button>
          </div>
        </Row>

        <Row label="How subtitles look" stack>
          <div className="subprev" data-pos={subPos}>
            <Slot ratio="16x9" label="video 16:9" tint={1} />
            <p className="subprev__caption" style={captionStyle}>
              {'You can turn it off at the exchange.\nNobody has, in forty years.'}
            </p>
          </div>

          <div className="set-row">
            <p className="set-row__label">Size</p>
            <div className="set-row__control">
              <Segmented
                label="Subtitle size"
                value={subSize}
                onChange={setSubSize}
                options={[
                  { v: 26, label: 'Small' },
                  { v: 34, label: 'Normal' },
                  { v: 44, label: 'Large' },
                  { v: 56, label: 'Largest' },
                ]}
              />
            </div>
          </div>

          <div className="set-row">
            <p className="set-row__label">Colour</p>
            <div className="set-row__control">
              <div className="swatches" role="group" aria-label="Subtitle colour">
                {SUB_COLOURS.map((c) => (
                  <button
                    key={c.v}
                    className="swatch"
                    style={{ background: c.v }}
                    aria-label={c.label}
                    aria-pressed={c.v === subColour}
                    onClick={() => setSubColour(c.v)}
                  />
                ))}
              </div>
              <span className="muted">{SUB_COLOURS.find((c) => c.v === subColour)?.label}</span>
            </div>
          </div>

          <div className="set-row">
            <p className="set-row__label">Outline</p>
            <div className="set-row__control">
              <Segmented
                label="Subtitle outline"
                value={subOutline}
                onChange={setSubOutline}
                options={[
                  { v: 'none' as const, label: 'None' },
                  { v: 'thin' as const, label: 'Thin' },
                  { v: 'heavy' as const, label: 'Heavy' },
                ]}
              />
            </div>
          </div>

          <div className="set-row">
            <p className="set-row__label">Background</p>
            <div className="set-row__control">
              <Segmented
                label="Subtitle background"
                value={subBack}
                onChange={setSubBack}
                options={[
                  { v: 'none' as const, label: 'None' },
                  { v: 'shadow' as const, label: 'Shadow' },
                  { v: 'box' as const, label: 'Box' },
                ]}
              />
            </div>
          </div>

          <div className="set-row">
            <p className="set-row__label">Position</p>
            <div className="set-row__control">
              <Segmented
                label="Subtitle position"
                value={subPos}
                onChange={setSubPos}
                options={[
                  { v: 'bottom' as const, label: 'Bottom' },
                  { v: 'middle' as const, label: 'Middle' },
                  { v: 'top' as const, label: 'Top' },
                ]}
              />
            </div>
          </div>
        </Row>
      </section>

      {/* ------------------------------------------------------ online lookup */}
      <section className="set-group">
        <h3 className="set-group__title">Looking things up</h3>
        <p className="set-row__help" style={{ marginTop: 'var(--s-3)' }}>
          Optional. Without these, Cassette works from the filenames alone and every poster is a J-card.
        </p>

        <Row label="OpenSubtitles key" help="Only used when you ask for subtitles." stack>
          <input className="field field--mono" type="password" defaultValue="opensub-9f2c4a7b13" aria-label="OpenSubtitles key" />
        </Row>

        <Row label="SubDL key" help="A second place to look when the first one has nothing." stack>
          <input className="field field--mono" type="password" placeholder="Not set" aria-label="SubDL key" />
        </Row>

        <Row label="Fetch every language" help="Downloads all of them at once instead of only your preferred ones. Slower, and a lot of files.">
          <Switch on={everyLanguage} onChange={setEveryLanguage} label="Fetch every language" />
        </Row>
      </section>

      {/* --------------------------------------------------------- the keys */}
      <section className="set-group">
        <h3 className="set-group__title">Controls</h3>
        <p className="set-row__help" style={{ marginTop: 'var(--s-3)' }}>
          {controlCount} actions. Click a key to change it, then press the key or mouse button you want.
        </p>

        {listening && (
          <p className="menu__status fade" style={{ marginTop: 'var(--s-4)', color: 'var(--accent)' }}>
            <IconWarn size={14} />
            Press anything now — a key, a combination, or a mouse button. Esc keeps the old one.
          </p>
        )}

        <div className="controls">
          {CONTROLS.map((group) => (
            <React.Fragment key={group.group}>
              <div className="controls__group">{group.group}</div>
              {group.rows.map((row) => {
                const id = `${group.group}/${row.action}`
                const keys = bindings[id] ?? row.keys
                const isListening = listening === id
                return (
                  <div className="controls__row" key={id}>
                    <span>{row.action}</span>
                    <span className="controls__bind">
                      {isListening ? (
                        <button className="cap cap--listening" onClick={() => setListening(null)}>
                          Press anything now
                        </button>
                      ) : (
                        <button className="cap" onClick={() => setListening(id)}>
                          {keys.map((k, i) => (
                            <React.Fragment key={k + i}>
                              {i > 0 && <span className="cap__plus">+</span>}
                              {k}
                            </React.Fragment>
                          ))}
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-4)' }}>
          <button className="btn" onClick={() => setBindings({})}>
            <IconRescan />
            Restore defaults
          </button>
          {Object.keys(bindings).length > 0 && (
            <span className="menu__status fade">
              <IconTick size={12} /> {Object.keys(bindings).length} changed
            </span>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------- about */}
      <section className="about">
        <h3 className="set-group__title" style={{ color: 'var(--text-muted)' }}>About</h3>
        <p>
          Cassette <span className="about__ver">0.1.0</span> — a player for the films and
          programmes already on this computer.
        </p>
        <p>
          Artwork, synopses and ratings come from TMDB when a key is set. This product uses the
          TMDB API but is not endorsed or certified by TMDB.
        </p>
        <p>
          Playback is mpv. Subtitles come from OpenSubtitles and SubDL when you ask for them, and
          from the files themselves when you do not.
        </p>
        <div style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-5)' }}>
          <button className="btn btn--quiet" onClick={onCheckForUpdates}>Check for updates</button>
          <button className="btn btn--quiet">Open the settings file</button>
        </div>
      </section>
    </div>
  )
}

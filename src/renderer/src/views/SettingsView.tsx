import { useCallback, useEffect, useState } from 'react'
import { ACTIONS, type KeyBindings, type Settings } from '@shared/types'
import { SubtitleSettings } from '../components/SubtitleSettings'
import { describeCaptured, humaniseDescriptor } from '../inputDescriptors'

export interface SettingsViewProps {
  settings: Settings | null
  bindings: KeyBindings
  onChooseFolder: () => void
  onRescan: () => void
  onAssign: (descriptor: string, actionId: string) => void
  onResetBindings: () => void
  onChangeSettings: (changes: Partial<Settings>) => void
  scanning: boolean
}

export function SettingsView({
  settings,
  bindings,
  onChooseFolder,
  onRescan,
  onAssign,
  onResetBindings,
  onChangeSettings,
  scanning
}: SettingsViewProps) {
  const [listening, setListening] = useState<string | null>(null)

  const descriptorsFor = useCallback(
    (actionId: string) =>
      Object.entries(bindings)
        .filter(([, id]) => id === actionId)
        .map(([descriptor]) => descriptor),
    [bindings]
  )

  // While listening, every key and button press is a candidate binding, so the
  // capture has to sit above the app's own handling rather than beside it.
  useEffect(() => {
    if (!listening) return

    const finish = (descriptor: string | null): void => {
      if (descriptor) onAssign(descriptor, listening)
      setListening(null)
    }

    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return finish(null)
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return
      finish(describeCaptured({ type: 'key', event: e }))
    }
    const onMouse = (e: MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      finish(describeCaptured({ type: 'mouse', event: e }))
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      finish(describeCaptured({ type: 'wheel', event: e }))
    }

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('wheel', onWheel, { capture: true, passive: false })
    window.addEventListener('contextmenu', preventDefault, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('wheel', onWheel, true)
      window.removeEventListener('contextmenu', preventDefault, true)
    }
  }, [listening, onAssign])

  const groups = [...new Set(ACTIONS.map((a) => a.group))]
  const root = settings?.libraryRoots[0]

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Where your files live, and how you drive the player.</p>

      <h2 className="section-title">Media folder</h2>
      <div className="field">
        <div className="path-box">
          <div className="path">{root ?? 'No folder chosen yet'}</div>
          <button className="btn" onClick={onChooseFolder}>
            Change
          </button>
          <button className="btn" onClick={onRescan} disabled={!root || scanning}>
            {scanning ? 'Scanning' : 'Rescan'}
          </button>
        </div>
        <p className="field-help">
          Rescan after adding or removing files. Your watch history is matched by file
          size and name, so moving a folder keeps your place.
        </p>
      </div>

      {settings && (
        <>
          <h2 className="section-title">Playback</h2>
          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoplayNext}
                onChange={(e) => onChangeSettings({ autoplayNext: e.target.checked })}
              />
              Play the next episode automatically
            </label>
            <p className="field-help">
              Runs on through a season and into the next one when it finishes. Turn it
              off to stop after every episode.
            </p>
          </div>

          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.nightAudio}
                onChange={(e) => onChangeSettings({ nightAudio: e.target.checked })}
              />
              Even out loud and quiet scenes
            </label>
            <p className="field-help">
              Lifts quiet dialogue and holds back sudden loud scenes — for watching at
              low volume without reaching for the remote.
            </p>
          </div>

          <SubtitleSettings settings={settings} onChange={onChangeSettings} />

          <h2 className="section-title">Subtitle downloads</h2>
          <div className="field">
            <div className="field-label">OpenSubtitles API key</div>
            <input
              className="search"
              type="password"
              value={settings.openSubtitlesApiKey ?? ''}
              placeholder="Not set"
              onChange={(e) =>
                onChangeSettings({ openSubtitlesApiKey: e.target.value || null })
              }
            />
            <p className="field-help">
              Needed only to download subtitles that are not already on disk. Without
              a key, searching still reports which files already have subtitle files
              beside them. Keys are free from opensubtitles.com.
            </p>
          </div>
        </>
      )}

      <h2 className="section-title">Controls</h2>
      <p className="field-help" style={{ marginBottom: 14 }}>
        Click a binding, then press any key or mouse button. Side buttons work. Press
        Escape to leave it unchanged.
      </p>

      {groups.map((group) => (
        <div key={group} style={{ marginBottom: 22 }}>
          <div className="field-label" style={{ color: 'var(--muted)' }}>
            {group}
          </div>
          <table className="bind-table">
            <tbody>
              {ACTIONS.filter((a) => a.group === group).map((action) => {
                const descriptors = descriptorsFor(action.id)
                return (
                  <tr key={action.id}>
                    <td>{action.label}</td>
                    <td>
                      <button
                        className={`key${listening === action.id ? ' listening' : ''}`}
                        onClick={() => setListening(action.id)}
                      >
                        {listening === action.id
                          ? 'Press anything'
                          : descriptors.length > 0
                            ? descriptors.map(humaniseDescriptor).join(', ')
                            : 'Not bound'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      <button className="btn" onClick={onResetBindings}>
        Restore VLC defaults
      </button>
    </>
  )
}

function preventDefault(e: Event): void {
  e.preventDefault()
}

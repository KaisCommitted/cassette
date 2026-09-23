import { useCallback, useEffect, useState, type RefObject } from 'react'
import {
  ACTIONS,
  type BundledKeyAvailability,
  type KeyBindings,
  type Library,
  type MetadataSnapshot,
  type ScanProgressInfo,
  type Settings
} from '@shared/types'
import { SubtitleSettings } from '../components/SubtitleSettings'
import { describeCaptured, humaniseDescriptor } from '../inputDescriptors'

export interface SettingsViewProps {
  settings: Settings | null
  bindings: KeyBindings
  onChooseFolder: () => void
  onRescan: () => void
  onCancelScan: () => void
  onAssign: (descriptor: string, actionId: string) => void
  onResetBindings: () => void
  onChangeSettings: (changes: Partial<Settings>) => void
  scanning: boolean
  scanProgress: ScanProgressInfo | null
  library: Library
  metadata: MetadataSnapshot
  scrollRoot: RefObject<HTMLElement | null>
  onMetadata: (metadata: MetadataSnapshot) => void
}

export function SettingsView({
  settings,
  bindings,
  onChooseFolder,
  onRescan,
  onCancelScan,
  onAssign,
  onResetBindings,
  onChangeSettings,
  scanning,
  scanProgress
}: SettingsViewProps) {
  const [listening, setListening] = useState<string | null>(null)

  // Whether this build ships its own keys decides what an empty box means, so
  // it is asked for once rather than guessed at.
  const [bundled, setBundled] = useState<BundledKeyAvailability>({
    tmdb: false,
    subdl: false,
    openSubtitles: false
  })
  useEffect(() => {
    void window.cassette.getBundledKeys().then(setBundled)
  }, [])

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
          {scanning ? (
            <button className="btn" onClick={onCancelScan}>
              Stop
            </button>
          ) : (
            <button className="btn" onClick={onRescan} disabled={!root}>
              Rescan
            </button>
          )}
        </div>

        {scanning && <ScanProgress progress={scanProgress} />}
        <p className="field-help">
          Rescan after adding or removing files. Your watch history is matched by file
          size and name, so moving a folder keeps your place.
        </p>
      </div>

      {settings && (
        <div className="field">
          <div className="field-label">Ignore anything shorter than</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              className="search"
              type="number"
              min={0}
              max={120}
              step={1}
              value={settings.minimumDurationMinutes}
              onChange={(e) =>
                onChangeSettings({
                  minimumDurationMinutes: clampMinutes(e.target.value)
                })
              }
              style={{ width: 96 }}
            />
            <span style={{ fontSize: 13, opacity: 0.7 }}>minutes</span>
          </div>
          <p className="field-help">
            Trailers, samples and featurettes end up in the same folders as what you
            actually want to watch. Files are checked once and the answer is
            remembered, so this only costs time on the first scan. Set it to 0 to keep
            everything.
          </p>
        </div>
      )}

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
            <div className="field-label">SubDL API key</div>
            <input
              className="search"
              type="password"
              value={settings.subdlApiKey ?? ''}
              placeholder={bundled.subdl ? 'Using the built-in key' : 'Not set'}
              onChange={(e) => onChangeSettings({ subdlApiKey: e.target.value || null })}
            />
            <p className="field-help">
              {bundled.subdl
                ? 'Cassette comes with a key, so this already works. Put your own here if you would rather not share its daily limit — free from subdl.com. Clear the box to go back to the built-in one.'
                : 'A free key from subdl.com allows around two thousand searches a day, which is enough to fill in a whole series in one go.'}
            </p>
          </div>

          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.downloadEveryPreferredLanguage}
                onChange={(e) =>
                  onChangeSettings({ downloadEveryPreferredLanguage: e.target.checked })
                }
              />
              Fetch every language you listed, not just the first
            </label>
            <p className="field-help">
              Leaves each episode with one subtitle track per language, so you can
              switch between them from the player's Subtitles menu.
            </p>
          </div>

          <div className="field">
            <div className="field-label">OpenSubtitles API key</div>
            <input
              className="search"
              type="password"
              value={settings.openSubtitlesApiKey ?? ''}
              placeholder={bundled.openSubtitles ? 'Using the built-in key' : 'Not set'}
              onChange={(e) =>
                onChangeSettings({ openSubtitlesApiKey: e.target.value || null })
              }
            />
            <p className="field-help">
              Optional fallback, used only for languages SubDL could not supply. Free
              accounts allow a few downloads a day, so it runs out quickly on its own.
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

      <h2 className="section-title">About</h2>
      <p className="field-help" style={{ maxWidth: '62ch' }}>
        Cassette is free and open source, and everything it knows stays on this
        machine.
      </p>
      <p className="field-help" style={{ maxWidth: '62ch' }}>
        Posters, backdrops and episode details come from TMDB. This product uses
        the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </>
  )
}

function preventDefault(e: Event): void {
  e.preventDefault()
}

/**
 * What the scan is doing, while it does it.
 *
 * A first scan opens every file to read its duration, which takes long enough
 * on a large folder that a button reading "Scanning" and nothing else is
 * indistinguishable from the app having hung.
 */
function ScanProgress({ progress }: { progress: ScanProgressInfo | null }) {
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : null

  return (
    <div className="scan-progress">
      <div className="scan-bar">
        {/* Before the first file is reported there is no ratio to show, so the
            bar sweeps rather than sitting empty. */}
        <div
          className={pct === null ? 'scan-fill indeterminate' : 'scan-fill'}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
      <div className="scan-label">
        {pct === null
          ? 'Looking through your folders'
          : `Checking ${progress!.done} of ${progress!.total} files`}
      </div>
    </div>
  )
}

/** An empty or nonsense box means "keep everything" rather than NaN minutes. */
function clampMinutes(value: string): number {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return 0
  return Math.max(0, Math.min(120, Math.round(minutes)))
}

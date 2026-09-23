import { useEffect, useState, type RefObject } from 'react'
import {
  type BundledKeyAvailability,
  type KeyBindings,
  type Library,
  type MetadataSnapshot,
  type ScanProgressInfo,
  type Settings
} from '@shared/types'
import { SubtitleSettings } from '../components/SubtitleSettings'
import { DraftInput, Section, SwitchRow } from '../components/SettingsParts'
import { ControlsSection } from '../components/ControlsSection'
import { Icon, Logo } from '../../shared/Icon'
import { formatAgo } from '../select'

export interface SettingsViewProps {
  settings: Settings | null
  bindings: KeyBindings
  onChooseFolder: () => void
  onRescan: () => void
  onCancelScan: () => void
  onAssign: (descriptor: string, actionId: string) => void
  onUnassign: (descriptor: string) => void
  onResetBindings: () => void
  onChangeSettings: (changes: Partial<Settings>) => void
  scanning: boolean
  scanProgress: ScanProgressInfo | null
  library: Library
  metadata: MetadataSnapshot
  scrollRoot: RefObject<HTMLElement | null>
  onMetadata: (metadata: MetadataSnapshot) => void
}

const SECTIONS = [
  { id: 'folder', title: 'Media folder' },
  { id: 'playback', title: 'Playback' },
  { id: 'subtitles', title: 'Subtitles' },
  { id: 'appearance', title: 'Subtitle appearance' },
  { id: 'services', title: 'Online services' },
  { id: 'controls', title: 'Controls' },
  { id: 'about', title: 'About' }
] as const

export function SettingsView(props: SettingsViewProps) {
  const { settings, scrollRoot } = props

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

  // The contents list follows the section you are reading.
  const [active, setActive] = useState<string>(SECTIONS[0].id)
  useEffect(() => {
    const root = scrollRoot.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible[0]) setActive(visible[0].target.id.replace('settings-', ''))
      },
      { root, rootMargin: '0px 0px -75% 0px' }
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(`settings-${s.id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [scrollRoot, settings === null])

  const jump = (id: string): void => {
    const section = document.getElementById(`settings-${id}`)
    if (!section) return
    section.scrollIntoView({ block: 'start' })
    section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
    setActive(id)
  }

  return (
    <div className="page page-settings">
      <header className="settings-head">
        <h1 className="settings-title" tabIndex={-1} data-return="page-start">
          Settings
        </h1>
        <p className="settings-sub">Where your files live, and how you drive the player.</p>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className="settings-nav-link"
              aria-current={active === s.id ? 'true' : undefined}
              onClick={() => jump(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div className="settings-sections">
          <FolderSection {...props} />

          {settings && (
            <>
              <Section id="playback" title="Playback">
                <SwitchRow
                  label="Play the next episode automatically"
                  help="Runs on through a season and into the next one when it finishes. Turn it off to stop after every episode."
                  checked={settings.autoplayNext}
                  onChange={(v) => props.onChangeSettings({ autoplayNext: v })}
                />
                <SwitchRow
                  label="Even out loud and quiet scenes"
                  help="Lifts quiet dialogue and holds back sudden loud scenes, for watching at low volume without reaching for the remote."
                  checked={settings.nightAudio}
                  onChange={(v) => props.onChangeSettings({ nightAudio: v })}
                />
                <SwitchRow
                  label="Dim the picture while a sleep timer runs"
                  help="Warms the colours like a night light and darkens the picture gradually over ten minutes. Cancelling the timer or changing episode yourself puts it back."
                  checked={settings.sleepNightLight}
                  onChange={(v) => props.onChangeSettings({ sleepNightLight: v })}
                />
              </Section>

              <SubtitleSettings
                settings={settings}
                onChange={props.onChangeSettings}
                previewArt={previewBackdrop(props.library, props.metadata)}
              />

              <Section id="services" title="Online services">
                <p className="section-intro">
                  Cassette only goes online for artwork and subtitles. Each box can be left
                  empty.
                </p>
                <KeyRow
                  label="TMDB API key"
                  value={settings.tmdbApiKey}
                  bundled={bundled.tmdb}
                  help={
                    bundled.tmdb
                      ? 'Posters, backdrops and episode details. Cassette comes with a key; put your own here to use that instead, or clear the box to go back to the built-in one.'
                      : 'Posters, backdrops and episode details. A free key comes with an account at themoviedb.org. Without one, tapes show frames from your own files.'
                  }
                  onChange={(v) => props.onChangeSettings({ tmdbApiKey: v })}
                />
                <KeyRow
                  label="SubDL API key"
                  value={settings.subdlApiKey}
                  bundled={bundled.subdl}
                  help={
                    bundled.subdl
                      ? 'Cassette comes with a key, so this already works. Put your own here if you would rather not share its daily limit — free from subdl.com. Clear the box to go back to the built-in one.'
                      : 'A free key from subdl.com allows around two thousand searches a day, which is enough to fill in a whole series in one go.'
                  }
                  onChange={(v) => props.onChangeSettings({ subdlApiKey: v })}
                />
                <KeyRow
                  label="OpenSubtitles API key"
                  value={settings.openSubtitlesApiKey}
                  bundled={bundled.openSubtitles}
                  help="Optional fallback, used only for languages SubDL could not supply. Free accounts allow a few downloads a day, so it runs out quickly on its own."
                  onChange={(v) => props.onChangeSettings({ openSubtitlesApiKey: v })}
                />
              </Section>
            </>
          )}

          <ControlsSection
            bindings={props.bindings}
            onAssign={props.onAssign}
            onUnassign={props.onUnassign}
            onReset={props.onResetBindings}
          />

          <Section id="about" title="About">
            <div className="about">
              <Logo variant="combined" className="about-logo" />
              <p>
                Cassette is free and open source, and everything it knows stays on this
                machine.
              </p>
              <p className="about-small">
                Posters, backdrops and episode details come from TMDB. This product uses the
                TMDB API but is not endorsed or certified by TMDB.
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

/** A backdrop from the library for the subtitle preview to sit on. */
function previewBackdrop(library: Library, metadata: MetadataSnapshot): string | null {
  for (const s of library.series) {
    const path = metadata.series[s.id]?.backdropPath
    if (path) return path
  }
  for (const m of library.movies) {
    const path = metadata.movies[m.id]?.backdropPath
    if (path) return path
  }
  return null
}

function KeyRow({
  label,
  value,
  bundled,
  help,
  onChange
}: {
  label: string
  value: string | null
  bundled: boolean
  help: string
  onChange: (value: string | null) => void
}) {
  const id = `key-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="setting-row setting-row-stacked">
      <span className="setting-text">
        <label className="setting-label" htmlFor={id}>
          {label}
        </label>
        <span className="setting-help">{help}</span>
      </span>
      <DraftInput
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="setting-input-wide"
        value={value ?? ''}
        placeholder={bundled ? 'Using the built-in key' : 'Not set'}
        onCommit={(v) => onChange(v.trim() || null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function FolderSection({
  settings,
  library,
  scanning,
  scanProgress,
  onChooseFolder,
  onRescan,
  onCancelScan,
  onChangeSettings,
  onMetadata
}: SettingsViewProps) {
  const root = settings?.libraryRoots[0]
  const [artwork, setArtwork] = useState<'idle' | 'busy' | 'done'>('idle')

  const lookUpArtwork = async (): Promise<void> => {
    setArtwork('busy')
    try {
      onMetadata(await window.cassette.refreshMetadata(false))
      setArtwork('done')
    } catch {
      setArtwork('idle')
    }
  }

  const films = library.movies.length
  const series = library.series.length

  return (
    <Section id="folder" title="Media folder">
      <div className="folder-card">
        <Icon name="folder" className="folder-icon" />
        <div className="folder-text">
          <p className="folder-path">{root ?? 'No folder chosen yet'}</p>
          <p className="folder-stats">
            {series === 1 ? '1 series' : `${series} series`} and{' '}
            {films === 1 ? '1 film' : `${films} films`}. Scanned {formatAgo(library.scannedAt)}.
          </p>
        </div>
        <div className="folder-actions">
          <button className="btn btn-ghost btn-sm" onClick={onChooseFolder} disabled={scanning}>
            Change folder
          </button>
          {scanning ? (
            <button className="btn btn-ghost btn-sm" onClick={onCancelScan}>
              Stop
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={onRescan} disabled={!root}>
              <Icon name="rescan" />
              Rescan
            </button>
          )}
        </div>
      </div>

      {scanning && <ScanProgress progress={scanProgress} />}

      <p className="setting-help setting-help-block">
        Rescan after adding or removing files. Your watch history is matched by file size
        and name, so moving a folder keeps your place.
      </p>

      {settings && (
        <div className="setting-row">
          <span className="setting-text">
            <label className="setting-label" htmlFor="minimum-minutes">
              Leave out anything shorter than
            </label>
            <span className="setting-help">
              Trailers, samples and featurettes end up in the same folders as what you
              actually want to watch. Files are checked once and the answer is remembered,
              so this only costs time on the first scan. Set it to 0 to keep everything.
            </span>
          </span>
          <span className="setting-unit">
            <DraftInput
              id="minimum-minutes"
              type="number"
              min={0}
              max={120}
              step={1}
              inputMode="numeric"
              className="setting-input-number"
              value={String(settings.minimumDurationMinutes)}
              onCommit={(v) => onChangeSettings({ minimumDurationMinutes: clampMinutes(v) })}
            />
            minutes
          </span>
        </div>
      )}

      <div className="setting-row">
        <span className="setting-text">
          <span className="setting-label">Artwork</span>
          <span className="setting-help">
            {artwork === 'done'
              ? 'Looked up. Anything still without a poster was not found on TMDB, and shows a frame from the file instead.'
              : 'Posters and episode details are fetched after each scan. Look again for anything that has none, for instance after adding a TMDB key.'}
          </span>
        </span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void lookUpArtwork()}
          disabled={artwork === 'busy' || scanning}
        >
          {artwork === 'busy' ? 'Looking…' : 'Look up missing artwork'}
        </button>
      </div>
    </Section>
  )
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
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div className="scan-progress" role="status">
      <span className="meter" aria-hidden="true">
        <span
          className={pct === null ? 'is-indeterminate' : undefined}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </span>
      <span className="scan-progress-label">
        {pct === null
          ? 'Looking through your folders'
          : `Checking ${progress!.done} of ${progress!.total} files`}
      </span>
    </div>
  )
}

/** An empty or nonsense box means "keep everything" rather than NaN minutes. */
function clampMinutes(value: string): number {
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return 0
  return Math.max(0, Math.min(120, Math.round(minutes)))
}

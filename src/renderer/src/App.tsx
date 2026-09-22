import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyBindings, MetadataSnapshot, Settings } from '@shared/types'
import { useLibrary } from './useLibrary'
import { useAmbient } from './useAmbient'
import { artUrl } from './components/Art'
import { continueWatching } from './select'
import { UpdateBanner } from './components/UpdateBanner'
import { HomeView } from './views/HomeView'
import { SeriesView } from './views/SeriesView'
import { SettingsView } from './views/SettingsView'

type View = { name: 'home' } | { name: 'series'; id: string } | { name: 'settings' }

export function App() {
  const { library, progress, loading, chooseFolder, rescan, refreshProgress } = useLibrary()
  const [view, setView] = useState<View>({ name: 'home' })
  const [query, setQuery] = useState('')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [bindings, setBindings] = useState<KeyBindings>({})
  const [metadata, setMetadata] = useState<MetadataSnapshot>({
    series: {},
    movies: {},
    episodes: {},
    pinned: {}
  })
  const [metadataBusy, setMetadataBusy] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setSettings(await window.cassette.getSettings())
      setBindings(await window.cassette.getBindings())
      setMetadata(await window.cassette.getMetadata())
    })()
  }, [])

  // Watch positions change while the player is open, so refresh on return.
  useEffect(() => {
    const off = window.cassette.onPlaybackState((state) => {
      if (!state.path) void refreshProgress()
    })
    return off
  }, [refreshProgress])

  useEffect(
    () =>
      window.cassette.onMetadataReady((next) => {
        setMetadata(next)
        setMetadataBusy(null)
      }),
    []
  )

  const play = useCallback((path: string, key: string) => {
    void window.cassette.play(path, key)
  }, [])

  const handleChooseFolder = useCallback(async () => {
    await chooseFolder()
    setSettings(await window.cassette.getSettings())
  }, [chooseFolder])

  const series =
    view.name === 'series' ? library?.series.find((s) => s.id === view.id) : undefined

  /*
   * The page takes its colour from whatever is on screen — the featured
   * backdrop on the library, or the series you have opened. A flat near-black
   * behind vivid poster art reads as dead.
   */
  const ambientSource = useMemo(() => {
    if (!library) return null
    if (view.name === 'series' && series) {
      const meta = metadata.series[series.id]
      return meta?.backdropPath ? artUrl(meta.backdropPath, 'backdrop') : null
    }
    const lead = continueWatching(library, progress)[0]
    if (!lead) return null
    const movieId = library.movies.find((m) => m.file.key === lead.key)?.id
    const meta = lead.seriesId
      ? metadata.series[lead.seriesId]
      : movieId
        ? metadata.movies[movieId]
        : undefined
    return meta?.backdropPath ? artUrl(meta.backdropPath, 'backdrop') : null
  }, [library, progress, metadata, view, series])

  const ambient = useAmbient(ambientSource)
  const onSettings = view.name === 'settings'

  if (loading && !library) {
    return <div className="center">Reading your folder…</div>
  }

  if (!library) {
    return (
      <div className="center">
        <div>
          <h1>Cassette</h1>
          <p>
            Point it at the folder where your films and series live. Everything stays on
            this machine — nothing is uploaded, and no account is needed.
          </p>
          <button className="btn primary" onClick={() => void handleChooseFolder()}>
            Choose folder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="shell" style={{ ['--ambient' as string]: ambient.rgb }}>
      <nav className="rail">
        <div className="wordmark">
          Cas<span>sette</span>
        </div>

        <div className="rail-nav">
          {/* Slides between items, so the change reads as movement. */}
          <span
            className="rail-marker"
            style={{ transform: `translateY(${onSettings ? 41 : 0}px)` }}
            aria-hidden="true"
          />
          <button
            className="rail-link"
            aria-current={!onSettings}
            onClick={() => {
              setView({ name: 'home' })
              setQuery('')
            }}
          >
            Library
          </button>
          <button
            className="rail-link"
            aria-current={onSettings}
            onClick={() => setView({ name: 'settings' })}
          >
            Settings
          </button>
        </div>

      </nav>

      {/* Keyed so a view change replays the entrance rather than cutting. */}
      <main className="main" key={view.name === 'series' ? view.id : view.name}>
        {view.name === 'home' && (
          <HomeView
            library={library}
            progress={progress}
            metadata={metadata}
            metadataBusy={metadataBusy}
            query={query}
            onQueryChange={setQuery}
            onOpenSeries={(id) => setView({ name: 'series', id })}
            onPlay={play}
          />
        )}

        {view.name === 'series' &&
          (series ? (
            <SeriesView
              series={series}
              progress={progress}
              metadata={metadata}
              onBack={() => setView({ name: 'home' })}
              onPlay={play}
              onRefreshProgress={() => void refreshProgress()}
            />
          ) : (
            <p className="empty">That series is no longer in your library.</p>
          ))}

        {view.name === 'settings' && (
          <SettingsView
            settings={settings}
            bindings={bindings}
            scanning={loading}
            onChooseFolder={() => void handleChooseFolder()}
            onRescan={() => void rescan()}
            onAssign={(descriptor, actionId) => {
              void window.cassette.assignBinding(descriptor, actionId).then(setBindings)
            }}
            onChangeSettings={(changes) => {
              void window.cassette.updateSettings(changes).then(setSettings)
            }}
            onResetBindings={() => {
              void window.cassette.resetBindings().then(setBindings)
            }}
          />
        )}
      </main>

      <UpdateBanner />
    </div>
  )
}

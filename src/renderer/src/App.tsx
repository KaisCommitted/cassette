import { useCallback, useEffect, useState } from 'react'
import type { KeyBindings, Settings } from '@shared/types'
import { useLibrary } from './useLibrary'
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

  useEffect(() => {
    void (async () => {
      setSettings(await window.cassette.getSettings())
      setBindings(await window.cassette.getBindings())
    })()
  }, [])

  // Watch positions change while the player is open, so refresh on return.
  useEffect(() => {
    const off = window.cassette.onPlaybackState((state) => {
      if (!state.path) void refreshProgress()
    })
    return off
  }, [refreshProgress])

  const play = useCallback((path: string, key: string) => {
    void window.cassette.play(path, key)
  }, [])

  const handleChooseFolder = useCallback(async () => {
    await chooseFolder()
    setSettings(await window.cassette.getSettings())
  }, [chooseFolder])

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

  const series = view.name === 'series' ? library.series.find((s) => s.id === view.id) : null

  return (
    <div className="shell">
      <nav className="rail">
        <div className="wordmark">
          Cas<span>sette</span>
        </div>

        <button
          className="rail-link"
          aria-current={view.name === 'home' && query === ''}
          onClick={() => {
            setView({ name: 'home' })
            setQuery('')
          }}
        >
          Library
        </button>

        <button
          className="rail-link"
          aria-current={view.name === 'settings'}
          onClick={() => setView({ name: 'settings' })}
        >
          Settings
        </button>

        <div className="rail-foot">
          {library.series.length} series, {library.movies.length} films.
          <br />
          Stills are frames from your own files.
        </div>
      </nav>

      <main className="main">
        {view.name === 'home' && (
          <HomeView
            library={library}
            progress={progress}
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
              void window.cassette
                .assignBinding(descriptor, actionId)
                .then(setBindings)
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
    </div>
  )
}

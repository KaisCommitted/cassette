import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyBindings, MetadataSnapshot, Settings } from '@shared/types'
import { useLibrary } from './useLibrary'
import { useAmbient } from './useAmbient'
import { artUrl } from './mediaUrls'
import { continueWatching, keyForPath } from './select'
import { Header } from './components/Header'
import { UpdateBanner } from './components/UpdateBanner'
import { HomeView, type Scope } from './views/HomeView'
import { SeriesView } from './views/SeriesView'
import { SettingsView } from './views/SettingsView'
import { SetupView } from './views/SetupView'
import { Logo } from '../shared/Icon'

type View = { name: 'home' } | { name: 'series'; id: string } | { name: 'settings' }

/** Where a view's scroll position and focus are remembered. */
function viewKey(view: View, query: string): string {
  if (view.name === 'series') return `series:${view.id}`
  if (view.name === 'settings') return 'settings'
  // Each search keeps its own place, so backing out of a result lands on the
  // same results at the same scroll, and clearing the search lands on the
  // library where you left it.
  return `home:${query.trim().toLowerCase()}`
}

export function App() {
  const lib = useLibrary()
  const { library, progress, refreshProgress } = lib
  const [view, setView] = useState<View>({ name: 'home' })
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [bindings, setBindings] = useState<KeyBindings>({})
  const [metadata, setMetadata] = useState<MetadataSnapshot>({
    series: {},
    movies: {},
    episodes: {},
    pinned: {}
  })
  // Never set by anything today: the preload does not pass on the main
  // process' progress events. Kept so the note appears if it ever does.
  const [metadataBusy, setMetadataBusy] = useState<string | null>(null)

  const [playing, setPlaying] = useState(false)
  /** What was on screen last, so a returning view can put you back on it. */
  const [lastPlayedKey, setLastPlayedKey] = useState<string | null>(null)
  /** Bumped each time the player closes, for views that react to coming back. */
  const [returns, setReturns] = useState(0)

  const mainRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollMemory = useRef(new Map<string, number>())
  /** `data-return` of the element to focus once the next view has rendered. */
  const pendingFocus = useRef<string | null>(null)
  /** The control that started playback, focused again when it ends. */
  const focusBeforePlay = useRef<HTMLElement | null>(null)

  useEffect(() => {
    void (async () => {
      setSettings(await window.cassette.getSettings())
      setBindings(await window.cassette.getBindings())
      setMetadata(await window.cassette.getMetadata())
    })()
  }, [])

  useEffect(
    () =>
      window.cassette.onMetadataReady((next) => {
        setMetadata(next)
        setMetadataBusy(null)
      }),
    []
  )

  // Watch positions change while the player is open, so refresh on return.
  const libraryRef = useRef(library)
  libraryRef.current = library
  const playingRef = useRef(false)
  useEffect(
    () =>
      window.cassette.onPlaybackState((state) => {
        const nowPlaying = Boolean(state.path)
        if (state.path && libraryRef.current) {
          const key = keyForPath(libraryRef.current, state.path)
          if (key) setLastPlayedKey(key)
        }
        if (nowPlaying === playingRef.current) return
        playingRef.current = nowPlaying
        setPlaying(nowPlaying)
        if (!nowPlaying) {
          void refreshProgress()
          setReturns((n) => n + 1)
        }
      }),
    [refreshProgress]
  )

  // The library stays mounted under the player, so without this Tab would
  // walk through invisible tiles and Enter could start something else. It is
  // inert while the player is up, and focus goes back where it was after.
  useEffect(() => {
    if (playing) return
    const target = focusBeforePlay.current
    focusBeforePlay.current = null
    if (target?.isConnected) target.focus({ preventScroll: true })
  }, [playing])

  const rememberFocus = useCallback(() => {
    const active = document.activeElement
    focusBeforePlay.current = active instanceof HTMLElement ? active : null
  }, [])

  const play = useCallback(
    (path: string, key: string) => {
      rememberFocus()
      void window.cassette.play(path, key)
    },
    [rememberFocus]
  )

  const resumeSeries = useCallback(
    (seriesId: string) => {
      rememberFocus()
      void window.cassette.resumeSeries(seriesId)
    },
    [rememberFocus]
  )

  const handleChooseFolder = useCallback(async () => {
    await lib.chooseFolder()
    setSettings(await window.cassette.getSettings())
  }, [lib.chooseFolder])

  // ---- navigation that remembers where you were ----

  const currentKey = viewKey(view, query)

  const navigate = useCallback(
    (next: View, focus: string | null = null) => {
      const main = mainRef.current
      if (main) scrollMemory.current.set(currentKey, main.scrollTop)
      pendingFocus.current = focus
      setView(next)
    },
    [currentKey]
  )

  const changeQuery = useCallback(
    (next: string) => {
      const main = mainRef.current
      if (main) scrollMemory.current.set(currentKey, main.scrollTop)
      setQuery(next)
      if (view.name !== 'home') {
        pendingFocus.current = null
        setView({ name: 'home' })
      }
    },
    [currentKey, view.name]
  )

  // Runs before paint, so a returning view appears already at its old scroll
  // position rather than jumping there a frame later.
  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return
    main.scrollTop = scrollMemory.current.get(currentKey) ?? 0
    const focus = pendingFocus.current
    pendingFocus.current = null
    if (!focus) return
    const target = main.querySelector<HTMLElement>(`[data-return="${CSS.escape(focus)}"]`)
    target?.focus({ preventScroll: true })
  }, [currentKey])

  const openSeries = useCallback(
    (id: string) => navigate({ name: 'series', id }, 'page-start'),
    [navigate]
  )
  const goHome = useCallback(
    (focus: string | null = null) => navigate({ name: 'home' }, focus),
    [navigate]
  )

  // ---- keyboard ----

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || playingRef.current) return
      const target = e.target as HTMLElement | null
      // Only boxes you type into count: a focused switch or slider should not
      // stop Escape or / from working.
      const typing =
        (target instanceof HTMLInputElement &&
          !['checkbox', 'radio', 'range', 'color', 'button'].includes(target.type)) ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true

      if ((e.key === '/' && !typing) || (e.key === 'f' && e.ctrlKey && !e.altKey)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      // Escape backs out of wherever you are to the library, the way the
      // browser's back does, and lands on the tile you came from.
      if (e.key === 'Escape' && !typing && view.name !== 'home') {
        e.preventDefault()
        goHome(view.name === 'series' ? `series:${view.id}` : null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, goHome])

  // ---- colour ----

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

  // ---- screens ----

  if (lib.loading && !library) {
    return (
      <div className="loading-screen" role="status">
        <Logo variant="mark" className="loading-mark" />
        <p>Reading your library…</p>
      </div>
    )
  }

  if (!library) {
    return (
      <SetupView
        scanning={lib.scanning}
        folder={lib.scanningFolder}
        progress={lib.scanProgress}
        onChoose={() => void handleChooseFolder()}
        onCancel={() => void lib.cancelScan()}
      />
    )
  }

  return (
    <div
      className="shell"
      style={{ ['--ambient' as string]: ambient.rgb }}
      inert={playing}
    >
      <Header
        ref={searchRef}
        current={view.name === 'settings' ? 'settings' : 'library'}
        query={query}
        onQueryChange={changeQuery}
        onLibrary={() => {
          // The Library button is "take me to the top of my library": it
          // clears a search, and returning to it from elsewhere keeps its place.
          if (query) changeQuery('')
          else if (view.name === 'home') mainRef.current?.scrollTo({ top: 0 })
          else goHome(view.name === 'series' ? `series:${view.id}` : null)
        }}
        onSettings={() => navigate({ name: 'settings' }, 'page-start')}
        scanning={lib.scanning}
        scanProgress={lib.scanProgress}
      />

      <UpdateBanner />

      {/* `main` is also what the automated capture scrolls (testCapture.ts). */}
      <main className="main" ref={mainRef} key={currentKey.startsWith('home:') ? 'home' : currentKey}>
        {view.name === 'home' && (
          <HomeView
            library={library}
            progress={progress}
            metadata={metadata}
            metadataBusy={metadataBusy}
            query={query}
            scope={scope}
            onScopeChange={setScope}
            onClearQuery={() => changeQuery('')}
            onOpenSeries={openSeries}
            onPlay={play}
            onResumeSeries={resumeSeries}
            onChooseFolder={() => void handleChooseFolder()}
            onRescan={() => void lib.rescan()}
            scanning={lib.scanning}
            minimumMinutes={settings?.minimumDurationMinutes ?? null}
          />
        )}

        {view.name === 'series' &&
          (series ? (
            <SeriesView
              series={series}
              progress={progress}
              metadata={metadata}
              lastPlayedKey={lastPlayedKey}
              returns={returns}
              onBack={() => goHome(`series:${series.id}`)}
              onPlay={play}
              onResumeSeries={resumeSeries}
              onRefreshProgress={() => void refreshProgress()}
            />
          ) : (
            <div className="page">
              <div className="empty-state">
                <p className="empty-title">That series is no longer in your library.</p>
                <p className="empty-text">
                  It was not found in the last scan. If you moved it, rescan from
                  Settings once it is back in your media folder.
                </p>
                <button className="btn btn-ghost" onClick={() => goHome()}>
                  Back to the library
                </button>
              </div>
            </div>
          ))}

        {view.name === 'settings' && (
          <SettingsView
            settings={settings}
            bindings={bindings}
            library={library}
            metadata={metadata}
            scanning={lib.scanning}
            scanProgress={lib.scanProgress}
            scrollRoot={mainRef}
            onChooseFolder={() => void handleChooseFolder()}
            onRescan={() => void lib.rescan()}
            onCancelScan={() => void lib.cancelScan()}
            onAssign={(descriptor, actionId) => {
              void window.cassette.assignBinding(descriptor, actionId).then(setBindings)
            }}
            onChangeSettings={(changes) => {
              void window.cassette.updateSettings(changes).then(setSettings)
            }}
            onResetBindings={() => {
              void window.cassette.resetBindings().then(setBindings)
            }}
            onMetadata={setMetadata}
          />
        )}
      </main>
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type {
  KeyBindings,
  MetadataProgressInfo,
  MetadataSnapshot,
  Settings
} from '@shared/types'
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
import { glow, prefersReducedMotion } from '../shared/motion'

type View = { name: 'home' } | { name: 'series'; id: string } | { name: 'settings' }

/**
 * A box you type into. A focused switch or slider does not count: it should
 * not stop Escape or / from working, and it has no letters to protect.
 */
function isTextEntry(element: Element | null): boolean {
  if (element instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'color', 'button', 'submit'].includes(element.type)
  }
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

/**
 * Moves between screens as one motion rather than a cut.
 *
 * The browser's view transitions hold a picture of the old screen, apply the
 * change, and cross between the two; forward slides the new screen in from
 * the right, back from the left, so going into a series and coming out of it
 * read as opposites. It costs one short full-window animation per navigation
 * and nothing in between. Reduced motion gets the plain cut, and so does a
 * change made in the dark, while the lights are coming back up after the
 * player: nobody sees it, and the veil would be captured into the picture.
 */
function transitionTo(direction: 'forward' | 'back', update: () => void, instant = false): void {
  if (
    instant ||
    prefersReducedMotion() ||
    document.visibilityState === 'hidden' ||
    typeof document.startViewTransition !== 'function'
  ) {
    update()
    return
  }
  document.documentElement.dataset.nav = direction
  const transition = document.startViewTransition(() => flushSync(update))
  // One cut short (the window hidden mid-way, another navigation) has still
  // made its change; only the animation is lost, which is nothing to report.
  transition.ready.catch(() => undefined)
  transition.finished.catch(() => undefined)
}

/**
 * How long the library takes to go dark before the player opens. Long enough
 * to be felt as the lights going down, short enough not to feel like waiting.
 */
const LIGHTS_DOWN_MS = 340
/** If the player has not opened this long after asking, bring the lights back. */
const LIGHTS_GIVE_UP_MS = 2500
/** How long the launch cascade is given before the page is left to itself. */
const LAUNCH_MS = 1400

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
  /** An artwork lookup under way, or null. */
  const [artwork, setArtwork] = useState<MetadataProgressInfo | null>(null)

  const [playing, setPlaying] = useState(false)
  /** Play was pressed and the library is going dark; the player is not up yet. */
  const [opening, setOpening] = useState(false)
  /** The first moments of the library on screen, which get an entrance. */
  const [launching, setLaunching] = useState(true)
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
      }),
    []
  )

  useEffect(
    () =>
      window.cassette.onMetadataProgress((p) =>
        setArtwork(p.total > 0 && p.done < p.total ? p : null)
      ),
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
          // The player can change settings too (the sleep timer's night light).
          void window.cassette.getSettings().then(setSettings)
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

  // The player is up: whatever was dimming the lights has done its job.
  useEffect(() => {
    if (playing) setOpening(false)
  }, [playing])

  /*
   * Starting something takes the lights down first: the library fades to
   * black, and the player opens in the dark (its loading screen fades up out
   * of it). Closing reverses it — see the veil below and stopPlayback in main.
   * A second press while the lights are going down is the same press.
   */
  const openingRef = useRef(false)
  const startInTheDark = useCallback(
    (start: () => Promise<unknown>) => {
      if (openingRef.current) return
      rememberFocus()
      openingRef.current = true
      setOpening(true)
      setTimeout(
        () => {
          openingRef.current = false
          void start()
            .catch(() => undefined)
            .finally(() => {
              // A file that fails to open must not leave the room dark.
              setTimeout(() => {
                if (!playingRef.current) setOpening(false)
              }, LIGHTS_GIVE_UP_MS)
            })
        },
        prefersReducedMotion() ? 0 : LIGHTS_DOWN_MS
      )
    },
    [rememberFocus]
  )

  const play = useCallback(
    (path: string, key: string) => startInTheDark(() => window.cassette.play(path, key)),
    [startInTheDark]
  )

  const resumeSeries = useCallback(
    (seriesId: string) => startInTheDark(() => window.cassette.resumeSeries(seriesId)),
    [startInTheDark]
  )

  const handleChooseFolder = useCallback(async () => {
    await lib.chooseFolder()
    setSettings(await window.cassette.getSettings())
  }, [lib.chooseFolder])

  // ---- navigation that remembers where you were ----

  const currentKey = viewKey(view, query)

  /**
   * Where Back goes. The library is the root, so going there clears it; any
   * other screen remembers the one it was opened from, so settings opened
   * from a series goes back to that series, not to the library.
   */
  const history = useRef<View[]>([])

  const navigate = useCallback(
    (
      next: View,
      focus: string | null = null,
      direction?: 'forward' | 'back',
      instant = false
    ) => {
      const main = mainRef.current
      if (main) scrollMemory.current.set(currentKey, main.scrollTop)
      if (next.name === 'home') history.current = []
      else if (direction !== 'back') history.current.push(view)
      setLaunching(false)
      transitionTo(
        direction ?? (next.name === 'home' ? 'back' : 'forward'),
        () => {
          pendingFocus.current = focus
          setView(next)
        },
        instant
      )
    },
    [currentKey, view]
  )

  /** One step back, landing on whatever opened the screen being left. */
  const goBack = useCallback(() => {
    if (view.name === 'home') return
    const previous = history.current.pop() ?? { name: 'home' as const }
    // Coming out of a series onto the library lands on that series' tile.
    const focus =
      view.name === 'series' && previous.name === 'home' ? `series:${view.id}` : 'page-start'
    navigate(previous, focus, 'back')
  }, [view, navigate])

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
    // A series always opens on the episode you are on, and scrolls itself
    // there (see SeriesView); every other screen comes back where it was.
    if (!currentKey.startsWith('series:')) {
      main.scrollTop = scrollMemory.current.get(currentKey) ?? 0
    }
    const focus = pendingFocus.current
    pendingFocus.current = null
    if (!focus) return
    const target = main.querySelector<HTMLElement>(`[data-return="${CSS.escape(focus)}"]`)
    target?.focus({ preventScroll: true })
    // Back from the player onto an episode: say which one, as the lights come up.
    if (target && focus.startsWith('episode:')) glow(target, 300)
  }, [currentKey])

  const openSeries = useCallback(
    (id: string) => navigate({ name: 'series', id }, 'page-start'),
    [navigate]
  )
  const goHome = useCallback(
    (focus: string | null = null) => navigate({ name: 'home' }, focus),
    [navigate]
  )

  /*
   * Closing the player lands on the episode you were watching: its series
   * opens on that season with the row in view and focused, wherever playback
   * was started from. Back from there is the screen you came from. A film has
   * no page of its own, so closing one leaves you where you were.
   */
  const handledReturns = useRef(returns)
  useEffect(() => {
    if (returns === handledReturns.current) return
    handledReturns.current = returns
    if (!library || !lastPlayedKey) return
    const home = library.series.find((s) =>
      s.seasons.some((season) => season.episodes.some((e) => e.file.key === lastPlayedKey))
    )
    if (!home) return
    if (view.name === 'series' && view.id === home.id) return
    // Made in the dark, while the lights come back up, so it is not animated.
    navigate({ name: 'series', id: home.id }, `episode:${lastPlayedKey}`, 'back', true)
    history.current.push(view)
  }, [returns, library, lastPlayedKey, view, navigate])

  // ---- keyboard ----

  // Typing beats every binding. The main process resolves bindings before the
  // page sees a key, so it has to be told when a text box has focus.
  useEffect(() => {
    const report = (): void => window.cassette.setTyping(isTextEntry(document.activeElement))
    // On focusout the next element is not focused yet, so look a tick later.
    const later = (): void => void setTimeout(report, 0)
    document.addEventListener('focusin', report)
    document.addEventListener('focusout', later)
    report()
    return () => {
      document.removeEventListener('focusin', report)
      document.removeEventListener('focusout', later)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || playingRef.current) return
      const typing = isTextEntry(e.target as Element | null)

      if ((e.key === '/' && !typing) || (e.key === 'f' && e.ctrlKey && !e.altKey)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      // Escape, Alt+Left and the mouse's back button all step back one screen,
      // the way a browser's back does.
      const back = (e.key === 'Escape' && !typing) || (e.key === 'ArrowLeft' && e.altKey)
      if (back && view.name !== 'home') {
        e.preventDefault()
        goBack()
      }
    }
    const onMouse = (e: MouseEvent): void => {
      if (playingRef.current || e.button !== 3) return
      e.preventDefault()
      goBack()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [view, goBack])

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

  // The entrance plays once, when the library first appears.
  const hasLibrary = library !== null
  useEffect(() => {
    if (!hasLibrary) return
    const timer = setTimeout(() => setLaunching(false), LAUNCH_MS)
    return () => clearTimeout(timer)
  }, [hasLibrary])

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
      style={{ ['--ambient' as string]: `rgb(${ambient.rgb})` }}
      data-launch={launching || undefined}
      inert={playing || opening}
    >
      <Header
        ref={searchRef}
        current={view.name === 'settings' ? 'settings' : 'library'}
        query={query}
        onQueryChange={changeQuery}
        onBack={view.name === 'home' ? null : goBack}
        onLibrary={() => {
          // The Library button is "take me to the top of my library": it
          // clears a search, and returning to it from elsewhere keeps its place.
          if (query) changeQuery('')
          else if (view.name === 'home') {
            mainRef.current?.scrollTo({
              top: 0,
              behavior: prefersReducedMotion() ? 'auto' : 'smooth'
            })
          }
          else goHome(view.name === 'series' ? `series:${view.id}` : null)
        }}
        onSettings={() => {
          if (view.name === 'settings') goBack()
          else navigate({ name: 'settings' }, 'page-start')
        }}
        scanning={lib.scanning}
        scanProgress={lib.scanProgress}
        artwork={artwork}
      />

      {/* `main` is also what the automated capture scrolls (testCapture.ts). */}
      <main className="main" ref={mainRef} key={currentKey.startsWith('home:') ? 'home' : currentKey}>
        {view.name === 'home' && (
          <HomeView
            library={library}
            progress={progress}
            metadata={metadata}
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
            onUnassign={(descriptor) => {
              void window.cassette.unassignBinding(descriptor).then(setBindings)
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

      {/* Floats over the page from the corner; takes no place in its layout. */}
      <UpdateBanner />

      {/* The lights: down while the player opens and while it is up. */}
      <div className={opening || playing ? 'veil is-down' : 'veil'} aria-hidden="true" />
    </div>
  )
}

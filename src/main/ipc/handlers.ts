import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC, type Library, type MediaFile, type Settings } from '@shared/types'
import { scanLibrary } from '../library/scanner'
import { findNext, findPrevious, type PlayableItem } from '../library/playQueue'
import { resumeTarget } from '../library/resume'
import { findLocalSubtitles } from '../subs/localSubtitles'
import { scanForSubtitles, scanOne, type ScanScope } from '../subs/subtitleScan'
import type { SleepTimer } from '../player/sleepTimer'
import { libraryFile } from '../state/paths'
import { bundledKeyAvailability, withBundledKeys } from '../state/bundledKeys'
import { readJson, writeJsonAtomic } from '../state/atomicJson'
import type { ProgressStore } from '../state/progressStore'
import type { SettingsStore } from '../state/settingsStore'
import type { MpvController } from '../mpv/mpvController'
import type { OverlayInteraction } from '../windows/overlayInteraction'
import type { BindingsStore } from '../input/bindingsStore'
import type { MetadataStore } from '../tmdb/metadataStore'
import { TmdbClient } from '../tmdb/tmdbClient'

export interface AppContext {
  settings: SettingsStore
  progress: ProgressStore
  mpv: MpvController
  mainWindow: BrowserWindow
  videoWindow: BrowserWindow
  overlayWindow: BrowserWindow
  overlayInteraction: OverlayInteraction
  bindings: BindingsStore
  metadata: MetadataStore
  sleepTimer: SleepTimer
  /** Pushes timer and autoplay state into the overlay. */
  publishSessionFlags: () => void
  onSettingsChanged?: (settings: Settings) => void
  /** Key of the file currently loaded, so progress ticks know where to go. */
  currentKey: string | null
  /** Cached library, used to resolve next/previous without re-reading disk. */
  library: Library | null
}

/** Shows the video and control windows and loads an item. */
export async function playItem(ctx: AppContext, item: PlayableItem): Promise<void> {
  ctx.currentKey = item.key
  const resumeAt = ctx.progress.get(item.key)?.positionSeconds ?? 0
  ctx.mpv.setNeighbours(
    ctx.library ? findPrevious(ctx.library, item.key) !== null : false,
    ctx.library ? findNext(ctx.library, item.key) !== null : false
  )
  ctx.videoWindow.show()
  ctx.overlayWindow.show()
  ctx.overlayInteraction.start()
  // The main window keeps keyboard focus; the other two are non-focusable.
  ctx.mainWindow.focus()
  await ctx.mpv.load(item.path, resumeAt, item.label)
}

export async function stopPlayback(ctx: AppContext): Promise<void> {
  await ctx.mpv.stop()
  ctx.currentKey = null
  ctx.overlayInteraction.stop()
  ctx.overlayWindow.hide()
  ctx.videoWindow.hide()

  // Fullscreen belongs to the player, not the library. Closing an episode
  // while fullscreen used to leave the window that way, which was wrong on its
  // own and also left the screen black: the two windows covering the library
  // had just been hidden, and on this compositing path nothing repaints what
  // they were covering. The next thing to disturb the window — switching away
  // and back — brought the picture back, which is what made it look like an
  // alt-tab problem.
  if (ctx.mainWindow.isFullScreen()) {
    ctx.mainWindow.setFullScreen(false)
    ctx.mpv.setFullscreen(false)
  }

  // Ask for a repaint regardless. Leaving fullscreen resizes the window, which
  // forces one by itself, but closing a windowed player does not — and the
  // same stale area can be left behind there.
  if (!ctx.mainWindow.isDestroyed()) ctx.mainWindow.webContents.invalidate()

  await ctx.progress.save()
}


/** Fills in artwork after a scan, in the background so browsing is not held up. */
export function enrichInBackground(ctx: AppContext): void {
  const token = withBundledKeys(ctx.settings.get()).tmdbApiKey
  if (!token || !ctx.library) return
  const library = ctx.library
  void ctx.metadata
    .enrich(library, new TmdbClient(token), {
      onProgress: (progress) => {
        if (!ctx.mainWindow.isDestroyed()) {
          ctx.mainWindow.webContents.send(IPC.metadataProgress, progress)
        }
      }
    })
    .then(() => {
      if (!ctx.mainWindow.isDestroyed()) {
        ctx.mainWindow.webContents.send(IPC.metadataReady, ctx.metadata.snapshot())
      }
    })
}

/**
 * The scan currently running, if there is one.
 *
 * Scanning spawns mpv once per file to read its duration. Two scans at once
 * would double that for no benefit and make the app noticeably worse to use
 * while they ran, so a second request joins the first rather than starting
 * another.
 */
let inFlightScan: { promise: Promise<Library>; controller: AbortController } | null = null

/** Stops a scan in progress. The library is left as it was. */
export function cancelScan(): boolean {
  if (!inFlightScan) return false
  inFlightScan.controller.abort()
  return true
}

export function registerHandlers(ctx: AppContext): void {
  const handle = (channel: string, fn: (...args: never[]) => unknown): void => {
    ipcMain.handle(channel, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  }

  /** Runs a scan, reporting progress and refusing to start a second one. */
  const runScan = async (roots: string[]): Promise<Library> => {
    if (inFlightScan) return inFlightScan.promise

    const controller = new AbortController()
    const report = (done: number, total: number): void => {
      if (!ctx.mainWindow.isDestroyed()) {
        ctx.mainWindow.webContents.send(IPC.scanProgress, { done, total })
      }
    }

    const promise = (async () => {
      try {
        const library = await scanLibrary(roots, {
          minimumDurationMinutes: ctx.settings.get().minimumDurationMinutes,
          onProgress: report,
          signal: controller.signal
        })
        await writeJsonAtomic(libraryFile(), library)
        ctx.library = library
        enrichInBackground(ctx)
        return library
      } finally {
        inFlightScan = null
        report(0, 0)
      }
    })()

    inFlightScan = { promise, controller }
    return promise
  }

  handle(IPC.chooseFolder, async () => {
    const result = await dialog.showOpenDialog(ctx.mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose your media folder'
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle(IPC.getSettings, () => ctx.settings.get())

  handle(IPC.getBundledKeys, () => bundledKeyAvailability())

  handle(IPC.setRoots, async (roots: string[]): Promise<Library> => {
    await ctx.settings.setRoots(roots)
    return runScan(roots)
  })

  handle(IPC.getLibrary, async () => {
    const library = await readJson<Library | null>(libraryFile(), null)
    ctx.library = library
    return library
  })

  handle(IPC.rescan, () => runScan(ctx.settings.get().libraryRoots))

  // Stopping is answered with the library that is already loaded, so the
  // caller has something to show rather than an error to handle.
  handle(IPC.cancelScan, async (): Promise<Library | null> => {
    cancelScan()
    return ctx.library
  })

  handle(IPC.getProgress, () => ctx.progress.all())

  handle(IPC.play, async (path: string, key: string) => {
    // seriesId is not needed here: next/previous are resolved from the cached
    // library by key, so the renderer only has to name what it wants played.
    await playItem(ctx, { key, path, label: resolveLabel(ctx, key, path), seriesId: null })
  })

  handle(IPC.stop, () => stopPlayback(ctx))
  handle(IPC.togglePause, () => ctx.mpv.togglePause())
  handle(IPC.seekAbsolute, (seconds: number) => ctx.mpv.seekAbsolute(seconds))
  handle(IPC.seekRelative, (seconds: number) => ctx.mpv.seekRelative(seconds))
  handle(IPC.setVolume, (volume: number) => ctx.mpv.setVolume(volume))
  handle(IPC.toggleMute, () => ctx.mpv.toggleMute())
  handle(IPC.setSpeed, (speed: number) => ctx.mpv.setSpeed(speed))
  handle(IPC.setSubtitleTrack, (id: number | null) => ctx.mpv.setSubtitleTrack(id))
  handle(IPC.setAudioTrack, (id: number) => ctx.mpv.setAudioTrack(id))
  handle(IPC.setSubtitleDelay, (ms: number) => ctx.mpv.setSubtitleDelay(ms))

  handle(IPC.nextEpisode, async () => {
    if (!ctx.library || !ctx.currentKey) return
    const next = findNext(ctx.library, ctx.currentKey)
    if (next) await playItem(ctx, next)
  })

  handle(IPC.previousEpisode, async () => {
    if (!ctx.library || !ctx.currentKey) return
    const previous = findPrevious(ctx.library, ctx.currentKey)
    if (previous) await playItem(ctx, previous)
  })

  handle(IPC.toggleFullscreen, () => {
    const next = !ctx.mainWindow.isFullScreen()
    ctx.mainWindow.setFullScreen(next)
    ctx.mpv.setFullscreen(next)
  })

  handle(IPC.updateSettings, async (changes: Partial<Settings>) => {
    const next = await ctx.settings.patch(changes)
    // Appearance and audio changes should show up without restarting playback.
    if (changes.subtitleStyle) await ctx.mpv.applySubtitleStyle(next.subtitleStyle)
    if (changes.nightAudio !== undefined) await ctx.mpv.setNightAudio(next.nightAudio)
    ctx.onSettingsChanged?.(next)
    return next
  })

  handle(IPC.markWatched, async (key: string, watched: boolean) => {
    const existing = ctx.progress.get(key)
    const duration = existing?.durationSeconds ?? 0
    if (watched) {
      // Park the position at the end so Continue Watching drops it and the
      // next episode becomes the one on offer.
      ctx.progress.record(key, Math.max(duration, 1), Math.max(duration, 1))
    } else {
      ctx.progress.record(key, 0, duration)
    }
    await ctx.progress.save()
  })

  handle(IPC.resumeSeries, async (seriesId: string) => {
    if (!ctx.library) return
    const series = ctx.library.series.find((s) => s.id === seriesId)
    if (!series) return
    const target = resumeTarget(series, new Map(ctx.progress.all().map((r) => [r.key, r])))
    if (!target) return
    await playItem(ctx, {
      key: target.episode.file.key,
      path: target.episode.file.path,
      label: `${series.title} — ${target.episode.label}`,
      seriesId: series.id
    })
  })

  handle(IPC.listLocalSubtitles, async () => {
    const path = ctx.mpv.getState().path
    return path ? findLocalSubtitles(path) : []
  })

  handle(IPC.useSubtitleFile, (path: string) => ctx.mpv.addSubtitleFile(path))

  handle(IPC.scanSubtitles, async (scope: ScanScope) => {
    if (!ctx.library) return []
    return scanForSubtitles(ctx.library, scope, withBundledKeys(ctx.settings.get()), (progress) => {
      if (!ctx.mainWindow.isDestroyed()) {
        ctx.mainWindow.webContents.send(IPC.subtitleScanProgress, progress)
      }
    })
  })

  /**
   * Searches for subtitles for the file playing right now, without leaving it.
   *
   * Whatever is found is added as extra tracks straight away, so the menu it
   * was triggered from fills in rather than asking for a restart.
   */
  handle(IPC.findSubtitlesNow, async () => {
    const path = ctx.mpv.getState().path
    if (!path || !ctx.library) return null

    const target = findFile(ctx.library, path)
    if (!target) return null

    const result = await scanOne(target.file, target.label, withBundledKeys(ctx.settings.get()))
    await loadExternalSubtitles(ctx, path)
    return result
  })

  handle(IPC.nextChapter, () => ctx.mpv.nextChapter())
  handle(IPC.previousChapter, () => ctx.mpv.previousChapter())

  handle(IPC.setSleepTimer, (seconds: number | null) => {
    if (seconds === null) ctx.sleepTimer.clear()
    else ctx.sleepTimer.setDuration(seconds)
    ctx.publishSessionFlags()
  })

  handle(IPC.setSleepAfterEpisode, () => {
    ctx.sleepTimer.setAfterEpisode()
    ctx.publishSessionFlags()
  })

  handle(IPC.getMetadata, () => ctx.metadata.snapshot())

  handle(IPC.refreshMetadata, async (force?: boolean) => {
    const token = withBundledKeys(ctx.settings.get()).tmdbApiKey
    if (!token || !ctx.library) return ctx.metadata.snapshot()
    await ctx.metadata.enrich(ctx.library, new TmdbClient(token), {
      force: force === true,
      onProgress: (progress) => {
        if (!ctx.mainWindow.isDestroyed()) {
          ctx.mainWindow.webContents.send(IPC.metadataProgress, progress)
        }
      }
    })
    return ctx.metadata.snapshot()
  })

  handle(IPC.getBindings, () => ctx.bindings.all())
  handle(IPC.assignBinding, (descriptor: string, actionId: string) =>
    ctx.bindings.assign(descriptor, actionId)
  )
  handle(IPC.resetBindings, () => ctx.bindings.reset())

  // A plain message, not invoke: it fires on every pointer move over the
  // controls and must not pay for a round trip.
  ipcMain.on(IPC.setOverlayInteractive, (_e, interactive: boolean) => {
    if (ctx.overlayWindow.isDestroyed()) return
    ctx.overlayWindow.setIgnoreMouseEvents(!interactive, { forward: true })
  })
}

/**
 * Adds every subtitle file beside the video that mpv is not already showing.
 *
 * mpv picks up siblings named after the video on its own, but not ones in a
 * `Subs` folder, and not files that appear after it opened. Adding them
 * without selecting anything leaves the track that was chosen for the user's
 * preferred language switched on.
 */
export async function loadExternalSubtitles(ctx: AppContext, path: string): Promise<number> {
  const already = ctx.mpv.loadedSubtitlePaths()
  const found = await findLocalSubtitles(path)
  let added = 0
  for (const sub of found) {
    if (already.has(sub.path.toLowerCase())) continue
    try {
      await ctx.mpv.addSubtitleFile(sub.path, sub.label, sub.lang)
      added++
    } catch {
      // A subtitle mpv refuses to parse should not stop the others loading.
    }
  }
  if (added > 0) await ctx.mpv.refreshTracks()
  return added
}

/** The library entry for a path, with the label the scan report should use. */
function findFile(
  library: Library,
  path: string
): { file: MediaFile; label: string } | null {
  const wanted = path.toLowerCase()
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        if (episode.file.path.toLowerCase() === wanted) {
          return { file: episode.file, label: `${series.title} ${episode.label}` }
        }
      }
    }
  }
  const movie = library.movies.find((m) => m.file.path.toLowerCase() === wanted)
  return movie ? { file: movie.file, label: movie.title } : null
}

/** Best label we can build for an item the renderer asked for by path. */
function resolveLabel(ctx: AppContext, key: string, path: string): string {
  if (!ctx.library) return path
  for (const series of ctx.library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        if (episode.file.key === key) return `${series.title} — ${episode.label}`
      }
    }
  }
  const movie = ctx.library.movies.find((m) => m.file.key === key)
  return movie ? movie.title : path
}

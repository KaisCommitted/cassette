import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC, type Library, type Settings } from '@shared/types'
import { scanLibrary } from '../library/scanner'
import { findNext, findPrevious, type PlayableItem } from '../library/playQueue'
import { resumeTarget } from '../library/resume'
import { findLocalSubtitles } from '../subs/localSubtitles'
import { scanForSubtitles, type ScanScope } from '../subs/subtitleScan'
import type { SleepTimer } from '../player/sleepTimer'
import { libraryFile } from '../state/paths'
import { readJson, writeJsonAtomic } from '../state/atomicJson'
import type { ProgressStore } from '../state/progressStore'
import type { SettingsStore } from '../state/settingsStore'
import type { MpvController } from '../mpv/mpvController'
import type { OverlayInteraction } from '../windows/overlayInteraction'
import type { BindingsStore } from '../input/bindingsStore'

export interface AppContext {
  settings: SettingsStore
  progress: ProgressStore
  mpv: MpvController
  mainWindow: BrowserWindow
  videoWindow: BrowserWindow
  overlayWindow: BrowserWindow
  overlayInteraction: OverlayInteraction
  bindings: BindingsStore
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
  await ctx.progress.save()
}

export function registerHandlers(ctx: AppContext): void {
  const handle = (channel: string, fn: (...args: never[]) => unknown): void => {
    ipcMain.handle(channel, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  }

  handle(IPC.chooseFolder, async () => {
    const result = await dialog.showOpenDialog(ctx.mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose your media folder'
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle(IPC.getSettings, () => ctx.settings.get())

  handle(IPC.setRoots, async (roots: string[]): Promise<Library> => {
    await ctx.settings.setRoots(roots)
    const library = await scanLibrary(roots)
    await writeJsonAtomic(libraryFile(), library)
    ctx.library = library
    return library
  })

  handle(IPC.getLibrary, async () => {
    const library = await readJson<Library | null>(libraryFile(), null)
    ctx.library = library
    return library
  })

  handle(IPC.rescan, async (): Promise<Library> => {
    const library = await scanLibrary(ctx.settings.get().libraryRoots)
    await writeJsonAtomic(libraryFile(), library)
    ctx.library = library
    return library
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
    return scanForSubtitles(ctx.library, scope, ctx.settings.get(), (progress) => {
      if (!ctx.mainWindow.isDestroyed()) {
        ctx.mainWindow.webContents.send(IPC.subtitleScanProgress, progress)
      }
    })
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

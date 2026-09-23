import { app, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { IPC, type Library, type PlaybackState } from '@shared/types'
import { describeKey } from './input/descriptors'
import { BindingsStore } from './input/bindingsStore'
import { GlobalHotkeyMachine } from './input/globalHotkey'
import { startNativeHook } from './input/nativeHook'
import { findNext, findPrevious } from './library/playQueue'
import { SleepTimer } from './player/sleepTimer'
import { chooseAudioTrack, chooseSubtitleTrack } from './player/trackChoice'
import { killRunningProbes } from './library/mediaProbe'
import {
  cancelScan,
  enrichInBackground,
  loadExternalSubtitles,
  playItem,
  registerHandlers,
  stopPlayback,
  type AppContext
} from './ipc/handlers'
import { MpvController } from './mpv/mpvController'
import { ProgressStore } from './state/progressStore'
import { SettingsStore } from './state/settingsStore'
import { readJson } from './state/atomicJson'
import {
  keybindsFile,
  libraryFile,
  cleanupStaleTemps,
  migrateLegacyData,
  progressFile,
  settingsFile
} from './state/paths'
import { createMainWindow } from './windows/mainWindow'
import { createOverlayWindow } from './windows/overlayWindow'
import { createVideoWindow } from './windows/videoWindow'
import { createOverlayInteraction } from './windows/overlayInteraction'
import { ThumbnailService } from './thumbs/thumbnails'
import { serveThumbnails } from './thumbs/thumbProtocol'
import { MetadataStore } from './tmdb/metadataStore'
import { ArtworkCache } from './tmdb/artworkCache'
import { serveArtwork } from './tmdb/artProtocol'
import { registerCustomSchemes } from './protocolSchemes'
import { serveRenderer } from './appProtocol'
import { scheduleTestCapture } from './testCapture'
import { cleanUpdaterCache, initUpdater } from './updater'

/**
 * mpv draws into a native child window, but Chromium presents through
 * DirectComposition, whose visual tree is composited independently of ordinary
 * child windows — so mpv's picture never reached the screen and playback was
 * audio over an empty window. Turning DirectComposition off puts Chromium back
 * on a normal swapchain and restores the usual child-window z-order.
 *
 * This is far narrower than disabling hardware acceleration outright, which
 * also stopped the app's own windows painting. It pairs with `--d3d11-flip=no`
 * on the mpv side; neither works alone.
 */
app.commandLine.appendSwitch('disable-direct-composition')

/**
 * This was tested, and it is not optional.
 *
 * It was briefly a setting, on the theory that the workaround might have been
 * left over from when mpv drew into the main window rather than one of its
 * own. Turning it off produces a black player — no picture, fullscreen or
 * windowed, with nothing else changed. So the flag is load-bearing, and the
 * cost it imposes on the rest of the app is the price of video working.
 *
 * That cost is real and permanent: every repaint in the whole app, not just
 * the player, goes through the slower path. Anything that has to be composited
 * across the full window is therefore worth more here than it looks.
 *
 * Removing it for good needs a different architecture — video rendered into
 * the page as a texture rather than into a window of its own — which in
 * Electron means giving up mpv.
 */
const legacyCompositing = true

/**
 * One Cassette at a time.
 *
 * A second copy is not a harmless duplicate: both write the same settings,
 * watch history and library files, so whichever saves last wins and the other
 * one's progress is lost. Both also start their own mpv, and both install the
 * global hotkey, so the pause-and-hide key fires twice and the two disagree
 * about what is hidden.
 *
 * It is easy to end up here by accident, because that same hotkey hides the
 * window: an app you cannot see looks like an app you closed, so you launch it
 * again. Handing the launch to the copy already running turns that mistake
 * into exactly what was wanted — the window comes back.
 */
const isOnlyInstance = app.requestSingleInstanceLock()
if (!isOnlyInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = ctx?.mainWindow
    if (!window || window.isDestroyed()) return
    window.show()
    if (window.isMinimized()) window.restore()
    window.focus()
  })
}

/**
 * A failed background operation must never end the app.
 *
 * Node ends the process on an unhandled rejection, and in a desktop app that
 * means the windows stay on screen and simply stop answering — which reads as
 * a freeze rather than a crash, with nothing to show for it.
 *
 * There is plenty here that can reject through no fault of the user: every mpv
 * command rejects if the player does not reply within five seconds or answers
 * with an error, and closing a file mid-load makes the commands still queued
 * behind it fail by definition. None of that is worth losing what you were
 * watching over.
 */
process.on('unhandledRejection', (reason) => {
  console.error('[cassette] unhandled rejection:', reason)
})

/**
 * The same again for exceptions that arrive outside a promise.
 *
 * The rejection net above does not catch these, and at least one real failure
 * takes this route: if mpv cannot be started — the file missing, or an
 * anti-virus holding it — the spawn reports it by emitting an error event, and
 * an error event with no listener is rethrown at the top of the process. That
 * ends the app during startup, before there is a window to say anything in, so
 * launching Cassette appears to do nothing at all.
 *
 * Losing playback is bad; losing the whole library because playback could not
 * start is worse. Everything else here keeps working without mpv.
 */
process.on('uncaughtException', (error) => {
  console.error('[cassette] uncaught exception:', error)
})

// Custom schemes must be declared before the app is ready.
registerCustomSchemes()

// The stock Edit/View/Window menu is meaningless here and steals vertical space.
Menu.setApplicationMenu(null)

let ctx: AppContext | null = null
let stopHook: (() => void) | null = null

async function bootstrap(): Promise<void> {
  // Carry over anything saved under the app's previous name before the stores
  // read from disk, or the rename would look like a fresh install.
  await migrateLegacyData()
  await cleanupStaleTemps()
  // Installers from updates already applied, which nothing else removes.
  const freed = await cleanUpdaterCache()
  if (freed > 0) {
    console.log(`[update] reclaimed ${Math.round(freed / 1e6)} MB of old installers`)
  }

  const settings = new SettingsStore(settingsFile())
  const progress = new ProgressStore(progressFile())
  const bindings = new BindingsStore(keybindsFile())
  const metadata = new MetadataStore()
  await Promise.all([settings.load(), progress.load(), bindings.load(), metadata.load()])

  // The renderer is served over app:// rather than loaded from disk, so it
  // has a real origin and can request our other custom schemes. Registered
  // before any window opens, since the first load hits it immediately.
  const thumbnails = new ThumbnailService()
  const artwork = new ArtworkCache()

  // Development serves the renderer from Vite over http, where the standalone
  // schemes work. A packaged build serves everything from app:// instead, so
  // images share the page origin.
  if (process.env.ELECTRON_RENDERER_URL) {
    serveThumbnails(thumbnails, () => ctx?.library ?? null)
    serveArtwork(artwork)
  } else {
    serveRenderer({
      rendererDir: join(__dirname, '..', 'renderer'),
      artwork,
      thumbnails,
      getLibrary: () => ctx?.library ?? null
    })
  }

  const mainWindow = createMainWindow()
  // Order matters: the video window must exist before the overlay so the
  // overlay's always-on-top level puts the controls above the picture.
  const videoWindow = createVideoWindow(mainWindow)
  const overlayWindow = createOverlayWindow(mainWindow)
  const overlayInteraction = createOverlayInteraction(mainWindow, overlayWindow)
  const mpv = new MpvController()

  /**
   * The controls only float while Cassette is the app you are using.
   *
   * They sit above the picture by being always-on-top, and always-on-top is
   * not relative to this app — it is above every window on the desktop. So
   * switching to something else during an episode left a slab of controls
   * hanging over whatever you switched to, with the video window below it.
   *
   * Tying it to focus keeps the controls above the video where they belong
   * and lets the whole app go behind, the way any other window does. The
   * video window needs no such handling: it is owned by the main window, so
   * it already follows it in the z-order.
   */
  const floatOnlyWhenActive = (): void => {
    if (overlayWindow.isDestroyed()) return
    overlayWindow.setAlwaysOnTop(mainWindow.isFocused(), 'pop-up-menu')
  }
  mainWindow.on('focus', floatOnlyWhenActive)
  mainWindow.on('blur', floatOnlyWhenActive)
  // Also when the controls appear, not only when focus changes: starting an
  // episode while the window is already in the background fires no focus
  // event at all, and the controls would come up floating over everything.
  overlayWindow.on('show', floatOnlyWhenActive)
  floatOnlyWhenActive()

  // Handlers must be registered before the renderer mounts and starts calling
  // them. Starting mpv takes hundreds of milliseconds, so it must not come
  // first — the renderer's initial getLibrary() would arrive with no handler.
  const sleepTimer = new SleepTimer({
    pause: () => {
      void mpv.setPaused(true)
      publishSessionFlags()
    }
  })

  const publishSessionFlags = (): void => {
    mpv.setSessionFlags({
      sleepRemainingSeconds: sleepTimer.remainingSeconds(),
      sleepAfterEpisode: sleepTimer.stopsAfterEpisode,
      autoplayNext: settings.get().autoplayNext
    })
  }

  ctx = {
    settings,
    progress,
    mpv,
    bindings,
    metadata,
    sleepTimer,
    publishSessionFlags,
    onSettingsChanged: () => publishSessionFlags(),
    mainWindow,
    videoWindow,
    overlayWindow,
    overlayInteraction,
    currentKey: null,
    library: await readJson<Library | null>(libraryFile(), null)
  }
  registerHandlers(ctx)

  // Artwork on launch, not only after a rescan: a library scanned before a
  // TMDB key existed would otherwise stay bare until the user thought to
  // rescan. Missing entries only, so this is a no-op once filled in.
  enrichInBackground(ctx)

  initUpdater(mainWindow)
  scheduleTestCapture(mainWindow)


  await mpv.start(videoWindow.getNativeWindowHandle(), legacyCompositing)

  const hotkey = new GlobalHotkeyMachine({
    isArmed: () => Boolean(mpv.getState().path) && !mpv.getState().paused,
    isAppFocused: () => mainWindow.isVisible(),
    pauseAndHide: async () => {
      await mpv.setPaused(true)
      overlayWindow.hide()
      videoWindow.hide()
      mainWindow.hide()
    },
    restoreAndResume: async () => {
      mainWindow.show()
      videoWindow.show()
      overlayWindow.show()
      mainWindow.focus()
      await mpv.setPaused(false)
    }
  })

  stopHook = startNativeHook({
    globalDescriptor: () => bindings.descriptorsFor('hideAndPause')[0] ?? null,
    onTrigger: () => void hotkey.trigger()
  })

  /**
   * Runs a bound action and absorbs whatever it throws.
   *
   * A keypress arriving at a bad moment — Escape while a file is still
   * loading, a seek after the file went away — makes the underlying mpv
   * command reject. That is a shrug, not a reason to take the app down with
   * it, and every caller here is a key or a mouse button with nowhere to
   * report a failure to anyway.
   */
  function runActionSafely(action: string): void {
    void runAction(action).catch((error: Error) => {
      console.error(`[cassette] ${action} failed:`, error.message)
    })
  }

  async function runAction(action: string): Promise<void> {
    const state = mpv.getState()
    switch (action) {
      case 'playPause':
        return mpv.togglePause()
      case 'seekShortBack':
        return mpv.seekRelative(-10)
      case 'seekShortForward':
        return mpv.seekRelative(10)
      case 'seekMediumBack':
        return mpv.seekRelative(-60)
      case 'seekMediumForward':
        return mpv.seekRelative(60)
      case 'speedUp':
        return mpv.setSpeed(state.speed + 0.25)
      case 'speedDown':
        return mpv.setSpeed(state.speed - 0.25)
      case 'volumeUp':
        return mpv.setVolume(state.volume + 5)
      case 'volumeDown':
        return mpv.setVolume(state.volume - 5)
      case 'mute':
        return mpv.toggleMute()
      case 'cycleSubtitleTrack':
        return mpv.cycleSubtitleTrack()
      case 'cycleAudioTrack':
        return mpv.cycleAudioTrack()
      case 'subtitleDelayDown':
        return mpv.adjustSubtitleDelay(-50)
      case 'subtitleDelayUp':
        return mpv.adjustSubtitleDelay(50)
      case 'nextEpisode':
        if (ctx?.library && ctx.currentKey) {
          const next = findNext(ctx.library, ctx.currentKey)
          if (next) await playItem(ctx, next)
        }
        return
      case 'previousEpisode':
        if (ctx?.library && ctx.currentKey) {
          const previous = findPrevious(ctx.library, ctx.currentKey)
          if (previous) await playItem(ctx, previous)
        }
        return
      case 'toggleFullscreen': {
        const next = !mainWindow.isFullScreen()
        mainWindow.setFullScreen(next)
        mpv.setFullscreen(next)
        return
      }
      case 'hideAndPause':
        await hotkey.trigger()
        return
      case 'stop':
        if (!state.path) return
        if (ctx) await stopPlayback(ctx)
        sleepTimer.clear()
        hotkey.clear()
        return
      default:
        return
    }
  }

  /** Actions that only make sense with the player open. */
  const playerOnly = new Set([
    'playPause',
    'seekShortBack',
    'seekShortForward',
    'seekMediumBack',
    'seekMediumForward',
    'speedUp',
    'speedDown',
    'cycleSubtitleTrack',
    'cycleAudioTrack',
    'subtitleDelayDown',
    'subtitleDelayUp',
    'nextEpisode',
    'previousEpisode',
    'stop'
  ])

  // Keyboard: Chromium only sees these while the main window has focus,
  // which is exactly the scope we want — nothing here is global.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const action = ctx?.bindings.resolve(
      describeKey({
        key: input.key,
        control: input.control,
        alt: input.alt,
        shift: input.shift
      })
    )
    if (!action) return
    // Typing in the search box must not fire playback shortcuts.
    if (playerOnly.has(action) && !mpv.getState().path) return
    event.preventDefault()
    runActionSafely(action)
  })

  // Mouse bindings arrive as descriptors from the overlay, which covers the
  // video while playing. They resolve through exactly the same table as keys.
  ipcMain.on(IPC.runInput, (_event, descriptor: string) => {
    const action = ctx?.bindings.resolve(descriptor)
    if (!action) return
    if (playerOnly.has(action) && !mpv.getState().path) return
    runActionSafely(action)
  })

  // Auto-advance: when an episode finishes, roll into the next one. This
  // crosses season boundaries, because findNext walks the series in order.
  mpv.on('end-file', () => {
    void (async () => {
      if (!ctx?.library || !ctx.currentKey) return
      const finishedKey = ctx.currentKey
      const state = mpv.getState()
      // Only advance on a genuine end, not on a stop or a replace-load.
      if (state.durationSeconds > 0 && state.positionSeconds < state.durationSeconds - 5) {
        return
      }
      // A sleep timer set to "after this episode" wins over autoplay.
      if (sleepTimer.shouldStopAtEpisodeEnd()) {
        await mpv.setPaused(true)
        publishSessionFlags()
        return
      }
      if (!settings.get().autoplayNext) {
        await stopPlayback(ctx)
        return
      }
      const next = findNext(ctx.library, finishedKey)
      if (next) await playItem(ctx, next)
      else await stopPlayback(ctx)
    })().catch((error: Error) => {
      console.error(`[cassette] auto-advance failed:`, error.message)
    })
  })

  /**
   * Turn on subtitles and the right audio track once a file is ready.
   *
   * Release encodes routinely leave no default subtitle track, so mpv would
   * show none at all unless asked. Matching on the language tags already in
   * the file means embedded subtitles simply appear.
   */
  let autoSelectedFor: string | null = null
  mpv.on('state', (state: PlaybackState) => {
    // Closing the player clears this, so the same episode played again gets
    // its subtitles chosen afresh. Without it, watching something, closing it
    // and starting it again left the subtitles off: the path had not changed,
    // so none of this ran a second time.
    if (!state.path) {
      autoSelectedFor = null
      return
    }
    if (state.loading || state.tracks.length === 0) return
    if (autoSelectedFor === state.path) return
    autoSelectedFor = state.path

    void (async () => {
      const config = settings.get()
      await mpv.applySubtitleStyle(config.subtitleStyle)
      await mpv.setNightAudio(config.nightAudio)

      const audio = chooseAudioTrack(state.tracks, config.preferredAudioLanguages)
      if (audio !== null) await mpv.setAudioTrack(audio)

      // Subtitle files beside the video come first: they are extra candidates
      // for the choice below, and picking before loading them would settle on
      // an embedded track while a preferred-language file sat unused.
      if (ctx) await loadExternalSubtitles(ctx, state.path!)

      const subtitle = chooseSubtitleTrack(
        mpv.getState().tracks,
        config.preferredSubtitleLanguages,
        config.autoEnableSubtitles
      )
      if (subtitle !== null) await mpv.setSubtitleTrack(subtitle)
    })().catch((error: Error) => {
      console.error(`[cassette] track selection failed:`, error.message)
    })
  })

  // Keep the countdown on screen ticking.
  const sleepTick = setInterval(() => {
    if (sleepTimer.isSet) publishSessionFlags()
  }, 1000)
  sleepTick.unref?.()

  // Persist position on a 5-second debounce while playing.
  let lastSaved = 0
  mpv.on('state', (state: PlaybackState) => {
    if (!overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC.playbackState, state)
    }
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.playbackState, state)
    }
    const key = ctx?.currentKey
    if (!key || state.durationSeconds <= 0 || state.loading) return
    progress.record(key, state.positionSeconds, state.durationSeconds)
    const now = Date.now()
    if (now - lastSaved >= 5000) {
      lastSaved = now
      // Nothing awaits this, so it has to swallow its own failures: an
      // unhandled rejection here takes the whole main process down, and the
      // app freezing is a far worse outcome than one missed save of a
      // position that will be written again five seconds later.
      void progress.save().catch((error: Error) => {
        console.error('[progress] save failed:', error.message)
      })
    }
  })

  // Leaving fullscreen with Escape is a Windows convention; keep state in sync.
  mainWindow.on('leave-full-screen', () => mpv.setFullscreen(false))
  mainWindow.on('enter-full-screen', () => mpv.setFullscreen(true))

  // CASSETTE_AUTOPLAY starts the first episode unattended, so rendering can be
  // verified by screen capture without a person driving the UI.
  if (process.env.CASSETTE_AUTOPLAY === '1') {
    void (async () => {
      const { scanLibrary } = await import('./library/scanner')
      const roots = settings.get().libraryRoots
      const library = ctx?.library ?? (roots.length > 0 ? await scanLibrary(roots) : null)
      if (!library || !ctx) return
      ctx.library = library
      const { flattenPlayable } = await import('./library/playQueue')
      const first = flattenPlayable(library)[0]
      if (first) await playItem(ctx, first)
    })().catch((error: Error) => {
      console.error(`[cassette] autoplay test hook failed:`, error.message)
    })
  }
}

// Nothing starts in a copy that lost the race: quitting is already under way,
// and booting anyway would open the very second window this prevents.
if (isOnlyInstance) void app.whenReady().then(bootstrap)

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  stopHook?.()
  // A scan spawns mpv once per file to read its duration. Those children are
  // not part of this process's tree once it is gone, so quitting mid-scan
  // would leave them running with nothing left to report to.
  cancelScan()
  const orphans = killRunningProbes()
  if (orphans > 0) console.log(`[scan] stopped ${orphans} probe(s) on quit`)
  if (!ctx) return
  void ctx.progress.save().catch(() => undefined)
  ctx.mpv.dispose()
})

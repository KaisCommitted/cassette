import { app, ipcMain, Menu } from 'electron'
import { IPC, type Library, type PlaybackState } from '@shared/types'
import { describeKey } from './input/descriptors'
import { BindingsStore } from './input/bindingsStore'
import { GlobalHotkeyMachine } from './input/globalHotkey'
import { startNativeHook } from './input/nativeHook'
import { findNext, findPrevious } from './library/playQueue'
import { playItem, registerHandlers, stopPlayback, type AppContext } from './ipc/handlers'
import { MpvController } from './mpv/mpvController'
import { ProgressStore } from './state/progressStore'
import { SettingsStore } from './state/settingsStore'
import { readJson } from './state/atomicJson'
import { keybindsFile, libraryFile, progressFile, settingsFile } from './state/paths'
import { createMainWindow } from './windows/mainWindow'
import { createOverlayWindow } from './windows/overlayWindow'
import { createVideoWindow } from './windows/videoWindow'
import { createOverlayInteraction } from './windows/overlayInteraction'
import { ThumbnailService } from './thumbs/thumbnails'
import { registerThumbProtocolSchemes, serveThumbnails } from './thumbs/thumbProtocol'

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

// Custom schemes must be declared before the app is ready.
registerThumbProtocolSchemes()

// The stock Edit/View/Window menu is meaningless here and steals vertical space.
Menu.setApplicationMenu(null)

let ctx: AppContext | null = null
let stopHook: (() => void) | null = null

async function bootstrap(): Promise<void> {
  const settings = new SettingsStore(settingsFile())
  const progress = new ProgressStore(progressFile())
  const bindings = new BindingsStore(keybindsFile())
  await Promise.all([settings.load(), progress.load(), bindings.load()])

  const mainWindow = createMainWindow()
  // Order matters: the video window must exist before the overlay so the
  // overlay's always-on-top level puts the controls above the picture.
  const videoWindow = createVideoWindow(mainWindow)
  const overlayWindow = createOverlayWindow(mainWindow)
  const overlayInteraction = createOverlayInteraction(mainWindow, overlayWindow)
  const mpv = new MpvController()

  // Handlers must be registered before the renderer mounts and starts calling
  // them. Starting mpv takes hundreds of milliseconds, so it must not come
  // first — the renderer's initial getLibrary() would arrive with no handler.
  ctx = {
    settings,
    progress,
    mpv,
    bindings,
    mainWindow,
    videoWindow,
    overlayWindow,
    overlayInteraction,
    currentKey: null,
    library: await readJson<Library | null>(libraryFile(), null)
  }
  registerHandlers(ctx)
  serveThumbnails(new ThumbnailService(), () => ctx?.library ?? null)

  await mpv.start(videoWindow.getNativeWindowHandle())

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
    void runAction(action)
  })

  // Mouse bindings arrive as descriptors from the overlay, which covers the
  // video while playing. They resolve through exactly the same table as keys.
  ipcMain.on(IPC.runInput, (_event, descriptor: string) => {
    const action = ctx?.bindings.resolve(descriptor)
    if (!action) return
    if (playerOnly.has(action) && !mpv.getState().path) return
    void runAction(action)
  })

  // Auto-advance: when an episode finishes, roll into the next one.
  mpv.on('end-file', () => {
    void (async () => {
      if (!ctx?.library || !ctx.currentKey) return
      const finishedKey = ctx.currentKey
      const state = mpv.getState()
      // Only advance on a genuine end, not on a stop or a replace-load.
      if (state.durationSeconds > 0 && state.positionSeconds < state.durationSeconds - 5) {
        return
      }
      const next = findNext(ctx.library, finishedKey)
      if (next) await playItem(ctx, next)
      else await stopPlayback(ctx)
    })()
  })

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
      void progress.save()
    }
  })

  // Leaving fullscreen with Escape is a Windows convention; keep state in sync.
  mainWindow.on('leave-full-screen', () => mpv.setFullscreen(false))
  mainWindow.on('enter-full-screen', () => mpv.setFullscreen(true))

  // MNF_AUTOPLAY starts the first episode unattended, so rendering can be
  // verified by screen capture without a person driving the UI.
  if (process.env.MNF_AUTOPLAY === '1') {
    void (async () => {
      const { scanLibrary } = await import('./library/scanner')
      const roots = settings.get().libraryRoots
      const library = ctx?.library ?? (roots.length > 0 ? await scanLibrary(roots) : null)
      if (!library || !ctx) return
      ctx.library = library
      const { flattenPlayable } = await import('./library/playQueue')
      const first = flattenPlayable(library)[0]
      if (first) await playItem(ctx, first)
    })()
  }
}

void app.whenReady().then(bootstrap)

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  stopHook?.()
  if (!ctx) return
  void ctx.progress.save()
  ctx.mpv.dispose()
})

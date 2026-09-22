import { app, BrowserWindow } from 'electron'
import { IPC, type PlaybackState } from '@shared/types'
import { describeKey, resolveBinding } from './input/resolveBinding'
import { registerHandlers, type AppContext } from './ipc/handlers'
import { MpvController } from './mpv/mpvController'
import { ProgressStore } from './state/progressStore'
import { SettingsStore } from './state/settingsStore'
import { progressFile, settingsFile } from './state/paths'
import { createMainWindow } from './windows/mainWindow'
import { createOverlayWindow } from './windows/overlayWindow'

let ctx: AppContext | null = null

async function bootstrap(): Promise<void> {
  const settings = new SettingsStore(settingsFile())
  const progress = new ProgressStore(progressFile())
  await settings.load()
  await progress.load()

  const mainWindow = createMainWindow()
  const overlayWindow = createOverlayWindow(mainWindow)
  const mpv = new MpvController()

  // Handlers must be registered before the renderer mounts and starts calling
  // them. Starting mpv takes hundreds of milliseconds, so it must not come
  // first — the renderer's initial getLibrary() would arrive with no handler.
  ctx = { settings, progress, mpv, mainWindow, overlayWindow, currentKey: null }
  registerHandlers(ctx)

  await mpv.start(mainWindow.getNativeWindowHandle())

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
      case 'toggleFullscreen':
        mainWindow.setFullScreen(!mainWindow.isFullScreen())
        return
      case 'stop':
        await mpv.stop()
        if (ctx) ctx.currentKey = null
        overlayWindow.hide()
        await progress.save()
        return
      default:
        return
    }
  }

  // Keyboard: Chromium only sees these while the main window has focus,
  // which is exactly the scope we want — nothing here is global.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const action = resolveBinding(
      describeKey({
        key: input.key,
        control: input.control,
        alt: input.alt,
        shift: input.shift
      })
    )
    if (!action) return
    event.preventDefault()
    void runAction(action)
  })

  // Persist position on a 5-second debounce while playing.
  let lastSaved = 0
  mpv.on('state', (state: PlaybackState) => {
    if (!overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send(IPC.playbackState, state)
    }
    const key = ctx?.currentKey
    if (!key || state.durationSeconds <= 0) return
    progress.record(key, state.positionSeconds, state.durationSeconds)
    const now = Date.now()
    if (now - lastSaved >= 5000) {
      lastSaved = now
      void progress.save()
    }
  })
}

void app.whenReady().then(bootstrap)

app.on('window-all-closed', () => app.quit())

app.on('before-quit', () => {
  if (!ctx) return
  void ctx.progress.save()
  ctx.mpv.dispose()
})

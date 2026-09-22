import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { followBounds } from './followBounds'

/**
 * A transparent window that floats above the video window and draws the
 * on-screen controls.
 *
 * It starts click-through so the library underneath stays usable, and the
 * renderer switches that off while the pointer is over the controls — see
 * the `overlay:setInteractive` channel. Without that, clicks on the seek bar
 * fall through to whatever is behind the overlay.
 *
 * `focusable: false` keeps keyboard focus on the main window, which is where
 * key handling lives.
 */
export function createOverlayWindow(parent: BrowserWindow): BrowserWindow {
  const overlay = new BrowserWindow({
    parent,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  // Above the video window, which sits at the default level.
  overlay.setAlwaysOnTop(true, 'pop-up-menu')
  overlay.setIgnoreMouseEvents(true, { forward: true })

  if (process.env.ELECTRON_RENDERER_URL) {
    void overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    void overlay.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  followBounds(parent, overlay)
  return overlay
}

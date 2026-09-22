import { BrowserWindow } from 'electron'
import { join } from 'node:path'

/**
 * A transparent window that floats above the embedded mpv surface.
 *
 * This exists because mpv's `--wid` child window always composites above
 * Chromium's output on Windows, so on-screen controls cannot be drawn in
 * the main renderer. `focusable: false` keeps keyboard focus on the main
 * window, which is where input handling lives.
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
      nodeIntegration: false
    }
  })

  overlay.setAlwaysOnTop(true, 'pop-up-menu')
  // Click-through by default; the renderer turns this off while controls show.
  overlay.setIgnoreMouseEvents(true, { forward: true })

  if (process.env.ELECTRON_RENDERER_URL) {
    void overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    void overlay.loadFile(join(__dirname, '../renderer/overlay.html'))
  }

  const sync = (): void => {
    if (overlay.isDestroyed() || !parent.isVisible()) return
    overlay.setBounds(parent.getContentBounds())
  }

  // Registered one by one rather than in a loop: BrowserWindow.on is heavily
  // overloaded per event name, so a union of names matches no single overload.
  parent.on('resize', sync)
  parent.on('move', sync)
  parent.on('enter-full-screen', sync)
  parent.on('leave-full-screen', sync)
  parent.on('restore', sync)

  parent.on('closed', () => {
    if (!overlay.isDestroyed()) overlay.destroy()
  })
  parent.on('hide', () => overlay.hide())
  sync()

  return overlay
}

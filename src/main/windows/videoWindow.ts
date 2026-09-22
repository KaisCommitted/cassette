import { BrowserWindow } from 'electron'
import { followBounds } from './followBounds'

/**
 * A bare window that exists purely to give mpv an HWND to render into.
 *
 * Embedding mpv into the *main* window's handle does not work: Chromium's
 * compositor paints over the child surface, so the video is invisible even
 * though audio plays. Giving mpv a window of its own removes the conflict —
 * the OS composites three separate windows in a z-order we control:
 *
 *   main (library UI)  <  video (mpv)  <  overlay (controls)
 *
 * It never loads app content; mpv paints over every pixel.
 */
export function createVideoWindow(parent: BrowserWindow): BrowserWindow {
  const win = new BrowserWindow({
    parent,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // No renderer work happens here, so let it idle cheaply.
      backgroundThrottling: false
    }
  })

  void win.loadURL(
    'data:text/html,' + encodeURIComponent('<body style="margin:0;background:#000"></body>')
  )

  followBounds(parent, win)
  return win
}

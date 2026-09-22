import { BrowserWindow, screen } from 'electron'
import { rendererUrl } from '../appProtocol'
import { preloadPath } from './preloadPath'

const WIDTH = 1400
const HEIGHT = 900

/**
 * Where to put the window during an automated run.
 *
 * A display that is not the primary one, if there is such a display. Failing
 * that, parked off the left edge of the desktop: the window is still real and
 * still renders, so it can be captured with PrintWindow, but it never appears
 * in front of whoever is using the machine.
 */
function testPosition(): { x: number; y: number } | null {
  if (process.env.CASSETTE_TEST !== '1') return null

  const primary = screen.getPrimaryDisplay()
  const other = screen.getAllDisplays().find((d) => d.id !== primary.id)
  if (other) {
    return {
      x: Math.round(other.workArea.x + (other.workArea.width - WIDTH) / 2),
      y: Math.round(other.workArea.y + (other.workArea.height - HEIGHT) / 2)
    }
  }
  return { x: -(WIDTH + 200), y: 60 }
}

export function createMainWindow(): BrowserWindow {
  const position = testPosition()

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    minWidth: 900,
    minHeight: 560,
    ...(position ?? {}),
    backgroundColor: '#0b0b0f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())


  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadURL(rendererUrl('index.html'))
  }
  return win
}

import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

const WIDTH = 1400
const HEIGHT = 900

/**
 * During test runs, put the window on a secondary display if one exists, so
 * automated playback checks do not take over the screen being worked on.
 */
function testPosition(): { x: number; y: number } | null {
  if (process.env.MNF_TEST !== '1') return null
  const primary = screen.getPrimaryDisplay()
  const other = screen.getAllDisplays().find((d) => d.id !== primary.id)
  if (!other) return null
  return {
    x: Math.round(other.workArea.x + (other.workArea.width - WIDTH) / 2),
    y: Math.round(other.workArea.y + (other.workArea.height - HEIGHT) / 2)
  }
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
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

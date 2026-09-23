import { screen, type BrowserWindow } from 'electron'
import { IPC } from '@shared/types'

/** Height of the strip at the bottom of the window that the controls occupy. */
export const CONTROL_ZONE_HEIGHT = 140

const POLL_MS = 100

export interface OverlayInteraction {
  start: () => void
  stop: () => void
}

/**
 * Drives the overlay from the main process by polling the cursor.
 *
 * The overlay is non-focusable, so it cannot be relied on to receive mouse
 * moves of its own — forwarded moves never arrived, which left the controls
 * permanently hidden. Main always knows where the cursor is, so it decides
 * when to reveal the controls.
 *
 * It takes clicks for the whole time the player is open, and is click-through
 * only while hidden. It used to switch between the two whenever the cursor
 * crossed the window's edge, and at every fullscreen change, which was ruinous
 * on Windows: Electron implements click-through by adding and removing the
 * window's WS_EX_LAYERED style along with WS_EX_TRANSPARENT, so the one window
 * whose transparency the whole player depends on was losing and regaining its
 * layer dozens of times an episode. Logged against the released build, that
 * churn is where the black picture, the controls that stopped taking clicks
 * and the pile of phantom Cassette entries in Alt-Tab came from.
 *
 * Nothing needs the switching. The overlay covers exactly the content area,
 * so a cursor outside it is not over it anyway, and while it is hidden it
 * takes nothing.
 */
export function createOverlayInteraction(
  mainWindow: BrowserWindow,
  overlay: BrowserWindow
): OverlayInteraction {
  let timer: ReturnType<typeof setInterval> | null = null
  let last = { x: -1, y: -1 }

  // No forwarding: see createOverlayWindow for why it is not harmless.
  const setInteractive = (next: boolean): void => {
    if (!overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!next)
  }

  const tick = (): void => {
    if (overlay.isDestroyed() || mainWindow.isDestroyed()) return
    const point = screen.getCursorScreenPoint()
    const bounds = mainWindow.getContentBounds()

    const inside =
      point.x >= bounds.x &&
      point.x < bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y < bounds.y + bounds.height

    const moved = point.x !== last.x || point.y !== last.y
    last = point

    if (moved && inside) {
      overlay.webContents.send(IPC.overlayActivity)
    }
  }

  return {
    start: () => {
      if (timer) return
      // Interactive across the whole window while playing, not just over the
      // control bar: the video fills the window, so mouse bindings (wheel for
      // volume, side buttons, double click for fullscreen) need to land
      // somewhere, and mpv itself is given no input handling at all.
      setInteractive(true)
      timer = setInterval(tick, POLL_MS)
    },
    stop: () => {
      if (timer) clearInterval(timer)
      timer = null
      setInteractive(false)
    }
  }
}

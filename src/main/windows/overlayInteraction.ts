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
 * The overlay is click-through and non-focusable, so it cannot be relied on to
 * receive mouse events of its own — forwarded moves never arrived, which left
 * the controls permanently hidden. Main always knows where the cursor is, so
 * it decides both when to reveal the controls and when the overlay should
 * accept clicks.
 */
export function createOverlayInteraction(
  mainWindow: BrowserWindow,
  overlay: BrowserWindow
): OverlayInteraction {
  let timer: ReturnType<typeof setInterval> | null = null
  let last = { x: -1, y: -1 }
  let interactive: boolean | null = null

  const setInteractive = (next: boolean): void => {
    if (next === interactive || overlay.isDestroyed()) return
    interactive = next
    overlay.setIgnoreMouseEvents(!next, { forward: true })
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

    // Interactive across the whole window while playing, not just over the
    // control bar: the video fills the window, so mouse bindings (wheel for
    // volume, side buttons, double click for fullscreen) need to land
    // somewhere, and mpv itself is given no input handling at all.
    setInteractive(inside)
  }

  return {
    start: () => {
      if (timer) return
      interactive = null
      timer = setInterval(tick, POLL_MS)
    },
    stop: () => {
      if (timer) clearInterval(timer)
      timer = null
      setInteractive(false)
    }
  }
}

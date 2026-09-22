import type { BrowserWindow } from 'electron'

/**
 * Keep `child` locked to `parent`'s content area.
 *
 * Used by both the video window and the OSD overlay, which must stay exactly
 * aligned with the main window through moves, resizes and fullscreen changes.
 */
export function followBounds(parent: BrowserWindow, child: BrowserWindow): void {
  const sync = (): void => {
    if (child.isDestroyed() || parent.isDestroyed()) return
    if (!parent.isVisible()) return
    child.setBounds(parent.getContentBounds())
  }

  // Registered one by one rather than in a loop: BrowserWindow.on is heavily
  // overloaded per event name, so a union of names matches no single overload.
  parent.on('resize', sync)
  parent.on('move', sync)
  parent.on('enter-full-screen', sync)
  parent.on('leave-full-screen', sync)
  parent.on('restore', sync)
  parent.on('maximize', sync)
  parent.on('unmaximize', sync)

  parent.on('closed', () => {
    if (!child.isDestroyed()) child.destroy()
  })
  parent.on('hide', () => child.hide())

  sync()
}

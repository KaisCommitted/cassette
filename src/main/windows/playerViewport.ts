import { screen, type BrowserWindow, type Rectangle } from 'electron'

/**
 * The area the player occupies: the main window's content area, or the whole
 * display while the player is fullscreen.
 *
 * The video window and the controls overlay are locked to it, so they stay
 * exactly aligned with each other through moves, resizes and fullscreen
 * changes.
 *
 * Fullscreen is deliberately not the main window's fullscreen. On Windows,
 * Chromium shrinks a fullscreen window by one pixel whenever it loses
 * activation and snaps it back when it regains it, to work around the taskbar
 * tracking fullscreen state per thread. On Windows 11 24H2 and later, that
 * snap-back — once per Alt-Tab — makes the task switcher add another stale
 * "Cassette" tile every time: a dozen black tiles after a dozen switches, none
 * of them a real window. Reproduced with the player fullscreen, playing or
 * paused, and absent with it in a window; gone the moment the main window
 * stopped going through Chromium's fullscreen path.
 *
 * So the library window is never made fullscreen. Only the two player windows
 * grow to cover the display, and the library sits behind them unchanged. Their
 * size does not change with activation, so the switcher has nothing to trip
 * over, and leaving fullscreen or closing the player has no window to restore.
 */
export class PlayerViewport {
  private readonly followers: BrowserWindow[] = []
  private fullscreen = false

  constructor(
    private readonly main: BrowserWindow,
    /** The display a rectangle falls on; a parameter so tests need no screen. */
    private readonly displayBounds: (near: Rectangle) => Rectangle = (near) =>
      screen.getDisplayMatching(near).bounds
  ) {
    const sync = (): void => this.sync()
    // Registered one by one rather than in a loop: BrowserWindow.on is heavily
    // overloaded per event name, so a union of names matches no single overload.
    main.on('resize', sync)
    main.on('move', sync)
    main.on('restore', sync)
    main.on('maximize', sync)
    main.on('unmaximize', sync)

    main.on('closed', () => {
      for (const win of this.followers) if (!win.isDestroyed()) win.destroy()
    })
    main.on('hide', () => {
      for (const win of this.followers) if (!win.isDestroyed()) win.hide()
    })
  }

  get isFullscreen(): boolean {
    return this.fullscreen
  }

  /** Where the player is right now, in screen coordinates. */
  bounds(): Rectangle {
    return this.fullscreen
      ? this.displayBounds(this.main.getBounds())
      : this.main.getContentBounds()
  }

  /** Locks a window to the viewport from now on. */
  follow(win: BrowserWindow): void {
    this.followers.push(win)
    this.sync()
  }

  setFullscreen(fullscreen: boolean): void {
    this.fullscreen = fullscreen
    this.sync()
  }

  /** Puts every follower where the viewport is. */
  sync(): void {
    if (this.main.isDestroyed() || !this.main.isVisible()) return
    const rect = this.bounds()
    for (const win of this.followers) {
      if (!win.isDestroyed()) win.setBounds(rect)
    }
  }
}

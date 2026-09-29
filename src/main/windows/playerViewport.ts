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
 *
 * Picture-in-picture is a third place for it: a small rectangle of its own,
 * anywhere on any display, which the library window no longer decides. The
 * windows are the same two and mpv is the same mpv, so moving between the
 * three is only ever a change of bounds — nothing reloads or seeks.
 */
export type ViewportMode = 'window' | 'fullscreen' | 'pip'

export class PlayerViewport {
  private readonly followers: BrowserWindow[] = []
  private current: ViewportMode = 'window'
  /** Where leaving fullscreen goes back to: the window, or picture-in-picture. */
  private beforeFullscreen: Exclude<ViewportMode, 'fullscreen'> = 'window'
  /** The picture-in-picture rectangle, kept while elsewhere for coming back. */
  private pip: Rectangle | null = null

  constructor(
    private readonly main: BrowserWindow,
    /** The display a rectangle falls on; a parameter so tests need no screen. */
    private readonly displayBounds: (near: Rectangle) => Rectangle = (near) =>
      screen.getDisplayMatching(near).bounds
  ) {
    // Picture-in-picture is placed on its own; the library window moving or
    // resizing under it has no say in where it is.
    const sync = (): void => {
      if (this.current !== 'pip') this.sync()
    }
    // Registered one by one rather than in a loop: BrowserWindow.on is heavily
    // overloaded per event name, so a union of names matches no single overload.
    main.on('resize', sync)
    main.on('move', sync)
    main.on('restore', sync)
    main.on('maximize', sync)
    main.on('unmaximize', sync)

    // Picture-in-picture is not owned by the library window, so Windows does
    // not take it down along with it; this does, so it is never left playing
    // on its own after the library has gone.
    main.on('closed', () => {
      for (const win of this.followers) if (!win.isDestroyed()) win.destroy()
    })
    main.on('hide', () => {
      for (const win of this.followers) if (!win.isDestroyed()) win.hide()
    })
  }

  get mode(): ViewportMode {
    return this.current
  }

  get isFullscreen(): boolean {
    return this.current === 'fullscreen'
  }

  get isPip(): boolean {
    return this.current === 'pip'
  }

  /** The picture-in-picture rectangle last used, or null if there has been none. */
  get pipBounds(): Rectangle | null {
    return this.pip
  }

  /** Where the player is right now, in screen coordinates. */
  bounds(): Rectangle {
    switch (this.current) {
      case 'fullscreen':
        // The display it was on: under the library window, or under the
        // picture-in-picture window when it went fullscreen from there.
        return this.displayBounds(
          this.beforeFullscreen === 'pip' && this.pip ? this.pip : this.main.getBounds()
        )
      case 'pip':
        return this.pip ?? this.main.getContentBounds()
      default:
        return this.main.getContentBounds()
    }
  }

  /** Locks a window to the viewport from now on. */
  follow(win: BrowserWindow): void {
    this.followers.push(win)
    this.sync()
  }

  /**
   * Into fullscreen, remembering where from; out of it, back to there — the
   * window or picture-in-picture.
   */
  setFullscreen(fullscreen: boolean): void {
    if (fullscreen !== this.isFullscreen) {
      if (fullscreen) {
        this.beforeFullscreen = this.current === 'pip' ? 'pip' : 'window'
        this.current = 'fullscreen'
      } else {
        this.current = this.beforeFullscreen
      }
    }
    this.sync()
  }

  /** Into picture-in-picture at a rectangle, or out of it to the window. */
  setPip(rect: Rectangle | null): void {
    if (rect) {
      this.pip = rect
      this.current = 'pip'
    } else {
      this.current = 'window'
    }
    this.beforeFullscreen = 'window'
    this.sync()
  }

  /** Moves or resizes picture-in-picture, or notes where it will be next time. */
  setPipBounds(rect: Rectangle): void {
    this.pip = rect
    if (this.current === 'pip') this.sync()
  }

  /** Back to the library window, for when the player closes. */
  reset(): void {
    this.current = 'window'
    this.beforeFullscreen = 'window'
  }

  /** Puts every follower where the viewport is. */
  sync(): void {
    if (this.main.isDestroyed()) return
    // Picture-in-picture stays up while the library is minimised, and its
    // rectangle does not depend on the library's; the other two do.
    if (this.current !== 'pip' && !this.main.isVisible()) return
    const rect = this.bounds()
    // Only picture-in-picture is moved between displays by hand; the window
    // and fullscreen stay put, and checking there would cost a second
    // setBounds per resize wherever scaling rounds the size by a pixel.
    for (const win of this.followers) {
      if (win.isDestroyed()) continue
      if (this.current === 'pip') setBoundsExactly(win, rect)
      else win.setBounds(rect)
    }
  }
}

/**
 * Sets a window's bounds, and sets them again if Windows got the size wrong.
 *
 * Between displays with different scaling, Electron converts new bounds with
 * the scale of the display the window is on *before* the move, so a window
 * moved or resized across the boundary lands in the right place at the wrong
 * size. By the second call it is already on the new display, and the
 * conversion comes out right.
 */
export function setBoundsExactly(win: BrowserWindow, rect: Rectangle): void {
  win.setBounds(rect)
  const got = win.getBounds()
  if (got.width !== rect.width || got.height !== rect.height) win.setBounds(rect)
}

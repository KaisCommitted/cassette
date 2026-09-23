import { BrowserWindow } from 'electron'
import { rendererUrl } from '../appProtocol'
import { preloadPath } from './preloadPath'
import { followBounds } from './followBounds'

/**
 * A transparent window above the video window that draws the on-screen
 * controls.
 *
 * It is owned by the video window, and that is the whole of how it stays
 * above the picture. Windows keeps an owned window above its owner, so the
 * chain main → video → overlay holds its order by itself and moves as one
 * with the main window: behind whatever app you switch to, back in front
 * when you return, never over anything else.
 *
 * It used to get there by being always-on-top, switched on while Cassette
 * had focus and off when it lost it, so that the controls would not hang
 * over other apps. That switching is what stopped the controls taking
 * clicks. After a round of Alt-Tab, Chromium swallowed every button press on
 * this window while still delivering the release — confirmed from inside the
 * window, press by press, and cured on the spot by no longer switching.
 *
 * It can take focus, and that is what makes it clickable at all. A window
 * that cannot take focus has every button press eaten by Chromium whenever
 * Windows asks it whether a click should activate it — it answers "no, and
 * discard the click", and only the release gets through. Windows asks that
 * of any window that is not the active one, so after an Alt-Tab the controls
 * stopped answering the mouse entirely, until something reset them. Found by
 * logging the window's own events: releases arriving, presses never; and
 * cured, live, by making it focusable and nothing else.
 *
 * Clicking it therefore moves focus to it, which is why the main process
 * listens for key bindings on this window as well as on the main one.
 */
export function createOverlayWindow(
  main: BrowserWindow,
  video: BrowserWindow
): BrowserWindow {
  const overlay = new BrowserWindow({
    parent: video,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: true,
    skipTaskbar: true,
    // See the video window: this is what keeps it out of Alt-Tab.
    type: 'toolbar',
    hasShadow: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  /*
   * Click-through, and without asking for forwarded mouse messages.
   *
   * `forward: true` is what made the cursor flicker between a hand and an
   * arrow whenever the mouse moved over anything clickable — anywhere in the
   * app, not just during playback. Confirmed by swapping it in and out of the
   * released build and nothing else: with it the flicker is there, without it
   * it is gone.
   *
   * It is not a passive option. Electron implements it with a system-wide
   * low-level mouse hook, and that hook posts a mouse move into this window
   * for any cursor position inside its rectangle — it checks neither the
   * z-order nor whether this window is even visible. The overlay is locked to
   * the main window's content area, so every movement over the library was
   * replayed into a hidden window, which then had its own say about the
   * cursor.
   *
   * It only shows with a real mouse. Moving the pointer programmatically
   * (SetCursorPos) bypasses low-level hooks entirely, so automated checks
   * of the cursor saw nothing wrong; any future check needs a human hand or
   * input that goes through the hook chain.
   *
   * Nothing wanted it: the controls are driven by polling the cursor from the
   * main process precisely because these forwarded events were never reliable
   * (see overlayInteraction). While the overlay is interactive it receives
   * real mouse events like any window, and `forward` is ignored then anyway.
   */
  overlay.setIgnoreMouseEvents(true)

  if (process.env.ELECTRON_RENDERER_URL) {
    void overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay.html`)
  } else {
    void overlay.loadURL(rendererUrl('overlay.html'))
  }

  // Its position still comes from the main window's content area, like the
  // video window's; only the stacking comes from the video.
  followBounds(main, overlay)
  return overlay
}

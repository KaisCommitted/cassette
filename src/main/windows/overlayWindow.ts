import { BrowserWindow } from 'electron'
import { rendererUrl } from '../appProtocol'
import { preloadPath } from './preloadPath'
import { followBounds } from './followBounds'

/**
 * A transparent window that floats above the video window and draws the
 * on-screen controls.
 *
 * It starts click-through so the library underneath stays usable, and the
 * renderer switches that off while the pointer is over the controls — see
 * the `overlay:setInteractive` channel. Without that, clicks on the seek bar
 * fall through to whatever is behind the overlay.
 *
 * `focusable: false` keeps keyboard focus on the main window, which is where
 * key handling lives.
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

  // Above the video window, which sits at the default level.
  overlay.setAlwaysOnTop(true, 'pop-up-menu')

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

  followBounds(parent, overlay)
  return overlay
}

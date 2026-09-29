import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rectangle } from 'electron'

// Only the player's size switches and its closing are exercised here; the
// rest of Electron is never reached.
vi.mock('electron', () => ({
  app: { getPath: () => '', isPackaged: false },
  BrowserWindow: {},
  dialog: {},
  ipcMain: { handle: () => undefined, on: () => undefined },
  screen: {}
}))

import { stopPlayback, toggleFullscreen, togglePip, type AppContext } from './handlers'
import { PlayerViewport } from '../windows/playerViewport'

const PIP: Rectangle = { x: 1400, y: 800, width: 480, height: 270 }

function fakeWindow() {
  const win = {
    visible: true,
    bounds: { x: 0, y: 0, width: 1400, height: 900 } as Rectangle,
    on: () => undefined,
    isDestroyed: () => false,
    isVisible: () => win.visible,
    isFocused: () => false,
    isMinimized: () => false,
    getBounds: () => win.bounds,
    getContentBounds: () => win.bounds,
    setBounds: (r: Rectangle) => {
      win.bounds = r
    },
    show: () => {
      win.visible = true
    },
    hide: () => {
      win.visible = false
    },
    focus: () => undefined,
    webContents: { send: vi.fn(), invalidate: () => undefined }
  }
  return win
}

function context() {
  const main = fakeWindow()
  const video = fakeWindow()
  const overlay = fakeWindow()
  const viewport = new PlayerViewport(main as never, () => ({ x: 0, y: 0, width: 1920, height: 1080 }))
  viewport.follow(video as never)
  let path: string | null = 'C:\\show\\episode.mkv'
  const detached: boolean[] = []
  const mpv = {
    getState: () => ({ path }),
    stop: vi.fn(async () => {
      path = null
    }),
    setFullscreen: vi.fn(),
    setPip: vi.fn()
  }
  const ctx = {
    mpv,
    mainWindow: main,
    videoWindow: video,
    overlayWindow: overlay,
    viewport,
    pip: {
      openingBounds: () => PIP,
      setDetached: (d: boolean) => detached.push(d),
      reshapeTo: () => undefined
    },
    overlayInteraction: { stop: () => undefined },
    progress: { save: async () => undefined },
    endSleep: () => undefined,
    currentKey: 'k'
  } as unknown as AppContext
  return { ctx, viewport, overlay, mpv, detached }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('size switches racing a close', () => {
  it('does not go into picture-in-picture when the player closes during the dip', async () => {
    const { ctx, viewport, mpv, detached } = context()
    const closing = stopPlayback(ctx)
    // P pressed straight after Escape.
    const switching = togglePip(ctx)
    await vi.runAllTimersAsync()
    await Promise.all([closing, switching])

    expect(viewport.mode).toBe('window')
    expect(detached).not.toContain(true)
    expect(mpv.setPip).not.toHaveBeenCalledWith(true)
  })

  it('does not go into picture-in-picture when a close starts after the switch began', async () => {
    const { ctx, viewport, detached } = context()
    const switching = togglePip(ctx)
    await vi.advanceTimersByTimeAsync(50)
    const closing = stopPlayback(ctx)
    await vi.runAllTimersAsync()
    await Promise.all([closing, switching])

    expect(viewport.mode).toBe('window')
    expect(detached).not.toContain(true)
  })

  it('does not go fullscreen either', async () => {
    const { ctx, viewport, mpv } = context()
    const switching = toggleFullscreen(ctx)
    await vi.advanceTimersByTimeAsync(50)
    const closing = stopPlayback(ctx)
    await vi.runAllTimersAsync()
    await Promise.all([closing, switching])
    expect(viewport.mode).toBe('window')
    expect(mpv.setFullscreen).not.toHaveBeenCalledWith(true)
  })

  it('leaves the close’s dip to black down rather than lifting it', async () => {
    const { ctx, overlay } = context()
    const switching = togglePip(ctx)
    await vi.advanceTimersByTimeAsync(50)
    const closing = stopPlayback(ctx)
    await vi.runAllTimersAsync()
    await Promise.all([closing, switching])
    // The switch gave up, and must not have brought the picture back up.
    expect(overlay.webContents.send).not.toHaveBeenCalledWith(expect.anything(), 'in')
  })

  it('still switches when nothing closes', async () => {
    const { ctx, viewport, detached } = context()
    const switching = togglePip(ctx)
    await vi.runAllTimersAsync()
    await switching
    expect(viewport.mode).toBe('pip')
    expect(detached).toEqual([true])
  })

  it('closes from picture-in-picture back to the window, hung under the library again', async () => {
    const { ctx, viewport, detached } = context()
    const switching = togglePip(ctx)
    await vi.runAllTimersAsync()
    await switching
    const closing = stopPlayback(ctx)
    await vi.runAllTimersAsync()
    await closing
    expect(viewport.mode).toBe('window')
    expect(detached).toEqual([true, false])
  })
})

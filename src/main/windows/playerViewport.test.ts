import { describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, Rectangle } from 'electron'

// The module reads the display through Electron's screen API by default; the
// tests inject their own lookup, so Electron itself is never needed here.
vi.mock('electron', () => ({ screen: {} }))

import { PlayerViewport } from './playerViewport'

const CONTENT: Rectangle = { x: 260, y: 157, width: 1400, height: 869 }
const WINDOW: Rectangle = { x: 252, y: 126, width: 1416, height: 908 }
const DISPLAY: Rectangle = { x: 0, y: 0, width: 1920, height: 1200 }

interface Fake {
  win: BrowserWindow
  emit: (event: string) => void
  setBounds: ReturnType<typeof vi.fn>
  hide: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  visible: boolean
}

function fakeWindow(options: { visible?: boolean; content?: Rectangle } = {}): Fake {
  const handlers = new Map<string, Array<() => void>>()
  let bounds = WINDOW
  const fake: Fake = {
    visible: options.visible ?? true,
    setBounds: vi.fn((rect: Rectangle) => {
      bounds = rect
    }),
    hide: vi.fn(),
    destroy: vi.fn(),
    emit: (event) => {
      for (const fn of handlers.get(event) ?? []) fn()
    },
    win: null as unknown as BrowserWindow
  }
  fake.win = {
    on: (event: string, fn: () => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn])
    },
    isDestroyed: () => false,
    isVisible: () => fake.visible,
    getBounds: () => bounds,
    getContentBounds: () => options.content ?? CONTENT,
    setBounds: fake.setBounds,
    hide: fake.hide,
    destroy: fake.destroy
  } as unknown as BrowserWindow
  return fake
}

function viewport(main: Fake): PlayerViewport {
  return new PlayerViewport(main.win, () => DISPLAY)
}

describe('PlayerViewport', () => {
  it('places a follower on the main window content area', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    viewport(main).follow(child.win)
    expect(child.setBounds).toHaveBeenLastCalledWith(CONTENT)
  })

  it('covers the display containing the main window while fullscreen, and returns after', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)

    view.setFullscreen(true)
    expect(view.isFullscreen).toBe(true)
    expect(child.setBounds).toHaveBeenLastCalledWith(DISPLAY)

    view.setFullscreen(false)
    expect(view.isFullscreen).toBe(false)
    expect(child.setBounds).toHaveBeenLastCalledWith(CONTENT)
  })

  it('keeps following the main window as it moves and resizes', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    viewport(main).follow(child.win)
    child.setBounds.mockClear()

    for (const event of ['resize', 'move', 'restore', 'maximize', 'unmaximize']) {
      main.emit(event)
    }
    expect(child.setBounds).toHaveBeenCalledTimes(5)
    expect(child.setBounds).toHaveBeenLastCalledWith(CONTENT)
  })

  it('ignores main window geometry while fullscreen', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)
    view.setFullscreen(true)
    child.setBounds.mockClear()

    main.emit('resize')
    expect(child.setBounds).toHaveBeenLastCalledWith(DISPLAY)
  })

  it('leaves followers alone while the main window is hidden', () => {
    const main = fakeWindow({ visible: false })
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)
    view.setFullscreen(true)
    main.emit('resize')
    expect(child.setBounds).not.toHaveBeenCalled()
  })

  it('hides followers with the main window and destroys them when it closes', () => {
    const main = fakeWindow()
    const a = fakeWindow()
    const b = fakeWindow()
    const view = viewport(main)
    view.follow(a.win)
    view.follow(b.win)

    main.emit('hide')
    expect(a.hide).toHaveBeenCalledTimes(1)
    expect(b.hide).toHaveBeenCalledTimes(1)

    main.emit('closed')
    expect(a.destroy).toHaveBeenCalledTimes(1)
    expect(b.destroy).toHaveBeenCalledTimes(1)
  })

  it('reports the area the player occupies', () => {
    const main = fakeWindow()
    const view = viewport(main)
    expect(view.bounds()).toEqual(CONTENT)
    view.setFullscreen(true)
    expect(view.bounds()).toEqual(DISPLAY)
  })
})

describe('PlayerViewport in picture-in-picture', () => {
  const PIP: Rectangle = { x: 1416, y: 858, width: 480, height: 270 }
  const SECOND_DISPLAY: Rectangle = { x: 1920, y: 0, width: 2560, height: 1440 }

  it('puts followers in the picture-in-picture rectangle and back on the window after', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)

    view.setPip(PIP)
    expect(view.isPip).toBe(true)
    expect(view.mode).toBe('pip')
    expect(child.setBounds).toHaveBeenLastCalledWith(PIP)

    view.setPip(null)
    expect(view.mode).toBe('window')
    expect(child.setBounds).toHaveBeenLastCalledWith(CONTENT)
  })

  it('stays put while the library window moves, resizes or is restored', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)
    view.setPip(PIP)
    child.setBounds.mockClear()

    for (const event of ['resize', 'move', 'restore', 'maximize', 'unmaximize']) {
      main.emit(event)
    }
    expect(child.setBounds).not.toHaveBeenCalled()
  })

  it('moves and resizes as it is dragged, and remembers the rectangle once out of it', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)
    view.setPip(PIP)

    const dragged = { ...PIP, x: 40, y: 40 }
    view.setPipBounds(dragged)
    expect(child.setBounds).toHaveBeenLastCalledWith(dragged)

    view.setPip(null)
    child.setBounds.mockClear()
    const reshaped = { ...dragged, height: 360 }
    view.setPipBounds(reshaped)
    // Not in it now, so nothing moves — but next time starts there.
    expect(child.setBounds).not.toHaveBeenCalled()
    expect(view.pipBounds).toEqual(reshaped)
  })

  it('keeps following while the library window is minimised or hidden', () => {
    const main = fakeWindow({ visible: false })
    const child = fakeWindow()
    const view = new PlayerViewport(main.win, () => DISPLAY)
    view.follow(child.win)
    view.setPip(PIP)
    expect(child.setBounds).toHaveBeenLastCalledWith(PIP)
  })

  it('goes fullscreen on the display picture-in-picture is on, and comes back to it', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const onSecond: Rectangle = { x: 3900, y: 1100, width: 480, height: 270 }
    const view = new PlayerViewport(main.win, (near) =>
      near.x >= SECOND_DISPLAY.x ? SECOND_DISPLAY : DISPLAY
    )
    view.follow(child.win)
    view.setPip(onSecond)

    view.setFullscreen(true)
    expect(view.isFullscreen).toBe(true)
    expect(child.setBounds).toHaveBeenLastCalledWith(SECOND_DISPLAY)

    view.setFullscreen(false)
    expect(view.mode).toBe('pip')
    expect(child.setBounds).toHaveBeenLastCalledWith(onSecond)
  })

  it('leaves fullscreen for the window when it went fullscreen from the window', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)
    view.setPip(PIP)
    view.setPip(null)

    view.setFullscreen(true)
    view.setFullscreen(false)
    expect(view.mode).toBe('window')
    expect(child.setBounds).toHaveBeenLastCalledWith(CONTENT)
  })

  it('goes from fullscreen straight into picture-in-picture, and out of it to the window', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    const view = viewport(main)
    view.follow(child.win)

    view.setFullscreen(true)
    view.setPip(PIP)
    expect(view.mode).toBe('pip')
    expect(child.setBounds).toHaveBeenLastCalledWith(PIP)

    // Fullscreen from here and back returns to picture-in-picture, not to
    // the window it was fullscreen from before.
    view.setFullscreen(true)
    view.setFullscreen(false)
    expect(view.mode).toBe('pip')

    view.setPip(null)
    expect(view.mode).toBe('window')
  })

  it('starts from the window again after a reset', () => {
    const main = fakeWindow()
    const view = viewport(main)
    view.setPip(PIP)
    view.setFullscreen(true)
    view.reset()
    expect(view.mode).toBe('window')
    view.setFullscreen(true)
    view.setFullscreen(false)
    expect(view.mode).toBe('window')
    // The rectangle is kept for the next time.
    expect(view.pipBounds).toEqual(PIP)
  })

  it('sets the bounds again when a move across displays comes out the wrong size', () => {
    const main = fakeWindow()
    const child = fakeWindow()
    // The first call lands at 1.5× the size, as Electron does when the scale
    // of the display being left is applied to the display arrived on.
    let calls = 0
    const setBounds = vi.fn((rect: Rectangle) => {
      calls++
      landed = calls === 1 ? { ...rect, width: rect.width * 1.5, height: rect.height * 1.5 } : rect
    })
    let landed: Rectangle = WINDOW
    const win = {
      ...child.win,
      setBounds,
      getBounds: () => landed,
      isDestroyed: () => false
    } as unknown as BrowserWindow
    const view = viewport(main)
    view.setPip(PIP)
    view.follow(win)
    expect(setBounds).toHaveBeenCalledTimes(2)
    expect(landed).toEqual(PIP)
  })

  it('sets the bounds once outside picture-in-picture, even if they come back a pixel off', () => {
    const main = fakeWindow()
    // What 125% scaling does: the size comes back rounded.
    const setBounds = vi.fn()
    const win = {
      setBounds,
      getBounds: () => ({ ...CONTENT, width: CONTENT.width - 1 }),
      isDestroyed: () => false
    } as unknown as BrowserWindow
    const view = viewport(main)
    view.follow(win)
    view.setFullscreen(true)
    view.setFullscreen(false)
    expect(setBounds).toHaveBeenCalledTimes(3)
  })
})

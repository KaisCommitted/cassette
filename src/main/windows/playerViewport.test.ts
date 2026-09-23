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
  const fake: Fake = {
    visible: options.visible ?? true,
    setBounds: vi.fn(),
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
    getBounds: () => WINDOW,
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

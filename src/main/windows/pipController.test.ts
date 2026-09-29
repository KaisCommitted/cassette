import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, Rectangle } from 'electron'

// A pretend screen: displays and the cursor are whatever a test sets, and
// display events are kept so a test can fire them.
const fake = vi.hoisted(() => ({
  areas: [] as Rectangle[],
  cursor: { x: 0, y: 0 },
  listeners: new Map<string, Array<() => void>>()
}))

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => fake.areas.map((workArea) => ({ workArea, bounds: workArea })),
    getPrimaryDisplay: () => ({ workArea: fake.areas[0], bounds: fake.areas[0] }),
    getDisplayMatching: () => ({ workArea: fake.areas[0], bounds: fake.areas[0] }),
    getCursorScreenPoint: () => ({ ...fake.cursor }),
    // One scale everywhere: physical and Electron coordinates are the same.
    dipToScreenPoint: (p: { x: number; y: number }) => p,
    screenToDipPoint: (p: { x: number; y: number }) => p,
    on: (event: string, fn: () => void) => {
      fake.listeners.set(event, [...(fake.listeners.get(event) ?? []), fn])
    }
  }
}))

vi.mock('../state/atomicJson', () => ({
  readJson: vi.fn(async () => null),
  writeJsonAtomic: vi.fn(async () => undefined)
}))

import { PipController } from './pipController'
import { PlayerViewport } from './playerViewport'

const BIG: Rectangle = { x: 0, y: 0, width: 3840, height: 2112 }
const SMALL: Rectangle = { x: 3840, y: 0, width: 1366, height: 728 }
const WIDE = 16 / 9

function fakeWindow(start: Rectangle): BrowserWindow & { bounds: Rectangle } {
  const win = {
    bounds: start,
    on: () => undefined,
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    getBounds: () => win.bounds,
    getContentBounds: () => win.bounds,
    setBounds: (rect: Rectangle) => {
      win.bounds = rect
    },
    setParentWindow: () => undefined,
    setAlwaysOnTop: () => undefined,
    moveTop: () => undefined,
    restore: () => undefined
  }
  return win as unknown as BrowserWindow & { bounds: Rectangle }
}

function setup(pipRect: Rectangle, aspect = { value: WIDE as number | null }) {
  const main = fakeWindow({ x: 100, y: 100, width: 1400, height: 900 })
  const video = fakeWindow(pipRect)
  const viewport = new PlayerViewport(main, () => BIG)
  viewport.follow(video)
  const pip = new PipController({
    main,
    video,
    viewport,
    aspect: () => aspect.value,
    file: 'pip.json'
  })
  viewport.setPip(pipRect)
  pip.setDetached(true)
  return { viewport, video, pip, aspect }
}

beforeEach(() => {
  vi.useFakeTimers()
  fake.areas = [BIG, SMALL]
  fake.cursor = { x: 0, y: 0 }
  fake.listeners.clear()
})
afterEach(() => vi.useRealTimers())

describe('PipController drags', () => {
  it('follows the cursor while moving, and stops the moment the drag ends', () => {
    const { pip, video } = setup({ x: 1000, y: 1000, width: 960, height: 540 })
    fake.cursor = { x: 1200, y: 1200 }
    pip.startDrag('move')
    fake.cursor = { x: 1300, y: 1250 }
    vi.advanceTimersByTime(40)
    expect(video.bounds).toMatchObject({ x: 1100, y: 1050 })

    pip.endDrag()
    fake.cursor = { x: 2000, y: 1900 }
    vi.advanceTimersByTime(200)
    expect(video.bounds).toMatchObject({ x: 1100, y: 1050 })
  })

  it('shrinks a big window dropped on a small display to a size that display allows', () => {
    // 1600 wide is fine on 3840 but over three quarters of 1366.
    const { pip, video } = setup({ x: 1000, y: 200, width: 1600, height: 900 })
    fake.cursor = { x: 1000, y: 300 }
    pip.startDrag('move')
    fake.cursor = { x: 4000, y: 300 }
    vi.advanceTimersByTime(20)
    pip.endDrag()

    const { x, y, width, height } = video.bounds
    expect(width).toBeLessThanOrEqual(Math.round(SMALL.height * 0.75 * WIDE))
    expect(Math.abs(width / height - WIDE)).toBeLessThan(0.01)
    expect(x).toBeGreaterThanOrEqual(SMALL.x)
    expect(x + width).toBeLessThanOrEqual(SMALL.x + SMALL.width)
    expect(y + height).toBeLessThanOrEqual(SMALL.y + SMALL.height)
  })

  it('keeps a new shape that arrives mid-drag rather than putting the old one back', () => {
    const { pip, video, aspect } = setup({ x: 1000, y: 1000, width: 960, height: 540 })
    fake.cursor = { x: 1100, y: 1100 }
    pip.startDrag('move')
    aspect.value = 2.4
    pip.reshapeTo(2.4)
    fake.cursor = { x: 1150, y: 1100 }
    vi.advanceTimersByTime(40)
    expect(video.bounds.width).toBe(960)
    expect(video.bounds.height).toBe(400)
    pip.endDrag()
  })

  it('takes the video’s current shape when a drag starts', () => {
    const { pip, video, aspect } = setup({ x: 1000, y: 1000, width: 960, height: 540 })
    aspect.value = 4 / 3
    pip.startDrag('move')
    expect(video.bounds.height).toBe(720)
    pip.endDrag()
  })
})

describe('PipController and the displays', () => {
  it('brings the window back onto a display when the one it was on goes away', () => {
    const { pip, video, viewport } = setup({ x: 4200, y: 100, width: 640, height: 360 })
    pip.watchDisplays()
    fake.areas = [BIG]
    for (const fn of fake.listeners.get('display-removed') ?? []) fn()

    const rect = viewport.pipBounds!
    expect(rect.x + rect.width).toBeLessThanOrEqual(BIG.x + BIG.width)
    expect(video.bounds).toEqual(rect)
  })

  it('works from where Windows already moved the window, not from the rectangle it kept', () => {
    const { pip, video, viewport } = setup({ x: 4200, y: 100, width: 640, height: 360 })
    pip.watchDisplays()
    fake.areas = [BIG]
    // Windows has moved it itself, somewhere sensible on what is left.
    video.bounds = { x: 300, y: 300, width: 640, height: 360 }
    for (const fn of fake.listeners.get('display-removed') ?? []) fn()
    expect(viewport.pipBounds).toEqual({ x: 300, y: 300, width: 640, height: 360 })
  })

  it('shrinks the window when a display is rescaled and it no longer fits', () => {
    const { pip, viewport } = setup({ x: 3900, y: 50, width: 1000, height: 563 })
    pip.watchDisplays()
    // The small display at a larger scale: less room in its coordinates.
    fake.areas = [BIG, { x: 3840, y: 0, width: 1093, height: 582 }]
    for (const fn of fake.listeners.get('display-metrics-changed') ?? []) fn()
    const rect = viewport.pipBounds!
    expect(rect.width).toBeLessThanOrEqual(Math.round(582 * 0.75 * WIDE))
    expect(rect.x + rect.width).toBeLessThanOrEqual(3840 + 1093)
  })
})

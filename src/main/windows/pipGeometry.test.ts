import { describe, expect, it } from 'vitest'
import type { Rectangle } from 'electron'
import {
  areaFor,
  defaultPipBounds,
  PIP_MARGIN,
  PIP_MIN_WIDTH,
  placeWithin,
  reshape,
  resizeFromEdge,
  restorePipBounds,
  saneAspect,
  snapToEdges,
  widthLimits
} from './pipGeometry'

// A 1920×1200 display with a 48px taskbar, and a second one to its right.
const LEFT: Rectangle = { x: 0, y: 0, width: 1920, height: 1152 }
const RIGHT: Rectangle = { x: 1920, y: 0, width: 2560, height: 1392 }
const WIDE = 16 / 9

describe('saneAspect', () => {
  it('keeps a real shape and replaces anything unusable with 16:9', () => {
    expect(saneAspect(2.39)).toBe(2.39)
    expect(saneAspect(0)).toBeCloseTo(WIDE)
    expect(saneAspect(null)).toBeCloseTo(WIDE)
    expect(saneAspect(Number.NaN)).toBeCloseTo(WIDE)
  })
})

describe('widthLimits', () => {
  it('stops at a minimum size and three quarters of the work area', () => {
    const { min, max } = widthLimits(WIDE, LEFT)
    expect(min).toBe(PIP_MIN_WIDTH)
    // Height is the tighter limit here: 1152 × 0.75 × 16/9 = 1536 > 1440.
    expect(max).toBe(1440)
  })

  it('holds a very wide picture to a minimum height too', () => {
    expect(widthLimits(2.4, LEFT).min).toBe(384)
  })

  it('never lets the minimum exceed what the display has room for', () => {
    const tiny: Rectangle = { x: 0, y: 0, width: 300, height: 200 }
    const { min, max } = widthLimits(WIDE, tiny)
    expect(min).toBeLessThanOrEqual(max)
  })
})

describe('defaultPipBounds', () => {
  it('opens a quarter wide in the bottom-right corner, in the video’s shape', () => {
    const rect = defaultPipBounds(LEFT, WIDE)
    expect(rect.width).toBe(480)
    expect(rect.height).toBe(270)
    expect(rect.x + rect.width).toBe(LEFT.width - PIP_MARGIN)
    expect(rect.y + rect.height).toBe(LEFT.height - PIP_MARGIN)
  })

  it('opens on the display it is given, not the first one', () => {
    const rect = defaultPipBounds(RIGHT, WIDE)
    expect(rect.x).toBeGreaterThan(RIGHT.x)
    expect(rect.x + rect.width).toBe(RIGHT.x + RIGHT.width - PIP_MARGIN)
  })
})

describe('areaFor', () => {
  it('picks the display it covers most of', () => {
    expect(areaFor({ x: 1800, y: 100, width: 480, height: 270 }, [LEFT, RIGHT])).toBe(RIGHT)
  })

  it('falls back to the nearest display for a window on none of them', () => {
    expect(areaFor({ x: 5000, y: 100, width: 480, height: 270 }, [LEFT, RIGHT])).toBe(RIGHT)
    expect(areaFor({ x: -3000, y: 100, width: 480, height: 270 }, [LEFT, RIGHT])).toBe(LEFT)
  })
})

describe('restorePipBounds', () => {
  it('uses the default the first time', () => {
    expect(restorePipBounds(null, [LEFT, RIGHT], WIDE, LEFT)).toEqual(defaultPipBounds(LEFT, WIDE))
  })

  it('puts it back where it was left', () => {
    const saved = { x: 100, y: 80, width: 640, height: 360 }
    expect(restorePipBounds(saved, [LEFT, RIGHT], WIDE, LEFT)).toEqual(saved)
  })

  it('keeps the width and takes the height from the video playing now', () => {
    const saved = { x: 100, y: 80, width: 640, height: 360 }
    expect(restorePipBounds(saved, [LEFT], 4 / 3, LEFT)).toEqual({
      x: 100,
      y: 80,
      width: 640,
      height: 480
    })
  })

  it('brings back a window left on a display that has gone', () => {
    const saved = { x: 3800, y: 900, width: 640, height: 360 }
    const rect = restorePipBounds(saved, [LEFT], WIDE, LEFT)
    expect(rect.x + rect.width).toBeLessThanOrEqual(LEFT.x + LEFT.width)
    expect(rect.y + rect.height).toBeLessThanOrEqual(LEFT.y + LEFT.height)
    expect(rect.width).toBe(640)
  })

  it('pulls a window hanging off an edge back on, and shrinks one too big to fit', () => {
    const hanging = restorePipBounds({ x: 1700, y: 1000, width: 640, height: 360 }, [LEFT], WIDE, LEFT)
    expect(hanging).toEqual({ x: 1280, y: 792, width: 640, height: 360 })

    const huge = restorePipBounds({ x: 0, y: 0, width: 2400, height: 1350 }, [LEFT], WIDE, LEFT)
    expect(huge.width).toBe(1440)
  })
})

describe('reshape', () => {
  it('keeps the width and stays tucked into the corner it was nearest', () => {
    const tucked = defaultPipBounds(LEFT, WIDE)
    const next = reshape(tucked, 2.4, LEFT)
    expect(next.width).toBe(tucked.width)
    expect(next.height).toBe(200)
    expect(next.x + next.width).toBe(tucked.x + tucked.width)
    expect(next.y + next.height).toBe(tucked.y + tucked.height)
  })

  it('holds the top-left corner for a window in the top-left', () => {
    const next = reshape({ x: 40, y: 40, width: 480, height: 270 }, 4 / 3, LEFT)
    expect(next).toEqual({ x: 40, y: 40, width: 480, height: 360 })
  })
})

describe('resizeFromEdge', () => {
  const start: Rectangle = { x: 1000, y: 600, width: 480, height: 270 }

  it('grows from the right edge with the left edge held, keeping the shape', () => {
    // Taller by 90, split either side of the edge's middle.
    expect(resizeFromEdge(start, 'e', 160, 0, WIDE, LEFT)).toEqual({
      x: 1000,
      y: 555,
      width: 640,
      height: 360
    })
  })

  it('grows from the top-left corner with the bottom-right corner held', () => {
    const rect = resizeFromEdge(start, 'nw', -160, -10, WIDE, LEFT)
    expect(rect.width).toBe(640)
    expect(rect.height).toBe(360)
    expect(rect.x + rect.width).toBe(start.x + start.width)
    expect(rect.y + rect.height).toBe(start.y + start.height)
  })

  it('lets the axis the pointer moved further in decide the size at a corner', () => {
    // Mostly downwards: the height leads, 270 + 90 = 360 → 640 wide.
    const rect = resizeFromEdge(start, 'se', 10, 90, WIDE, LEFT)
    expect(rect).toEqual({ x: 1000, y: 600, width: 640, height: 360 })
  })

  it('grows evenly either side when dragged from the middle of the top edge', () => {
    const rect = resizeFromEdge(start, 'n', 0, -90, WIDE, LEFT)
    expect(rect.width).toBe(640)
    expect(rect.y + rect.height).toBe(start.y + start.height)
    expect(rect.x).toBe(start.x - 80)
  })

  it('stops at the minimum and the maximum', () => {
    expect(resizeFromEdge(start, 'e', -1000, 0, WIDE, LEFT).width).toBe(PIP_MIN_WIDTH)
    expect(resizeFromEdge(start, 'e', 5000, 0, WIDE, LEFT).width).toBe(1440)
  })

  it('holds the anchored side still even at the limit', () => {
    const rect = resizeFromEdge(start, 'w', 1000, 0, WIDE, LEFT)
    expect(rect.x + rect.width).toBe(start.x + start.width)
  })
})

describe('snapToEdges', () => {
  it('lands flush against an edge dropped close to it', () => {
    expect(snapToEdges({ x: 12, y: 500, width: 480, height: 270 }, LEFT)).toEqual({
      x: 0,
      y: 500,
      width: 480,
      height: 270
    })
  })

  it('lands in a corner dropped near two edges', () => {
    const rect = snapToEdges({ x: 1430, y: 870, width: 480, height: 270 }, LEFT)
    expect(rect).toEqual({ x: 1440, y: 882, width: 480, height: 270 })
  })

  it('leaves a window dropped away from the edges where it is', () => {
    const rect = { x: 300, y: 300, width: 480, height: 270 }
    expect(snapToEdges(rect, LEFT)).toEqual(rect)
  })
})

describe('placeWithin', () => {
  it('moves a rectangle the least distance that brings it inside', () => {
    expect(placeWithin({ x: -50, y: 1100, width: 480, height: 270 }, LEFT)).toEqual({
      x: 0,
      y: 882,
      width: 480,
      height: 270
    })
  })
})

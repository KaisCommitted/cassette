import type { Rectangle } from 'electron'

/*
 * Where the picture-in-picture window goes and how big it may be.
 *
 * Pure arithmetic on rectangles, apart from Electron's types, so it can be
 * tested without a screen. The main process supplies the work areas — the
 * part of each display the taskbar leaves free — and the video's shape.
 */

/** The smallest the window may get, whatever the video's shape. */
export const PIP_MIN_WIDTH = 320
export const PIP_MIN_HEIGHT = 160
/** The largest, as a share of the work area in each direction. */
export const PIP_MAX_SHARE = 0.75
/** How wide it opens the first time, as a share of the work area. */
export const PIP_DEFAULT_SHARE = 0.25
/** How far from the corner it opens the first time. */
export const PIP_MARGIN = 24
/** A drop this close to a work-area edge lands flush against it. */
export const PIP_SNAP_DISTANCE = 16

/** An edge or corner of the window, as a compass point. */
export type PipEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Shape of a picture nothing is known about yet. */
export const FALLBACK_ASPECT = 16 / 9

/** Width over height, falling back to 16:9 for anything unusable. */
export function saneAspect(aspect: number | null | undefined): number {
  return typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0.1 && aspect < 10
    ? aspect
    : FALLBACK_ASPECT
}

/** The narrowest and widest the window may be, for this shape in this area. */
export function widthLimits(aspect: number, area: Rectangle): { min: number; max: number } {
  const min = Math.max(PIP_MIN_WIDTH, PIP_MIN_HEIGHT * aspect)
  const max = Math.min(area.width * PIP_MAX_SHARE, area.height * PIP_MAX_SHARE * aspect)
  // A display too small for the minimum gets the most it has room for.
  return { min: Math.min(min, max), max }
}

function clampWidth(width: number, aspect: number, area: Rectangle): number {
  const { min, max } = widthLimits(aspect, area)
  return Math.round(Math.max(min, Math.min(max, width)))
}

/** Moves a rectangle the least distance that puts it wholly inside the area. */
export function placeWithin(rect: Rectangle, area: Rectangle): Rectangle {
  const x = Math.max(area.x, Math.min(area.x + area.width - rect.width, rect.x))
  const y = Math.max(area.y, Math.min(area.y + area.height - rect.height, rect.y))
  return { ...rect, x: Math.round(x), y: Math.round(y) }
}

/** Where it opens the first time: the bottom-right corner, a quarter wide. */
export function defaultPipBounds(area: Rectangle, aspect: number): Rectangle {
  const width = clampWidth(area.width * PIP_DEFAULT_SHARE, aspect, area)
  const height = Math.round(width / aspect)
  return {
    x: area.x + area.width - width - PIP_MARGIN,
    y: area.y + area.height - height - PIP_MARGIN,
    width,
    height
  }
}

function overlap(a: Rectangle, b: Rectangle): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function centreDistance(a: Rectangle, b: Rectangle): number {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2)
  const dy = a.y + a.height / 2 - (b.y + b.height / 2)
  return Math.hypot(dx, dy)
}

/**
 * The work area a rectangle belongs to: the one it covers most of, or, when
 * it is on none of them — a display unplugged since — the nearest.
 */
export function areaFor(rect: Rectangle, areas: Rectangle[]): Rectangle | null {
  let best: Rectangle | null = null
  let bestOverlap = 0
  for (const area of areas) {
    const o = overlap(rect, area)
    if (o > bestOverlap) {
      best = area
      bestOverlap = o
    }
  }
  if (best) return best
  let nearest: Rectangle | null = null
  for (const area of areas) {
    if (!nearest || centreDistance(rect, area) < centreDistance(rect, nearest)) nearest = area
  }
  return nearest
}

/**
 * Where it opens: where it was last time, if that is still somewhere on the
 * displays there are now, in the shape of the video playing now.
 *
 * The saved width is kept and the height follows the picture, since the last
 * thing watched may have been another shape. A window left on a display that
 * has since gone, or that would now hang off an edge, is brought back inside
 * the nearest work area rather than opening where nobody can see it.
 */
export function restorePipBounds(
  saved: Rectangle | null,
  areas: Rectangle[],
  aspect: number,
  fallback: Rectangle
): Rectangle {
  if (!saved || !(saved.width > 0)) return defaultPipBounds(fallback, aspect)
  const area = areaFor(saved, areas) ?? fallback
  const width = clampWidth(saved.width, aspect, area)
  return placeWithin({ x: saved.x, y: saved.y, width, height: Math.round(width / aspect) }, area)
}

/**
 * The window in a new shape, when something of another aspect ratio starts
 * playing in it.
 *
 * It keeps its width, and holds on to whichever corner of the screen it is
 * nearest, so a window tucked into the bottom-right stays tucked there.
 */
export function reshape(rect: Rectangle, aspect: number, area: Rectangle): Rectangle {
  const width = clampWidth(rect.width, aspect, area)
  const height = Math.round(width / aspect)
  const right = rect.x + rect.width / 2 > area.x + area.width / 2
  const bottom = rect.y + rect.height / 2 > area.y + area.height / 2
  return placeWithin(
    {
      x: right ? rect.x + rect.width - width : rect.x,
      y: bottom ? rect.y + rect.height - height : rect.y,
      width,
      height
    },
    area
  )
}

/**
 * The window being resized from one edge or corner, keeping its shape.
 *
 * `dx` and `dy` are how far the pointer has moved since the press. The side
 * opposite the one being dragged stays where it is; dragging the middle of
 * an edge grows the window evenly either side of it. From a corner, the
 * direction the pointer went further in decides the size, so the corner
 * follows the hand along either axis.
 */
export function resizeFromEdge(
  start: Rectangle,
  edge: PipEdge,
  dx: number,
  dy: number,
  aspect: number,
  area: Rectangle
): Rectangle {
  const east = edge.includes('e')
  const west = edge.includes('w')
  const north = edge.includes('n')
  const south = edge.includes('s')

  const fromX = east ? start.width + dx : west ? start.width - dx : null
  const fromY = south ? (start.height + dy) * aspect : north ? (start.height - dy) * aspect : null
  let proposed: number
  if (fromX !== null && fromY !== null) {
    proposed = Math.abs(fromX - start.width) >= Math.abs(fromY - start.width) ? fromX : fromY
  } else {
    proposed = fromX ?? fromY ?? start.width
  }

  const width = clampWidth(proposed, aspect, area)
  const height = Math.round(width / aspect)

  const x = west
    ? start.x + start.width - width
    : east
      ? start.x
      : Math.round(start.x + (start.width - width) / 2)
  const y = north
    ? start.y + start.height - height
    : south
      ? start.y
      : Math.round(start.y + (start.height - height) / 2)
  return { x, y, width, height }
}

/**
 * Lands a dropped window flush against any work-area edge it was let go
 * within a few pixels of — and so into a corner, when near two.
 */
export function snapToEdges(
  rect: Rectangle,
  area: Rectangle,
  distance = PIP_SNAP_DISTANCE
): Rectangle {
  let { x, y } = rect
  const right = area.x + area.width - rect.width
  const bottom = area.y + area.height - rect.height
  if (Math.abs(x - area.x) <= distance) x = area.x
  else if (Math.abs(x - right) <= distance) x = right
  if (Math.abs(y - area.y) <= distance) y = area.y
  else if (Math.abs(y - bottom) <= distance) y = bottom
  return { ...rect, x, y }
}

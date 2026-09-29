import { screen, type BrowserWindow, type Point, type Rectangle } from 'electron'
import { readJson, writeJsonAtomic } from '../state/atomicJson'
import type { PlayerViewport } from './playerViewport'
import {
  areaFor,
  placeWithin,
  reshape,
  resizeFromEdge,
  restorePipBounds,
  saneAspect,
  snapToEdges,
  type PipEdge
} from './pipGeometry'

/** How often a drag moves the window: about once a frame. */
const DRAG_MS = 16

/** What a press on the picture-in-picture window started: a move, or a resize from an edge. */
export type PipDragKind = 'move' | PipEdge

export interface PipControllerDeps {
  main: BrowserWindow
  video: BrowserWindow
  viewport: PlayerViewport
  /** The playing video's width over height, or null before it is known. */
  aspect: () => number | null
  /** Where the rectangle is kept between runs. */
  file: string
}

/**
 * The picture-in-picture window: where it opens, how it is dragged about,
 * and what it takes for it to float over other apps.
 *
 * It is the same video window as always, with the overlay still owned by
 * it, so it is only ever re-hung rather than recreated — mpv never notices.
 */
export class PipController {
  private saved: Rectangle | null = null
  private detached = false
  private drag: {
    kind: PipDragKind
    start: Rectangle
    cursor: Point
    area: Rectangle
    timer: ReturnType<typeof setInterval>
  } | null = null

  constructor(private readonly deps: PipControllerDeps) {}

  async load(): Promise<void> {
    const saved = await readJson<Rectangle | null>(this.deps.file, null)
    this.saved = isRect(saved) ? saved : null
  }

  /**
   * Where it opens: where it was left last time, in the shape of what is
   * playing now, on a display that is still there — or, the first time, in
   * the bottom-right corner of the display the player is on.
   */
  openingBounds(): Rectangle {
    const here = screen.getDisplayMatching(this.deps.viewport.bounds()).workArea
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    return restorePipBounds(this.saved, areas, this.aspect(), here)
  }

  /**
   * Takes the video window out from under the library window so it floats
   * over every app, or puts it back.
   *
   * Owned by the library, it would be hidden whenever the library is
   * minimised and sink behind any app brought forward; in picture-in-picture
   * it is neither, so it is its own top-level window, always on top. The
   * overlay is still owned by it, which is what keeps the controls above the
   * picture here as everywhere — and Windows makes an owned window topmost
   * along with its owner, so the overlay itself is never switched. Switching
   * the overlay's always-on-top at every focus change is what once stopped it
   * taking clicks; this happens once on the way in and once on the way out.
   *
   * Both stay tool windows, so neither shows in Alt-Tab or on the taskbar:
   * Cassette keeps its single entry, the library, whatever the player does.
   */
  setDetached(detached: boolean, options: { restoreLibrary?: boolean } = {}): void {
    const { main, video } = this.deps
    if (detached === this.detached || video.isDestroyed() || main.isDestroyed()) return
    this.detached = detached
    if (detached) {
      video.setParentWindow(null)
      video.setAlwaysOnTop(true)
      return
    }
    // A drag still under way belongs to the floating window that is going.
    this.endDrag()
    // Off topmost before it is owned again: Windows spreads a change to
    // non-topmost through owners, and the library must not be caught in it.
    video.setAlwaysOnTop(false)
    video.setParentWindow(main)
    // Windowed and fullscreen both hang off the library window, which may
    // have been minimised while the picture floated on its own. Closing the
    // player from picture-in-picture needs no library, and leaves it be.
    if (options.restoreLibrary !== false && main.isMinimized()) main.restore()
    if (video.isVisible()) video.moveTop()
  }

  /**
   * The window in the shape of the video, holding its nearest corner: when a
   * file of another shape starts, and on every way back into
   * picture-in-picture, since the file may have changed while it was
   * fullscreen.
   */
  reshapeTo(aspect: number | null = this.deps.aspect()): void {
    const rect = this.deps.viewport.pipBounds
    if (!rect || !this.deps.viewport.isPip) return
    const shape = saneAspect(aspect)
    const next = reshape(rect, shape, this.areaOf(rect))
    // Mid-drag, the next step starts from the rectangle the drag began with;
    // left as it was, it would put the old shape straight back.
    if (this.drag) this.drag.start = reshape(this.drag.start, shape, this.drag.area)
    if (sameRect(next, rect)) return
    this.deps.viewport.setPipBounds(next)
    this.remember(next)
  }

  /**
   * Keeps picture-in-picture on the displays there are.
   *
   * Windows moves windows off a display that goes away, and rescaling one
   * changes what fits on it, but the rectangle kept here would put the window
   * straight back where it was on the next sync. So on any change it is
   * brought within a work area again, at a size that display allows, from
   * wherever the window actually is now.
   */
  watchDisplays(): void {
    const refit = (): void => this.refit()
    screen.on('display-removed', refit)
    screen.on('display-added', refit)
    screen.on('display-metrics-changed', refit)
  }

  private refit(): void {
    const { viewport, video } = this.deps
    const kept = viewport.pipBounds
    if (!kept) return
    const now = viewport.isPip && !video.isDestroyed() && video.isVisible() ? video.getBounds() : kept
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    const here = areaFor(now, areas) ?? screen.getPrimaryDisplay().workArea
    const next = restorePipBounds(now, areas, this.aspect(), here)
    if (sameRect(next, kept)) return
    viewport.setPipBounds(next)
    this.remember(next)
  }

  /**
   * Starts moving or resizing with the pointer.
   *
   * The main process follows the cursor itself rather than taking moves from
   * the page: the window slides under the pointer as it goes, so positions
   * reported relative to it are meaningless, and the pointer can leave it
   * altogether on a fast drag.
   */
  startDrag(kind: PipDragKind): void {
    this.endDrag()
    // In the video's shape before anything else, in case that has changed
    // without the window hearing of it.
    this.reshapeTo()
    const start = this.deps.viewport.pipBounds
    if (!start || !this.deps.viewport.isPip) return
    this.drag = {
      kind,
      start,
      cursor: screen.getCursorScreenPoint(),
      area: this.areaOf(start),
      timer: setInterval(() => this.follow(), DRAG_MS)
    }
  }

  /**
   * Lets go: a moved window takes a size the display it landed on allows — a
   * big window brought from a big display to a small one shrinks to fit —
   * and snaps to an edge it was dropped near; a window grown past the edge of
   * the screen slides back onto it; either is kept for next time.
   */
  endDrag(): void {
    const drag = this.drag
    if (!drag) return
    clearInterval(drag.timer)
    this.drag = null
    this.follow(drag)
    const rect = this.deps.viewport.pipBounds
    if (!rect || !this.deps.viewport.isPip) return
    const area = this.areaOf(rect)
    const settled = placeWithin(
      drag.kind === 'move' ? snapToEdges(reshape(rect, this.aspect(), area), area) : rect,
      area
    )
    if (!sameRect(settled, rect)) this.deps.viewport.setPipBounds(settled)
    this.remember(settled)
  }

  private follow(drag = this.drag): void {
    if (!drag || !this.deps.viewport.isPip) return
    const now = screen.getCursorScreenPoint()
    if (drag.kind === 'move') {
      const origin = moveAcrossDisplays(drag.start, drag.cursor, now)
      this.deps.viewport.setPipBounds({ ...drag.start, ...origin })
    } else {
      this.deps.viewport.setPipBounds(
        resizeFromEdge(
          drag.start,
          drag.kind,
          now.x - drag.cursor.x,
          now.y - drag.cursor.y,
          this.aspect(),
          drag.area
        )
      )
    }
  }

  private aspect(): number {
    return saneAspect(this.deps.aspect())
  }

  private areaOf(rect: Rectangle): Rectangle {
    const areas = screen.getAllDisplays().map((d) => d.workArea)
    return areaFor(rect, areas) ?? screen.getDisplayMatching(rect).workArea
  }

  private remember(rect: Rectangle): void {
    this.saved = rect
    void writeJsonAtomic(this.deps.file, rect).catch((error: Error) => {
      console.error('[pip] could not save where it was:', error.message)
    })
  }
}

/**
 * Where the window's top-left corner goes when the pointer has moved from
 * `from` to `to`.
 *
 * Measured in physical pixels. Electron's coordinates are scaled per
 * display, so between two displays with different scaling they jump at the
 * boundary; a move reckoned in them made the window leap as the pointer
 * crossed. Physical pixels run continuously across every display.
 */
function moveAcrossDisplays(start: Rectangle, from: Point, to: Point): Point {
  if (process.platform !== 'win32') {
    return { x: start.x + to.x - from.x, y: start.y + to.y - from.y }
  }
  const a = screen.dipToScreenPoint(from)
  const b = screen.dipToScreenPoint(to)
  const origin = screen.dipToScreenPoint({ x: start.x, y: start.y })
  const moved = screen.screenToDipPoint({ x: origin.x + b.x - a.x, y: origin.y + b.y - a.y })
  return { x: Math.round(moved.x), y: Math.round(moved.y) }
}

function sameRect(a: Rectangle, b: Rectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function isRect(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]))
}

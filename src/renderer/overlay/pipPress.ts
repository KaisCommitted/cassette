/** How far a press on the picture has to travel before it is a move, not a click. */
export const MOVE_THRESHOLD_PX = 4

export interface PressHandlers {
  /** The press has travelled far enough to be a move: start moving the window. */
  onMoveStart: () => void
  /** A move has ended, however it ended. */
  onMoveEnd: () => void
  /** The press came up without ever becoming a move: it was a click. */
  onTap: () => void
}

/**
 * Tells a click on the picture-in-picture window from a drag of it.
 *
 * A press only becomes a move once it has travelled a few pixels, and only a
 * press that never did counts as a click, when it comes up. Mouse bindings
 * on the left button used to be sent on the way down, so a left-click
 * binding — play/pause, say — fired at the start of every drag.
 */
export function createPressTracker(handlers: PressHandlers, threshold = MOVE_THRESHOLD_PX) {
  let press: { id: number; x: number; y: number; moving: boolean } | null = null

  return {
    down(id: number, x: number, y: number): void {
      press = { id, x, y, moving: false }
    },
    move(id: number, x: number, y: number): void {
      if (!press || press.moving || id !== press.id) return
      if (Math.hypot(x - press.x, y - press.y) < threshold) return
      press.moving = true
      handlers.onMoveStart()
    },
    /** The button came up. */
    up(id: number): void {
      if (!press || id !== press.id) return
      const { moving } = press
      press = null
      if (moving) handlers.onMoveEnd()
      else handlers.onTap()
    },
    /** The press was taken away — cancelled, or its capture lost — without coming up here. */
    cancel(id: number): void {
      if (!press || id !== press.id) return
      const { moving } = press
      press = null
      if (moving) handlers.onMoveEnd()
    }
  }
}

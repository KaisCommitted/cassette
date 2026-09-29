import { useRef, type PointerEvent } from 'react'
import type { PlaybackState } from '@shared/types'
import { Control } from './ControlBar'
import { createPressTracker } from './pipPress'
import { SeekBar } from './SeekBar'

const api = window.cassette

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

/**
 * The controls of the small floating window: play and pause, a skip either
 * way, where you are, the way back to the full player and the way out.
 *
 * Everything else — subtitles, audio, speed, the sleep timer — stays with the
 * full player, and on its keys once this window is clicked.
 */
export function PipControls({ state, onActivity }: { state: PlaybackState; onActivity: () => void }) {
  return (
    <div className="pip-controls" onMouseMove={onActivity}>
      <div className="pip-corner">
        <Control
          icon="pip-exit"
          label="Back to the full player"
          onClick={() => void api.togglePip()}
        />
        <Control icon="close" label="Close the player" onClick={() => void api.stop()} />
      </div>

      <div className="pip-middle">
        <Control icon="back-10s" label="Back 10 seconds" onClick={() => void api.seekRelative(-10)} />
        <Control
          icon={state.paused ? 'play' : 'pause'}
          label={state.paused ? 'Play' : 'Pause'}
          primary
          onClick={() => void api.togglePause()}
        />
        <Control
          icon="forward-30s"
          label="Forward 30 seconds"
          onClick={() => void api.seekRelative(30)}
        />
      </div>

      <div className="pip-seek">
        <SeekBar
          position={state.positionSeconds}
          duration={state.durationSeconds}
          onSeek={(s) => void api.seekAbsolute(s)}
          onActivity={onActivity}
        />
      </div>
    </div>
  )
}

/**
 * Thin strips along the edges and corners that resize the window.
 *
 * There is no native frame to grab — a transparent window cannot have one,
 * and this one covers the picture anyway — so these stand in for it. The
 * main process follows the pointer from the press until it lets go (see
 * PipController).
 */
export function PipEdges() {
  const end = (): void => api.endPipDrag()
  return (
    <>
      {EDGES.map((edge) => (
        <div
          key={edge}
          className={`pip-edge pip-edge-${edge}`}
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            api.startPipDrag(edge)
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
        />
      ))}
    </>
  )
}

/**
 * Moving the window by dragging the picture.
 *
 * A press only becomes a move once it has travelled a few pixels, and a
 * press that never did is a click, passed to `onTap` as it comes up — so a
 * click or double click on the picture still reaches the bindings as it
 * does in the full player, without a left-click binding firing at the start
 * of every drag.
 */
export function usePipMove(enabled: boolean, onTap: () => void) {
  const tapRef = useRef(onTap)
  tapRef.current = onTap
  const tracker = useRef(
    createPressTracker({
      onMoveStart: () => api.startPipDrag('move'),
      onMoveEnd: () => api.endPipDrag(),
      onTap: () => tapRef.current()
    })
  ).current

  return {
    onPointerDown: (e: PointerEvent<HTMLDivElement>): void => {
      if (!enabled || e.button !== 0 || e.currentTarget !== e.target) return
      tracker.down(e.pointerId, e.screenX, e.screenY)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>): void =>
      tracker.move(e.pointerId, e.screenX, e.screenY),
    onPointerUp: (e: PointerEvent<HTMLDivElement>): void => tracker.up(e.pointerId),
    onPointerCancel: (e: PointerEvent<HTMLDivElement>): void => tracker.cancel(e.pointerId),
    onLostPointerCapture: (e: PointerEvent<HTMLDivElement>): void => tracker.cancel(e.pointerId)
  }
}

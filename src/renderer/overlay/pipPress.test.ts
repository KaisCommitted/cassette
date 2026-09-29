import { describe, expect, it, vi } from 'vitest'
import { createPressTracker } from './pipPress'

function tracker() {
  const handlers = { onMoveStart: vi.fn(), onMoveEnd: vi.fn(), onTap: vi.fn() }
  return { t: createPressTracker(handlers, 4), ...handlers }
}

describe('createPressTracker', () => {
  it('counts a press that comes up where it went down as a click', () => {
    const { t, onTap, onMoveStart } = tracker()
    t.down(1, 100, 100)
    t.move(1, 102, 101)
    t.up(1)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onMoveStart).not.toHaveBeenCalled()
  })

  it('turns a press into a move once it travels, and never into a click', () => {
    const { t, onTap, onMoveStart, onMoveEnd } = tracker()
    t.down(1, 100, 100)
    t.move(1, 110, 100)
    t.move(1, 200, 150)
    t.up(1)
    expect(onMoveStart).toHaveBeenCalledTimes(1)
    expect(onMoveEnd).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('ends a move that is cancelled, and makes no click of a cancelled press', () => {
    const { t, onTap, onMoveEnd } = tracker()
    t.down(1, 0, 0)
    t.move(1, 50, 0)
    t.cancel(1)
    expect(onMoveEnd).toHaveBeenCalledTimes(1)

    t.down(2, 0, 0)
    t.cancel(2)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('ignores the capture being lost after the button already came up', () => {
    const { t, onMoveEnd, onTap } = tracker()
    t.down(1, 0, 0)
    t.move(1, 50, 0)
    t.up(1)
    t.cancel(1)
    expect(onMoveEnd).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('ignores another pointer', () => {
    const { t, onMoveStart, onTap } = tracker()
    t.down(1, 0, 0)
    t.move(2, 50, 0)
    t.up(2)
    expect(onMoveStart).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
  })
})

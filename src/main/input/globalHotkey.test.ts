import { describe, expect, it } from 'vitest'
import { GlobalHotkeyMachine } from './globalHotkey'

function machine(over: Partial<Record<'armed' | 'focused', boolean>> = {}) {
  const calls: string[] = []
  const state = { armed: over.armed ?? true, focused: over.focused ?? true }
  const m = new GlobalHotkeyMachine({
    isArmed: () => state.armed,
    isAppFocused: () => state.focused,
    pauseAndHide: async () => {
      calls.push('pauseAndHide')
      state.focused = false
    },
    restoreAndResume: async () => {
      calls.push('restoreAndResume')
      state.focused = true
    }
  })
  return { m, calls, state }
}

describe('GlobalHotkeyMachine', () => {
  it('pauses and hides when armed and focused', async () => {
    const { m, calls } = machine()
    expect(await m.trigger()).toBe('hidden')
    expect(calls).toEqual(['pauseAndHide'])
  })

  it('does nothing while browsing the library', async () => {
    const { m, calls } = machine({ armed: false })
    expect(await m.trigger()).toBe('ignored')
    expect(calls).toEqual([])
  })

  it('restores and resumes on the second press', async () => {
    const { m, calls } = machine()
    await m.trigger()
    expect(await m.trigger()).toBe('restored')
    expect(calls).toEqual(['pauseAndHide', 'restoreAndResume'])
  })

  it('will not restore something it did not hide', async () => {
    // Paused with Space and alt-tabbed away by hand: the app is not focused
    // and the flag was never set, so the key must not pull it back.
    const { m, calls } = machine({ focused: false })
    expect(await m.trigger()).toBe('ignored')
    expect(calls).toEqual([])
  })

  it('stops being a restore once playback is stopped another way', async () => {
    const { m } = machine()
    await m.trigger()
    m.clear()
    expect(m.isSuspended).toBe(false)
  })

  it('toggles back and forth without getting stuck', async () => {
    const { m } = machine()
    expect(await m.trigger()).toBe('hidden')
    expect(await m.trigger()).toBe('restored')
    expect(await m.trigger()).toBe('hidden')
    expect(await m.trigger()).toBe('restored')
  })
})

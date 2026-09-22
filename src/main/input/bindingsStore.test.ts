import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BindingsStore } from './bindingsStore'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mnf-bind-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function store(name = `${Math.random()}.json`): BindingsStore {
  return new BindingsStore(join(dir, name))
}

describe('BindingsStore', () => {
  it('ships with the VLC defaults', async () => {
    const s = store()
    await s.load()
    expect(s.resolve('key:Space')).toBe('playPause')
    expect(s.resolve('key:g')).toBe('subtitleDelayDown')
  })

  it('binds mouse buttons exactly like keys', async () => {
    const s = store()
    await s.load()
    await s.assign('mouse:button4', 'seekShortBack')
    expect(s.resolve('mouse:button4')).toBe('seekShortBack')
  })

  it('takes a descriptor away from whatever held it before', async () => {
    const s = store()
    await s.load()
    await s.assign('key:Space', 'mute')
    expect(s.resolve('key:Space')).toBe('mute')
  })

  it('allows several bindings for one action', async () => {
    const s = store()
    await s.load()
    await s.assign('mouse:button5', 'playPause')
    // Containment, not equality: the shipped defaults for an action may grow,
    // and this test is about supporting more than one binding at a time.
    const descriptors = s.descriptorsFor('playPause')
    expect(descriptors).toContain('key:Space')
    expect(descriptors).toContain('mouse:button5')
  })

  it('persists across a reload', async () => {
    const file = 'persist.json'
    const a = store(file)
    await a.load()
    await a.assign('mouse:button4', 'nextEpisode')
    const b = store(file)
    await b.load()
    expect(b.resolve('mouse:button4')).toBe('nextEpisode')
  })

  it('fills in defaults for actions added after the file was saved', async () => {
    const file = 'partial.json'
    const a = store(file)
    await a.load()
    await a.assign('key:z', 'mute')
    const b = store(file)
    await b.load()
    // Still present even though the saved file only named one binding.
    expect(b.resolve('key:Space')).toBe('playPause')
    expect(b.resolve('key:z')).toBe('mute')
  })

  it('restores the defaults on reset', async () => {
    const s = store()
    await s.load()
    await s.assign('key:Space', 'mute')
    await s.reset()
    expect(s.resolve('key:Space')).toBe('playPause')
  })

  it('can clear a binding', async () => {
    const s = store()
    await s.load()
    await s.unassign('key:Space')
    expect(s.resolve('key:Space')).toBeNull()
  })
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SubtitleChoiceStore } from './subtitleChoiceStore'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cassette-subchoice-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function store(): SubtitleChoiceStore {
  return new SubtitleChoiceStore(join(dir, `${Math.random()}.json`))
}

describe('SubtitleChoiceStore', () => {
  it('has nothing for a season that was never chosen for', () => {
    expect(store().get('the-mentalist', 6)).toBeUndefined()
  })

  it('remembers a position by series and season', async () => {
    const s = store()
    await s.set('the-mentalist', 6, 1)
    expect(s.get('the-mentalist', 6)).toBe(1)
  })

  it('keeps seasons of the same series apart', async () => {
    const s = store()
    await s.set('the-mentalist', 6, 1)
    await s.set('the-mentalist', 7, 0)
    expect(s.get('the-mentalist', 6)).toBe(1)
    expect(s.get('the-mentalist', 7)).toBe(0)
  })

  it('remembers off as its own choice, not as nothing chosen', async () => {
    const s = store()
    await s.set('the-mentalist', 6, null)
    expect(s.get('the-mentalist', 6)).toBeNull()
  })

  it('survives a save and reload', async () => {
    const file = join(dir, 'persist.json')
    const a = new SubtitleChoiceStore(file)
    await a.set('the-mentalist', 6, 1)
    const b = new SubtitleChoiceStore(file)
    await b.load()
    expect(b.get('the-mentalist', 6)).toBe(1)
  })
})

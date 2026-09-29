import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SubtitlePick } from '../player/trackChoice'
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

const english: SubtitlePick = { index: 1, lang: 'eng', external: true, flavour: 'full' }
const french: SubtitlePick = { index: 0, lang: 'fre', external: false, flavour: 'full' }

describe('SubtitleChoiceStore', () => {
  it('has nothing for a season that was never chosen for', () => {
    expect(store().get('the-mentalist', 6)).toBeUndefined()
  })

  it('remembers a pick by series and season', async () => {
    const s = store()
    await s.set('the-mentalist', 6, english)
    expect(s.get('the-mentalist', 6)).toEqual(english)
  })

  it('keeps seasons of the same series apart', async () => {
    const s = store()
    await s.set('the-mentalist', 6, english)
    await s.set('the-mentalist', 7, french)
    expect(s.get('the-mentalist', 6)).toEqual(english)
    expect(s.get('the-mentalist', 7)).toEqual(french)
  })

  it('remembers off as its own choice, not as nothing chosen', async () => {
    const s = store()
    await s.set('the-mentalist', 6, null)
    expect(s.get('the-mentalist', 6)).toBeNull()
  })

  it('survives a save and reload', async () => {
    const file = join(dir, 'persist.json')
    const a = new SubtitleChoiceStore(file)
    await a.set('the-mentalist', 6, english)
    const b = new SubtitleChoiceStore(file)
    await b.load()
    expect(b.get('the-mentalist', 6)).toEqual(english)
  })

  it('drops the bare positions older versions saved, but keeps off', async () => {
    const file = join(dir, 'legacy.json')
    await writeFile(file, JSON.stringify({ 'the mentalist:6': 0, 'the mentalist:5': null }))
    const s = new SubtitleChoiceStore(file)
    await s.load()
    expect(s.get('the mentalist', 6)).toBeUndefined()
    expect(s.get('the mentalist', 5)).toBeNull()
  })
})

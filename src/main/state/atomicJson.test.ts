import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readJson, writeJsonAtomic } from './atomicJson'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cassette-json-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('atomicJson', () => {
  it('round-trips a value', async () => {
    const file = join(dir, 'a.json')
    await writeJsonAtomic(file, { hello: 'world' })
    expect(await readJson(file, { hello: '' })).toEqual({ hello: 'world' })
  })

  it('returns the fallback when the file does not exist', async () => {
    expect(await readJson(join(dir, 'missing.json'), { n: 1 })).toEqual({ n: 1 })
  })

  it('returns the fallback when the file is corrupt', async () => {
    const file = join(dir, 'bad.json')
    await writeJsonAtomic(file, { ok: true })
    await writeFile(file, '{ not json')
    expect(await readJson(file, { ok: false })).toEqual({ ok: false })
  })

  /*
   * Saving the same file twice at once is not hypothetical here: watch
   * positions are written on a timer with `void save()` while closing the
   * player awaits another `save()`, so closing during playback overlaps them.
   * With one temp name per file, the first rename moves the temp away and the
   * second fails on a file that is no longer there — losing the write, and
   * taking the rejection somewhere nobody is catching it.
   */
  /*
   * Repeated, because the damage is a race and a single attempt finds it only
   * about a third of the time. Forty rounds makes a miss vanishingly unlikely,
   * and the old implementation failed this within the first few.
   */
  it('survives writes to the same file at once', async () => {
    const rejections: string[] = []
    const unreadable: number[] = []

    for (let round = 0; round < 40; round++) {
      const file = join(dir, `concurrent-${round}.json`)
      const results = await Promise.allSettled([
        writeJsonAtomic(file, { who: 'first', pad: 'x'.repeat(2000) }),
        writeJsonAtomic(file, { who: 'second', pad: 'y'.repeat(2000) })
      ])
      for (const r of results) {
        if (r.status === 'rejected') rejections.push(String((r.reason as { code?: string }).code))
      }
      // Read back as text: readJson hides a corrupt file behind the fallback,
      // which is exactly how this went unnoticed in the first place.
      const raw = await readFile(file, 'utf8')
      try {
        const parsed = JSON.parse(raw) as { who?: string }
        if (parsed.who !== 'first' && parsed.who !== 'second') unreadable.push(round)
      } catch {
        unreadable.push(round)
      }
    }

    expect(rejections).toEqual([])
    expect(unreadable).toEqual([])
  })

  it('leaves no temp files behind after concurrent writes', async () => {
    const file = join(dir, 'concurrent-clean.json')
    await Promise.all([
      writeJsonAtomic(file, { n: 1 }),
      writeJsonAtomic(file, { n: 2 }),
      writeJsonAtomic(file, { n: 3 })
    ])
    const leftovers = (await readdir(dir)).filter((n) => n.includes('concurrent-clean.json.'))
    expect(leftovers).toEqual([])
  })

  it('leaves no temp files behind', async () => {
    const file = join(dir, 'clean.json')
    await writeJsonAtomic(file, { a: 1 })
    const leftovers = (await readdir(dir)).filter((n) => n.includes('.tmp'))
    expect(leftovers).toEqual([])
  })
})

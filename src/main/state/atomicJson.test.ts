import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
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

  it('leaves no temp files behind', async () => {
    const file = join(dir, 'clean.json')
    await writeJsonAtomic(file, { a: 1 })
    const leftovers = (await readdir(dir)).filter((n) => n.includes('.tmp'))
    expect(leftovers).toEqual([])
  })
})

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { walk } from './walker'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mnf-'))
  await mkdir(join(root, 'Series', 'Show', 'Season 1 720p WEBRip'), { recursive: true })
  await mkdir(join(root, 'Movies'), { recursive: true })
  await writeFile(
    join(root, 'Series', 'Show', 'Season 1 720p WEBRip', 'Show S01E01.mkv'),
    'x'
  )
  await writeFile(join(root, 'Movies', 'Film.2020.1080p.mkv'), 'xx')
  await writeFile(join(root, 'Series', 'desktop.ini'), 'junk')
  await writeFile(join(root, 'Movies', 'notes.txt'), 'junk')
  await writeFile(join(root, 'Movies', 'Film.sample.mkv'), 'junk')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('walk', () => {
  it('finds media files recursively', async () => {
    const files = await walk([root])
    expect(files.map((f) => f.path.split(/[\\/]/).pop()).sort()).toEqual([
      'Film.2020.1080p.mkv',
      'Show S01E01.mkv'
    ])
  })

  it('reports real file sizes', async () => {
    const files = await walk([root])
    const film = files.find((f) => f.path.endsWith('Film.2020.1080p.mkv'))!
    expect(film.sizeBytes).toBe(2)
  })

  it('skips desktop.ini, non-media extensions and sample files', async () => {
    const names = (await walk([root])).map((f) => f.path)
    expect(names.some((n) => n.includes('desktop.ini'))).toBe(false)
    expect(names.some((n) => n.endsWith('.txt'))).toBe(false)
    expect(names.some((n) => n.includes('sample'))).toBe(false)
  })

  it('returns an empty list for a root that does not exist', async () => {
    expect(await walk([join(root, 'nope')])).toEqual([])
  })
})

import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { walk } from './walker'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cassette-'))
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
  // Titles that happen to contain a word release groups use for junk.
  await mkdir(join(root, 'Series', 'Trailer Park Boys'), { recursive: true })
  await writeFile(join(root, 'Series', 'Trailer Park Boys', 'Trailer.Park.Boys.S01E01.mkv'), 'x')
  await mkdir(join(root, 'Movies', 'Extra Ordinary (2019)'), { recursive: true })
  await writeFile(
    join(root, 'Movies', 'Extra Ordinary (2019)', 'Extra.Ordinary.2019.1080p.mkv'),
    'x'
  )
  // The junk itself, which must still be skipped.
  await writeFile(join(root, 'Movies', 'Film.2020.Trailer.mkv'), 'junk')
  await mkdir(join(root, 'Movies', 'Film (2020)', 'Extras'), { recursive: true })
  await writeFile(join(root, 'Movies', 'Film (2020)', 'Extras', 'Deleted.Scenes.mkv'), 'junk')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('walk', () => {
  it('finds media files recursively', async () => {
    const files = await walk([root])
    expect(files.map((f) => f.path.split(/[\\/]/).pop()).sort()).toEqual([
      'Extra.Ordinary.2019.1080p.mkv',
      'Film.2020.1080p.mkv',
      'Show S01E01.mkv',
      'Trailer.Park.Boys.S01E01.mkv'
    ])
  })

  it('keeps an episode whose show is named after a junk word', async () => {
    const names = (await walk([root])).map((f) => f.path.split(/[\\/]/).pop())
    expect(names).toContain('Trailer.Park.Boys.S01E01.mkv')
  })

  it('keeps a film whose title merely begins with "extra"', async () => {
    const names = (await walk([root])).map((f) => f.path.split(/[\\/]/).pop())
    expect(names).toContain('Extra.Ordinary.2019.1080p.mkv')
  })

  it('still skips a trailer file and an Extras folder', async () => {
    const names = (await walk([root])).map((f) => f.path.split(/[\\/]/).pop())
    expect(names).not.toContain('Film.2020.Trailer.mkv')
    expect(names).not.toContain('Deleted.Scenes.mkv')
  })

  it('keeps going when one file cannot be inspected', async () => {
    const files = await walk([root], {
      readdir,
      stat: (path) =>
        path.endsWith('Film.2020.1080p.mkv') ? Promise.reject(new Error('EPERM')) : stat(path)
    })
    const names = files.map((f) => f.path.split(/[\\/]/).pop())
    expect(names).not.toContain('Film.2020.1080p.mkv')
    expect(names).toContain('Show S01E01.mkv')
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

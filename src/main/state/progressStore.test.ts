import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { MediaFile, SeriesEntry } from '@shared/types'
import { ProgressStore } from './progressStore'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cassette-prog-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function store(): ProgressStore {
  return new ProgressStore(join(dir, `${Math.random()}.json`))
}

function epFile(key: string, episode: number): MediaFile {
  return {
    path: key,
    sizeBytes: 1,
    key,
    title: 'M',
    year: null,
    season: 1,
    episodes: [episode],
    kind: 'series',
    tags: []
  }
}

const series: SeriesEntry = {
  kind: 'series',
  id: 'm',
  title: 'M',
  year: null,
  seasons: [
    {
      season: 1,
      episodes: [
        { file: epFile('k1', 1), season: 1, episodes: [1], label: 'S01E01' },
        { file: epFile('k2', 2), season: 1, episodes: [2], label: 'S01E02' }
      ]
    }
  ]
}

describe('ProgressStore', () => {
  it('remembers a position', () => {
    const s = store()
    s.record('k1', 120, 2400)
    expect(s.get('k1')?.positionSeconds).toBe(120)
  })

  it('does not mark an item finished below 90%', () => {
    const s = store()
    s.record('k1', 2159, 2400) // 89.96%
    expect(s.isFinished('k1')).toBe(false)
  })

  it('marks an item finished at or past 90%', () => {
    const s = store()
    s.record('k1', 2160, 2400) // exactly 90%
    expect(s.isFinished('k1')).toBe(true)
  })

  it('offers the first episode when nothing has been watched', () => {
    expect(store().nextUnwatched(series)?.file.key).toBe('k1')
  })

  it('offers the next episode once the first is finished', () => {
    const s = store()
    s.record('k1', 2400, 2400)
    expect(s.nextUnwatched(series)?.file.key).toBe('k2')
  })

  it('offers nothing once every episode is finished', () => {
    const s = store()
    s.record('k1', 2400, 2400)
    s.record('k2', 2400, 2400)
    expect(s.nextUnwatched(series)).toBeNull()
  })

  it('survives a save and reload', async () => {
    const file = join(dir, 'persist.json')
    const a = new ProgressStore(file)
    a.record('k1', 42, 100)
    await a.save()
    const b = new ProgressStore(file)
    await b.load()
    expect(b.get('k1')?.positionSeconds).toBe(42)
  })

  it('ignores a zero duration rather than dividing by zero', () => {
    const s = store()
    s.record('k1', 10, 0)
    expect(s.isFinished('k1')).toBe(false)
  })
})

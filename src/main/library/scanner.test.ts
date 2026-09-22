import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The walker and the probe are both replaced: one touches the disk, the other
 * spawns mpv and needs Electron for the binary's path. What is under test is
 * the decision the scanner makes about each file, not either of those.
 */
const state = vi.hoisted(() => ({
  walked: [] as Array<{ path: string; sizeBytes: number; modifiedMs: number }>,
  durations: new Map<string, number | null>(),
  probed: [] as string[],
  saves: 0
}))

vi.mock('./walker', () => ({
  walk: async () => state.walked
}))

vi.mock('./mediaProbe', () => ({
  MediaProbe: class {
    async load(): Promise<void> {}
    async save(): Promise<void> {
      state.saves++
    }
    cached(): null {
      return null
    }
    async probe(_key: string, path: string): Promise<unknown> {
      state.probed.push(path)
      return { durationSeconds: state.durations.get(path) ?? 3000, subtitles: [] }
    }
  },
  killRunningProbes: () => 0
}))

const { scanLibrary, ScanCancelled } = await import('./scanner')

const MINUTE = 60 * 1000

function file(
  name: string,
  options: { minutesOld?: number; durationSeconds?: number | null } = {}
): void {
  const path = `C:\\Watch\\${name}`
  state.walked.push({
    path,
    sizeBytes: 700_000_000,
    modifiedMs: Date.now() - (options.minutesOld ?? 600) * MINUTE
  })
  if (options.durationSeconds !== undefined) {
    state.durations.set(path, options.durationSeconds)
  }
}

function titles(library: Awaited<ReturnType<typeof scanLibrary>>): string[] {
  const out: string[] = []
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) out.push(episode.file.path)
    }
  }
  for (const movie of library.movies) out.push(movie.file.path)
  return out.map((p) => p.split('\\').pop()!)
}

beforeEach(() => {
  state.walked = []
  state.durations = new Map()
  state.probed = []
  state.saves = 0
})

describe('scanLibrary', () => {
  it('drops files shorter than the minimum', async () => {
    file('Show S01E01.mkv', { durationSeconds: 2400 })
    file('Show S01E02 trailer clip.mkv', { durationSeconds: 90 })

    const library = await scanLibrary(['C:\\Watch'], { minimumDurationMinutes: 15 })
    expect(titles(library)).toEqual(['Show S01E01.mkv'])
  })

  it('keeps a file it could not read rather than hiding it', async () => {
    file('Show S01E01.mkv', { durationSeconds: null })

    const library = await scanLibrary(['C:\\Watch'], { minimumDurationMinutes: 15 })
    expect(titles(library)).toEqual(['Show S01E01.mkv'])
  })

  // A download in progress reads as a short file, because only part of it
  // exists yet. Dropping it makes episodes disappear from the library while
  // they download and reappear later, which looks like the library losing
  // things at random.
  it('keeps a file that is still being written, however short it reads', async () => {
    file('Show S06E01.mkv', { minutesOld: 1, durationSeconds: 120 })

    const library = await scanLibrary(['C:\\Watch'], { minimumDurationMinutes: 15 })
    expect(titles(library)).toEqual(['Show S06E01.mkv'])
  })

  it('does not even open a file that is still being written', async () => {
    file('Show S06E01.mkv', { minutesOld: 1 })
    file('Show S01E01.mkv', { minutesOld: 600 })

    await scanLibrary(['C:\\Watch'], { minimumDurationMinutes: 15 })
    expect(state.probed).toEqual(['C:\\Watch\\Show S01E01.mkv'])
  })

  it('checks nothing at all when no minimum is set', async () => {
    file('Show S01E01.mkv', { durationSeconds: 30 })

    const library = await scanLibrary(['C:\\Watch'], { minimumDurationMinutes: 0 })
    expect(state.probed).toEqual([])
    expect(titles(library)).toEqual(['Show S01E01.mkv'])
  })

  it('reports how far it has got', async () => {
    file('Show S01E01.mkv')
    file('Show S01E02.mkv')

    const seen: Array<[number, number]> = []
    await scanLibrary(['C:\\Watch'], {
      minimumDurationMinutes: 15,
      onProgress: (done, total) => seen.push([done, total])
    })
    expect(seen).toEqual([
      [0, 2],
      [1, 2],
      [2, 2]
    ])
  })

  describe('when stopped part way', () => {
    it('gives up rather than returning half a library', async () => {
      file('Show S01E01.mkv')
      file('Show S01E02.mkv')

      const controller = new AbortController()
      const scan = scanLibrary(['C:\\Watch'], {
        minimumDurationMinutes: 15,
        signal: controller.signal,
        onProgress: () => controller.abort()
      })
      await expect(scan).rejects.toBeInstanceOf(ScanCancelled)
    })

    // Otherwise a long first scan that gets interrupted has to start over.
    it('still writes out what it managed to read', async () => {
      file('Show S01E01.mkv')
      file('Show S01E02.mkv')

      const controller = new AbortController()
      await scanLibrary(['C:\\Watch'], {
        minimumDurationMinutes: 15,
        signal: controller.signal,
        onProgress: (done) => {
          if (done === 1) controller.abort()
        }
      }).catch(() => undefined)

      expect(state.saves).toBeGreaterThan(0)
    })
  })
})

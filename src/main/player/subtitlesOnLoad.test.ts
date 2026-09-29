import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PlaybackState, TrackInfo } from '@shared/types'
import {
  chooseSubtitlesOnLoad,
  loadExternalSubtitles,
  type SubtitleContext,
  type SubtitlePlayer
} from './subtitlesOnLoad'

let folder: string
let e1: string
let e2: string

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'cassette-onload-'))
  e1 = join(folder, 'Show S01E01.mkv')
  e2 = join(folder, 'Show S01E02.mkv')
  for (const name of [
    'Show S01E01.mkv',
    'Show S01E02.mkv',
    'Show S01E01.eng.srt',
    'Show S01E01.fre.srt',
    'Show S01E02.eng.srt'
  ]) {
    await writeFile(join(folder, name), 'x')
  }
})

afterAll(async () => {
  await rm(folder, { recursive: true, force: true })
})

const embeddedEnglish: TrackInfo = {
  id: 1, type: 'sub', title: 'English', lang: 'eng', codec: 'subrip',
  selected: false, externalFilename: null
}

/**
 * Stands in for mpv. `during` runs inside a chosen call, which is how a test
 * moves the player on to the next episode at the worst possible moment.
 */
function player(
  path: string,
  during: Partial<Record<'refreshTracks' | 'addSubtitleFile', (p: FakePlayer) => void>> = {}
): FakePlayer {
  const p: FakePlayer = {
    path,
    added: [],
    selected: [],
    tracks: [embeddedEnglish],
    getState: () => ({ path: p.path, tracks: p.tracks }) as unknown as PlaybackState,
    refreshTracks: vi.fn(async () => {
      during.refreshTracks?.(p)
      return p.tracks
    }),
    loadedSubtitlePaths: () => new Set(),
    addSubtitleFile: vi.fn(async (file: string) => {
      p.added.push(file)
      during.addSubtitleFile?.(p)
    }),
    setSubtitleTrack: vi.fn(async (id: number | null) => {
      p.selected.push(id)
    })
  }
  return p
}

interface FakePlayer extends SubtitlePlayer {
  path: string | null
  added: string[]
  selected: Array<number | null>
  tracks: TrackInfo[]
}

const context = (mpv: SubtitlePlayer): SubtitleContext => ({
  mpv,
  library: null,
  currentKey: null,
  subtitleChoices: null
})

const config = { preferredSubtitleLanguages: ['eng'], autoEnableSubtitles: true }

describe('loadExternalSubtitles', () => {
  it('adds the playing episode’s own subtitle files', async () => {
    const mpv = player(e1)
    expect(await loadExternalSubtitles(context(mpv), e1)).toBe(2)
    expect(mpv.added.map((p) => p.split(/[\\/]/).pop()).sort()).toEqual([
      'Show S01E01.eng.srt',
      'Show S01E01.fre.srt'
    ])
  })

  it('adds nothing when the player has already moved to another file', async () => {
    const mpv = player(e2)
    expect(await loadExternalSubtitles(context(mpv), e1)).toBe(0)
    expect(mpv.added).toEqual([])
  })

  it('stops when the player moves on while it waits', async () => {
    const mpv = player(e1, { refreshTracks: (p) => (p.path = e2) })
    await loadExternalSubtitles(context(mpv), e1)
    expect(mpv.added).toEqual([])
  })

  it('stops between one file and the next when the player moves on', async () => {
    const mpv = player(e1, { addSubtitleFile: (p) => (p.path = e2) })
    await loadExternalSubtitles(context(mpv), e1)
    expect(mpv.added).toHaveLength(1)
  })
})

describe('chooseSubtitlesOnLoad', () => {
  it('turns on a subtitle for the file that opened', async () => {
    const mpv = player(e1)
    await chooseSubtitlesOnLoad(context(mpv), e1, config)
    expect(mpv.selected).toEqual([1])
  })

  it('chooses nothing for a file that is no longer playing', async () => {
    const mpv = player(e1, { refreshTracks: (p) => (p.path = e2) })
    await chooseSubtitlesOnLoad(context(mpv), e1, config)
    expect(mpv.setSubtitleTrack).not.toHaveBeenCalled()
  })

  it('still picks from the video’s own tracks when loading the files fails', async () => {
    const mpv = player(e1)
    mpv.refreshTracks = vi.fn(async () => {
      throw new Error('mpv did not answer')
    })
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    await chooseSubtitlesOnLoad(context(mpv), e1, config)
    quiet.mockRestore()
    expect(mpv.selected).toEqual([1])
  })
})

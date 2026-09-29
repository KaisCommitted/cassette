import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Library, type MediaFile, type Settings } from '@shared/types'
import { filesInScope, scanOne, wantedLanguages } from './subtitleScan'
import { rankCandidates, rankOpenSubtitles, type SubtitleCandidate } from './openSubtitles'
import { buildZip } from './zipFixture'
import { FolderCache, findLocalSubtitles } from './localSubtitles'

// Nothing is embedded in the empty stand-in videos, and no mpv is started to
// find that out.
vi.mock('./embeddedSubtitles', () => ({
  probeEmbeddedSubtitles: async () => [],
  describeEmbedded: () => ''
}))

function file(key: string): MediaFile {
  return {
    path: `C:\${key}.mkv`, sizeBytes: 1, key, title: 'S', year: null,
    season: 1, episodes: [1], kind: 'series', tags: []
  }
}

const library: Library = {
  scannedAt: '',
  series: [
    {
      kind: 'series', id: 'show', title: 'Show', year: null,
      seasons: [
        { season: 1, episodes: [
          { file: file('a'), season: 1, episodes: [1], label: 'S01E01' },
          { file: file('b'), season: 1, episodes: [2], label: 'S01E02' }
        ] },
        { season: 2, episodes: [
          { file: file('c'), season: 2, episodes: [1], label: 'S02E01' }
        ] }
      ]
    },
    {
      kind: 'series', id: 'other', title: 'Other', year: null,
      seasons: [{ season: 1, episodes: [
        { file: file('d'), season: 1, episodes: [1], label: 'S01E01' }
      ] }]
    }
  ],
  movies: [{ kind: 'movie', id: 'film', title: 'Film', year: 2020, file: file('m') }]
}

describe('filesInScope', () => {
  it('covers a whole series', () => {
    const keys = filesInScope(library, { kind: 'series', seriesId: 'show' }).map((f) => f.file.key)
    expect(keys).toEqual(['a', 'b', 'c'])
  })

  it('covers one season only', () => {
    const keys = filesInScope(library, { kind: 'season', seriesId: 'show', season: 1 })
      .map((f) => f.file.key)
    expect(keys).toEqual(['a', 'b'])
  })

  it('covers a single episode', () => {
    const keys = filesInScope(library, { kind: 'episode', key: 'b' }).map((f) => f.file.key)
    expect(keys).toEqual(['b'])
  })

  it('covers a film', () => {
    const keys = filesInScope(library, { kind: 'movie', key: 'm' }).map((f) => f.file.key)
    expect(keys).toEqual(['m'])
  })

  it('does not stray into another series', () => {
    const keys = filesInScope(library, { kind: 'series', seriesId: 'show' }).map((f) => f.file.key)
    expect(keys).not.toContain('d')
  })

  it('labels each file so progress is readable', () => {
    expect(filesInScope(library, { kind: 'episode', key: 'a' })[0]!.label).toBe('Show S01E01')
  })
})

describe('wantedLanguages', () => {
  const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over })

  it('treats two- and three-letter codes as one language', () => {
    // The shipped default is 'eng, en', which must not mean English twice.
    expect(wantedLanguages(settings({ preferredSubtitleLanguages: ['eng', 'en'] }))).toEqual([
      'eng'
    ])
  })

  it('keeps every distinct language, in the order given', () => {
    const chosen = wantedLanguages(
      settings({ preferredSubtitleLanguages: ['fr', 'English', 'ara'] })
    )
    expect(chosen).toEqual(['fre', 'eng', 'ara'])
  })

  it('takes only the first when fetching every language is off', () => {
    const chosen = wantedLanguages(
      settings({
        preferredSubtitleLanguages: ['fre', 'eng'],
        downloadEveryPreferredLanguage: false
      })
    )
    expect(chosen).toEqual(['fre'])
  })

  it('falls back to English rather than searching for nothing', () => {
    expect(wantedLanguages(settings({ preferredSubtitleLanguages: [] }))).toEqual(['eng'])
  })
})

function candidate(over: Partial<SubtitleCandidate>): SubtitleCandidate {
  return {
    id: '1', fileId: 1, language: 'en', release: '', fileName: '', downloads: 0,
    fromTrusted: false, hashMatch: false, hearingImpaired: false, forced: false,
    season: null, episode: null, ...over
  }
}

describe('rankCandidates', () => {

  it('puts trusted uploads first', () => {
    const list = [candidate({ id: 'a', downloads: 900 }), candidate({ id: 'b', fromTrusted: true })]
    expect(list.sort(rankCandidates)[0]!.id).toBe('b')
  })

  it('falls back to download count', () => {
    const list = [candidate({ id: 'a', downloads: 10 }), candidate({ id: 'b', downloads: 99 })]
    expect(list.sort(rankCandidates)[0]!.id).toBe('b')
  })
})

describe('rankOpenSubtitles', () => {
  const s06e18: MediaFile = {
    path: join('C:', 'Watch', 'The Mentalist S06E18 Forest Green.mkv'), sizeBytes: 1, key: 'k',
    title: 'The Mentalist', year: 2008, season: 6, episodes: [18], kind: 'series', tags: []
  }

  it('drops another episode, whether OpenSubtitles files it so or its name says so', () => {
    const ranked = rankOpenSubtitles(
      [
        candidate({ id: 'filed', season: 6, episode: 19 }),
        candidate({ id: 'named', release: 'The.Mentalist.S06E01.HDTV', season: 6, episode: 18 }),
        candidate({ id: 'right', release: 'The.Mentalist.S06E18.HDTV', season: 6, episode: 18 })
      ],
      s06e18
    )
    expect(ranked.map((c) => c.id)).toEqual(['right'])
  })

  it('drops forced subtitles, and a film named for another year', () => {
    const heat: MediaFile = {
      path: join('C:', 'Films', 'Heat (1995).mkv'), sizeBytes: 1, key: 'h', title: 'Heat',
      year: 1995, season: null, episodes: [], kind: 'movie', tags: []
    }
    const ranked = rankOpenSubtitles(
      [
        candidate({ id: 'forced', forced: true }),
        candidate({ id: 'remake', release: 'Heat.2021.1080p' }),
        candidate({ id: 'right', release: 'Heat.1995.1080p.BluRay' })
      ],
      heat
    )
    expect(ranked.map((c) => c.id)).toEqual(['right'])
  })

  it('puts a hash match first, then this episode, then plain over hearing-impaired', () => {
    const ranked = rankOpenSubtitles(
      [
        candidate({ id: 'hi', season: 6, episode: 18, hearingImpaired: true, fromTrusted: true }),
        candidate({ id: 'named', release: 'The.Mentalist.S06E18.720p' }),
        candidate({ id: 'plain', season: 6, episode: 18 }),
        candidate({ id: 'hash', hashMatch: true })
      ],
      s06e18
    )
    expect(ranked.map((c) => c.id)).toEqual(['hash', 'plain', 'hi', 'named'])
  })

  it('drops an episode result that nothing says is this episode', () => {
    const ranked = rankOpenSubtitles(
      [
        candidate({ id: 'unfiled' }),
        candidate({ id: 'vague', release: 'The.Mentalist.720p.WEB-DL' }),
        candidate({ id: 'hash', hashMatch: true })
      ],
      s06e18
    )
    expect(ranked.map((c) => c.id)).toEqual(['hash'])
  })
})

/**
 * A whole scan against SubDL, answered the way SubDL answered for The
 * Mentalist season 6: season packs first, mixed with each episode's own
 * subtitles, and no episode's own for episode 20.
 */
describe('scanOne against SubDL', () => {
  let folder: string

  beforeAll(async () => {
    folder = join(
      await mkdtemp(join(tmpdir(), 'cassette-scan-')),
      'The Mentalist 2008 Season 6 Complete 720p AMZN WEBRip x264 [i_c]'
    )
    await mkdir(folder, { recursive: true })
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await rm(join(folder, '..'), { recursive: true, force: true })
  })

  const cue = (what: string): string => `1\n00:00:01,000 --> 00:00:03,000\n${what}\n`

  function answer(url: string): { ok: boolean; status: number; json: () => Promise<unknown>; arrayBuffer: () => Promise<ArrayBuffer> } {
    const reply = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
      arrayBuffer: async () => {
        const buffer = body as Buffer
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
      }
    })
    if (url.startsWith('https://api.subdl.com')) {
      const episode = Number(new URL(url).searchParams.get('episode_number'))
      const subtitles: unknown[] = [
        {
          url: '/pack.zip', language: 'EN', hi: false, season: 6, episode: null,
          episode_from: null, episode_end: 0, full_season: true,
          release_name: 'The Mentalist (2008) Season 6 S06 (1080p AMZN WEB-DL x265 HEVC 10bit'
        },
        {
          url: '/range.zip', language: 'EN', hi: false, season: 6, episode: 1,
          episode_from: 1, episode_end: 22, full_season: false,
          release_name: 'The.Mentalist.Season06.720p.WEB-DL.x264.Complete'
        }
      ]
      if (episode !== 20) {
        subtitles.push({
          url: `/own-${episode}.zip`, language: 'EN', hi: true, season: 6, episode,
          episode_from: episode, episode_end: episode, full_season: false,
          release_name: `The.Mentalist.S06E${episode}.720p.WEB-DL.DD5.1.H.264-ECI`
        })
      }
      return reply({ status: true, subtitles })
    }
    const path = new URL(url).pathname
    if (path === '/pack.zip') {
      return reply(
        buildZip(
          [1, 18, 19, 20].map((n) => ({
            name: `The.Mentalist.S06E${String(n).padStart(2, '0')}.WEB-DL.srt`,
            contents: cue(`pack, episode ${n}`)
          }))
        )
      )
    }
    // A range upload whose archive is nothing but the season opener.
    if (path === '/range.zip') {
      return reply(buildZip([{ name: 'English.srt', contents: cue('range, episode 1') }]))
    }
    const own = /\/own-(\d+)\.zip/.exec(path)
    if (own) {
      return reply(buildZip([{ name: `The.Mentalist.S06E${own[1]}.srt`, contents: cue(`own, episode ${own[1]}`) }]))
    }
    return { ...reply(null), ok: false, status: 404 }
  }

  it('gives each episode its own subtitle, and none the season opener', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => answer(url)))
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      subdlApiKey: 'test',
      preferredSubtitleLanguages: ['eng']
    }

    const folders = new FolderCache()
    const names = ['Forest Green', 'Brown Eyed Girls', 'Il Tavolo Bianco']
    const written: string[] = []
    for (const [i, name] of names.entries()) {
      const path = join(folder, `The Mentalist S06E${18 + i} ${name}.mkv`)
      await writeFile(path, '')
      const media: MediaFile = {
        path, sizeBytes: 0, key: `e${18 + i}`, title: 'The Mentalist', year: 2008,
        season: 6, episodes: [18 + i], kind: 'series', tags: []
      }
      const result = await scanOne(media, `S06E${18 + i}`, settings, null, {}, folders)
      expect(result.status).toBe('downloaded')
      written.push(await readFile(result.detail!, 'utf8'))
      // The folder was read before the download; what was written must show.
      expect((await findLocalSubtitles(media, folders)).map((f) => f.path)).toContain(result.detail)
    }

    expect(written[0]).toContain('own, episode 18')
    expect(written[1]).toContain('own, episode 19')
    // No episode 20 of its own: taken from the pack, and the right entry of it.
    expect(written[2]).toContain('pack, episode 20')
    expect(new Set(written).size).toBe(3)
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MediaFile } from '@shared/types'
import {
  clearArchiveCache,
  coverageOf,
  SubdlClient,
  pickArchiveEntry,
  rankSubdl,
  readArchiveSubtitles,
  releaseHint,
  toSubdlLanguage,
  type SubdlCandidate
} from './subdl'
import { buildZip } from './zipFixture'

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nHello.\n'

/** A subtitle whose first line says which one it is. */
const cue = (what: string): string => `1\n00:00:01,000 --> 00:00:03,000\n${what}\n`

const SEASON_FOLDER = join(
  'C:',
  'Watch',
  'The Mentalist 2008',
  'The Mentalist 2008 Season 6 Complete 720p AMZN WEBRip x264 [i_c]'
)

function episode(name: string, season: number, episodes: number[]): MediaFile {
  const path = join(SEASON_FOLDER, name)
  return {
    path, sizeBytes: 1, key: path, title: 'The Mentalist', year: 2008,
    season, episodes, kind: 'series', tags: []
  }
}

function film(path: string, title: string, year: number | null): MediaFile {
  return { path, sizeBytes: 1, key: path, title, year, season: null, episodes: [], kind: 'movie', tags: [] }
}

const s06e18 = episode('The Mentalist S06E18 Forest Green.mkv', 6, [18])
const s06e19 = episode('The Mentalist S06E19 Brown Eyed Girls.mkv', 6, [19])

const candidate = (over: Partial<SubdlCandidate>): SubdlCandidate => ({
  url: '/x.zip',
  language: 'eng',
  releaseName: '',
  author: '',
  hearingImpaired: false,
  season: null,
  episodeFrom: null,
  episodeTo: null,
  fullSeason: false,
  ...over
})

/** The shapes SubDL really sends back for The Mentalist S06E18. */
const pack = candidate({
  url: '/pack.zip',
  releaseName: 'The Mentalist (2008) Season 6 S06 (1080p AMZN WEB-DL x265 HEVC 10bit [23.976 FPS]',
  season: 6,
  fullSeason: true
})
const range = candidate({
  url: '/range.zip',
  releaseName: 'The.Mentalist.Season06.720p.WEB-DL.x264.Complete',
  season: 6,
  episodeFrom: 1,
  episodeTo: 22
})
const own = candidate({
  url: '/own.zip',
  releaseName: 'The.Mentalist.S06E18.720p.WEB-DL.DD5.1.H.264-ECI',
  hearingImpaired: true,
  season: 6,
  episodeFrom: 18,
  episodeTo: 18
})
const ownHi = candidate({
  url: '/own-hi.zip',
  releaseName: 'The.Mentalist.S06E18.720p.WEB-DL.DD5.1.H.264-ECI.HI',
  hearingImpaired: true,
  season: 6,
  episodeFrom: 18,
  episodeTo: 18
})

describe('readArchiveSubtitles', () => {
  it('reads a deflated subtitle', () => {
    const [entry] = readArchiveSubtitles(buildZip([{ name: 'movie.srt', contents: SRT }]))
    expect(entry?.name).toBe('movie.srt')
    expect(entry?.extension).toBe('.srt')
    expect(entry?.contents.toString('utf8')).toBe(SRT)
  })

  it('reads an uncompressed subtitle', () => {
    const zip = buildZip([{ name: 'movie.srt', contents: SRT, stored: true }])
    expect(readArchiveSubtitles(zip)[0]?.contents.toString('utf8')).toBe(SRT)
  })

  // The sizes in a streamed archive's local header are zero, so a parser that
  // trusts them returns nothing at all.
  it('reads an archive written as a stream', () => {
    const zip = buildZip([{ name: 'movie.srt', contents: SRT, streamed: true }])
    expect(readArchiveSubtitles(zip)[0]?.contents.toString('utf8')).toBe(SRT)
  })

  it('skips past files that are not subtitles, and Finder’s shadow copies', () => {
    const zip = buildZip([
      { name: 'readme.txt', contents: 'visit our website' },
      { name: '__MACOSX/._movie.ass', contents: 'resource fork' },
      { name: 'movie.ass', contents: SRT }
    ])
    expect(readArchiveSubtitles(zip).map((e) => e.name)).toEqual(['movie.ass'])
  })

  it('returns nothing for an archive with no subtitle in it', () => {
    expect(readArchiveSubtitles(buildZip([{ name: 'a.txt', contents: 'x' }]))).toEqual([])
  })

  it('returns nothing rather than throwing on rubbish', () => {
    expect(readArchiveSubtitles(Buffer.from('not a zip at all'))).toEqual([])
  })
})

describe('toSubdlLanguage', () => {
  it('accepts whichever form the language is written in', () => {
    expect(toSubdlLanguage('eng')).toBe('EN')
    expect(toSubdlLanguage('en')).toBe('EN')
    expect(toSubdlLanguage('English')).toBe('EN')
    expect(toSubdlLanguage('fra')).toBe('FR')
    expect(toSubdlLanguage('ara')).toBe('AR')
  })
})

describe('coverageOf', () => {
  it('tells an episode’s own subtitle from a range and a pack', () => {
    expect(coverageOf(own, s06e18)).toBe('exact')
    expect(coverageOf(range, s06e18)).toBe('range')
    expect(coverageOf(pack, s06e18)).toBe('pack')
  })

  it('rules out another episode, another season, and a range without this one', () => {
    expect(coverageOf(own, s06e19)).toBeNull()
    expect(coverageOf(candidate({ season: 5, episodeFrom: 18, episodeTo: 18 }), s06e18)).toBeNull()
    expect(coverageOf(candidate({ season: 6, episodeFrom: 1, episodeTo: 10 }), s06e18)).toBeNull()
  })

  it('believes a release name that names another episode over SubDL’s fields', () => {
    const mislabelled = candidate({
      releaseName: 'The.Mentalist.S06E19.720p.HDTV',
      season: 6,
      episodeFrom: 18,
      episodeTo: 18
    })
    expect(coverageOf(mislabelled, s06e18)).toBeNull()
  })

  it('handles a double episode', () => {
    const double = episode('The Mentalist S06E01E02.mkv', 6, [1, 2])
    expect(coverageOf(candidate({ season: 6, episodeFrom: 1, episodeTo: 2 }), double)).toBe('exact')
    expect(coverageOf(candidate({ season: 6, episodeFrom: 1, episodeTo: 1 }), double)).toBe('partial')
    expect(coverageOf(candidate({ season: 6, episodeFrom: 2, episodeTo: 2 }), double)).toBeNull()
  })

  it('counts every candidate as exact for a film', () => {
    expect(coverageOf(pack, film('C:\\Heat.mkv', 'Heat', 1995))).toBe('exact')
  })
})

describe('releaseHint', () => {
  it('is the file’s own name and its folder’s release tags, not the whole path', () => {
    const hint = releaseHint(s06e18.path)
    expect(hint).toContain('The Mentalist S06E18 Forest Green')
    expect(hint).toContain('720p')
    expect(hint).toContain('AMZN')
    expect(hint).not.toMatch(/season|complete/i)
  })
})

describe('rankSubdl', () => {
  it('puts the episode’s own subtitle above a range, and a range above a pack', () => {
    const ranked = rankSubdl([pack, range, own], s06e18)
    expect(ranked.map((c) => c.url)).toEqual(['/own.zip', '/range.zip', '/pack.zip'])
  })

  it('drops candidates for another episode', () => {
    expect(rankSubdl([own, pack], s06e19).map((c) => c.url)).toEqual(['/pack.zip'])
  })

  it('does not trust SubDL’s hearing-impaired flag over the release name', () => {
    // Both are flagged; only one says HI.
    expect(rankSubdl([ownHi, own], s06e18)[0]?.url).toBe('/own.zip')
  })

  it('puts a subtitle made for this exact release first', () => {
    const file = film('C:\\Films\\Heat.1995.AMZN.WEB-DL.x264.mkv', 'Heat', 1995)
    const ranked = rankSubdl(
      [candidate({ url: '/a.zip' }), candidate({ url: '/b.zip', releaseName: 'AMZN.WEB-DL' })],
      file
    )
    expect(ranked[0]?.url).toBe('/b.zip')
  })

  it('matches a release written with different separators', () => {
    const file = film('C:\\Films\\Heat.1995.AMZN.WEB-DL.x264.mkv', 'Heat', 1995)
    const ranked = rankSubdl(
      [
        candidate({ url: '/wrong.zip', releaseName: 'HDTV.x264-LOL' }),
        candidate({ url: '/right.zip', releaseName: 'Amzn Web Dl' })
      ],
      file
    )
    expect(ranked[0]?.url).toBe('/right.zip')
  })

  it('does not let an upload with no release name outrank a real match', () => {
    const file = film('C:\\Films\\Heat.1995.AMZN.WEB-DL.x264.mkv', 'Heat', 1995)
    const ranked = rankSubdl(
      [
        candidate({ url: '/nameless.zip', releaseName: '' }),
        candidate({ url: '/match.zip', releaseName: 'AMZN.WEB-DL' })
      ],
      file
    )
    expect(ranked[0]?.url).toBe('/match.zip')
  })

  it('prefers a plain track over a hearing-impaired one', () => {
    const file = film('C:\\Films\\Heat.1995.mkv', 'Heat', 1995)
    const ranked = rankSubdl(
      [candidate({ url: '/hi.zip', hearingImpaired: true }), candidate({ url: '/plain.zip' })],
      file
    )
    expect(ranked[0]?.url).toBe('/plain.zip')
  })
})

describe('pickArchiveEntry', () => {
  const eng = (coverage: 'exact' | 'partial' | 'range' | 'pack') => ({ language: 'eng', coverage })

  /** A season pack the way uploaders build them: the opener first. */
  const seasonPack = buildZip(
    [1, 2, 17, 18, 19, 20].map((n) => ({
      name: `The.Mentalist.S06.DVDRip/The.Mentalist.S06E${String(n).padStart(2, '0')}.DVDRip.x264-DEMAND.srt`,
      contents: cue(`episode ${n}`)
    }))
  )

  it('takes this episode out of a season pack, not the first entry', () => {
    const e18 = pickArchiveEntry(seasonPack, s06e18, eng('pack'))
    const e19 = pickArchiveEntry(seasonPack, s06e19, eng('pack'))
    expect(e18?.contents.toString()).toContain('episode 18')
    expect(e19?.contents.toString()).toContain('episode 19')
  })

  it('takes nothing from a pack that lacks this episode', () => {
    const e21 = episode('The Mentalist S06E21 White as the Driven Snow.mkv', 6, [21])
    expect(pickArchiveEntry(seasonPack, e21, eng('pack'))).toBeNull()
  })

  it('takes nothing from a pack whose entries do not say which episode they are', () => {
    const vague = buildZip([
      { name: 'English.srt', contents: cue('who knows') },
      { name: 'English (SDH).srt', contents: cue('who knows') }
    ])
    expect(pickArchiveEntry(vague, s06e18, eng('pack'))).toBeNull()
    expect(pickArchiveEntry(vague, s06e18, eng('range'))).toBeNull()
  })

  it('accepts a nameless entry from an archive made for this one episode', () => {
    const single = buildZip([{ name: 'English.srt', contents: cue('episode 18') }])
    expect(pickArchiveEntry(single, s06e18, eng('exact'))?.contents.toString()).toContain('episode 18')
  })

  it('refuses an episode’s own archive when what is inside is another episode', () => {
    const wrong = buildZip([{ name: 'The.Mentalist.S06E01.srt', contents: cue('episode 1') }])
    expect(pickArchiveEntry(wrong, s06e18, eng('exact'))).toBeNull()
  })

  it('prefers plain dialogue to SDH, and never takes a forced track', () => {
    const zip = buildZip([
      { name: 'The.Mentalist.S06E18.HI.srt', contents: cue('sdh') },
      { name: 'The.Mentalist.S06E18.forced.srt', contents: cue('forced') },
      { name: 'The.Mentalist.S06E18.srt', contents: cue('plain') }
    ])
    const picked = pickArchiveEntry(zip, s06e18, eng('exact'))
    expect(picked?.contents.toString()).toContain('plain')
    expect(picked?.flavour).toBe('full')

    const onlyForced = buildZip([{ name: 'The.Mentalist.S06E18.forced.srt', contents: cue('forced') }])
    expect(pickArchiveEntry(onlyForced, s06e18, eng('exact'))).toBeNull()

    const onlySdh = buildZip([{ name: 'The.Mentalist.S06E18.HI.srt', contents: cue('sdh') }])
    expect(pickArchiveEntry(onlySdh, s06e18, eng('exact'))?.flavour).toBe('sdh')
  })

  it('skips an entry in another language', () => {
    const zip = buildZip([
      { name: 'The.Mentalist.S06E18.fre.srt', contents: cue('french') },
      { name: 'The.Mentalist.S06E18.eng.srt', contents: cue('english') }
    ])
    expect(pickArchiveEntry(zip, s06e18, eng('exact'))?.contents.toString()).toContain('english')
  })

  it('takes a double episode’s subtitle for the double-episode file', () => {
    const double = episode('The Mentalist S06E01E02.mkv', 6, [1, 2])
    const zip = buildZip([
      { name: 'The.Mentalist.S06E02.srt', contents: cue('second half') },
      { name: 'The.Mentalist.S06E01E02.srt', contents: cue('both') },
      { name: 'The.Mentalist.S06E01.srt', contents: cue('first half') }
    ])
    expect(pickArchiveEntry(zip, double, eng('pack'))?.contents.toString()).toContain('both')
  })

  it('reads specials as season 0', () => {
    const special = episode('The Mentalist S00E02.mkv', 0, [2])
    const zip = buildZip([
      { name: 'The.Mentalist.S01E02.srt', contents: cue('regular') },
      { name: 'The.Mentalist.S00E02.srt', contents: cue('special') }
    ])
    expect(pickArchiveEntry(zip, special, eng('pack'))?.contents.toString()).toContain('special')
  })

  it('finds an absolute-numbered episode in a pack', () => {
    const path = join('C:', 'Anime', 'Frieren', '[Grp] Frieren - 05 [1080p].mkv')
    const frieren: MediaFile = {
      path, sizeBytes: 1, key: path, title: 'Frieren', year: null,
      season: 1, episodes: [5], kind: 'series', tags: []
    }
    const zip = buildZip(
      [4, 5, 6].map((n) => ({ name: `Frieren - 0${n}.ass`, contents: cue(`episode ${n}`) }))
    )
    expect(pickArchiveEntry(zip, frieren, eng('pack'))?.contents.toString()).toContain('episode 5')
  })

  describe('for a film', () => {
    const heat = film(join('C:', 'Films', 'Heat.1995.1080p.BluRay.x264.mkv'), 'Heat', 1995)

    it('takes the whole-film subtitle over CD halves', () => {
      const zip = buildZip([
        { name: 'Heat.1995.CD1.srt', contents: cue('cd1') },
        { name: 'Heat.1995.CD2.srt', contents: cue('cd2') },
        { name: 'Heat.1995.srt', contents: cue('whole') }
      ])
      expect(pickArchiveEntry(zip, heat, eng('exact'))?.contents.toString()).toContain('whole')
    })

    it('takes nothing when all it has is halves', () => {
      const zip = buildZip([
        { name: 'Heat.1995.CD1.srt', contents: cue('cd1') },
        { name: 'Heat.1995.CD2.srt', contents: cue('cd2') }
      ])
      expect(pickArchiveEntry(zip, heat, eng('exact'))).toBeNull()
    })

    it('matches the half when the file itself is one', () => {
      const half = film(join('C:', 'Films', 'Heat.1995.CD2.avi'), 'Heat', 1995)
      const zip = buildZip([
        { name: 'Heat.1995.CD1.srt', contents: cue('cd1') },
        { name: 'Heat.1995.CD2.srt', contents: cue('cd2') }
      ])
      expect(pickArchiveEntry(zip, half, eng('exact'))?.contents.toString()).toContain('cd2')
    })

    it('matches the cut of the film', () => {
      const extended = film(join('C:', 'Films', 'Heat.1995.Extended.1080p.mkv'), 'Heat', 1995)
      const zip = buildZip([
        { name: 'Heat.1995.Theatrical.srt', contents: cue('theatrical') },
        { name: 'Heat.1995.Extended.srt', contents: cue('extended') }
      ])
      expect(pickArchiveEntry(zip, extended, eng('exact'))?.contents.toString()).toContain('extended')
      expect(pickArchiveEntry(zip, heat, eng('exact'))).not.toBeNull()
    })

    it('never takes a remake’s subtitle', () => {
      const zip = buildZip([{ name: 'Heat.2021.srt', contents: cue('remake') }])
      expect(pickArchiveEntry(zip, heat, eng('exact'))).toBeNull()
    })

    it('prefers plain over SDH and skips forced, as for an episode', () => {
      const zip = buildZip([
        { name: 'Heat.1995.English.Forced.srt', contents: cue('forced') },
        { name: 'Heat.1995.English.SDH.srt', contents: cue('sdh') },
        { name: 'Heat.1995.English.srt', contents: cue('plain') }
      ])
      expect(pickArchiveEntry(zip, heat, eng('exact'))?.contents.toString()).toContain('plain')
    })

    it('does not take a language out of the title', () => {
      const it2017 = film(join('C:', 'Films', 'It.2017.1080p.BluRay.x264.mkv'), 'It', 2017)
      const zip = buildZip([{ name: 'It.2017.1080p.BluRay.srt', contents: cue('it') }])
      expect(pickArchiveEntry(zip, it2017, eng('exact'))?.contents.toString()).toContain('it')
    })

    it('takes an entry whose title disagrees with the file’s name, but not another year', () => {
      const renamed = film(join('C:', 'Films', 'tt-inc-1080p.mkv'), 'tt inc', null)
      const zip = buildZip([{ name: 'Inception.2010.srt', contents: cue('inception') }])
      expect(pickArchiveEntry(zip, renamed, eng('exact'))).not.toBeNull()
      const remake = buildZip([{ name: 'Heat.2021.srt', contents: cue('remake') }])
      expect(pickArchiveEntry(remake, heat, eng('exact'))).toBeNull()
    })
  })
})

describe('SubdlClient.download, reusing archives', () => {
  let folder: string
  const fetched: string[] = []
  const archives = new Map<string, Buffer>()
  const heatFile = (): MediaFile => film(join(folder, 'Heat.1995.mkv'), 'Heat', 1995)
  const upload = (url: string): SubdlCandidate => candidate({ url })

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'cassette-archives-'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(new URL(url).pathname)
        const body = archives.get(new URL(url).pathname) ?? Buffer.from('<html>not found</html>')
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
        }
      })
    )
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      archives.set(`/${name}.zip`, buildZip([{ name: 'Heat.1995.srt', contents: cue(name) }]))
    }
    archives.set(
      '/big.zip',
      buildZip([{ name: 'Heat.1995.srt', contents: cue('x'.repeat(11 * 1024 * 1024)), stored: true }])
    )
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    clearArchiveCache()
    await rm(folder, { recursive: true, force: true })
  })

  beforeEach(() => {
    clearArchiveCache()
    fetched.length = 0
  })

  const client = new SubdlClient('test')

  it('fetches an archive once, however often it is asked for', async () => {
    await client.download(upload('/a.zip'), heatFile())
    await client.download(upload('/a.zip'), heatFile())
    expect(fetched).toEqual(['/a.zip'])
  })

  it('does not keep what was not an archive with a subtitle in it', async () => {
    expect(await client.download(upload('/missing.zip'), heatFile())).toBeNull()
    expect(await client.download(upload('/missing.zip'), heatFile())).toBeNull()
    expect(fetched).toEqual(['/missing.zip', '/missing.zip'])
  })

  it('does not keep a large archive', async () => {
    await client.download(upload('/big.zip'), heatFile())
    await client.download(upload('/big.zip'), heatFile())
    expect(fetched).toEqual(['/big.zip', '/big.zip'])
  })

  it('keeps the most recently used, not the first fetched', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'a', 'e']) {
      await client.download(upload(`/${name}.zip`), heatFile())
    }
    // `a` was used again before `e` came in, so `b` was the one let go.
    fetched.length = 0
    await client.download(upload('/a.zip'), heatFile())
    await client.download(upload('/b.zip'), heatFile())
    expect(fetched).toEqual(['/b.zip'])
  })

  it('forgets everything when a scan ends', async () => {
    await client.download(upload('/a.zip'), heatFile())
    clearArchiveCache()
    await client.download(upload('/a.zip'), heatFile())
    expect(fetched).toEqual(['/a.zip', '/a.zip'])
  })
})

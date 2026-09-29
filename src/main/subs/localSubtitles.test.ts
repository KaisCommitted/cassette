import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FolderCache, findLocalSubtitles } from './localSubtitles'
import { guessLanguage, languageName } from './language'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cassette-subs-'))
  await mkdir(join(root, 'Subs'), { recursive: true })
  await writeFile(join(root, 'Show S01E01.mkv'), 'video')
  await writeFile(join(root, 'Show S01E01.eng.srt'), 'subs')
  await writeFile(join(root, 'Show S01E01.fre.srt'), 'subs')
  await writeFile(join(root, 'Show S01E02.eng.srt'), 'other episode')
  await writeFile(join(root, 'Show S01E01.empty.srt'), '')
  await writeFile(join(root, 'notes.txt'), 'not a subtitle')
  await writeFile(join(root, 'Subs', 'English.srt'), 'subs in a folder')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('guessLanguage', () => {
  it('reads a trailing language tag', () => {
    expect(guessLanguage('Show S01E01.eng.srt')).toBe('eng')
  })

  it('accepts two-letter codes and full names', () => {
    expect(guessLanguage('Show.fr.srt')).toBe('fre')
    expect(guessLanguage('Show.French.srt')).toBe('fre')
  })

  it('returns null when there is no tag', () => {
    expect(guessLanguage('Show S01E01.srt')).toBeNull()
  })

  it('does not mistake a word in the title for a language', () => {
    // "German" here is the last token, but "Italian Job" is not: the search
    // runs from the end so the real suffix wins.
    expect(guessLanguage('The Italian Job.eng.srt')).toBe('eng')
  })
})

describe('languageName', () => {
  it('names known languages', () => {
    expect(languageName('fre')).toBe('French')
  })

  it('falls back for unknown codes', () => {
    expect(languageName('xyz')).toBe('XYZ')
  })

  it('handles no language at all', () => {
    expect(languageName(null)).toBe('Unknown language')
  })
})

describe('findLocalSubtitles', () => {
  it('finds subtitles sitting beside the video', async () => {
    const found = await findLocalSubtitles(join(root, 'Show S01E01.mkv'))
    const names = found.map((f) => f.path.split(/[\\/]/).pop())
    expect(names).toContain('Show S01E01.eng.srt')
    expect(names).toContain('Show S01E01.fre.srt')
  })

  it('does not pick up another episode’s subtitles', async () => {
    const found = await findLocalSubtitles(join(root, 'Show S01E01.mkv'))
    expect(found.map((f) => f.path)).not.toContain(join(root, 'Show S01E02.eng.srt'))
  })

  it('looks in a neighbouring Subs folder', async () => {
    const found = await findLocalSubtitles(join(root, 'Show S01E01.mkv'))
    expect(found.some((f) => f.path.includes('Subs'))).toBe(true)
  })

  it('skips empty files', async () => {
    const found = await findLocalSubtitles(join(root, 'Show S01E01.mkv'))
    expect(found.some((f) => f.path.endsWith('empty.srt'))).toBe(false)
  })

  it('ignores files that are not subtitles', async () => {
    const found = await findLocalSubtitles(join(root, 'Show S01E01.mkv'))
    expect(found.some((f) => f.path.endsWith('.txt'))).toBe(false)
  })

  it('labels each find by language', async () => {
    const found = await findLocalSubtitles(join(root, 'Show S01E01.mkv'))
    expect(found.find((f) => f.lang === 'fre')?.label).toBe('French (file)')
  })

  it('returns nothing for a video in a folder that does not exist', async () => {
    expect(await findLocalSubtitles(join(root, 'nope', 'x.mkv'))).toEqual([])
  })
})

describe('findLocalSubtitles in a season pack', () => {
  let pack: string

  beforeAll(async () => {
    pack = join(root, 'pack')
    await mkdir(join(pack, 'Subs'), { recursive: true })
    await writeFile(join(pack, 'Show S01E01.mkv'), 'video')
    await writeFile(join(pack, 'Show S01E02.mkv'), 'video')
    await writeFile(join(pack, 'Subs', 'Show S01E01.eng.srt'), 'subs')
    await writeFile(join(pack, 'Subs', 'Show S01E02.eng.srt'), 'subs')
    await writeFile(join(pack, 'Subs', 'Random.srt'), 'subs')
    await writeFile(join(pack, 'Show E1.mkv'), 'video')
    await writeFile(join(pack, 'Show E1.eng.srt'), 'subs')
    await writeFile(join(pack, 'Show E10.eng.srt'), 'subs')
  })

  it('takes from a shared Subs folder only the files named for this episode', async () => {
    const found = await findLocalSubtitles(join(pack, 'Show S01E01.mkv'))
    const names = found.map((f) => f.path.split(/[\\/]/).pop())
    expect(names).toEqual(['Show S01E01.eng.srt'])
  })

  it('does not take episode 10 for episode 1', async () => {
    const found = await findLocalSubtitles(join(pack, 'Show E1.mkv'))
    const names = found.map((f) => f.path.split(/[\\/]/).pop())
    expect(names).toEqual(['Show E1.eng.srt'])
  })
})

/**
 * Subtitles matched by what they are, not by what they are called: every
 * layout here has subtitles that do not start with the video's name.
 */
describe('findLocalSubtitles by what a subtitle is', () => {
  let base: string
  const names = (found: Array<{ path: string }>): string[] =>
    found.map((f) => f.path.slice(base.length + 1).split(sep).join('/'))

  async function files(paths: string[]): Promise<void> {
    for (const path of paths) {
      await mkdir(join(base, path, '..'), { recursive: true })
      await writeFile(join(base, path), path.endsWith('.mkv') ? 'video' : 'subs')
    }
  }

  beforeAll(async () => {
    base = join(root, 'layouts')
    await files([
      // Same folder, differently named.
      'flat/Show - 1x03 - Title.mkv',
      'flat/Show - 1x04 - Other.mkv',
      'flat/Show.S01E03.srt',
      'flat/Show.S01E04.eng.srt',
      'flat/Show.S01E05.eng.srt',
      'flat/English.srt',
      // RARBG: a Subs folder with one folder per episode, named by track.
      'rarbg/Show.S01E03.1080p.WEB.x264-GRP.mkv',
      'rarbg/Show.S01E04.1080p.WEB.x264-GRP.mkv',
      'rarbg/Subs/Show.S01E03.1080p.WEB.x264-GRP/2_English.srt',
      'rarbg/Subs/Show.S01E03.1080p.WEB.x264-GRP/3_English.srt',
      'rarbg/Subs/Show.S01E03.1080p.WEB.x264-GRP/4_French.srt',
      'rarbg/Subs/Show.S01E04.1080p.WEB.x264-GRP/2_English.srt',
      // A season pack of subtitles next to a season pack of videos.
      'pack/The.Mentalist.S06E18.720p.mkv',
      'pack/The.Mentalist.S06E19.720p.mkv',
      'pack/The.Mentalist.S06.English.Subs/The.Mentalist.S06E18.HDTV.x264-LOL.srt',
      'pack/The.Mentalist.S06.English.Subs/The.Mentalist.S06E19.HDTV.x264-LOL.srt',
      'pack/The.Mentalist.S06.English.Subs/The.Mentalist.S06E20.HDTV.x264-LOL.srt',
      // A film folder, with a sample that is no rival and a remake's subtitle.
      'film/Heat.1995.1080p.BluRay.x264.mkv',
      'film/heat-sample.mkv',
      'film/English.srt',
      'film/Heat.1995.720p.WEB.forced.srt',
      'film/Heat.2021.srt',
      // Films side by side.
      'films/Heat (1995).mkv',
      'films/Inception (2010).mkv',
      'films/Inception.2010.1080p.eng.srt',
      'films/English.srt',
      // A lone episode beside another episode's subtitle.
      'lone/Show S01E01.mkv',
      'lone/Show S01E02.srt',
      'lone/Subs/Show S01E02.srt',
      // A VobSub pair.
      'vobsub/Film.2001.mkv',
      'vobsub/Film.2001.idx',
      'vobsub/Film.2001.sub',
      // Absolute numbering, alone in its folder.
      'anime/[Grp] Frieren - 05 [1080p].mkv',
      'anime/Frieren S01E05.eng.srt'
    ])
  })

  it('finds a differently named subtitle for the same episode', async () => {
    const found = await findLocalSubtitles(join(base, 'flat', 'Show - 1x03 - Title.mkv'))
    expect(names(found)).toEqual(['flat/Show.S01E03.srt'])
    const next = await findLocalSubtitles(join(base, 'flat', 'Show - 1x04 - Other.mkv'))
    expect(names(next)).toEqual(['flat/Show.S01E04.eng.srt'])
  })

  it('reads the episode from the folder when a subtitle is named by track', async () => {
    const found = await findLocalSubtitles(join(base, 'rarbg', 'Show.S01E03.1080p.WEB.x264-GRP.mkv'))
    expect(names(found)).toEqual([
      'rarbg/Subs/Show.S01E03.1080p.WEB.x264-GRP/2_English.srt',
      'rarbg/Subs/Show.S01E03.1080p.WEB.x264-GRP/3_English.srt',
      'rarbg/Subs/Show.S01E03.1080p.WEB.x264-GRP/4_French.srt'
    ])
    expect(found.map((f) => f.lang)).toEqual(['eng', 'eng', 'fre'])
    const next = await findLocalSubtitles(join(base, 'rarbg', 'Show.S01E04.1080p.WEB.x264-GRP.mkv'))
    expect(names(next)).toEqual(['rarbg/Subs/Show.S01E04.1080p.WEB.x264-GRP/2_English.srt'])
  })

  it('takes each episode’s own subtitle out of a season pack of them', async () => {
    const e18 = await findLocalSubtitles(join(base, 'pack', 'The.Mentalist.S06E18.720p.mkv'))
    expect(names(e18)).toEqual([
      'pack/The.Mentalist.S06.English.Subs/The.Mentalist.S06E18.HDTV.x264-LOL.srt'
    ])
    const e19 = await findLocalSubtitles(join(base, 'pack', 'The.Mentalist.S06E19.720p.mkv'))
    expect(names(e19)).toEqual([
      'pack/The.Mentalist.S06.English.Subs/The.Mentalist.S06E19.HDTV.x264-LOL.srt'
    ])
  })

  it('gives a film its subtitles, full ones first, and never a remake’s', async () => {
    const found = await findLocalSubtitles(join(base, 'film', 'Heat.1995.1080p.BluRay.x264.mkv'))
    expect(names(found)).toEqual(['film/Heat.1995.720p.WEB.forced.srt', 'film/English.srt'])
    expect(found[0]!.label).toBe('Unknown language forced (file)')
    expect(found[1]!.label).toBe('English (file)')
  })

  it('keeps films in one folder apart, and a nameless subtitle out of it', async () => {
    const inception = await findLocalSubtitles(join(base, 'films', 'Inception (2010).mkv'))
    expect(names(inception)).toEqual(['films/Inception.2010.1080p.eng.srt'])
    expect(await findLocalSubtitles(join(base, 'films', 'Heat (1995).mkv'))).toEqual([])
  })

  it('never offers another episode’s subtitle, even to a video on its own', async () => {
    expect(await findLocalSubtitles(join(base, 'lone', 'Show S01E01.mkv'))).toEqual([])
  })

  it('offers a VobSub through its index only', async () => {
    const found = await findLocalSubtitles(join(base, 'vobsub', 'Film.2001.mkv'))
    expect(names(found)).toEqual(['vobsub/Film.2001.idx'])
  })

  it('uses the library’s placement of the video when it has one', async () => {
    const path = join(base, 'anime', '[Grp] Frieren - 05 [1080p].mkv')
    // Alone in its folder, the file reads as a film, which an episode's
    // subtitle can never be for; the library knows it is episode 5.
    expect(await findLocalSubtitles(path)).toEqual([])
    const placed = await findLocalSubtitles({
      path, sizeBytes: 1, key: 'k', title: 'Frieren', year: null,
      season: 1, episodes: [5], kind: 'series', tags: []
    })
    expect(names(placed)).toEqual(['anime/Frieren S01E05.eng.srt'])
  })
})

describe('findLocalSubtitles, more layouts', () => {
  let base: string
  const names = (found: Array<{ path: string }>): string[] =>
    found.map((f) => f.path.slice(base.length + 1).split(sep).join('/'))

  async function files(paths: string[]): Promise<void> {
    for (const path of paths) {
      await mkdir(join(base, path, '..'), { recursive: true })
      await writeFile(join(base, path), path.endsWith('.mkv') ? 'video' : 'subs')
    }
  }

  beforeAll(async () => {
    base = join(root, 'more')
    await files([
      // A lone video whose name has nothing in common with its subtitle's.
      'renamed/tt-inc-1080p.mkv',
      'renamed/Subs/Inception.2010.eng.srt',
      'other/Some.Film.2010.mkv',
      'other/Subs/Other.Name.srt',
      'other/Some.Film.1990.srt',
      // Formats mpv reads that used to reach it only through its own loading.
      'formats/Film.2001.mkv',
      'formats/Film.2001.smi',
      'formats/Film.2001.mks',
      'formats/Film.2001.utf',
      'formats/Film.2001.utf8',
      'formats/Film.2001.utf-8',
      // A title that is a language's name.
      'italian/The.Italian.Job.2003.mkv',
      'italian/The.Italian.Job.2003.srt',
      // Slashes the other way.
      'slashes/Show S01E01.mkv',
      'slashes/Subs/English.srt'
    ])
  })

  it('gives a lone video a subtitle whose title disagrees with its name', async () => {
    const found = await findLocalSubtitles(join(base, 'renamed', 'tt-inc-1080p.mkv'))
    expect(names(found)).toEqual(['renamed/Subs/Inception.2010.eng.srt'])
    const other = await findLocalSubtitles(join(base, 'other', 'Some.Film.2010.mkv'))
    // …but never one for another year of it.
    expect(names(other)).toEqual(['other/Subs/Other.Name.srt'])
  })

  it('loads every subtitle format mpv reads', async () => {
    const found = await findLocalSubtitles(join(base, 'formats', 'Film.2001.mkv'))
    expect(names(found).sort()).toEqual([
      'formats/Film.2001.mks',
      'formats/Film.2001.smi',
      'formats/Film.2001.utf',
      'formats/Film.2001.utf-8',
      'formats/Film.2001.utf8'
    ])
  })

  it('does not label a subtitle by a language named in the title', async () => {
    const [found] = await findLocalSubtitles(join(base, 'italian', 'The.Italian.Job.2003.mkv'))
    expect(found?.lang).toBeNull()
  })

  it('treats a path written with forward slashes as the same video', async () => {
    const path = join(base, 'slashes', 'Show S01E01.mkv').split(sep).join('/')
    expect(names(await findLocalSubtitles(path))).toEqual(['slashes/Subs/English.srt'])
  })

  it('reuses what it read of a folder until told the folder changed', async () => {
    const cache = new FolderCache()
    const video = join(base, 'formats', 'Film.2001.mkv')
    expect(await findLocalSubtitles(video, cache)).toHaveLength(5)

    await writeFile(join(base, 'formats', 'Film.2001.eng.srt'), 'subs')
    expect(await findLocalSubtitles(video, cache)).toHaveLength(5)
    cache.invalidate(join(base, 'formats'))
    expect(await findLocalSubtitles(video, cache)).toHaveLength(6)
  })

  it('takes in a subtitle the scan wrote without reading the folder again', async () => {
    const cache = new FolderCache()
    const video = join(base, 'formats', 'Film.2001.mkv')
    const before = (await findLocalSubtitles(video, cache)).length

    const written = join(base, 'formats', 'Film.2001.fre.srt')
    await writeFile(written, 'subs')
    cache.added(written)
    const after = await findLocalSubtitles(video, cache)
    expect(after).toHaveLength(before + 1)
    expect(after.find((f) => f.path === written)?.lang).toBe('fre')
  })
})

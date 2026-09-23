import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findLocalSubtitles, guessLanguage, languageName } from './localSubtitles'

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

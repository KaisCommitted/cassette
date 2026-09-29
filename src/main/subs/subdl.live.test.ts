import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { MediaFile } from '@shared/types'
import { rankSubdl, SubdlClient } from './subdl'
import { guessLanguage } from './language'

/**
 * Talks to SubDL for real.
 *
 * Skipped unless SUBDL_API_KEY is set, so the ordinary test run stays offline
 * and deterministic. It exists because the parts most likely to break are the
 * ones no local test can cover: the shape of the response, and whether what
 * comes back is an archive this app can read.
 *
 *   SUBDL_API_KEY=... npx vitest run src/main/subs/subdl.live.test.ts
 */
const apiKey = process.env.SUBDL_API_KEY
const live = apiKey ? describe : describe.skip

function episode(folder: string, name: string, season: number, number: number): MediaFile {
  const path = join(folder, name)
  return {
    path, sizeBytes: 0, key: path, title: 'The Mentalist', year: 2008,
    season, episodes: [number], kind: 'series', tags: []
  }
}

live('SubDL, against the live service', () => {
  it('finds subtitles for an episode, with what each one covers', async () => {
    const client = new SubdlClient(apiKey!)
    const file = episode('C:\\', 'The.Mentalist.S03E16.720p.HDTV.x264.mkv', 3, 16)
    const candidates = await client.search(file, ['eng', 'fre'])

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.url.length > 0)).toBe(true)
    expect(new Set(candidates.map((c) => c.language)).has('eng')).toBe(true)
    // Season packs come back mixed in; they must be told apart.
    expect(candidates.some((c) => c.episodeFrom === 16 && c.episodeTo === 16)).toBe(true)
  }, 30000)

  it('writes a subtitle beside the video, named by language, without replacing one', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'cassette-subs-'))
    const file = episode(folder, 'The.Mentalist.S03E16.720p.HDTV.x264.mkv', 3, 16)
    await writeFile(file.path, '')

    const client = new SubdlClient(apiKey!)
    const best = rankSubdl(await client.search(file, ['eng']), file).find((c) => c.language === 'eng')!

    const first = await client.download(best, file)
    expect(first).not.toBeNull()
    expect(basename(first!)).toMatch(/^The\.Mentalist\.S03E16\.720p\.HDTV\.x264\.eng(\.sdh)?\.srt$/)
    const second = await client.download(best, file)
    expect(second).not.toBe(first)
    expect(guessLanguage(basename(first!))).toBe('eng')

    await rm(folder, { recursive: true, force: true })
  }, 30000)

  /**
   * The bug this was written for: every episode of a season got the same
   * file, the first one out of a season pack.
   */
  it('gives each episode of a season its own subtitle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cassette-subs-'))
    const folder = join(root, 'The Mentalist 2008 Season 6 Complete 720p AMZN WEBRip x264 [i_c]')
    await mkdir(folder)
    const client = new SubdlClient(apiKey!)

    const texts: string[] = []
    for (const [n, name] of [[18, 'Forest Green'], [19, 'Brown Eyed Girls']] as const) {
      const file = episode(folder, `The Mentalist S06E${n} ${name}.mkv`, 6, n)
      await writeFile(file.path, '')
      let written: string | null = null
      for (const candidate of rankSubdl(await client.search(file, ['eng']), file).slice(0, 5)) {
        written = await client.download(candidate, file)
        if (written) break
      }
      expect(written).not.toBeNull()
      texts.push(await readFile(written!, 'utf8'))
    }
    expect(texts[0]).not.toBe(texts[1])

    await rm(root, { recursive: true, force: true })
  }, 60000)
})

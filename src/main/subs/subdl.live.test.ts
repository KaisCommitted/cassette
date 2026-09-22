import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { extractFirstSubtitle, rankSubdl, SubdlClient } from './subdl'
import { guessLanguage } from './localSubtitles'
import type { ParsedMedia } from '@shared/types'

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

const episode: ParsedMedia = {
  title: 'The Mentalist',
  year: null,
  season: 3,
  episodes: [16],
  kind: 'series',
  tags: []
}

live('SubDL, against the live service', () => {
  it('finds subtitles for an episode', async () => {
    const client = new SubdlClient(apiKey!)
    const candidates = await client.search(episode, ['eng', 'fre'])

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.url.length > 0)).toBe(true)
    // Both requested languages should be represented, which is what makes
    // filling in one track per language possible from a single request.
    const languages = new Set(candidates.map((c) => c.language))
    expect(languages.has('eng')).toBe(true)
  }, 30000)

  it('writes a subtitle beside the video, named by language', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'cassette-subs-'))
    const video = join(folder, 'The.Mentalist.S03E16.720p.HDTV.x264.mkv')
    await writeFile(video, '')

    const client = new SubdlClient(apiKey!)
    const candidates = rankSubdl(await client.search(episode, ['eng']), video)
    const best = candidates.find((c) => c.language === 'eng')!

    const first = await client.download(best, video)
    expect(basename(first)).toBe('The.Mentalist.S03E16.720p.HDTV.x264.eng.srt')

    // A second subtitle in a language already downloaded must not replace it.
    const second = await client.download(best, video)
    expect(basename(second)).toBe('The.Mentalist.S03E16.720p.HDTV.x264.eng.2.srt')

    // The language in the name is what the scanner reads back to decide the
    // language is already covered, and what mpv labels the track with.
    expect(guessLanguage(basename(first))).toBe('eng')

    await rm(folder, { recursive: true, force: true })
  }, 30000)

  it('downloads an archive this app can read', async () => {
    const client = new SubdlClient(apiKey!)
    const candidates = rankSubdl(
      await client.search(episode, ['eng']),
      'The.Mentalist.S03E16.720p.HDTV.x264.mkv'
    )
    const best = candidates.find((c) => c.language === 'eng')
    expect(best).toBeDefined()

    const response = await fetch('https://dl.subdl.com' + best!.url)
    expect(response.ok).toBe(true)

    const entry = extractFirstSubtitle(Buffer.from(await response.arrayBuffer()))
    expect(entry).not.toBeNull()
    // Subtitle files start with a cue number or an ASS script header; anything
    // else means we pulled out the wrong thing or failed to decompress it.
    expect(entry!.contents.toString('utf8').trim().length).toBeGreaterThan(50)
  }, 30000)
})

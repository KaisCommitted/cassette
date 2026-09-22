import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { extractFirstSubtitle, rankSubdl, toSubdlLanguage, type SubdlCandidate } from './subdl'

interface ZipEntry {
  name: string
  contents: string
  /** Stored rather than deflated, which small archives sometimes are. */
  stored?: boolean
  /**
   * Mimics an archive written as a stream: the flag says the sizes come after
   * the data, so the local header carries zeroes.
   */
  streamed?: boolean
}

/** Builds a real zip so the parser is tested against the format, not a mock. */
function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.from(entry.contents, 'utf8')
    const data = entry.stored ? raw : deflateRawSync(raw)
    const method = entry.stored ? 0 : 8
    const flags = entry.streamed ? 0x08 : 0

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(entry.streamed ? 0 : data.length, 18)
    local.writeUInt32LE(entry.streamed ? 0 : raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += 30 + name.length + data.length
  }

  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, directory, end])
}

const SRT = '1\n00:00:01,000 --> 00:00:03,000\nHello.\n'

describe('extractFirstSubtitle', () => {
  it('reads a deflated subtitle', () => {
    const entry = extractFirstSubtitle(buildZip([{ name: 'movie.srt', contents: SRT }]))
    expect(entry?.name).toBe('movie.srt')
    expect(entry?.extension).toBe('.srt')
    expect(entry?.contents.toString('utf8')).toBe(SRT)
  })

  it('reads an uncompressed subtitle', () => {
    const zip = buildZip([{ name: 'movie.srt', contents: SRT, stored: true }])
    expect(extractFirstSubtitle(zip)?.contents.toString('utf8')).toBe(SRT)
  })

  // The sizes in a streamed archive's local header are zero, so a parser that
  // trusts them returns nothing at all.
  it('reads an archive written as a stream', () => {
    const zip = buildZip([{ name: 'movie.srt', contents: SRT, streamed: true }])
    expect(extractFirstSubtitle(zip)?.contents.toString('utf8')).toBe(SRT)
  })

  it('skips past files that are not subtitles', () => {
    const zip = buildZip([
      { name: 'readme.txt', contents: 'visit our website' },
      { name: 'movie.ass', contents: SRT }
    ])
    expect(extractFirstSubtitle(zip)?.name).toBe('movie.ass')
  })

  it('returns nothing for an archive with no subtitle in it', () => {
    expect(extractFirstSubtitle(buildZip([{ name: 'a.txt', contents: 'x' }]))).toBeNull()
  })

  it('returns nothing rather than throwing on rubbish', () => {
    expect(extractFirstSubtitle(Buffer.from('not a zip at all'))).toBeNull()
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

describe('rankSubdl', () => {
  const candidate = (over: Partial<SubdlCandidate>): SubdlCandidate => ({
    url: '/x.zip',
    language: 'eng',
    releaseName: '',
    author: '',
    hearingImpaired: false,
    ...over
  })

  it('puts a subtitle made for this exact release first', () => {
    const ranked = rankSubdl(
      [candidate({ url: '/a.zip' }), candidate({ url: '/b.zip', releaseName: 'AMZN.WEB-DL' })],
      'Show.S01E01.AMZN.WEB-DL.x264.mkv'
    )
    expect(ranked[0]?.url).toBe('/b.zip')
  })

  it('matches a release written with different separators', () => {
    const ranked = rankSubdl(
      [
        candidate({ url: '/wrong.zip', releaseName: 'HDTV.x264-LOL' }),
        candidate({ url: '/right.zip', releaseName: 'Amzn Web Dl' })
      ],
      'Show.S01E01.AMZN.WEB-DL.x264.mkv'
    )
    expect(ranked[0]?.url).toBe('/right.zip')
  })

  it('does not let an upload with no release name outrank a real match', () => {
    const ranked = rankSubdl(
      [
        candidate({ url: '/nameless.zip', releaseName: '' }),
        candidate({ url: '/match.zip', releaseName: 'AMZN.WEB-DL' })
      ],
      'Show.S01E01.AMZN.WEB-DL.x264.mkv'
    )
    expect(ranked[0]?.url).toBe('/match.zip')
  })

  it('prefers a plain track over a hearing-impaired one', () => {
    const ranked = rankSubdl(
      [candidate({ url: '/hi.zip', hearingImpaired: true }), candidate({ url: '/plain.zip' })],
      'Show.S01E01.mkv'
    )
    expect(ranked[0]?.url).toBe('/plain.zip')
  })
})

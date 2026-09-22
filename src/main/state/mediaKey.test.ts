import { describe, expect, it } from 'vitest'
import { mediaKey } from './mediaKey'

describe('mediaKey', () => {
  it('is stable when a file moves to a different folder', () => {
    const a = mediaKey('C:\\Watch\\Show S01E01.mkv', 1234)
    const b = mediaKey('D:\\Archive\\Other\\Show S01E01.mkv', 1234)
    expect(a).toBe(b)
  })

  it('ignores case in the filename', () => {
    expect(mediaKey('C:\\a\\SHOW S01E01.MKV', 10)).toBe(
      mediaKey('C:\\a\\show s01e01.mkv', 10)
    )
  })

  it('differs when the size differs', () => {
    expect(mediaKey('C:\\a\\x.mkv', 10)).not.toBe(mediaKey('C:\\a\\x.mkv', 11))
  })

  it('is 16 hex characters', () => {
    expect(mediaKey('C:\\a\\x.mkv', 10)).toMatch(/^[0-9a-f]{16}$/)
  })
})

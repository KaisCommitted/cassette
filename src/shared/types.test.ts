import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, FINISHED_THRESHOLD, MEDIA_EXTENSIONS } from './types'

describe('shared constants', () => {
  it('starts with no library roots configured', () => {
    expect(DEFAULT_SETTINGS.libraryRoots).toEqual([])
    expect(DEFAULT_SETTINGS.tmdbApiKey).toBeNull()
  })

  it('treats 90% as finished', () => {
    expect(FINISHED_THRESHOLD).toBe(0.9)
  })

  it('accepts mkv, which is the entire reference library', () => {
    expect(MEDIA_EXTENSIONS).toContain('.mkv')
  })
})

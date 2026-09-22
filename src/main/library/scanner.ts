import type { Library, MediaFile } from '@shared/types'
import { mediaKey } from '../state/mediaKey'
import { groupIntoLibrary } from './groupIntoLibrary'
import { parseFilename } from './parseFilename'
import { walk } from './walker'

export async function scanLibrary(roots: string[]): Promise<Library> {
  const walked = await walk(roots)
  const files: MediaFile[] = walked.map((w) => ({
    ...parseFilename(w.path),
    path: w.path,
    sizeBytes: w.sizeBytes,
    key: mediaKey(w.path, w.sizeBytes)
  }))
  return groupIntoLibrary(files)
}

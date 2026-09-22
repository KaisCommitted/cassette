import type { Library } from '@shared/types'
import { mediaKey } from '../state/mediaKey'
import { categorize } from './categorize'
import { walk } from './walker'

/**
 * Turns the configured folders into a library.
 *
 * Grouping is done by `categorize`, which weighs every file that shares a
 * title against the others rather than trusting one filename or the folder it
 * happens to sit in. That is what lets a messy collection — no Movies/Series
 * split, seasons not in folders, episodes scattered across subfolders — come
 * out organised.
 */
export async function scanLibrary(roots: string[]): Promise<Library> {
  const walked = await walk(roots)
  return categorize(
    walked.map((file) => ({
      path: file.path,
      sizeBytes: file.sizeBytes,
      key: mediaKey(file.path, file.sizeBytes)
    }))
  )
}

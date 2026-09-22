import type { Library } from '@shared/types'
import { mediaKey } from '../state/mediaKey'
import { categorize } from './categorize'
import { MediaProbe } from './mediaProbe'
import { walk } from './walker'

export interface ScanOptions {
  /** Files shorter than this are left out. Zero keeps everything. */
  minimumDurationMinutes?: number
  onProgress?: (done: number, total: number) => void
}

/**
 * Turns the configured folders into a library.
 *
 * Grouping is done by `categorize`, which weighs every file that shares a
 * title against the others rather than trusting one filename or the folder it
 * happens to sit in. That is what lets a messy collection — no Movies/Series
 * split, seasons not in folders, episodes scattered across subfolders — come
 * out organised.
 *
 * Short files are dropped before grouping, since trailers, samples and stray
 * clips are noise in a list of things to watch, and a stray two-minute clip
 * sharing a show's name would otherwise be grouped in as an episode.
 */
export async function scanLibrary(
  roots: string[],
  options: ScanOptions = {}
): Promise<Library> {
  const { minimumDurationMinutes = 0, onProgress } = options
  const walked = await walk(roots)

  const files = walked.map((file) => ({
    path: file.path,
    sizeBytes: file.sizeBytes,
    key: mediaKey(file.path, file.sizeBytes)
  }))

  if (minimumDurationMinutes <= 0) return categorize(files)

  const probe = new MediaProbe()
  await probe.load()

  const minimumSeconds = minimumDurationMinutes * 60
  const keep: typeof files = []

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length)
    const { durationSeconds } = await probe.probe(file.key, file.path)
    // A file we could not read is kept: dropping something because the probe
    // failed would hide it with no way for anyone to notice.
    if (durationSeconds === null || durationSeconds >= minimumSeconds) {
      keep.push(file)
    }
  }

  await probe.save()
  onProgress?.(files.length, files.length)

  return categorize(keep)
}

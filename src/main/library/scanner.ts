import type { Library } from '@shared/types'
import { mediaKey } from '../state/mediaKey'
import { categorize } from './categorize'
import { MediaProbe } from './mediaProbe'
import { walk } from './walker'

/** Thrown when a scan is stopped part way through, rather than failing. */
export class ScanCancelled extends Error {
  constructor() {
    super('the scan was stopped')
    this.name = 'ScanCancelled'
  }
}

export interface ScanOptions {
  /** Files shorter than this are left out. Zero keeps everything. */
  minimumDurationMinutes?: number
  onProgress?: (done: number, total: number) => void
  /** Aborts the scan; what has been probed so far is still kept. */
  signal?: AbortSignal
}

/**
 * How often the probe cache is written out mid-scan.
 *
 * A first scan of a large folder takes a while, and writing only at the end
 * means closing the app part way through throws away every probe and the next
 * scan starts again from nothing. Writing as it goes costs one small file
 * write per batch and makes an interrupted scan worth something.
 */
const SAVE_EVERY = 10

/**
 * How recently a file must have been written to count as still arriving.
 *
 * A download in progress is a real media file that happens to be incomplete,
 * and mpv reads it as exactly that: half an episode reports half a duration.
 * Measured against a minimum length, it looks like a clip and gets dropped —
 * so episodes would quietly vanish from the library while they downloaded and
 * come back later, which reads as the library losing things at random.
 *
 * Anything touched this recently is kept without being probed at all. That
 * also keeps a scan quick while a download is saturating the disk, which is
 * exactly when someone is most likely to be watching something else.
 */
const STILL_ARRIVING_MS = 10 * 60 * 1000

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
  const { minimumDurationMinutes = 0, onProgress, signal } = options
  const walked = await walk(roots)

  const files = walked.map((file) => ({
    path: file.path,
    sizeBytes: file.sizeBytes,
    key: mediaKey(file.path, file.sizeBytes),
    modifiedMs: file.modifiedMs
  }))

  if (minimumDurationMinutes <= 0) return categorize(files)

  const probe = new MediaProbe()
  await probe.load()

  const minimumSeconds = minimumDurationMinutes * 60
  const keep: typeof files = []
  const now = Date.now()

  for (const [index, file] of files.entries()) {
    // Stopping leaves the library as it was rather than replacing it with a
    // half-scanned one, but everything probed so far is still written out, so
    // the work is not lost and starting again picks up where this left off.
    if (signal?.aborted) {
      await probe.save()
      throw new ScanCancelled()
    }

    onProgress?.(index, files.length)

    // A file that is still downloading is kept unexamined: its length so far
    // says nothing about the episode it will be, and reading it would only
    // compete with whatever is writing it.
    if (now - file.modifiedMs < STILL_ARRIVING_MS) {
      keep.push(file)
      continue
    }

    const { durationSeconds } = await probe.probe(file.key, file.path)
    // A file we could not read is kept: dropping something because the probe
    // failed would hide it with no way for anyone to notice.
    if (durationSeconds === null || durationSeconds >= minimumSeconds) {
      keep.push(file)
    }

    if ((index + 1) % SAVE_EVERY === 0) await probe.save()
  }

  await probe.save()
  onProgress?.(files.length, files.length)

  return categorize(keep)
}

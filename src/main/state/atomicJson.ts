import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    // Missing or corrupt: fall back rather than crash. library.json is a
    // cache, and a corrupt progress.json is better lost than fatal.
    return fallback
  }
}

/**
 * Writes in progress, one chain per file.
 *
 * Saves of the same file genuinely overlap: watch positions are written on a
 * timer while closing the player writes them again, so closing during
 * playback runs two saves at once. Queueing per file makes the later one
 * simply win instead of the two interleaving.
 */
const writing = new Map<string, Promise<void>>()

let counter = 0

/**
 * Write to a temp file then rename, so a crash mid-write cannot corrupt.
 *
 * The temp name has to be unique per write, not just per process. Two saves
 * of the same file used to share one temp path: they wrote over each other
 * and then both tried to rename it, so one moved a half-written blend of the
 * two into place and the other failed on a file that was no longer there.
 * Measured at 200 overlapping pairs, that left a third of the files unreadable
 * — and an unreadable file is read back as "no data", which for progress.json
 * means silently losing where you were in everything.
 */
export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  // The stored promise never rejects, so one failed save cannot stop the next.
  const previous = writing.get(file) ?? Promise.resolve()
  const run = previous.then(() => write(file, value))

  const settled = run.catch(() => undefined)
  writing.set(file, settled)
  // Stop tracking the file once nothing is queued behind this write, so a
  // long-running process does not keep an entry for every file it ever wrote.
  void settled.then(() => {
    if (writing.get(file) === settled) writing.delete(file)
  })

  return run
}

async function write(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${counter++}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await rename(tmp, file)
  } catch (error) {
    // Never leave a temp file behind when the write did not land.
    await rm(tmp, { force: true }).catch(() => undefined)
    throw error
  }
}

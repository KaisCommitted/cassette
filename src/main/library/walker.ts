import type { Dirent } from 'node:fs'
import { readdir as readDirectory, stat as statFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { MEDIA_EXTENSIONS } from '@shared/types'

export interface WalkedFile {
  path: string
  sizeBytes: number
  /** Last write time, used to spot files still being downloaded. */
  modifiedMs: number
}

/** The file system calls the walk makes, replaceable for tests. */
export interface WalkIo {
  readdir: (dir: string, options: { withFileTypes: true }) => Promise<Dirent[]>
  stat: (path: string) => Promise<{ size: number; mtimeMs: number }>
}

const REAL_IO: WalkIo = {
  readdir: (dir, options) => readDirectory(dir, options),
  stat: (path) => statFile(path)
}

const SKIP_NAME = /^(desktop\.ini|thumbs\.db|\..*)$/i
/**
 * Folders release groups put extras in, matched on the whole name. Matching
 * on a word anywhere in the name dropped whole shows — "Trailer Park Boys" —
 * and films — "Extra Ordinary" — on the strength of one word.
 */
const SKIP_DIRS = /^(samples?|extras?|featurettes?|trailers?|bonus|behind the scenes|deleted scenes)$/i
/** A sample is junk wherever the word appears; a trailer is, unless it is an episode. */
const SAMPLE = /\bsample\b/i
const TRAILER = /\btrailers?\b/i
const EPISODE_MARK = /\bS\d{1,2}E\d{1,3}\b|\b\d{1,2}x\d{1,3}\b/i

function isMedia(name: string): boolean {
  return (MEDIA_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

function isJunkFile(name: string): boolean {
  if (SAMPLE.test(name)) return true
  return TRAILER.test(name) && !EPISODE_MARK.test(name)
}

async function walkDir(dir: string, out: WalkedFile[], io: WalkIo): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await io.readdir(dir, { withFileTypes: true })
  } catch {
    return // unreadable or missing directory: skip it, never crash the scan
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (SKIP_NAME.test(entry.name)) continue
    if (entry.isDirectory()) {
      if (SKIP_DIRS.test(entry.name)) continue
      await walkDir(full, out, io)
    } else if (entry.isFile() && isMedia(entry.name) && !isJunkFile(entry.name)) {
      // A file that cannot be inspected — locked, a cloud placeholder, gone
      // since the listing — is left out, not allowed to end the whole scan.
      let info: { size: number; mtimeMs: number }
      try {
        info = await io.stat(full)
      } catch {
        continue
      }
      out.push({ path: full, sizeBytes: info.size, modifiedMs: info.mtimeMs })
    }
  }
}

export async function walk(roots: string[], io: WalkIo = REAL_IO): Promise<WalkedFile[]> {
  const out: WalkedFile[] = []
  for (const root of roots) await walkDir(root, out, io)
  return out
}

import { app } from 'electron'
import { dirname, join } from 'node:path'
import { access, cp, readdir, rm } from 'node:fs/promises'

export function dataDir(): string {
  return app.getPath('userData')
}

/**
 * Moves settings, watch history and caches over from the app's old name.
 *
 * Electron derives userData from the product name, so renaming the app points
 * it at an empty folder and silently loses where you were in everything. Runs
 * once and does nothing afterwards.
 */
export async function migrateLegacyData(): Promise<boolean> {
  const current = dataDir()
  const legacy = join(dirname(current), 'Mininetflix')
  if (current === legacy) return false

  try {
    await access(join(current, 'progress.json'))
    return false // already has its own data; nothing to bring over
  } catch {
    // no data yet, so a migration may be worth attempting
  }

  // Named explicitly rather than copying the folder wholesale: the rest of it
  // is Electron's own caches, which are keyed to the old name and worth
  // nothing here.
  const OURS = ['settings.json', 'progress.json', 'library.json', 'keybinds.json', 'cache']

  let moved = false
  for (const entry of OURS) {
    try {
      await cp(join(legacy, entry), join(current, entry), {
        recursive: true,
        force: false,
        errorOnExist: false
      })
      moved = true
    } catch {
      // That file did not exist under the old name; nothing to do.
    }
  }
  return moved
}

/**
 * Clears temp files left behind by a write that never finished.
 *
 * Atomic writes go to `<name>.<pid>.tmp` and are renamed into place, so a
 * process killed in between leaves the temp file behind. That is the price of
 * never corrupting the real file, but without a sweep they pile up in the
 * user's data folder forever.
 */
export async function cleanupStaleTemps(): Promise<number> {
  const dir = dataDir()
  let removed = 0
  try {
    for (const entry of await readdir(dir)) {
      if (!entry.endsWith('.tmp')) continue
      await rm(join(dir, entry), { force: true })
      removed++
    }
  } catch {
    // The data folder may not exist yet on a first run.
  }
  return removed
}

export const settingsFile = (): string => join(dataDir(), 'settings.json')
export const progressFile = (): string => join(dataDir(), 'progress.json')
export const libraryFile = (): string => join(dataDir(), 'library.json')

export const cacheDir = (): string => join(dataDir(), 'cache')
export const thumbsDir = (): string => join(cacheDir(), 'thumbs')
export const keybindsFile = (): string => join(dataDir(), 'keybinds.json')

export const metadataFile = (): string => join(dataDir(), 'metadata.json')
export const artDir = (): string => join(cacheDir(), 'art')

export const probeFile = (): string => join(dataDir(), 'probe.json')

import { createHash } from 'node:crypto'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { artDir } from '../state/paths'
import { imageUrl } from './tmdbClient'

/**
 * Downloads TMDB artwork once and serves it from disk afterwards.
 *
 * Caching rather than pointing the renderer at image.tmdb.org keeps the app
 * working with no network, avoids re-fetching the same poster on every launch,
 * and means the renderer never makes outbound requests of its own.
 */
export class ArtworkCache {
  private inFlight = new Map<string, Promise<string | null>>()

  /** Stable local name for a TMDB path at a given size. */
  private fileFor(tmdbPath: string, size: string): string {
    const hash = createHash('sha1').update(`${size}${tmdbPath}`).digest('hex').slice(0, 20)
    return join(artDir(), `${hash}.jpg`)
  }

  cachedId(tmdbPath: string, size: string): string {
    return createHash('sha1').update(`${size}${tmdbPath}`).digest('hex').slice(0, 20)
  }

  async ensure(tmdbPath: string, size: string): Promise<string | null> {
    const target = this.fileFor(tmdbPath, size)

    try {
      if ((await stat(target)).size > 0) return target
    } catch {
      // not cached yet
    }

    const key = target
    const existing = this.inFlight.get(key)
    if (existing) return existing

    const run = this.download(tmdbPath, size, target).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, run)
    return run
  }

  /** Resolves a cache id back to its file, for the protocol handler. */
  async byId(id: string): Promise<string | null> {
    const target = join(artDir(), `${id}.jpg`)
    try {
      if ((await stat(target)).size > 0) return target
    } catch {
      return null
    }
    return target
  }

  private async download(
    tmdbPath: string,
    size: string,
    target: string
  ): Promise<string | null> {
    try {
      await mkdir(artDir(), { recursive: true })
      const response = await fetch(imageUrl(tmdbPath, size))
      if (!response.ok) return null

      // Written to a temp name and renamed, so a half-downloaded image is
      // never served as if it were complete.
      const temp = `${target}.${process.pid}.part`
      await writeFile(temp, Buffer.from(await response.arrayBuffer()))
      await rename(temp, target)
      return target
    } catch {
      return null
    }
  }
}

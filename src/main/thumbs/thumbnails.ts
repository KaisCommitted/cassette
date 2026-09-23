import { spawn } from 'node:child_process'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { thumbsDir } from '../state/paths'
import { mpvBinaryPath } from '../mpv/mpvProcess'

/** Where in the file to grab the still, as a fraction of its duration. */
const GRAB_AT = '18%'
/**
 * Wide enough for the home page's big "Still watching" card, which is the
 * largest place a frame is shown. Frames used to be 480 wide, which was fine
 * on a tile and visibly blocky there.
 */
const WIDTH = 1280

/**
 * Generates poster stills by pulling a frame out of each file with mpv.
 *
 * Deliberately local rather than fetched: it needs no API key, works offline,
 * and always produces something, so a tile is never blank. TMDB artwork can
 * layer on top of this later without changing how the UI asks for an image.
 */
export class ThumbnailService {
  /** Keys currently being generated, so concurrent requests share one run. */
  private inFlight = new Map<string, Promise<string | null>>()

  /** Cap concurrency: each grab spawns mpv and decodes video. */
  private running = 0
  private queue: Array<() => void> = []
  private readonly maxConcurrent = 2

  /** The width is in the name, so frames grabbed at an older size are redone. */
  thumbPath(key: string): string {
    return join(thumbsDir(), `${key}.w${WIDTH}.jpg`)
  }

  /** Where frames were kept before the width was part of the name. */
  private legacyPath(key: string): string {
    return join(thumbsDir(), `${key}.jpg`)
  }

  private async exists(path: string): Promise<boolean> {
    try {
      return (await stat(path)).size > 0
    } catch {
      return false
    }
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.running++
    try {
      return await fn()
    } finally {
      this.running--
      const next = this.queue.shift()
      if (next) next()
    }
  }

  /** Returns the cached path, generating it first if needed. */
  async ensure(key: string, videoPath: string): Promise<string | null> {
    const target = this.thumbPath(key)
    if (await this.exists(target)) return target

    const existing = this.inFlight.get(key)
    if (existing) return existing

    const run = this.slot(() => this.generate(key, videoPath, target)).finally(() => {
      this.inFlight.delete(key)
    })
    this.inFlight.set(key, run)
    return run
  }

  private async generate(
    key: string,
    videoPath: string,
    target: string
  ): Promise<string | null> {
    // mpv writes a numbered file into an output directory, so each grab gets a
    // scratch directory of its own to avoid races between concurrent runs.
    const scratch = join(thumbsDir(), `.tmp-${key}`)
    await mkdir(scratch, { recursive: true })

    try {
      await this.runMpv(videoPath, scratch)
      const produced = (await readdir(scratch)).find((f) => f.endsWith('.jpg'))
      if (!produced) return null
      await rename(join(scratch, produced), target)
      await rm(this.legacyPath(key), { force: true }).catch(() => undefined)
      return target
    } catch {
      return null
    } finally {
      await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private runMpv(videoPath: string, outDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        mpvBinaryPath(),
        [
          '--no-config',
          '--really-quiet',
          '--no-audio',
          '--no-sub',
          `--start=${GRAB_AT}`,
          '--frames=1',
          `--vf=scale=${WIDTH}:-2`,
          '--vo=image',
          '--vo-image-format=jpg',
          '--vo-image-jpeg-quality=82',
          `--vo-image-outdir=${outDir}`,
          videoPath
        ],
        { stdio: 'ignore' }
      )
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('thumbnail generation timed out'))
      }, 25000)
      timer.unref?.()
      child.on('error', reject)
      child.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

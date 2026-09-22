import { spawn } from 'node:child_process'
import { mpvBinaryPath } from '../mpv/mpvProcess'
import { readJson, writeJsonAtomic } from '../state/atomicJson'
import { probeFile as probeCacheFile } from '../state/paths'
import { parseTrackList, type EmbeddedSubtitle } from '../subs/embeddedSubtitles'

export interface ProbeResult {
  durationSeconds: number | null
  subtitles: EmbeddedSubtitle[]
}

type ProbeCache = Record<string, ProbeResult>

/**
 * Reads duration and subtitle tracks out of a file, once.
 *
 * Both come from the same mpv call, because opening a file is the expensive
 * part and asking twice doubles the cost of a scan for nothing. Results are
 * cached by media key, so a rescan of a library that has not changed does no
 * probing at all.
 */
export class MediaProbe {
  private cache: ProbeCache = {}
  private inFlight = new Map<string, Promise<ProbeResult>>()
  private dirty = false

  async load(): Promise<void> {
    this.cache = await readJson<ProbeCache>(probeCacheFile(), {})
  }

  async save(): Promise<void> {
    if (!this.dirty) return
    await writeJsonAtomic(probeCacheFile(), this.cache)
    this.dirty = false
  }

  cached(key: string): ProbeResult | null {
    return this.cache[key] ?? null
  }

  async probe(key: string, path: string): Promise<ProbeResult> {
    const known = this.cache[key]
    if (known) return known

    const existing = this.inFlight.get(key)
    if (existing) return existing

    const run = runMpvProbe(path)
      .then((result) => {
        this.cache[key] = result
        this.dirty = true
        return result
      })
      .finally(() => this.inFlight.delete(key))

    this.inFlight.set(key, run)
    return run
  }
}

/** Opens the file, decodes nothing, and reads what mpv prints about it. */
function runMpvProbe(path: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const child = spawn(
      mpvBinaryPath(),
      [
        '--no-config',
        '--vo=null',
        '--ao=null',
        // One frame, not zero: duration is only reported once playback starts,
        // and decoding a single frame costs about half a second per file.
        '--frames=1',
        '--msg-level=all=no,cplayer=v,term-msg=info',
        '--term-playing-msg=PROBE_DURATION=${=duration}',
        path
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    let text = ''
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString()))

    const timer = setTimeout(() => child.kill(), 20000)
    timer.unref?.()

    const finish = (): void => {
      clearTimeout(timer)
      resolve({
        durationSeconds: parseDuration(text),
        subtitles: parseTrackList(text)
      })
    }
    child.on('exit', finish)
    child.on('error', finish)
  })
}

/** mpv reports it through the playing message we asked it to print. */
export function parseDuration(output: string): number | null {
  const match = /PROBE_DURATION=([\d.]+)/.exec(output)
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null
}

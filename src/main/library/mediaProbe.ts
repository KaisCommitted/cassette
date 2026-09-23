import { spawn } from 'node:child_process'
import { mpvBinaryPath } from '../mpv/mpvProcess'
import { readJson, writeJsonAtomic } from '../state/atomicJson'
import { probeFile as probeCacheFile } from '../state/paths'
import { parseTrackList, type EmbeddedSubtitle } from '../subs/embeddedSubtitles'

export interface ProbeResult {
  durationSeconds: number | null
  subtitles: EmbeddedSubtitle[]
}

/** A probe's answer, and whether mpv actually got to give one. */
export interface ProbeOutcome extends ProbeResult {
  /**
   * False when the probe was cut short — it timed out, or mpv could not be
   * started — so the answer is ours, not mpv's, and not worth remembering.
   */
  complete: boolean
}

export type ProbeRunner = (path: string) => Promise<ProbeOutcome>

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

  constructor(private readonly run: ProbeRunner = runMpvProbe) {}

  async load(): Promise<void> {
    this.cache = await readJson<ProbeCache>(probeCacheFile(), {})
  }

  async save(): Promise<void> {
    if (!this.dirty) return
    // A library scan and a subtitle scan each keep their own copy of this;
    // whichever saves second must not throw away what the other found.
    const onDisk = await readJson<ProbeCache>(probeCacheFile(), {})
    this.cache = { ...onDisk, ...this.cache }
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

    const run = this.run(path)
      .then(({ complete, ...result }) => {
        // Only an answer mpv gave is kept. A probe that timed out, or never
        // started, used to be remembered as "no duration, no subtitles" for
        // good — hiding a file's embedded subtitles until the cache was
        // deleted by hand.
        if (complete) {
          this.cache[key] = result
          this.dirty = true
        }
        return result
      })
      .finally(() => this.inFlight.delete(key))

    this.inFlight.set(key, run)
    return run
  }
}

/**
 * Every probe process currently running.
 *
 * Probing spawns mpv once per file, and a scan interrupted by quitting the app
 * would otherwise leave those children running with nothing to report to —
 * they are not in the app's process tree once it is gone, so nothing would
 * ever clean them up.
 */
const running = new Set<ReturnType<typeof spawn>>()
/** Probes we ended ourselves, whose exit therefore says nothing about the file. */
const killed = new WeakSet<ReturnType<typeof spawn>>()

/** Stops any probe in flight. Called when the app is on its way out. */
export function killRunningProbes(): number {
  const count = running.size
  for (const child of running) {
    killed.add(child)
    child.kill()
  }
  running.clear()
  return count
}

/** Opens the file, decodes nothing, and reads what mpv prints about it. */
function runMpvProbe(path: string): Promise<ProbeOutcome> {
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

    running.add(child)

    let text = ''
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString()))

    const timer = setTimeout(() => {
      killed.add(child)
      child.kill()
    }, 20000)
    timer.unref?.()

    const finish = (complete: boolean): void => {
      clearTimeout(timer)
      running.delete(child)
      resolve({
        durationSeconds: parseDuration(text),
        subtitles: parseTrackList(text),
        complete
      })
    }
    // mpv ending on its own is an answer, even a poor one; being killed by
    // the timeout, or never starting, is not.
    child.on('exit', () => finish(!killed.has(child)))
    child.on('error', () => finish(false))
  })
}

/** mpv reports it through the playing message we asked it to print. */
export function parseDuration(output: string): number | null {
  const match = /PROBE_DURATION=([\d.]+)/.exec(output)
  if (!match) return null
  const seconds = Number(match[1])
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null
}

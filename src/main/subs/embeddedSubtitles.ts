import { spawn } from 'node:child_process'
import { mpvBinaryPath } from '../mpv/mpvProcess'
import { languageName } from './localSubtitles'

export interface EmbeddedSubtitle {
  id: number
  lang: string | null
  title: string | null
  codec: string | null
}

/**
 * Subtitle tracks inside a container.
 *
 * Checking this before reaching for a download service matters more than it
 * sounds: nearly every file in a typical library already carries subtitles, so
 * a scan that only looks for sibling .srt files both reports the wrong thing
 * and spends a strictly limited download quota on files that need nothing.
 *
 * mpv is asked to open the file and decode no frames, which is fast and needs
 * no second tool alongside the one already bundled.
 */
export function probeEmbeddedSubtitles(path: string): Promise<EmbeddedSubtitle[]> {
  return new Promise((resolve) => {
    const child = spawn(
      mpvBinaryPath(),
      [
        '--no-config',
        '--vo=null',
        '--ao=null',
        '--frames=0',
        '--msg-level=all=no,cplayer=v',
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
      resolve(parseTrackList(text))
    }
    child.on('exit', finish)
    child.on('error', finish)
  })
}

/**
 * Reads mpv's track listing, whose subtitle lines look like:
 *   `(+) Subs  --sid=1  --slang=eng  'English (SDH)' (ass)`
 */
export function parseTrackList(output: string): EmbeddedSubtitle[] {
  const tracks: EmbeddedSubtitle[] = []
  for (const line of output.split('\n')) {
    if (!/\bSubs?\b/i.test(line)) continue
    const id = /--sid=(\d+)/.exec(line)
    if (!id) continue
    const lang = /--slang=(\S+)/.exec(line)
    const title = /'([^']*)'/.exec(line)
    const codec = /\(([^()]+)\)\s*$/.exec(line)
    tracks.push({
      id: Number(id[1]),
      lang: lang?.[1] ?? null,
      title: title?.[1] ?? null,
      codec: codec?.[1] ?? null
    })
  }
  return tracks
}

/** "English, Arabic and 13 more" for the scan report. */
export function describeEmbedded(tracks: EmbeddedSubtitle[]): string {
  if (tracks.length === 0) return 'none'
  const languages = [...new Set(tracks.map((t) => languageName(normalise(t.lang))))]
  if (languages.length <= 2) return languages.join(' and ')
  return `${languages.slice(0, 2).join(', ')} and ${languages.length - 2} more`
}

function normalise(lang: string | null): string | null {
  if (!lang || lang === 'und') return null
  return lang.toLowerCase()
}

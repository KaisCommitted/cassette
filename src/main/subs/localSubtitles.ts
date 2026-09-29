import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { MEDIA_EXTENSIONS, type MediaFile } from '@shared/types'
import { categorize } from '../library/categorize'
import { languageName, type Flavour } from './language'
import {
  identifySubtitle,
  identifyVideo,
  ownersOf,
  scoreMatch,
  SUBTITLE_FOLDER,
  type SubtitleIdentity,
  type VideoIdentity
} from './subtitleMatch'

/**
 * Every subtitle format mpv reads from a file of its own. mpv's own loading
 * is off (mpvProcess.ts), so a format missing here is never loaded at all.
 */
export const SUBTITLE_EXTENSIONS = [
  '.srt',
  '.ass',
  '.ssa',
  '.sub',
  '.idx',
  '.sup',
  '.vtt',
  '.smi',
  '.mks',
  '.utf',
  '.utf8',
  '.utf-8'
] as const

export interface FoundSubtitle {
  path: string
  /** Language guessed from the filename, e.g. `eng`, or null. */
  lang: string | null
  /** Human label for the menu, e.g. "English (file)". */
  label: string
}

function isSubtitle(name: string): boolean {
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

function isVideo(name: string): boolean {
  return (MEDIA_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

/** A sample is no rival for a film's subtitles; the library skips them too. */
const SAMPLE = /\bsample\b/i

/** How deep into a subtitle folder to look: `Subs/<episode>/2_English.srt`. */
const SUBTITLE_FOLDER_DEPTH = 2

interface SubtitleOnDisk {
  path: string
  name: string
  /** Folders between the video's folder and this file, outermost first. */
  folders: string[]
}

async function entriesOf(folder: string): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true })
  } catch {
    return []
  }
}

/** Every subtitle in a subtitle folder, and the folders inside it. */
async function walkSubtitleFolder(
  folder: string,
  folders: string[],
  out: SubtitleOnDisk[]
): Promise<void> {
  for (const entry of await entriesOf(folder)) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (folders.length < SUBTITLE_FOLDER_DEPTH) {
        await walkSubtitleFolder(path, [...folders, entry.name], out)
      }
    } else if (isSubtitle(entry.name)) {
      out.push({ path, name: entry.name, folders })
    }
  }
}

function labelFor(lang: string | null, flavour: Flavour): string {
  const kind = flavour === 'sdh' ? ' SDH' : flavour === 'forced' ? ' forced' : ''
  return `${languageName(lang)}${kind} (file)`
}

const FLAVOUR_ORDER: Record<Flavour, number> = { full: 0, sdh: 1, forced: 2 }

/**
 * Subtitle files for a video, from beside it and from any subtitle folder
 * next to it (`Subs`, `Subtitles`, `Show.S01.English.Subs`, and the
 * per-episode folders RARBG puts inside those).
 *
 * A name that starts with the video's is the quick, certain case, and is how
 * this app names what it downloads. Anything else is matched by what it is:
 * every video in the folder is placed the way the library places it, with its
 * neighbours, every subtitle is read with the same parser, and a subtitle is
 * offered to the video it fits best — `Show.S01E03.srt` to
 * `Show - 1x03 - Title.mkv`, never to episode four. One that says nothing of
 * what it is for, like `English.srt`, is only offered when the video has the
 * folder to itself.
 *
 * Given the library's own entry for the video, that placement is used for
 * it; a path alone is placed from its folder. No network involved.
 *
 * A scan passes a {@link FolderCache}, so a season folder is read and
 * identified once rather than once per episode.
 */
export async function findLocalSubtitles(
  video: string | MediaFile,
  cache: FolderCache | null = null
): Promise<FoundSubtitle[]> {
  const videoPath = resolve(typeof video === 'string' ? video : video.path)
  const wanted = pathKey(videoPath)
  const folder = await (cache ? cache.read(dirname(videoPath)) : readFolder(dirname(videoPath)))
  if (folder.subtitles.length === 0) return []

  let identities = folder.videos
  if (!identities.some((identity) => pathKey(identity.path) === wanted)) {
    identities = [...identities, identifyVideo(videoPath)]
  }
  // The library's own placement of this video, when given, over the one
  // worked out from its folder alone.
  if (typeof video !== 'string') {
    const own = identifyVideo(videoPath, video)
    identities = identities.map((identity) => (pathKey(identity.path) === wanted ? own : identity))
  }
  const target = identities.find((identity) => pathKey(identity.path) === wanted)!
  const alone = identities.length === 1

  const found: Array<FoundSubtitle & { score: number; flavour: Flavour; depth: number }> = []
  for (const sub of folder.subtitles) {
    // Most subtitles in a season folder are plainly some other episode's;
    // settling that first spares comparing them with every other video.
    const score = scoreMatch(sub.identity, target, { alone })
    if (score === null) continue
    if (!ownersOf(sub.identity, identities).includes(target)) continue
    try {
      if ((await stat(sub.path)).size === 0) continue
    } catch {
      continue
    }
    found.push({
      path: sub.path,
      lang: sub.identity.lang,
      label: labelFor(sub.identity.lang, sub.identity.flavour),
      score,
      flavour: sub.identity.flavour,
      depth: sub.folders.length
    })
  }

  // Surest first, then full dialogue before SDH before forced, so that where
  // the menu and the default pick fall back on order they fall on the best.
  found.sort(
    (a, b) =>
      b.score - a.score ||
      FLAVOUR_ORDER[a.flavour] - FLAVOUR_ORDER[b.flavour] ||
      a.depth - b.depth ||
      a.path.localeCompare(b.path)
  )
  return found.map(({ path, lang, label }) => ({ path, lang, label }))
}

interface FolderContents {
  /** Every video in the folder, placed from the folder alone. */
  videos: VideoIdentity[]
  subtitles: Array<SubtitleOnDisk & { identity: SubtitleIdentity }>
}

/**
 * A folder's videos and subtitles, read and identified once and reused for
 * the length of a scan.
 *
 * Identifying a folder means placing every video in it the way the library
 * would and reading every subtitle's name; for a season folder that is the
 * same work for every one of its episodes. A subtitle the scan writes is
 * added to what is kept ({@link FolderCache.added}); anything else that may
 * have changed a folder makes the scan forget it ({@link FolderCache.invalidate}).
 */
export class FolderCache {
  private readonly folders = new Map<string, Promise<FolderContents>>()

  read(folder: string): Promise<FolderContents> {
    const key = pathKey(folder)
    let contents = this.folders.get(key)
    if (!contents) {
      contents = readFolder(folder)
      this.folders.set(key, contents)
    }
    return contents
  }

  /**
   * A subtitle just written beside a video. Reading the whole folder again
   * for it would cost a season folder's worth of work per download.
   */
  added(path: string): void {
    const key = pathKey(dirname(path))
    const kept = this.folders.get(key)
    if (!kept) return
    this.folders.set(
      key,
      kept.then((contents) => {
        // A folder read while it held no subtitles kept nothing of its
        // videos either; it has to be read properly now.
        if (contents.videos.length === 0) return readFolder(dirname(path))
        const name = basename(path)
        const sub = { path, name, folders: [], identity: identifySubtitle(name) }
        return { ...contents, subtitles: [...contents.subtitles, sub] }
      })
    )
  }

  invalidate(folder: string): void {
    this.folders.delete(pathKey(folder))
  }
}

async function readFolder(home: string): Promise<FolderContents> {
  const paths: string[] = []
  const found: SubtitleOnDisk[] = []
  for (const entry of await entriesOf(home)) {
    const path = join(home, entry.name)
    if (entry.isDirectory()) {
      if (SUBTITLE_FOLDER.test(entry.name)) await walkSubtitleFolder(path, [entry.name], found)
    } else if (isSubtitle(entry.name)) {
      found.push({ path, name: entry.name, folders: [] })
    } else if (isVideo(entry.name) && !SAMPLE.test(entry.name)) {
      paths.push(path)
    }
  }
  if (found.length === 0) return { videos: [], subtitles: [] }

  const placed = new Map<string, MediaFile>()
  const library = categorize(paths.map((path) => ({ path, sizeBytes: 0, key: path })))
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) placed.set(pathKey(episode.file.path), episode.file)
    }
  }
  for (const movie of library.movies) placed.set(pathKey(movie.file.path), movie.file)

  // A VobSub is two files, and mpv opens the pair through the `.idx`.
  const indexes = new Set(
    found
      .filter((sub) => extname(sub.name).toLowerCase() === '.idx')
      .map((sub) => pathKey(sub.path.slice(0, -4)))
  )
  const subtitles = found
    .filter(
      (sub) =>
        !(extname(sub.name).toLowerCase() === '.sub' && indexes.has(pathKey(sub.path.slice(0, -4))))
    )
    .map((sub) => ({ ...sub, identity: identifySubtitle(sub.name, sub.folders) }))

  return {
    videos: paths.map((path) => identifyVideo(path, placed.get(pathKey(path)))),
    subtitles
  }
}

/**
 * One spelling for a path, to compare two by: absolute, with the separators
 * Windows uses, and — since its file system ignores case — lowercased there.
 * `C:/Show/E1.mkv` and `c:\show\e1.mkv` are the same file.
 */
function pathKey(path: string): string {
  const absolute = resolve(path)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

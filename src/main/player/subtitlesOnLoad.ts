import type { Library, MediaFile, PlaybackState, Settings, TrackInfo } from '@shared/types'
import { findSeasonOwner } from '../library/playQueue'
import { findLocalSubtitles } from '../subs/localSubtitles'
import type { SubtitleChoice } from './trackChoice'
import { applySeasonSubtitleChoice, chooseSubtitleTrack } from './trackChoice'

/** What of mpv loading a file's subtitles needs. MpvController fits it. */
export interface SubtitlePlayer {
  getState(): PlaybackState
  refreshTracks(): Promise<TrackInfo[]>
  loadedSubtitlePaths(): Set<string>
  addSubtitleFile(path: string, title?: string, lang?: string | null): Promise<void>
  setSubtitleTrack(id: number | null): Promise<void>
}

export interface SubtitleContext {
  mpv: SubtitlePlayer
  library: Library | null
  currentKey: string | null
  subtitleChoices: { get(seriesId: string, season: number): SubtitleChoice | undefined } | null
}

/**
 * Adds every subtitle file beside the video that mpv is not already showing.
 *
 * This is the only way a subtitle file reaches mpv: its own `--sub-auto` is
 * off (mpvProcess.ts), because mpv takes any file whose name *contains* the
 * video's, which hands `Show E1` the subtitles for `Show E10`. Which files
 * belong to which video is decided once, in findLocalSubtitles. Adding them
 * without selecting anything leaves the track that was chosen for the user's
 * preferred language switched on.
 *
 * The track list is read afresh from mpv first, rather than trusted from the
 * last update, so a list still describing the previous episode cannot make a
 * file look loaded when it is not. mpv drops a file's external subtitles
 * itself when the next file replaces it; nothing carries over.
 *
 * Every step here waits — on mpv, on the folder — and Next, or autoplay, can
 * move to another file meanwhile. Whenever `path` is no longer the one
 * playing, this stops: the rest of its subtitles belong to a file that has
 * gone, and adding them would give them to the one that replaced it.
 */
export async function loadExternalSubtitles(ctx: SubtitleContext, path: string): Promise<number> {
  const stillPlaying = (): boolean => ctx.mpv.getState().path === path
  if (!stillPlaying()) return 0
  await ctx.mpv.refreshTracks()
  if (!stillPlaying()) return 0
  const already = ctx.mpv.loadedSubtitlePaths()
  const found = await findLocalSubtitles(libraryEntryOrPath(ctx.library, path))

  let added = 0
  for (const sub of found) {
    if (!stillPlaying()) return added
    if (already.has(sub.path.toLowerCase())) continue
    try {
      await ctx.mpv.addSubtitleFile(sub.path, sub.label, sub.lang)
      added++
    } catch {
      // A subtitle mpv refuses to parse should not stop the others loading.
    }
  }
  if (added > 0 && stillPlaying()) await ctx.mpv.refreshTracks()
  return added
}

/**
 * Loads a file's subtitle files and switches on the right subtitle, once the
 * file has opened.
 *
 * Subtitle files beside the video come first: they are extra candidates for
 * the choice, and picking before loading them would settle on an embedded
 * track while a preferred-language file sat unused. Failing to load them —
 * mpv slow to answer, a folder that cannot be read — still leaves the tracks
 * inside the video to choose from, so it does not stop the choice.
 *
 * Picking a subtitle by hand on one episode carries to the rest of its
 * season (trackChoice.applySeasonSubtitleChoice); a season with no pick, or
 * an episode with nothing like it, gets the ordinary default.
 */
export async function chooseSubtitlesOnLoad(
  ctx: SubtitleContext,
  path: string,
  config: Pick<Settings, 'preferredSubtitleLanguages' | 'autoEnableSubtitles'>
): Promise<void> {
  try {
    await loadExternalSubtitles(ctx, path)
  } catch (error) {
    console.error('[cassette] loading subtitle files failed:', (error as Error).message)
  }
  // Moved on to another file while the folder was read: that file makes its
  // own choice.
  if (ctx.mpv.getState().path !== path) return

  const owner =
    ctx.library && ctx.currentKey ? findSeasonOwner(ctx.library, ctx.currentKey) : null
  const remembered = owner ? ctx.subtitleChoices?.get(owner.seriesId, owner.season) : undefined
  const tracks = ctx.mpv.getState().tracks
  const override = applySeasonSubtitleChoice(
    tracks.filter((t) => t.type === 'sub'),
    remembered
  )
  const subtitle =
    override !== undefined
      ? override
      : chooseSubtitleTrack(tracks, config.preferredSubtitleLanguages, config.autoEnableSubtitles)
  if (subtitle !== null) await ctx.mpv.setSubtitleTrack(subtitle)
}

/**
 * The library's entry for a playing file, so its subtitles are matched to
 * the season and episode the library gave it; the bare path when it has none.
 */
export function libraryEntryOrPath(library: Library | null, path: string): MediaFile | string {
  if (!library) return path
  const wanted = path.toLowerCase()
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        if (episode.file.path.toLowerCase() === wanted) return episode.file
      }
    }
  }
  return library.movies.find((m) => m.file.path.toLowerCase() === wanted)?.file ?? path
}

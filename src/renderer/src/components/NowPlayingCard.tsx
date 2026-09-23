import type { Library, MetadataSnapshot } from '@shared/types'
import { nowPlaying } from '../select'
import { PosterArt } from './Art'

/**
 * The tape in the machine: what the library window shows while the player is
 * up.
 *
 * Nobody looks at the library then — the player covers it — except Windows,
 * which photographs it for the Alt-Tab and Task View tile. The picture itself
 * lives in the video window, which the switcher never lists, so without this
 * the tile was pitch black. It is the sleeve already on the shelf, the title,
 * and the episode, and nothing that moves: no progress, no clock. Drawn once
 * when the episode starts, gone when the player closes, so it holds nothing
 * in memory beyond one poster the shelf had cached anyway.
 */
export function NowPlayingCard({
  library,
  metadata,
  mediaKey
}: {
  library: Library
  metadata: MetadataSnapshot
  mediaKey: string
}) {
  const card = nowPlaying(library, metadata, mediaKey)
  if (!card) return null
  return (
    <div className="now-playing" aria-hidden="true">
      <div className="now-playing-sleeve">
        <PosterArt
          posterPath={card.posterPath}
          thumbKey={card.thumbKey}
          title={card.title}
          // The printed sleeve shows a film's year; an episode's sleeve is the
          // series', so it carries no episode number.
          detail={card.kind === 'film' ? card.detail : null}
        />
      </div>
      <div className="now-playing-text">
        <p className="now-playing-title">{card.title}</p>
        {card.detail && <p className="now-playing-detail">{card.detail}</p>}
      </div>
    </div>
  )
}

import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import type { Library } from '@shared/types'
import type { ThumbnailService } from './thumbnails'

import { THUMB_SCHEME } from '../protocolSchemes'
export { THUMB_SCHEME }

/**
 * Serves generated stills to the renderer over `cassette-thumb://<key>`.
 *
 * A custom scheme rather than `file://`: the renderer runs with context
 * isolation and no filesystem access, and this exposes exactly one directory
 * of generated images instead of the whole disk. Requesting an image also
 * generates it on demand, so the UI just points at a URL and the still
 * appears when it is ready.
 */

export function serveThumbnails(
  thumbnails: ThumbnailService,
  getLibrary: () => Library | null
): void {
  protocol.handle(THUMB_SCHEME, async (request) => {
    const key = new URL(request.url).hostname
    const videoPath = findPath(getLibrary(), key)
    if (!videoPath) return new Response('unknown key', { status: 404 })

    const file = await thumbnails.ensure(key, videoPath)
    if (!file) return new Response('could not generate', { status: 404 })

    return net.fetch(pathToFileURL(file).toString())
  })
}

function findPath(library: Library | null, key: string): string | null {
  if (!library) return null
  for (const series of library.series) {
    for (const season of series.seasons) {
      for (const episode of season.episodes) {
        if (episode.file.key === key) return episode.file.path
      }
    }
  }
  return library.movies.find((m) => m.file.key === key)?.file.path ?? null
}

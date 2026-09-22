import { protocol } from 'electron'
import { serveLocalFile } from '../protocolResponse'
import { IMAGE_SIZES } from './tmdbClient'
import type { ArtworkCache } from './artworkCache'

import { ART_SCHEME } from '../protocolSchemes'
export { ART_SCHEME }


/**
 * Serves TMDB artwork from the local cache over
 * `cassette-art://<kind>/<tmdb path>`.
 *
 * The renderer asks by TMDB path and never touches the network itself: the
 * first request downloads, everything after is read from disk. Kind selects
 * the size, so a card never pulls a backdrop-sized file.
 */
export function serveArtwork(cache: ArtworkCache): void {
  protocol.handle(ART_SCHEME, async (request) => {
    const url = new URL(request.url)
    const kind = url.hostname as keyof typeof IMAGE_SIZES
    const size = IMAGE_SIZES[kind]
    if (!size) return new Response('unknown size', { status: 404 })

    // The TMDB path is the rest of the URL, e.g. /abc123.jpg
    const tmdbPath = decodeURIComponent(url.pathname)
    if (!/^\/[\w.-]+\.(jpg|png)$/i.test(tmdbPath)) {
      return new Response('bad path', { status: 400 })
    }
    const file = await cache.ensure(tmdbPath, size)
    if (!file) return new Response('not available', { status: 404 })

    return serveLocalFile(file)
  })
}

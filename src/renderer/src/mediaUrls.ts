import type { ArtKind } from './components/Art'

/*
 * Images come from the same origin as the page.
 *
 * When packaged, the renderer is served over app:// and a request to a
 * different custom scheme is refused by Chromium before any handler sees it —
 * artwork simply never loaded. Relative paths keep every image on the page's
 * own origin. In development the page is served over http, where the custom
 * schemes work fine and there is no app:// origin to be relative to.
 */
const SAME_ORIGIN = window.location.protocol === 'app:'

export function artUrl(tmdbPath: string, kind: ArtKind): string {
  return SAME_ORIGIN ? `/_art/${kind}${tmdbPath}` : `cassette-art://${kind}${tmdbPath}`
}

/**
 * Bumped whenever frames are regenerated at a new size. Responses are cached
 * for a day, so without it the page would keep showing the old, smaller frame.
 */
const THUMB_VERSION = 'w1280'

export function thumbUrl(key: string): string {
  return SAME_ORIGIN
    ? `/_thumb/${key}/${THUMB_VERSION}`
    : `cassette-thumb://${key}/${THUMB_VERSION}`
}

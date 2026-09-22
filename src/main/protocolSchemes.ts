import { protocol } from 'electron'

export const THUMB_SCHEME = 'cassette-thumb'
export const ART_SCHEME = 'cassette-art'
export const APP_SCHEME = 'app'

/**
 * Declares every custom scheme in one call, before the app is ready.
 *
 * Electron replaces the whole privileged list each time this is called, so
 * registering schemes from two different modules silently drops the first —
 * which showed up as artwork never loading while thumbnails still did.
 */
export function registerCustomSchemes(): void {
  /*
   * `standard` alone is not enough to load these from the renderer. The page
   * is served from file://, and without `secure` the scheme is treated as an
   * untrusted origin and the request is dropped before it ever reaches the
   * handler — images silently fell back while the same URL fetched fine from
   * the main process. `corsEnabled` is needed for the same reason.
   */
  const privileges = {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true
  }

  protocol.registerSchemesAsPrivileged([
    { scheme: THUMB_SCHEME, privileges },
    { scheme: ART_SCHEME, privileges },
    { scheme: APP_SCHEME, privileges }
  ])
}

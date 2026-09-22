import type { Settings } from '@shared/types'

/**
 * API keys compiled into the build, so a fresh install works immediately.
 *
 * Nobody should have to go and register with three services before the app
 * will show a poster or find a subtitle. These are supplied at build time from
 * the release workflow's secrets, never written in source: this repository is
 * public, and a key committed to it would be found by scanners within hours
 * and revoked by the provider — leaving every installed copy broken.
 *
 * A build made without them — anyone cloning and building this themselves —
 * simply has none, and the app asks for keys in settings as it always did.
 */
declare const __BUNDLED_TMDB_KEY__: string
declare const __BUNDLED_SUBDL_KEY__: string
declare const __BUNDLED_OPENSUBTITLES_KEY__: string

/** `define` replaces these at build time; a dev run has no definition at all. */
function bundled(value: string | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export const BUNDLED_KEYS = {
  tmdb: bundled(typeof __BUNDLED_TMDB_KEY__ === 'string' ? __BUNDLED_TMDB_KEY__ : undefined),
  subdl: bundled(typeof __BUNDLED_SUBDL_KEY__ === 'string' ? __BUNDLED_SUBDL_KEY__ : undefined),
  openSubtitles: bundled(
    typeof __BUNDLED_OPENSUBTITLES_KEY__ === 'string' ? __BUNDLED_OPENSUBTITLES_KEY__ : undefined
  )
} as const

/** Which keys this build carries, for the settings screen to say so. */
export function bundledKeyAvailability(): Record<'tmdb' | 'subdl' | 'openSubtitles', boolean> {
  return {
    tmdb: BUNDLED_KEYS.tmdb !== null,
    subdl: BUNDLED_KEYS.subdl !== null,
    openSubtitles: BUNDLED_KEYS.openSubtitles !== null
  }
}

/**
 * Settings with any key the user has not set filled in from the build.
 *
 * Applied where the keys are used rather than when settings are loaded, so
 * what is stored on disk stays exactly what the user chose. That keeps the
 * settings screen honest — an empty box means "using the built-in key", not a
 * copy of it — and means clearing the box goes back to the built-in one
 * instead of leaving the feature broken.
 */
export function withBundledKeys(settings: Settings): Settings {
  return {
    ...settings,
    tmdbApiKey: settings.tmdbApiKey ?? BUNDLED_KEYS.tmdb,
    subdlApiKey: settings.subdlApiKey ?? BUNDLED_KEYS.subdl,
    openSubtitlesApiKey: settings.openSubtitlesApiKey ?? BUNDLED_KEYS.openSubtitles
  }
}

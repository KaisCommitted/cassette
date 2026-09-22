/**
 * VLC's defaults. Phase 3 makes these editable and adds mouse descriptors;
 * the `key:` prefix exists now so that `mouse:button4` slots in unchanged.
 */
export const DEFAULT_BINDINGS: Record<string, string> = {
  'key:Space': 'playPause',
  'key:f': 'toggleFullscreen',
  'key:Left': 'seekShortBack',
  'key:Right': 'seekShortForward',
  'key:Ctrl+Left': 'seekMediumBack',
  'key:Ctrl+Right': 'seekMediumForward',
  'key:Up': 'volumeUp',
  'key:Down': 'volumeDown',
  'key:m': 'mute',
  'key:v': 'cycleSubtitleTrack',
  'key:b': 'cycleAudioTrack',
  'key:g': 'subtitleDelayDown',
  'key:h': 'subtitleDelayUp',
  'key:n': 'nextEpisode',
  'key:p': 'previousEpisode',
  'key:Escape': 'stop'
}

/**
 * Who a key press belongs to: the page it was pressed in, or the player.
 *
 * Bindings drive the player and nothing else. With nothing playing, every
 * key belongs to the page: to typing in search, to Tab and Enter, and to the
 * settings screen listening for a new binding. This used to hold back only
 * seek-style actions, so M, F and the arrows were taken from the search box —
 * typing "amen" left "aen" and muted the player.
 *
 * Typing is reported by the library alone, so it only ever holds back keys
 * pressed in the library. It used to hold back every key: the search box is
 * still the library's focused element after a click on picture-in-picture,
 * so the flag stayed set, and the little window lost Space, P, the arrows and
 * even Escape.
 *
 * In picture-in-picture the library is there to be used, so its keys are its
 * own again — arrows, Space, Enter and Escape browse as they do with nothing
 * playing. The player's bindings answer once the little window is clicked.
 * Media keys are the exception: they mean the player wherever they are
 * pressed, and nothing in the library wants them.
 */
export function keyOwner(press: {
  from: 'library' | 'player'
  key: string
  playing: boolean
  typing: boolean
  pip: boolean
}): 'page' | 'player' {
  if (!press.playing) return 'page'
  if (press.from === 'player') return 'player'
  if (press.typing) return 'page'
  if (press.pip && !isMediaKey(press.key)) return 'page'
  return 'player'
}

/** Keys that belong to the player from any of Cassette's windows. */
export function isMediaKey(key: string): boolean {
  return key.startsWith('Media') || key.startsWith('AudioVolume')
}

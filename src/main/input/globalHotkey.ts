/**
 * The one binding that works while Cassette is not focused.
 *
 * Everything else in the app is scoped to the focused window. This is the
 * exception, and it is deliberately narrow:
 *
 *   - It is armed only while the player is open and actually playing. Pressed
 *     while browsing the library, it does nothing.
 *   - Triggering it pauses, hides the window, and records that *it* was the
 *     thing that did so.
 *   - Triggering it again from elsewhere restores and resumes, but only if
 *     that flag is set. Pausing with Space and alt-tabbing away yourself
 *     leaves the flag clear, so the key will not drag the app back.
 *
 * Electron's globalShortcut cannot register mouse buttons at all, so this uses
 * a native OS hook. The hook observes without consuming, so a bound side
 * button still reaches the focused application — acceptable for MB4/MB5, and
 * it means the binding never breaks another app's shortcuts.
 */
export interface GlobalHotkeyDeps {
  /** True when the player is open with something playing. */
  isArmed: () => boolean
  isAppFocused: () => boolean
  pauseAndHide: () => Promise<void>
  restoreAndResume: () => Promise<void>
}

export class GlobalHotkeyMachine {
  private suspendedByHotkey = false

  constructor(private readonly deps: GlobalHotkeyDeps) {}

  /** Returns what it did, which makes the state machine straightforward to test. */
  async trigger(): Promise<'hidden' | 'restored' | 'ignored'> {
    if (this.suspendedByHotkey) {
      // Only this hotkey may undo what this hotkey did.
      this.suspendedByHotkey = false
      await this.deps.restoreAndResume()
      return 'restored'
    }

    if (!this.deps.isArmed() || !this.deps.isAppFocused()) return 'ignored'

    this.suspendedByHotkey = true
    await this.deps.pauseAndHide()
    return 'hidden'
  }

  /** Any other way of stopping clears the flag, so the key stops being a restore. */
  clear(): void {
    this.suspendedByHotkey = false
  }

  get isSuspended(): boolean {
    return this.suspendedByHotkey
  }
}

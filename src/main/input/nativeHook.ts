import { uIOhook, UiohookKey } from 'uiohook-napi'
import { describeKey, hookKeyName } from './descriptors'

/**
 * Watches the keyboard and mouse at OS level, for the single global binding.
 *
 * Only the descriptor bound to `hideAndPause` is acted on; everything else the
 * hook sees is discarded. The hook observes without consuming, so nothing here
 * takes an input away from whatever app is focused.
 */
export interface NativeHookDeps {
  /** Descriptor currently bound to the global action, or null if unbound. */
  globalDescriptor: () => string | null
  onTrigger: () => void
}

const KEY_NAMES = new Map<number, string>(
  Object.entries(UiohookKey).map(([name, code]) => [code as number, name])
)

export function startNativeHook(deps: NativeHookDeps): () => void {
  const matches = (descriptor: string): boolean => deps.globalDescriptor() === descriptor

  const onKeyDown = (e: {
    keycode: number
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
  }): void => {
    // Through the same spelling as every other source of a key, so what the
    // settings screen recorded is what gets compared.
    const raw = KEY_NAMES.get(e.keycode) ?? `Key${e.keycode}`
    const descriptor = describeKey({
      key: hookKeyName(raw),
      control: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey
    })
    if (matches(descriptor)) deps.onTrigger()
  }

  const onMouseDown = (e: { button: unknown }): void => {
    // uiohook numbers buttons from 1; 4 and 5 are the side buttons.
    const button = Number(e.button)
    const descriptor =
      button === 4 ? 'mouse:button4' : button === 5 ? 'mouse:button5' : null
    if (descriptor && matches(descriptor)) deps.onTrigger()
  }

  uIOhook.on('keydown', onKeyDown)
  uIOhook.on('mousedown', onMouseDown)
  uIOhook.start()

  return () => {
    uIOhook.off('keydown', onKeyDown)
    uIOhook.off('mousedown', onMouseDown)
    try {
      uIOhook.stop()
    } catch {
      // Stopping an already-stopped hook is not worth crashing shutdown over.
    }
  }
}

import { uIOhook, UiohookKey } from 'uiohook-napi'

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

function keyName(keycode: number): string {
  const raw = KEY_NAMES.get(keycode)
  if (!raw) return `Key${keycode}`
  // uiohook spells these differently from Electron's key names.
  if (raw === 'ArrowLeft') return 'Left'
  if (raw === 'ArrowRight') return 'Right'
  if (raw === 'ArrowUp') return 'Up'
  if (raw === 'ArrowDown') return 'Down'
  return raw.length === 1 ? raw.toLowerCase() : raw
}

export function startNativeHook(deps: NativeHookDeps): () => void {
  const matches = (descriptor: string): boolean => deps.globalDescriptor() === descriptor

  const onKeyDown = (e: {
    keycode: number
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
  }): void => {
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    parts.push(keyName(e.keycode))
    if (matches(`key:${parts.join('+')}`)) deps.onTrigger()
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

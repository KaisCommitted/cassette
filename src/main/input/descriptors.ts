import { canonicalKey } from '@shared/keys'

export interface KeyDescriptor {
  key: string
  control: boolean
  alt: boolean
  shift: boolean
}


export function describeKey(e: KeyDescriptor): string {
  const parts: string[] = []
  if (e.control) parts.push('Ctrl')
  if (e.alt) parts.push('Alt')
  if (e.shift) parts.push('Shift')
  parts.push(canonicalKey(e.key))
  return `key:${parts.join('+')}`
}

/**
 * The native hook names punctuation and the numpad by position — `Comma`,
 * `Numpad1` — where Electron and the page report the character. A binding is
 * recorded in the settings screen in the second form, so a global binding on
 * a punctuation key silently never fired until the hook's names came through
 * here first.
 */
const HOOK_KEY_NAMES: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Numpad0: '0',
  Numpad1: '1',
  Numpad2: '2',
  Numpad3: '3',
  Numpad4: '4',
  Numpad5: '5',
  Numpad6: '6',
  Numpad7: '7',
  Numpad8: '8',
  Numpad9: '9',
  NumpadAdd: '+',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadDecimal: '.',
  NumpadEnter: 'Enter',
  NumpadHome: 'Home',
  NumpadEnd: 'End',
  NumpadPageUp: 'PageUp',
  NumpadPageDown: 'PageDown',
  NumpadInsert: 'Insert',
  NumpadDelete: 'Delete',
  NumpadArrowLeft: 'Left',
  NumpadArrowRight: 'Right',
  NumpadArrowUp: 'Up',
  NumpadArrowDown: 'Down'
}

/** A key as the native hook names it, spelled the way the page would. */
export function hookKeyName(raw: string): string {
  return canonicalKey(HOOK_KEY_NAMES[raw] ?? raw)
}

/** Mouse buttons use the same shape, so anything bindable to a key is bindable here. */
export function describeMouseButton(button: number): string {
  switch (button) {
    case 0:
      return 'mouse:left'
    case 1:
      return 'mouse:middle'
    case 2:
      return 'mouse:right'
    case 3:
      return 'mouse:button4'
    case 4:
      return 'mouse:button5'
    default:
      return `mouse:button${button + 1}`
  }
}

export function describeWheel(deltaY: number): string {
  return deltaY < 0 ? 'mouse:wheelUp' : 'mouse:wheelDown'
}

/** A readable form for the settings screen: `Ctrl + Left`, `Mouse 4`. */
export function humaniseDescriptor(descriptor: string): string {
  if (descriptor.startsWith('key:')) {
    return descriptor
      .slice(4)
      .split('+')
      .map((part) => (part.length === 1 ? part.toUpperCase() : part))
      .join(' + ')
  }
  const name = descriptor.slice(6)
  const names: Record<string, string> = {
    left: 'Left click',
    middle: 'Middle click',
    right: 'Right click',
    button4: 'Mouse 4',
    button5: 'Mouse 5',
    wheelUp: 'Wheel up',
    wheelDown: 'Wheel down',
    double: 'Double click'
  }
  return names[name] ?? name
}

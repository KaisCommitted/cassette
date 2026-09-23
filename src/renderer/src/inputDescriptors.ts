/**
 * Renderer-side descriptor building, matching the main process exactly.
 *
 * Keyboard and mouse produce the same `source:name` shape, which is what makes
 * every action bindable to either without special cases.
 */
import { canonicalKey } from '@shared/keys'

export type Captured =
  | { type: 'key'; event: KeyboardEvent }
  | { type: 'mouse'; event: MouseEvent; double?: boolean }
  | { type: 'wheel'; event: WheelEvent }

export function describeCaptured(captured: Captured): string {
  if (captured.type === 'wheel') {
    return captured.event.deltaY < 0 ? 'mouse:wheelUp' : 'mouse:wheelDown'
  }

  if (captured.type === 'mouse') {
    const e = captured.event
    if (captured.double || e.detail >= 2) return 'mouse:double'
    switch (e.button) {
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
        return `mouse:button${e.button + 1}`
    }
  }

  const e = captured.event
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(canonicalKey(e.key))
  return `key:${parts.join('+')}`
}

const KEY_NAMES: Record<string, string> = {
  Left: '←',
  Right: '→',
  Up: '↑',
  Down: '↓',
  Escape: 'Esc',
  PageUp: 'Page up',
  PageDown: 'Page down',
  ' ': 'Space'
}

/** The pieces of a binding as they are printed on keycaps: `Ctrl`, `←`. */
export function descriptorParts(descriptor: string): string[] {
  if (descriptor.startsWith('key:')) {
    const body = descriptor.slice(4)
    const parts = body.endsWith('+')
      ? [...body.slice(0, -1).split('+').filter(Boolean), '+']
      : body.split('+')
    return parts.map((part) => KEY_NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part))
  }
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
  const name = descriptor.slice(6)
  return [names[name] ?? name]
}

export function humaniseDescriptor(descriptor: string): string {
  return descriptorParts(descriptor).join(' + ')
}

export interface KeyDescriptor {
  key: string
  control: boolean
  alt: boolean
  shift: boolean
}

/** Single-character keys are compared case-insensitively; named keys are not. */
function canonicalKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key
}

export function describeKey(e: KeyDescriptor): string {
  const parts: string[] = []
  if (e.control) parts.push('Ctrl')
  if (e.alt) parts.push('Alt')
  if (e.shift) parts.push('Shift')
  parts.push(canonicalKey(e.key))
  return `key:${parts.join('+')}`
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

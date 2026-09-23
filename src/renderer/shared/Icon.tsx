/*
 * The interface's icons, drawn once as SVG files and inlined at build time.
 *
 * Inlined rather than loaded as images so they take the text colour they sit
 * in, and so nothing is requested when a menu opens. Every file shares a 24
 * viewBox and a 1.6 stroke, which is why they can sit side by side.
 */

const files = import.meta.glob<string>('./icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
})

const markup: Record<string, string> = {}
for (const [path, svg] of Object.entries(files)) {
  const name = path.slice('./icons/'.length, -'.svg'.length)
  // Sized by CSS, never by the file, and never announced on its own.
  markup[name] = svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
}

export type IconName =
  | 'app'
  | 'app-16'
  | 'audio-track'
  | 'back-10s'
  | 'back-arrow'
  | 'close'
  | 'download'
  | 'folder'
  | 'forward-30s'
  | 'fullscreen'
  | 'fullscreen-exit'
  | 'library'
  | 'minus'
  | 'mute'
  | 'next'
  | 'pause'
  | 'play'
  | 'plus'
  | 'previous'
  | 'rescan'
  | 'search'
  | 'settings'
  | 'sleep-timer'
  | 'speed'
  | 'subtitles'
  | 'tick'
  | 'volume'
  | 'warning'

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span
      className={className ? `icon ${className}` : 'icon'}
      dangerouslySetInnerHTML={{ __html: markup[name] ?? markup.warning ?? '' }}
    />
  )
}

const logos = import.meta.glob<string>('./logo/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
})

function logo(name: string): string {
  const svg = logos[`./logo/${name}.svg`] ?? ''
  return svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
}

/** The tape mark, or the mark with the wordmark beside it. */
export function Logo({
  variant,
  className
}: {
  variant: 'mark' | 'wordmark' | 'combined'
  className?: string
}) {
  return (
    <span
      className={className ? `logo ${className}` : 'logo'}
      dangerouslySetInnerHTML={{ __html: logo(`logo-${variant}`) }}
    />
  )
}

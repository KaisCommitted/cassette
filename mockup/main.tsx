/* Harness only — the real app mounts <App /> from its own renderer entry.
   The query string is here so a screen can be opened directly for review:
   ?screen=settings   ?screen=series&id=long-wire   ?screen=firstrun
   ?play=1            &update=0 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import App, { Screen } from './App'
import { HERO } from './data'

const q = new URLSearchParams(location.search)
const screen = (q.get('screen') as Screen) || 'library'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App
      initialScreen={screen}
      initialSeriesId={q.get('id') || 'long-wire'}
      initialUpdateOpen={q.get('update') !== '0'}
      initialPlaying={
        q.get('play')
          ? {
              title: HERO.title,
              where: `${HERO.where} · ${HERO.episodeTitle}`,
              elapsed: HERO.elapsedSeconds,
              total: HERO.totalSeconds,
              counter: 142,
            }
          : null
      }
    />
  </React.StrictMode>
)

/* Preview only: ?click=sel|sel|sel presses those elements in turn, so a menu
   or a listening state can be looked at without a hand on the mouse. */
const clicks = q.get('click')
if (clicks) {
  clicks.split('|').forEach((sel, i) => {
    setTimeout(() => (document.querySelector(sel) as HTMLElement | null)?.click(), 400 + i * 450)
  })
}

/* Preview only: ?type=... puts text in the search box. */
const typed = q.get('type')
if (typed !== null) {
  setTimeout(() => {
    const el = document.querySelector('.libhead__search input') as HTMLInputElement | null
    if (!el) return
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    set?.call(el, typed)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, 400)
}

/* Preview only: ?scroll=N puts the screen that far down. */
const scroll = q.get('scroll')
if (scroll) {
  setTimeout(() => {
    const el = document.querySelector('.screen')
    if (el) el.scrollTop = Number(scroll)
  }, 500)
}

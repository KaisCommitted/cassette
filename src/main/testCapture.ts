import { writeFile } from 'node:fs/promises'
import type { BrowserWindow } from 'electron'

/**
 * Writes a PNG of the window's own rendering to disk, for automated checks.
 *
 * Captured from inside the renderer rather than off the screen, so it works
 * while the window is behind other things or parked off-screen — an automated
 * check never has to take the display from whoever is using the machine.
 * Enabled only by CASSETTE_CAPTURE, which names the file to write.
 */
export function scheduleTestCapture(window: BrowserWindow): void {
  const target = process.env.CASSETTE_CAPTURE
  if (!target) return

  const delayMs = Number(process.env.CASSETTE_CAPTURE_DELAY ?? '18000')

  const timer = setTimeout(() => {
    void (async () => {
      if (window.isDestroyed()) return
      try {
        // Lets a check look at a screen other than the one the app opens on,
        // named by the rail link that reaches it.
        const nav = process.env.CASSETTE_CAPTURE_NAV
        if (nav) {
          await window.webContents.executeJavaScript(
            `[...document.querySelectorAll('.rail-link')]
               .find((b) => b.textContent.trim().startsWith(${JSON.stringify(nav)}))?.click()`
          )
          await new Promise((resolve) => setTimeout(resolve, 600))
        }

        // Anything below the fold needs the page moved to it first.
        const scroll = process.env.CASSETTE_CAPTURE_SCROLL
        if (scroll) {
          await window.webContents.executeJavaScript(
            `document.querySelector('.main')?.scrollTo(0, ${Number(scroll) || 0})`
          )
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
        const image = await window.webContents.capturePage()
        await writeFile(target, image.toPNG())
        console.log(`[capture] wrote ${target}`)
      } catch (error) {
        console.log('[capture] failed:', (error as Error).message)
      }
    })()
  }, delayMs)
  timer.unref?.()
}

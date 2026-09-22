import { app, ipcMain, type BrowserWindow } from 'electron'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
// electron-updater is CommonJS. Importing it statically lets the bundler emit a
// plain require; a dynamic import() wraps it in a module object instead, and
// autoUpdater came back undefined in the packaged build.
import electronUpdater from 'electron-updater'
import { IPC } from '@shared/types'

/**
 * Checks GitHub Releases for a newer build and updates in place.
 *
 * Nothing downloads or installs on its own. Main only checks and reports what
 * it found; the renderer owns the banner and asks back over IPC once you
 * actually click, so an update never interrupts something you are watching.
 *
 * Differential downloads are disabled deliberately. They save bandwidth by
 * patching against the previous installer, but that breaks whenever the
 * artifact name changes between releases and the guessed URL 404s. Always
 * pulling the full installer avoids that whole class of failure, which is a
 * fair trade for a personal app.
 */
export function initUpdater(mainWindow: BrowserWindow): void {
  // Running from source has no installer to replace, and the check would only
  // ever report the version already in package.json.
  if (!app.isPackaged) return
  if (process.platform !== 'win32') return

  void (async () => {
    const { autoUpdater } = electronUpdater

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.disableDifferentialDownload = true

    const send = (channel: string, payload: unknown): void => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
    }

    autoUpdater.on('update-available', (info) => {
      send(IPC.updateAvailable, { version: info.version })
    })
    autoUpdater.on('download-progress', (progress) => {
      send(IPC.updateProgress, { percent: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      send(IPC.updateReady, { version: info.version })
    })
    autoUpdater.on('error', (error) => {
      // A failed check is not worth interrupting anyone over; the banner simply
      // never appears and the app carries on.
      send(IPC.updateError, { message: error.message })
    })

    ipcMain.on(IPC.startUpdateDownload, () => {
      void autoUpdater.downloadUpdate().catch(() => undefined)
    })

    ipcMain.on(IPC.installUpdate, () => {
      // Silent and force-run-after: no second installer wizard on top of the
      // progress the renderer already showed, just quit, replace, relaunch.
      autoUpdater.quitAndInstall(true, true)
    })

    await autoUpdater.checkForUpdates().catch(() => undefined)

    // Checking only at launch means an app left open for days never hears
    // about anything. Re-checking on a timer is what makes "there is a new
    // version" arrive while you are using it rather than only after a
    // restart. It reports the newest release each time, so several versions
    // going out between checks is still one update, not one per version.
    const timer = setInterval(
      () => void autoUpdater.checkForUpdates().catch(() => undefined),
      CHECK_EVERY_MS
    )
    timer.unref?.()
  })()
}

/** Three hours: often enough to notice, rare enough to ignore. */
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000

/**
 * Clears installers left in the update cache.
 *
 * electron-updater keeps the downloaded installer after running it, so every
 * update leaves about 150 MB behind and the next one leaves another. Nothing
 * ever removes them.
 *
 * Only files that have been sitting for a day go: a download interrupted an
 * hour ago is worth keeping, since throwing it away means pulling the whole
 * installer down again.
 */
export async function cleanUpdaterCache(): Promise<number> {
  // electron-updater puts its cache under Local, not Roaming where the app's
  // own data lives, and names it from updaterCacheDirName in app-update.yml.
  const local = process.env.LOCALAPPDATA
  if (!local) return 0
  const dir = join(local, 'cassette-updater')
  const DAY_MS = 24 * 60 * 60 * 1000

  let freed = 0
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      try {
        const info = await stat(path)
        if (Date.now() - info.mtimeMs < DAY_MS) continue
        if (entry.isDirectory()) {
          for (const inner of await readdir(path)) {
            freed += (await stat(join(path, inner))).size
          }
        } else {
          freed += info.size
        }
        await rm(path, { recursive: true, force: true })
      } catch {
        // In use, or gone already. Either way, leave it alone.
      }
    }
  } catch {
    // No cache directory yet, which is the normal case on a fresh install.
  }
  return freed
}

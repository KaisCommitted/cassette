import { app, ipcMain, type BrowserWindow } from 'electron'
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
    const { autoUpdater } = await import('electron-updater')

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
  })()
}

import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC, type Library } from '@shared/types'
import { scanLibrary } from '../library/scanner'
import { libraryFile } from '../state/paths'
import { readJson, writeJsonAtomic } from '../state/atomicJson'
import type { ProgressStore } from '../state/progressStore'
import type { SettingsStore } from '../state/settingsStore'
import type { MpvController } from '../mpv/mpvController'

export interface AppContext {
  settings: SettingsStore
  progress: ProgressStore
  mpv: MpvController
  mainWindow: BrowserWindow
  overlayWindow: BrowserWindow
  /** Key of the file currently loaded, so progress ticks know where to go. */
  currentKey: string | null
}

export function registerHandlers(ctx: AppContext): void {
  ipcMain.handle(IPC.chooseFolder, async () => {
    const result = await dialog.showOpenDialog(ctx.mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose your media folder'
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.getSettings, () => ctx.settings.get())

  ipcMain.handle(IPC.setRoots, async (_e, roots: string[]): Promise<Library> => {
    await ctx.settings.setRoots(roots)
    const library = await scanLibrary(roots)
    await writeJsonAtomic(libraryFile(), library)
    return library
  })

  ipcMain.handle(IPC.getLibrary, async () => readJson<Library | null>(libraryFile(), null))

  ipcMain.handle(IPC.rescan, async (): Promise<Library> => {
    const library = await scanLibrary(ctx.settings.get().libraryRoots)
    await writeJsonAtomic(libraryFile(), library)
    return library
  })

  ipcMain.handle(IPC.getProgress, () => ctx.progress.all())

  ipcMain.handle(IPC.play, async (_e, path: string, key: string) => {
    ctx.currentKey = key
    const resumeAt = ctx.progress.get(key)?.positionSeconds ?? 0
    await ctx.mpv.load(path, resumeAt)
    ctx.overlayWindow.show()
  })

  ipcMain.handle(IPC.stop, async () => {
    await ctx.mpv.stop()
    ctx.currentKey = null
    ctx.overlayWindow.hide()
    await ctx.progress.save()
  })
}

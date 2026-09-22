import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type Library,
  type MininetflixApi,
  type PlaybackState,
  type ProgressRecord,
  type Settings
} from '@shared/types'

const api: MininetflixApi = {
  chooseFolder: () => ipcRenderer.invoke(IPC.chooseFolder) as Promise<string | null>,
  getSettings: () => ipcRenderer.invoke(IPC.getSettings) as Promise<Settings>,
  setRoots: (roots) => ipcRenderer.invoke(IPC.setRoots, roots) as Promise<Library>,
  getLibrary: () => ipcRenderer.invoke(IPC.getLibrary) as Promise<Library | null>,
  rescan: () => ipcRenderer.invoke(IPC.rescan) as Promise<Library>,
  getProgress: () => ipcRenderer.invoke(IPC.getProgress) as Promise<ProgressRecord[]>,
  play: (path, key) => ipcRenderer.invoke(IPC.play, path, key) as Promise<void>,
  stop: () => ipcRenderer.invoke(IPC.stop) as Promise<void>,
  onPlaybackState: (cb) => {
    const listener = (_e: unknown, s: PlaybackState): void => cb(s)
    ipcRenderer.on(IPC.playbackState, listener)
    return () => {
      ipcRenderer.removeListener(IPC.playbackState, listener)
    }
  }
}

contextBridge.exposeInMainWorld('mininetflix', api)

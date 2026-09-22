import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type Library,
  type MininetflixApi,
  type PlaybackState,
  type ProgressRecord,
  type Settings
} from '@shared/types'

const invoke = <T,>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

const api: MininetflixApi = {
  chooseFolder: () => invoke<string | null>(IPC.chooseFolder),
  getSettings: () => invoke<Settings>(IPC.getSettings),
  setRoots: (roots) => invoke<Library>(IPC.setRoots, roots),
  getLibrary: () => invoke<Library | null>(IPC.getLibrary),
  rescan: () => invoke<Library>(IPC.rescan),
  getProgress: () => invoke<ProgressRecord[]>(IPC.getProgress),

  play: (path, key) => invoke<void>(IPC.play, path, key),
  stop: () => invoke<void>(IPC.stop),
  togglePause: () => invoke<void>(IPC.togglePause),
  seekAbsolute: (seconds) => invoke<void>(IPC.seekAbsolute, seconds),
  seekRelative: (seconds) => invoke<void>(IPC.seekRelative, seconds),
  setVolume: (volume) => invoke<void>(IPC.setVolume, volume),
  toggleMute: () => invoke<void>(IPC.toggleMute),
  setSpeed: (speed) => invoke<void>(IPC.setSpeed, speed),
  setSubtitleTrack: (id) => invoke<void>(IPC.setSubtitleTrack, id),
  setAudioTrack: (id) => invoke<void>(IPC.setAudioTrack, id),
  setSubtitleDelay: (ms) => invoke<void>(IPC.setSubtitleDelay, ms),
  nextEpisode: () => invoke<void>(IPC.nextEpisode),
  previousEpisode: () => invoke<void>(IPC.previousEpisode),
  toggleFullscreen: () => invoke<void>(IPC.toggleFullscreen),

  setOverlayInteractive: (interactive) => {
    ipcRenderer.send(IPC.setOverlayInteractive, interactive)
  },

  onPlaybackState: (cb) => {
    const listener = (_e: unknown, s: PlaybackState): void => cb(s)
    ipcRenderer.on(IPC.playbackState, listener)
    return () => {
      ipcRenderer.removeListener(IPC.playbackState, listener)
    }
  },

  onOverlayActivity: (cb) => {
    const listener = (): void => cb()
    ipcRenderer.on(IPC.overlayActivity, listener)
    return () => {
      ipcRenderer.removeListener(IPC.overlayActivity, listener)
    }
  }
}

contextBridge.exposeInMainWorld('mininetflix', api)

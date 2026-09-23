import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type BundledKeyAvailability,
  type ScanProgressInfo,
  type Library,
  type CassetteApi,
  type MetadataProgressInfo,
  type MetadataSnapshot,
  type PlaybackState,
  type ProgressRecord,
  type Settings
} from '@shared/types'

const invoke = <T,>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

/** Subscribes to a main-process event and returns an unsubscribe function. */
function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: unknown, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: CassetteApi = {
  chooseFolder: () => invoke<string | null>(IPC.chooseFolder),
  getSettings: () => invoke<Settings>(IPC.getSettings),
  getBundledKeys: () => invoke<BundledKeyAvailability>(IPC.getBundledKeys),
  setRoots: (roots) => invoke<Library>(IPC.setRoots, roots),
  getLibrary: () => invoke<Library | null>(IPC.getLibrary),
  rescan: () => invoke<Library>(IPC.rescan),
  cancelScan: () => invoke<Library | null>(IPC.cancelScan),
  onScanProgress: (cb) => subscribe<ScanProgressInfo>(IPC.scanProgress, cb),
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

  updateSettings: (changes) => invoke(IPC.updateSettings, changes),
  getMetadata: () => invoke(IPC.getMetadata),
  refreshMetadata: (force) => invoke(IPC.refreshMetadata, force),
  markWatched: (key, watched) => invoke(IPC.markWatched, key, watched),
  resumeSeries: (seriesId) => invoke(IPC.resumeSeries, seriesId),
  scanSubtitles: (scope, options) => invoke(IPC.scanSubtitles, scope, options),
  findSubtitlesNow: (options) => invoke(IPC.findSubtitlesNow, options),
  listLocalSubtitles: () => invoke(IPC.listLocalSubtitles),
  useSubtitleFile: (path) => invoke(IPC.useSubtitleFile, path),
  setSleepTimer: (seconds) => invoke(IPC.setSleepTimer, seconds),
  setSleepAfterEpisode: () => invoke(IPC.setSleepAfterEpisode),
  nextChapter: () => invoke(IPC.nextChapter),
  previousChapter: () => invoke(IPC.previousChapter),

  startUpdateDownload: () => ipcRenderer.send(IPC.startUpdateDownload),
  installUpdate: () => ipcRenderer.send(IPC.installUpdate),
  onUpdateAvailable: (cb) => subscribe(IPC.updateAvailable, cb),
  onUpdateProgress: (cb) => subscribe(IPC.updateProgress, cb),
  onUpdateReady: (cb) => subscribe(IPC.updateReady, cb),

  runInput: (descriptor) => {
    ipcRenderer.send(IPC.runInput, descriptor)
  },
  getBindings: () => invoke(IPC.getBindings),
  assignBinding: (descriptor, actionId) => invoke(IPC.assignBinding, descriptor, actionId),
  unassignBinding: (descriptor) => invoke(IPC.unassignBinding, descriptor),
  resetBindings: () => invoke(IPC.resetBindings),
  setTyping: (typing) => {
    ipcRenderer.send(IPC.setTyping, typing)
  },
  onScreenTransition: (cb) => subscribe<'out' | 'in'>(IPC.screenTransition, cb),
  onMetadataProgress: (cb) => subscribe<MetadataProgressInfo>(IPC.metadataProgress, cb),

  onPlaybackState: (cb) => {
    const listener = (_e: unknown, s: PlaybackState): void => cb(s)
    ipcRenderer.on(IPC.playbackState, listener)
    return () => {
      ipcRenderer.removeListener(IPC.playbackState, listener)
    }
  },

  onMetadataReady: (cb) => {
    const listener = (_e: unknown, m: MetadataSnapshot): void => cb(m)
    ipcRenderer.on(IPC.metadataReady, listener)
    return () => {
      ipcRenderer.removeListener(IPC.metadataReady, listener)
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

contextBridge.exposeInMainWorld('cassette', api)

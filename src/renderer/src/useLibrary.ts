import { useCallback, useEffect, useState } from 'react'
import type { Library, ProgressRecord, ScanProgressInfo } from '@shared/types'

export interface LibraryHook {
  library: Library | null
  progress: Map<string, ProgressRecord>
  /** True until the saved library has been read, on launch only. */
  loading: boolean
  /** True while a scan runs, whether it was started by a folder choice or a rescan. */
  scanning: boolean
  /** Folder being scanned for the first time, so the screen can name it. */
  scanningFolder: string | null
  /** How far the running scan has got, or null when none is running. */
  scanProgress: ScanProgressInfo | null
  chooseFolder: () => Promise<void>
  rescan: () => Promise<void>
  cancelScan: () => Promise<void>
  refreshProgress: () => Promise<void>
}

export function useLibrary(): LibraryHook {
  const [library, setLibrary] = useState<Library | null>(null)
  const [progress, setProgress] = useState<Map<string, ProgressRecord>>(new Map())
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanningFolder, setScanningFolder] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState<ScanProgressInfo | null>(null)

  // Reading durations means opening every file, so a first scan of a large
  // folder is slow enough that saying nothing looks like a hang.
  useEffect(
    () =>
      window.cassette.onScanProgress((p) =>
        setScanProgress(p.total > 0 ? p : null)
      ),
    []
  )

  const refreshProgress = useCallback(async () => {
    const records = await window.cassette.getProgress()
    setProgress(new Map(records.map((r) => [r.key, r])))
  }, [])

  useEffect(() => {
    void (async () => {
      setLibrary(await window.cassette.getLibrary())
      await refreshProgress()
      setLoading(false)
    })()
  }, [refreshProgress])

  const chooseFolder = useCallback(async () => {
    const folder = await window.cassette.chooseFolder()
    if (!folder) return
    setScanning(true)
    setScanningFolder(folder)
    try {
      setLibrary(await window.cassette.setRoots([folder]))
    } catch {
      // Stopped part-way. Whatever was on screen before is still right: the
      // previous library, or the first-run screen if there never was one.
    } finally {
      setScanning(false)
      setScanningFolder(null)
      setScanProgress(null)
    }
  }, [])

  const rescan = useCallback(async () => {
    setScanning(true)
    try {
      setLibrary(await window.cassette.rescan())
    } catch {
      // Stopping a scan rejects the call it was started from. The library on
      // screen is still the one that was there before, so there is nothing to
      // report and nothing to put right.
    } finally {
      setScanning(false)
      setScanProgress(null)
    }
  }, [])

  const cancelScan = useCallback(async () => {
    const existing = await window.cassette.cancelScan()
    if (existing) setLibrary(existing)
    setScanProgress(null)
  }, [])

  return {
    library,
    progress,
    loading,
    scanning,
    scanningFolder,
    scanProgress,
    chooseFolder,
    rescan,
    cancelScan,
    refreshProgress
  }
}

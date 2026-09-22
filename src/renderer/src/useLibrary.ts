import { useCallback, useEffect, useState } from 'react'
import type { Library, ProgressRecord, ScanProgressInfo } from '@shared/types'

export interface LibraryHook {
  library: Library | null
  progress: Map<string, ProgressRecord>
  loading: boolean
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
    setLoading(true)
    setLibrary(await window.cassette.setRoots([folder]))
    setLoading(false)
  }, [])

  const rescan = useCallback(async () => {
    setLoading(true)
    try {
      setLibrary(await window.cassette.rescan())
    } catch {
      // Stopping a scan rejects the call it was started from. The library on
      // screen is still the one that was there before, so there is nothing to
      // report and nothing to put right.
    } finally {
      setLoading(false)
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
    scanProgress,
    chooseFolder,
    rescan,
    cancelScan,
    refreshProgress
  }
}

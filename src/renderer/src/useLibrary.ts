import { useCallback, useEffect, useState } from 'react'
import type { Library, ProgressRecord } from '@shared/types'

export interface LibraryHook {
  library: Library | null
  progress: Map<string, ProgressRecord>
  loading: boolean
  chooseFolder: () => Promise<void>
  rescan: () => Promise<void>
  refreshProgress: () => Promise<void>
}

export function useLibrary(): LibraryHook {
  const [library, setLibrary] = useState<Library | null>(null)
  const [progress, setProgress] = useState<Map<string, ProgressRecord>>(new Map())
  const [loading, setLoading] = useState(true)

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
    setLibrary(await window.cassette.rescan())
    setLoading(false)
  }, [])

  return { library, progress, loading, chooseFolder, rescan, refreshProgress }
}

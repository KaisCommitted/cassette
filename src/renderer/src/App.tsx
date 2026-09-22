import { useLibrary } from './useLibrary'
import { LibraryView } from './views/LibraryView'
import { SetupView } from './views/SetupView'

export function App() {
  const { library, progress, loading, chooseFolder, rescan } = useLibrary()

  if (loading) {
    return (
      <div style={{ padding: 24, color: '#eee', fontFamily: 'system-ui' }}>Scanning…</div>
    )
  }
  if (!library) return <SetupView onChoose={() => void chooseFolder()} />

  return (
    <LibraryView library={library} progress={progress} onRescan={() => void rescan()} />
  )
}

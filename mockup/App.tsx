/* ===========================================================================
   Cassette — the shell.
   A nav rail and a screen. No router: which screen is showing is local state,
   and so is what the player is playing.
   =========================================================================== */
import React, { useState } from 'react'
import { SpoolMark, Wordmark, TapeCounter, IconLibrary, IconSettings } from './icons'
import { SERIES, FILMS } from './data'
import FirstRun from './FirstRun'
import Library from './Library'
import SeriesScreen from './Series'
import Settings from './Settings'
import Player, { Playing } from './Player'
import UpdateNotice from './UpdateNotice'

export type Screen = 'firstrun' | 'library' | 'series' | 'settings'

/** Starting state. The app always opens on the library; the props exist so a
 *  preview can be dropped straight onto any screen. */
type Props = {
  initialScreen?: Screen
  initialSeriesId?: string
  initialPlaying?: Playing | null
  initialUpdateOpen?: boolean
}

export default function App({
  initialScreen = 'library',
  initialSeriesId = 'long-wire',
  initialPlaying = null,
  initialUpdateOpen = true,
}: Props) {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [seriesId, setSeriesId] = useState<string>(initialSeriesId)
  const [playing, setPlaying] = useState<Playing | null>(initialPlaying)
  const [updateOpen, setUpdateOpen] = useState(initialUpdateOpen)
  const [scanOnEntry, setScanOnEntry] = useState(false)

  const series = SERIES.find((s) => s.id === seriesId) ?? SERIES[0]

  const openSeries = (id: string) => {
    setSeriesId(id)
    setScreen('series')
  }

  // the counter in the rail reads the size of the shelf, the way a deck
  // counter reads tape: a number that only means something to you.
  const shelfCount = SERIES.reduce((n, s) => n + s.episodeCount, 0) + FILMS.length

  if (screen === 'firstrun') {
    return (
      <FirstRun
        startScanning={scanOnEntry}
        onDone={() => {
          setScanOnEntry(false)
          setScreen('library')
        }}
      />
    )
  }

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <div className="rail__mark">
          <SpoolMark size={44} running={!!playing} />
          <Wordmark className="rail__word" />
        </div>

        <div className="rail__nav">
          <button
            className="rail__item"
            aria-current={screen === 'library' || screen === 'series' ? 'page' : undefined}
            onClick={() => setScreen('library')}
          >
            <IconLibrary />
            Library
          </button>
          <button
            className="rail__item"
            aria-current={screen === 'settings' ? 'page' : undefined}
            onClick={() => setScreen('settings')}
          >
            <IconSettings />
            Settings
          </button>
        </div>

        <div className="rail__foot">
          <TapeCounter value={shelfCount} size="sm" label={`${shelfCount} things on the shelf`} />
          <span className="counter__label">Shelf</span>
        </div>
      </nav>

      <main className="screen" key={screen === 'series' ? `series-${seriesId}` : screen}>
        {screen === 'library' && (
          <Library onOpenSeries={openSeries} onPlay={setPlaying} />
        )}
        {screen === 'series' && (
          <SeriesScreen
            series={series}
            onBack={() => setScreen('library')}
            onPlay={setPlaying}
          />
        )}
        {screen === 'settings' && (
          <Settings
            onChangeFolder={() => {
              setScanOnEntry(false)
              setScreen('firstrun')
            }}
            onRescan={() => {
              setScanOnEntry(true)
              setScreen('firstrun')
            }}
            onCheckForUpdates={() => setUpdateOpen(true)}
          />
        )}
      </main>

      {playing && <Player playing={playing} onClose={() => setPlaying(null)} />}
      {updateOpen && <UpdateNotice onDismiss={() => setUpdateOpen(false)} />}
    </div>
  )
}

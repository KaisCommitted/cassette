# Redesign inventory

Everything the renderer (`src/renderer/src`) and the player overlay
(`src/renderer/overlay`) did before the redesign, taken from the code at
`5779774`. Each line is ticked once the redesigned UI does the same job.
Where the Lovable prototype had no design for something, the line says what
was designed for it.

## App shell

- [ ] Loading state while the saved library is read ("Reading your folder…")
- [ ] First run, no library: explanation that nothing leaves the machine, and a Choose folder button (`chooseFolder`, then `setRoots`)
- [ ] Settings are re-read after choosing a folder (`getSettings`)
- [ ] Navigation between Library and Settings, with the current one marked
- [ ] Going to Library from the nav clears the search
- [ ] Nav buttons keep the `rail-link` class and text starting "Library" / "Settings", and the scroll container keeps the `main` class — `src/main/testCapture.ts` drives `CASSETTE_CAPTURE_NAV` and `CASSETTE_CAPTURE_SCROLL` through them
- [ ] Ambient colour: the page takes a wash of the dominant colour of the lead item's backdrop on the library, or the open series' backdrop (`useAmbient`)
- [ ] Watch progress is re-read when the player closes (`onPlaybackState` with no path, then `getProgress`)
- [ ] Metadata is read on launch (`getMetadata`) and replaced when artwork finishes downloading (`onMetadataReady`)
- [ ] Bindings read on launch (`getBindings`)
- [ ] "That series is no longer in your library." when an open series disappears after a rescan
- [ ] View changes have an entrance so a change reads as movement (was a keyed remount with a staggered rise)

## Update notice (`UpdateBanner`)

- [ ] Hidden until an update exists (`onUpdateAvailable`, `onUpdateProgress`, `onUpdateReady`)
- [ ] Available: version, "nothing restarts until you say so", Download (`startUpdateDownload`) and Not now
- [ ] Downloading: version, percentage bar, "carry on watching"
- [ ] Ready: Restart and install (`installUpdate`) and Later
- [ ] Dismiss button at every stage
- [ ] Never interrupts: nothing downloads or installs without a click

## Library (`HomeView`)

- [ ] Hero for the most recently watched unfinished item (`continueWatching`, first item)
- [ ] Hero art: TMDB backdrop, else a frame from the file
- [ ] Hero text: "Still watching", title (TMDB title before the parsed one), episode label and TMDB episode title, time left (`formatRemaining`)
- [ ] Hero overview: the episode's, else the series' or film's
- [ ] Resume: `resumeSeries` for a series, `play` for a film
- [ ] All episodes button for a series
- [ ] Progress bar for the hero item
- [ ] Hero and "Also on the go" hidden while searching
- [ ] Search box filtering series by title and films by title and year (`filterLibrary`)
- [ ] "Nothing matches …" message with a way forward
- [ ] "Fetching artwork for …" note while `metadataBusy` is set (never set by anything — `setMetadataBusy` is only ever called with null, and the preload does not expose `metadataProgress`; kept equivalent, see the review)
- [ ] "Also on the go": every other unfinished item, one per series, up to 11
- [ ] Each resume tile: episode still, else series backdrop, else a frame; play affordance; progress; title; episode label and title; time left
- [ ] A resume tile resumes the series or plays the film
- [ ] Series grid with count ("1 series" / "N series")
- [ ] Series tile: poster, else a frame of the next unwatched episode, else the title; TMDB rating; Watched when every episode is finished; title; "N episodes, seasons X to Y" (`describeSeasons`)
- [ ] A series tile opens the series
- [ ] Films grid with count ("1 film" / "N films")
- [ ] Film tile: poster, else a frame, else the title; rating; Watched; progress when part-watched; title; year or "Year unknown"
- [ ] A film tile plays the film (resuming where it stopped)
- [ ] Artwork retries a failed load once after 1.5 s, and a late change of source (metadata arriving) replaces the placeholder (`Art`)
- [ ] Artwork fades in when it arrives instead of popping
- [ ] The gaps between tiles carry the pointer cursor, so dragging across a grid does not flip the cursor (01a403b)

## Series (`SeriesView`)

- [ ] Backdrop hero when TMDB has one
- [ ] Back to library
- [ ] Title with year, "N episodes across seasons …, N watched.", overview
- [ ] Start watching (nothing watched yet) / Resume, via `resumeSeries`
- [ ] Find subtitles for the whole series (`scanSubtitles` series scope)
- [ ] Find subtitles for the season on screen (season scope)
- [ ] Busy state while a search runs ("Looking…"), with the other search buttons disabled
- [ ] Scan results: summary (downloaded, already had, still without) and one row per file with its status and detail on hover (`ScanLog`)
- [ ] "Nothing in that selection to look up." for an empty result
- [ ] Results cleared when a different series is opened
- [ ] Season tabs when there is more than one season; season 0 is "Unsorted"
- [ ] Opens on the first season with an unwatched episode
- [ ] Episode row: still (TMDB still, else a frame), play affordance, progress or finished bar
- [ ] Episode row text: label, TMDB episode title, overview (else the filename)
- [ ] Time left or "Watched"
- [ ] Mark watched / Unwatch (`markWatched`, then progress refresh)
- [ ] Subtitles for one episode (episode scope)
- [ ] Clicking a row, or Enter on it, plays that episode (`play`)
- [ ] Rows carry the pointer cursor across the space between them (01a403b)

## Settings (`SettingsView`, `SubtitleSettings`)

- [ ] Media folder path, or "No folder chosen yet"
- [ ] Change folder (`chooseFolder`)
- [ ] Rescan (`rescan`), disabled without a folder; Stop while scanning (`cancelScan`)
- [ ] Scan progress: sweeping bar before the first count, then "Checking X of Y files" (`onScanProgress`)
- [ ] Help: rescan after changes; history follows files that move
- [ ] Ignore anything shorter than N minutes (0–120, nonsense clamps to 0)
- [ ] Play the next episode automatically (`autoplayNext`)
- [ ] Even out loud and quiet scenes (`nightAudio`)
- [ ] Turn subtitles on automatically (`autoEnableSubtitles`)
- [ ] Preferred subtitle languages, comma separated, lower-cased
- [ ] Preferred audio languages
- [ ] Subtitle preview reflecting the style below
- [ ] Size (0.5–2.5×), Outline (0–6), Background (0–100 %), Lift off bottom (0–30 %)
- [ ] Text colour and outline colour
- [ ] Apply to embedded styled subtitles too (`overrideEmbeddedStyles`), with the warning about signs and karaoke
- [ ] SubDL API key, masked, with placeholder and help that depend on whether the build carries a key (`getBundledKeys`); clearing returns to the built-in key
- [ ] Fetch every listed language (`downloadEveryPreferredLanguage`)
- [ ] OpenSubtitles API key, same treatment
- [ ] Controls: every action from `ACTIONS`, grouped, with its current bindings or "Not bound"
- [ ] Click a binding, then press any key, mouse button (side buttons too) or wheel to bind it (`assignBinding`); Escape cancels; modifier keys alone are ignored; the context menu is suppressed while listening
- [ ] Restore VLC defaults (`resetBindings`)
- [ ] About: free and open source, nothing leaves the machine, TMDB attribution
- [ ] Every setting saves as it changes (`updateSettings`)

## Player overlay (`Overlay`, `ControlBar`, `SeekBar`, `TrackMenu`)

- [ ] Renders nothing unless something is playing (`onPlaybackState`)
- [ ] Mouse over the video resolves through the binding table: left, middle, right, buttons 4 and 5, double click, wheel (`runInput`) — only for presses on the bare video, not on controls
- [ ] Context menu suppressed
- [ ] Controls hide after 2.6 s without movement, woken by the main process' cursor poll (`onOverlayActivity`) and by movement over the bar
- [ ] Controls stay up while paused or while a menu is open
- [ ] Cursor hidden with the controls
- [ ] Menus close when the controls hide, and when the pointer leaves the control area
- [ ] Loading screen with spinner and the item's label while a file opens
- [ ] Title of what is playing
- [ ] Seek bar: click or drag to seek (`seekAbsolute`), hover shows the time under the pointer, dragging tracks the pointer rather than snapping back
- [ ] Play / pause (`togglePause`)
- [ ] Previous and next episode, disabled when there is none (`previousEpisode`, `nextEpisode`)
- [ ] Mute (`toggleMute`) with the icon following muted or zero volume
- [ ] Volume 0–130 (`setVolume`)
- [ ] Position and duration
- [ ] Status pills: subtitle delay, speed when not 1×, sleep countdown, stops after this episode
- [ ] Subtitles menu: Off and every track with a readable label (`trackLabel`), current one marked (`setSubtitleTrack`)
- [ ] Find subtitles online for the episode on screen, with its outcome (`findSubtitlesNow`)
- [ ] Subtitle delay −50 / +50 ms with the current value (`setSubtitleDelay`)
- [ ] Audio menu, current track marked (`setAudioTrack`); "None available" for an empty menu
- [ ] Speed menu 0.5–2×, "Normal" for 1× (`setSpeed`)
- [ ] Sleep menu: 15, 30, 45, 60, 90, 120 minutes, end of this episode, cancel (`setSleepTimer`, `setSleepAfterEpisode`)
- [ ] Fullscreen, icon following the state (`toggleFullscreen`)
- [ ] Close the player (`stop`)
- [ ] Click-through, auto-hide and input routing unchanged: interactivity is still decided by the main process, the overlay never asks for forwarded mouse events (a55993c)

## `window.cassette` calls

Used before, and still used after:

- [ ] `chooseFolder` · `getSettings` · `getBundledKeys` · `setRoots` · `getLibrary` · `rescan` · `cancelScan` · `onScanProgress` · `getProgress`
- [ ] `play` · `stop` · `togglePause` · `seekAbsolute` · `setVolume` · `toggleMute` · `setSpeed` · `setSubtitleTrack` · `setAudioTrack` · `setSubtitleDelay` · `nextEpisode` · `previousEpisode` · `toggleFullscreen`
- [ ] `onPlaybackState` · `onOverlayActivity` · `onMetadataReady` · `runInput`
- [ ] `updateSettings` · `getMetadata` · `markWatched` · `resumeSeries` · `scanSubtitles` · `findSubtitlesNow` · `setSleepTimer` · `setSleepAfterEpisode`
- [ ] `startUpdateDownload` · `installUpdate` · `onUpdateAvailable` · `onUpdateProgress` · `onUpdateReady`
- [ ] `getBindings` · `assignBinding` · `resetBindings`

Exposed by the preload but not used by the renderer before:
`seekRelative`, `setOverlayInteractive`, `refreshMetadata`,
`listLocalSubtitles`, `useSubtitleFile`, `nextChapter`, `previousChapter`.

## Constraints carried over

- [ ] No `backdrop-filter` anywhere (styles.css, 7695d2c)
- [ ] No full-viewport decorative layers above content (7695d2c)
- [ ] No always-on animation across the grid
- [ ] Reduced motion respected
- [ ] Nothing fetched at runtime: fonts and icons bundled
- [ ] Main process, preload and IPC untouched

## Not used by anything

`LibraryView.tsx`, `SetupView.tsx`, `MediaCard.tsx` and `Still.tsx` are not
imported anywhere. They are left in place: removing them is a removal, and
that is asked about rather than done.

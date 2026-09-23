# Redesign inventory

Everything the renderer (`src/renderer/src`) and the player overlay
(`src/renderer/overlay`) did before the redesign, taken from the code at
`5779774`. Each line is ticked once the redesigned UI does the same job, with a note
where it now does it differently. Why each change was made is in
[redesign-review.md](redesign-review.md).

## App shell

- [x] Loading state while the saved library is read ("Reading your folder…") — now "Reading your library…" beside the mark
- [x] First run, no library: explanation that nothing leaves the machine, and a Choose folder button (`chooseFolder`, then `setRoots`) — designed: one question, then a first-scan screen with a counter, the folder, a bar and Stop
- [x] Settings are re-read after choosing a folder (`getSettings`)
- [x] Navigation between Library and Settings, with the current one marked — top bar instead of a rail; `aria-current` marks the current one
- [x] Going to Library from the nav clears the search
- [x] Nav buttons keep the `rail-link` class and text starting "Library" / "Settings", and the scroll container keeps the `main` class — `src/main/testCapture.ts` drives `CASSETTE_CAPTURE_NAV` and `CASSETTE_CAPTURE_SCROLL` through them
- [x] Ambient colour: the page takes a wash of the dominant colour of the lead item's backdrop on the library, or the open series' backdrop (`useAmbient`)
- [x] Watch progress is re-read when the player closes (`onPlaybackState` with no path, then `getProgress`)
- [x] Metadata is read on launch (`getMetadata`) and replaced when artwork finishes downloading (`onMetadataReady`)
- [x] Bindings read on launch (`getBindings`)
- [x] "That series is no longer in your library." when an open series disappears after a rescan
- [x] View changes have an entrance so a change reads as movement (was a keyed remount with a staggered rise) — one 180 ms settle; no stagger, nothing on the tiles

## Update notice (`UpdateBanner`)

- [x] Hidden until an update exists (`onUpdateAvailable`, `onUpdateProgress`, `onUpdateReady`) — now a strip under the top bar, in the page flow; a finished download shows again after "Not now"
- [x] Available: version, "nothing restarts until you say so", Download (`startUpdateDownload`) and Not now
- [x] Downloading: version, percentage bar, "carry on watching"
- [x] Ready: Restart and install (`installUpdate`) and Later
- [x] Dismiss button at every stage
- [x] Never interrupts: nothing downloads or installs without a click

## Library (`HomeView`)

- [x] Hero for the most recently watched unfinished item (`continueWatching`, first item)
- [x] Hero art: TMDB backdrop, else a frame from the file — the episode's TMDB still first, then the backdrop, then a frame
- [x] Hero text: "Still watching", title (TMDB title before the parsed one), episode label and TMDB episode title, time left (`formatRemaining`) — episode written out as "Season 3, episode 16", position shown as a counter
- [x] Hero overview: the episode's, else the series' or film's
- [x] Resume: `resumeSeries` for a series, `play` for a film
- [x] All episodes button for a series
- [x] Progress bar for the hero item
- [x] Hero and "Also on the go" hidden while searching
- [x] Search box filtering series by title and films by title and year (`filterLibrary`) — moved to the top bar, reachable with / or Ctrl+F from any screen
- [x] "Nothing matches …" message with a way forward — designed: heading, what search looks at, Clear search
- [x] "Fetching artwork for …" note while `metadataBusy` is set (never set by anything — `setMetadataBusy` is only ever called with null, and the preload does not expose `metadataProgress`; kept equivalent, see the review) — shown in the scope bar if it is ever set
- [x] "Also on the go": every other unfinished item, one per series, up to 11
- [x] Each resume tile: episode still, else series backdrop, else a frame; play affordance; progress; title; episode label and title; time left
- [x] A resume tile resumes the series or plays the film
- [x] Series grid with count ("1 series" / "N series")
- [x] Series tile: poster, else a frame of the next unwatched episode, else the title; TMDB rating; Watched when every episode is finished; title; "N episodes, seasons X to Y" (`describeSeasons`) — rating beside the title rather than over the poster; no-artwork tiles are printed tape sleeves
- [x] A series tile opens the series
- [x] Films grid with count ("1 film" / "N films")
- [x] Film tile: poster, else a frame, else the title; rating; Watched; progress when part-watched; title; year or "Year unknown" — play disc on hover, rating beside the title
- [x] A film tile plays the film (resuming where it stopped)
- [x] Artwork retries a failed load once after 1.5 s, and a late change of source (metadata arriving) replaces the placeholder (`Art`)
- [x] Artwork fades in when it arrives instead of popping — over the printed sleeve, which replaces the shimmering skeleton
- [x] The gaps between tiles carry the pointer cursor, so dragging across a grid does not flip the cursor (01a403b)

## Series (`SeriesView`)

- [x] Backdrop hero when TMDB has one
- [x] Back to library
- [x] Title with year, "N episodes across seasons …, N watched.", overview
- [x] Start watching (nothing watched yet) / Resume, via `resumeSeries`
- [x] Find subtitles for the whole series (`scanSubtitles` series scope)
- [x] Find subtitles for the season on screen (season scope)
- [x] Busy state while a search runs ("Looking…"), with the other search buttons disabled — the results panel says it is looking; the buttons are disabled
- [x] Scan results: summary (downloaded, already had, still without) and one row per file with its status and detail on hover (`ScanLog`) — in a panel beside the list rather than above it; failures show their detail
- [x] "Nothing in that selection to look up." for an empty result
- [x] Results cleared when a different series is opened
- [x] Season tabs when there is more than one season; season 0 is "Unsorted"
- [x] Opens on the first season with an unwatched episode
- [x] Episode row: still (TMDB still, else a frame), play affordance, progress or finished bar — no nested buttons: the row plays, watched and subtitles are separate buttons
- [x] Episode row text: label, TMDB episode title, overview (else the filename)
- [x] Time left or "Watched" — or the TMDB runtime for an episode not started
- [x] Mark watched / Unwatch (`markWatched`, then progress refresh) — a tick toggle with a label that says which
- [x] Subtitles for one episode (episode scope)
- [x] Clicking a row, or Enter on it, plays that episode (`play`) — the row is a button; closing the player comes back to the row
- [x] Rows carry the pointer cursor across the space between them (01a403b)

## Settings (`SettingsView`, `SubtitleSettings`)

- [x] Media folder path, or "No folder chosen yet" — with the counts and when it was last scanned
- [x] Change folder (`chooseFolder`)
- [x] Rescan (`rescan`), disabled without a folder; Stop while scanning (`cancelScan`)
- [x] Scan progress: sweeping bar before the first count, then "Checking X of Y files" (`onScanProgress`)
- [x] Help: rescan after changes; history follows files that move
- [x] Ignore anything shorter than N minutes (0–120, nonsense clamps to 0)
- [x] Play the next episode automatically (`autoplayNext`)
- [x] Even out loud and quiet scenes (`nightAudio`)
- [x] Turn subtitles on automatically (`autoEnableSubtitles`)
- [x] Preferred subtitle languages, comma separated, lower-cased — saves on leaving the box, so a comma can be typed
- [x] Preferred audio languages
- [x] Subtitle preview reflecting the style below — over a backdrop from the library, and now showing the lift too
- [x] Size (0.5–2.5×), Outline (0–6), Background (0–100 %), Lift off bottom (0–30 %)
- [x] Text colour and outline colour
- [x] Apply to embedded styled subtitles too (`overrideEmbeddedStyles`), with the warning about signs and karaoke
- [x] SubDL API key, masked, with placeholder and help that depend on whether the build carries a key (`getBundledKeys`); clearing returns to the built-in key
- [x] Fetch every listed language (`downloadEveryPreferredLanguage`)
- [x] OpenSubtitles API key, same treatment
- [x] Controls: every action from `ACTIONS`, grouped, with its current bindings or "Not bound"
- [x] Click a binding, then press any key, mouse button (side buttons too) or wheel to bind it (`assignBinding`); Escape cancels; modifier keys alone are ignored; the context menu is suppressed while listening — "Add" per action; Cancel cancels instead of binding the left button
- [x] Restore VLC defaults (`resetBindings`)
- [x] About: free and open source, nothing leaves the machine, TMDB attribution
- [x] Every setting saves as it changes (`updateSettings`)

## Player overlay (`Overlay`, `ControlBar`, `SeekBar`, `TrackMenu`)

- [x] Renders nothing unless something is playing (`onPlaybackState`)
- [x] Mouse over the video resolves through the binding table: left, middle, right, buttons 4 and 5, double click, wheel (`runInput`) — only for presses on the bare video, not on controls
- [x] Context menu suppressed
- [x] Controls hide after 2.6 s without movement, woken by the main process' cursor poll (`onOverlayActivity`) and by movement over the bar
- [x] Controls stay up while paused or while a menu is open
- [x] Cursor hidden with the controls
- [x] Menus close when the controls hide, and when the pointer leaves the control area
- [x] Loading screen with spinner and the item's label while a file opens — the mark, a spinner, the series and episode title
- [x] Title of what is playing — series and TMDB episode title in a top band, from `getLibrary` and `getMetadata`
- [x] Seek bar: click or drag to seek (`seekAbsolute`), hover shows the time under the pointer, dragging tracks the pointer rather than snapping back — timecodes moved above it
- [x] Play / pause (`togglePause`)
- [x] Previous and next episode, disabled when there is none (`previousEpisode`, `nextEpisode`)
- [x] Mute (`toggleMute`) with the icon following muted or zero volume
- [x] Volume 0–130 (`setVolume`)
- [x] Position and duration
- [x] Status pills: subtitle delay, speed when not 1×, sleep countdown, stops after this episode — the matching menu button is also lit
- [x] Subtitles menu: Off and every track with a readable label (`trackLabel`), current one marked (`setSubtitleTrack`)
- [x] Find subtitles online for the episode on screen, with its outcome (`findSubtitlesNow`)
- [x] Subtitle delay −50 / +50 ms with the current value (`setSubtitleDelay`)
- [x] Audio menu, current track marked (`setAudioTrack`); "None available" for an empty menu
- [x] Speed menu 0.5–2×, "Normal" for 1× (`setSpeed`)
- [x] Sleep menu: 15, 30, 45, 60, 90, 120 minutes, end of this episode, cancel (`setSleepTimer`, `setSleepAfterEpisode`)
- [x] Fullscreen, icon following the state (`toggleFullscreen`)
- [x] Close the player (`stop`) — "Library" at the top left
- [x] Click-through, auto-hide and input routing unchanged: interactivity is still decided by the main process, the overlay never asks for forwarded mouse events (a55993c) — checked by pressing the centre, the top band and the bar through the DevTools protocol

## `window.cassette` calls

Used before, and still used after:

- [x] `chooseFolder` · `getSettings` · `getBundledKeys` · `setRoots` · `getLibrary` · `rescan` · `cancelScan` · `onScanProgress` · `getProgress`
- [x] `play` · `stop` · `togglePause` · `seekAbsolute` · `setVolume` · `toggleMute` · `setSpeed` · `setSubtitleTrack` · `setAudioTrack` · `setSubtitleDelay` · `nextEpisode` · `previousEpisode` · `toggleFullscreen`
- [x] `onPlaybackState` · `onOverlayActivity` · `onMetadataReady` · `runInput`
- [x] `updateSettings` · `getMetadata` · `markWatched` · `resumeSeries` · `scanSubtitles` · `findSubtitlesNow` · `setSleepTimer` · `setSleepAfterEpisode`
- [x] `startUpdateDownload` · `installUpdate` · `onUpdateAvailable` · `onUpdateProgress` · `onUpdateReady`
- [x] `getBindings` · `assignBinding` · `resetBindings`

Exposed by the preload but not used by the renderer before:
`seekRelative`, `setOverlayInteractive`, `refreshMetadata`,
`listLocalSubtitles`, `useSubtitleFile`, `nextChapter`, `previousChapter`.

Now used: `seekRelative` (back 10 / forward 30 in the player) and
`refreshMetadata` (Look up missing artwork in settings). The overlay also
calls `getLibrary` and `getMetadata` to name the episode on screen.

Added with no new call: a TMDB key field in settings (`updateSettings`), an
empty-folder screen, Everything / Series / Films, and a scan chip in the top
bar.

## Constraints carried over

- [x] No `backdrop-filter` anywhere (styles.css, 7695d2c)
- [x] No full-viewport decorative layers above content (7695d2c)
- [x] No always-on animation across the grid
- [x] Reduced motion respected
- [x] Nothing fetched at runtime: fonts and icons bundled
- [x] Main process, preload and IPC untouched

## Not used by anything

`LibraryView.tsx`, `SetupView.tsx`, `MediaCard.tsx` and `Still.tsx` are not
imported anywhere. They are left in place: removing them is a removal, and
that is asked about rather than done.

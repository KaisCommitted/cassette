# Redesign review

What was kept from the Lovable prototype, what changed, and why. The
prototype was a sketch on mock data; the decisions below come from putting
real libraries through it — the one on this machine, and a generated one of
640 films and 37 series with no artwork at all.

## Kept

- **The palette.** Warm ink rather than a cold near-black, cream text, brass
  for the one thing to press, oxide for sleeves. It suits a shelf of tapes
  better than the previous blue-grey, and it lets TMDB artwork be the colour on
  the page. The ambient wash from the current backdrop stays, painted once on a
  non-scrolling box.
- **Space Grotesk over DM Sans**, now bundled as variable woff2 files. Space
  Grotesk carries headings, counters and keycaps; DM Sans everything read.
- **The top bar** with the mark, Library, Settings and search, replacing the
  left rail. It gives the grid the full width, and search belongs somewhere
  reachable from every screen.
- **"Still watching" as a card**, the episode's still beside its title,
  overview, progress and Resume — the prototype's best idea, and closer to why
  you open the app than the old full-bleed hero.
- **The tape sleeve** as the poster for anything without artwork.
- **The series screen's shape**: backdrop, title, underlined season tabs,
  numbered episode rows.
- **Settings as sections with a contents list** and switch rows.
- **The player's deck**: timecodes over the bar, bordered square buttons, a
  brass play button, menus as panels.
- **The icon set and the mark**, used everywhere including the app icon.

## Changed

### Artwork and the sleeve

- **The sleeve is the fallback, and TMDB art sits in it.** With a poster, the
  poster fills the case with only a hairline inset: posters carry their own
  lettering, and anything heavier fights it. Without one the sleeve is printed
  — a colour from the title (stable across launches), the title set large, the
  mark's two reels, and a *real frame from the file* in a window, the way a
  tape box shows a still. The prototype's sleeve was pure mock; this one is
  made of your data.
- **No per-tile rotation.** The prototype tilted each tape by up to a degree.
  At 600 tiles it reads as untidy rather than handmade, and rotated text
  renders soft.
- **No spinning reels, no shimmer.** The prototype spun every reel forever and
  the old app ran a shimmer across every loading tile. Both are always-on
  animation across the grid. Late artwork now fades in once, over the printed
  sleeve that was there all along, so nothing on the shelf ever looks broken or
  busy while it waits.
- **The frame window only appears once a frame exists.** An empty box while
  the main process decodes one read as a fault.
- **Ratings moved under the poster**, beside the title. On the poster they sat
  on the poster's own lettering.
- **No play glyph on series tiles.** A series tile opens the series; only
  things that play when pressed show the brass play disc.

### Typography and copy

- **No all-caps eyebrows.** "STILL WATCHING", "SEARCH RESULTS", "CASSETTE
  DECK" above headings were decoration. The one kept ("Still watching") is in
  sentence case, because it says why that item is there.
- **Episode labels in words**: "Season 3, episode 16" where there is room,
  "S3 E16" where there is not, instead of the filename's `S03E16`.
- **No monospace.** The prototype set timecodes and keycaps in a mono face;
  Space Grotesk's tabular figures do the same job in the house type. The one
  big number in the app is the tape counter on the first scan, because on a
  large folder it is the only sign the app is working.
- The prototype's placeholder copy ("on your counter", "Nothing leaves your
  drive") is replaced with plain statements of what happens.

### Screens the prototype did not design

- **First scan**: a counter, a bar, the folder being read, and Stop. Before,
  a first scan showed "Reading your folder…" and nothing else for minutes, and
  stopping left the screen stuck.
- **Scan from anywhere**: a small chip in the top bar while a rescan runs.
- **An empty folder**: says why (files under N minutes are left out) and
  offers another folder or a rescan.
- **Nothing found** in search: what search looks at, and Clear search.
- **Subtitle results**: a panel beside the episode list instead of a log
  pushed in above it.
- **Update notice**: a strip under the top bar, in the page's flow, so it never
  covers a tile or the controls.
- **Loading a file** in the player: the mark, a spinner, and the episode's
  name.
- **Exit fullscreen** icon, drawn in the set's grid and stroke.

### Getting around

- **Back lands where you left.** Every view and every search remembers its
  scroll. Leaving a series by its back button, Library or Escape lands on the
  tile you opened it from, focused. Returning to a search's results restores
  them at the same scroll.
- **The player returns you to the episode.** Closing it opens the season of
  the last episode played, even when autoplay crossed into the next season,
  scrolls to its row, focuses it, and marks it "Last played".
- **The library is inert under the player**, so Tab cannot walk through
  invisible tiles, and focus returns to whatever started playback.
- **Keyboard**: `/` or Ctrl+F reaches search from anywhere; Escape clears the
  search, then lets go of it, and backs out of a series or settings; season
  tabs move with the arrow keys; episode rows are one button each, with
  watched and subtitles as separate buttons rather than nested inside a
  clickable row.
- **Everything / Series / Films** appears once a library is big enough to
  scroll past (more than 12 titles). Search always looks across both, so a
  filter left on Films never makes a series look missing.

### Player

- **Back 10 and forward 30**, which the icon set drew and the old bar did not
  have (`seekRelative` was exposed and unused).
- **Menus as icons** (subtitles, audio, speed, sleep), lit while doing
  something: a speed other than 1× or a running timer shows on the button.
- **The episode's TMDB title in the top band**, fetched once per file, where
  the old bar showed the filename label.
- **The close button became "Library"** at top left: it says where it goes.
- **Menus open above the seek bar**, not over it.
- **Speed as a grid**, the sleep menu says what the timer is doing.

### Settings

- **Text boxes save on leaving them**, not per keystroke. Per-keystroke saving
  refilled the box from the main process' answer and dropped a trailing comma,
  so a second preferred language could not be typed.
- **Bindings as keycaps with Add**, which names what pressing a binding always
  did. Cancel now cancels instead of being bound as a left click, and the click
  after a captured mouse press no longer presses whatever is under the
  pointer.
- **The subtitle preview sits on a backdrop from your library** and shows the
  lift off the bottom; outline and background only mean something over a
  picture.
- **TMDB key** and **Look up missing artwork**: both were possible through the
  preload and had no way in from the interface.

## Tailwind or plain CSS

Plain CSS on custom properties. The app already was, several rules carry
reasons that belong next to their selector (the pointer cursor across grid
gaps, why nothing is composited across the whole window), the automated
capture depends on two class names, and Tailwind would have added a build
plugin and a dependency for an interface of six screens. Tokens live in
`src/renderer/shared/tokens.css`, shared by the library window and the
overlay; each screen has its own file under `src/renderer/src/styles/`.

## Motion

Every transition answers something you did — hover, press, open, arrive —
and runs in 120–180 ms. The one entrance is a 180 ms settle when a page
changes. The only looping animations run while something is being waited on:
the scan bar before the first count, a subtitle search, a file opening.
`prefers-reduced-motion` cuts all of it to an instant, and the waiting
indicators become still.

## From 1000px to 4K

Checked at 1000, 1400, 1920 and 3840 CSS pixels. Posters widen with the
window (150–230px) rather than shrinking into ever more columns; gutters and
gaps scale with it. At 1000px the brand collapses to the mark, the settings
contents list hides, and the subtitle panel moves above the episode list.

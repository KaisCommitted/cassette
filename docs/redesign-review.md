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
- **The top bar**, replacing the left rail. It gives the grid the full width,
  and search belongs somewhere reachable from every screen. The prototype's
  Library and Settings tabs are gone: with only two places, the mark is the
  way home, a cog in the corner is settings, and Back sits first whenever
  you are off the library. Search takes the true centre.
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
- **Update notice**: a card floating in the bottom-left corner, as before the
  redesign but in its colours, type and icons. It takes no place in the
  page, so appearing never pushes the library down under the pointer; it is
  clear of the top bar's chips, and the player's controls are a window above
  it. It slides in once, and not at all under reduced motion.
- **Loading a file** in the player: the mark, a spinner, and the episode's
  name.
- **Exit fullscreen** icon, drawn in the set's grid and stroke.

### Getting around

- **Back is previous, not home.** Back in the top bar, Escape, Alt+Left and
  the mouse's back button all step back one screen to whatever opened the one
  you are on — settings opened from a series goes back to that series.
  Leaving a series for the library lands on its tile, focused. Every search
  keeps its results at the same scroll.
- **A series opens on the episode you are on**: the one part-way through,
  else the next unwatched, with its season selected, its row scrolled into
  view and marked "Last played" or "Up next".
- **The player returns you to the episode.** Closing it — Escape, the button
  naming the series, or the close binding — opens that series on the
  episode's season with its row in view and focused, wherever playback was
  started, even when autoplay crossed seasons. Escape in fullscreen only
  leaves fullscreen; it is fixed to mean back and is not rebindable.
- **Episodes are named even without TMDB**: the title in the file's name
  ("S06E01 The Desert Rose") is used before falling back to "S6 E1", and
  seasons added after a series was first matched now get their TMDB titles.
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
- **The close button names where it goes**: the series for an episode, the
  library for a film.
- **Menus open above the seek bar**, not over it.
- **Speed as a grid**, the sleep menu says what the timer is doing.

### Settings

- **Text boxes save on leaving them**, not per keystroke. Per-keystroke saving
  refilled the box from the main process' answer and dropped a trailing comma,
  so a second preferred language could not be typed.
- **Bindings as keycaps**, each with a cross that removes it, and Add. Adding
  opens a listening row: keys are read from anywhere, mouse buttons, double
  clicks and the wheel only from a pad in that row, so Cancel and the rest of
  the page never get bound by accident. A key already doing something else
  asks before moving. Restoring the defaults asks first.
- **Bindings only act in the player.** In the library every key belongs to the
  page, and while a text box has focus no binding can take a keystroke.
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
and runs in 120–180 ms. Changing screens is one 260 ms view transition of the
page alone — forward slides in from the right, back from the left, so going
into a series and coming out read as opposites — while the top bar stays
still. Going in or out of fullscreen dips the picture to black for the moment
the window changes size, so the jump is never seen. The only looping animations run while something is being waited on:
the scan bar before the first count, a subtitle search, a file opening.
`prefers-reduced-motion` cuts all of it to an instant, and the waiting
indicators become still.

## From 1000px to 4K

Checked at 1000, 1400, 1920 and 3840 CSS pixels. Posters widen with the
window (150–230px) rather than shrinking into ever more columns; gutters and
gaps scale with it. At 1000px the brand collapses to the mark, the settings
contents list hides, and the subtitle panel moves above the episode list.

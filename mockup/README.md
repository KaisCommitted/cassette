# Cassette — UI prototype

Design and frontend only. Nothing outside this folder was touched.

## Look

```
open mockup/index.html          # bundle.js is already built
```

Rebuild after an edit:

```
node_modules/.bin/esbuild mockup/main.tsx --bundle --outfile=mockup/bundle.js \
  --jsx=automatic --define:process.env.NODE_ENV='"production"'
```

## Files

| File | What it is |
| --- | --- |
| `styles.css` | The whole stylesheet. Every value is a named custom property at the top. Lift this as is. |
| `icons.tsx` | Every drawn thing: interface glyphs, the spool mark, the app icon, the tape counter, the rolling digits, the J-card, the artwork slots. |
| `data.ts` | Invented shelf contents, the controls table and the track lists. |
| `App.tsx` | Nav rail and screen switching. Local state, no router. |
| `FirstRun.tsx` `Library.tsx` `Series.tsx` `Settings.tsx` `Player.tsx` `UpdateNotice.tsx` | The screens. |
| `index.html` `main.tsx` `bundle.js` `fonts/` | Harness. Not part of what you lift. |

## Fonts

IBM Plex Sans (interface) and Courier Prime (J-cards, counters). Both OFL, both
already in `fonts/` as woff2 — copy that folder next to `styles.css` wherever it
lands and the `@font-face` rules bind. If the files are missing the stack falls
back to Segoe UI and Courier New and nothing breaks.

## Artwork

No image files anywhere. Every poster is a J-card built from CSS. Backdrops,
stills and the block behind the player are flat warm blocks with a faint label
saying what belongs there. To drop a real image in later:

```tsx
<Slot ratio="16x9" label="backdrop 16:9">
  <img src={backdropUrl} alt="" />
</Slot>
```

The `img` is absolutely positioned and `object-fit: cover`, so the layout does
not move when it appears or fails to load.

## Getting around

Library and Settings are in the rail. A series poster or **All episodes** opens
the series screen. **Resume**, a film poster, an episode or an "also on the go"
card opens the player. Settings → **Change** or **Rescan** goes to the first-run
screen (change goes to the chooser, rescan goes straight into the scan).
Settings → About → **Check for updates** brings the update notice back.

## Preview hooks

Harness only — `main.tsx`, not `App.tsx`. They exist so a screen can be opened
straight into a particular state for a screenshot.

```
?screen=settings            open a screen directly (library, series, settings, firstrun)
?screen=series&id=long-wire which series
?play=1                     open the player
?update=0                   start with the update notice dismissed
?scroll=2560                scroll the screen down
?type=zzz                   put text in the search box
?click=a|b|c                press those selectors in turn
```

## What is where

- **J-card** — `icons.tsx` → `JCard`, `styles.css` section 10. Paper stock is
  picked per title by `stockFor(id)`, so a shelf has four card colours in it.
- **Tape counter** — `TapeCounter`, `styles.css` section 8. Drums are shaded
  with inset shadows rather than gradients.
- **Rolling digits** — `Rolling`, same section. One column of 0–9 per digit,
  moved by a `transform` transition with a stagger, rightmost first.
- **Spool mark** — `SpoolMark` and `AppIcon`. Six-toothed hubs, ribbon thick on
  one and thin on the other. `running` spins them in opposite directions; it is
  also the scanning and searching indicator, so there is no spinner anywhere.
- **Latch press** — `.btn`, `.key`, `.cap`, `.rail__item`, `.check`, `.spine`
  all depress 2px with an inner shadow on `:active`.
- **Filament fade** — `filament-fade` / `filament-rise` / `filament-lamp`, used
  on screen changes, menus, the player overlay, the results panel, the update
  notice and the listening key cap.

Reduced motion is respected. Nothing is signalled by colour alone: every state
that uses amber also carries a word, a tick, a filled bar or an underscore.

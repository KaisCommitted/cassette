/* ===========================================================================
   Cassette — invented shelf contents.
   Everything here is something you already own and can play now. Nothing is
   fetched, nothing is a catalogue entry, nothing is for sale.
   =========================================================================== */

export type Episode = {
  id: string
  season: number
  number: number
  title: string
  desc: string
  runtime: number   // minutes
  watched: boolean
  progress: number  // 0..1
  hasSubs: boolean
}

export type Series = {
  id: string
  title: string
  year: number
  endYear?: number
  rating: number
  synopsis: string
  seasons: number[]
  episodeCount: number
  watchedCount: number
  watched: boolean
  episodes: Episode[]
}

export type Film = {
  id: string
  title: string
  year: number
  rating: number
  runtime: number   // minutes
  synopsis: string
  progress: number
  watched: boolean
}

/* --- helpers ------------------------------------------------------------- */

export const hhmm = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

export const seasonSpan = (seasons: number[]) =>
  seasons.length === 1
    ? `season ${seasons[0]}`
    : `seasons ${seasons[0]} to ${seasons[seasons.length - 1]}`

/* --- the series you have most of ---------------------------------------- */

const LONG_WIRE_TITLES: [number, string, string][] = [
  [3, 'Trunk Call', 'A night operator patches a call that was never logged, and decides not to mention it.'],
  [3, 'Party Line', 'Four houses share a line. Three of them hear something they should not have.'],
  [3, 'The Exchange', 'Marsh takes the switchboard job because it is warm and quiet. It is neither.'],
  [3, 'Crossed Wires', 'Two conversations leak into each other and a name comes up twice.'],
  [3, 'Night Rate', 'Calls after ten are cheaper, which is why nobody is honest before then.'],
  [3, 'Operator', 'The exchange gets its first written complaint in nine years.'],
  [3, 'Cable Bay', 'The undersea run comes ashore at a cove with no road to it.'],
  [3, 'The Relay', 'A fault is traced to a hut that was decommissioned in 1961.'],
  [3, 'Dead Air', 'Eleven minutes of silence on a line that was supposed to be cut.'],
  [3, 'Long Distance', 'Bern calls every Thursday. This week she calls on a Tuesday.'],
  [3, 'The Junction Box', 'An engineer finds a splice done by someone who knew what they were doing.'],
  [3, 'Wrong Number', 'The same wrong number four nights running, always at the same minute.'],
  [3, 'Ring Back', 'Marsh tries to return a call and reaches a coin box on a bypass.'],
  [3, 'The Switchboard', 'A day shift covers for a night shift, and learns what the night shift hears.'],
  [3, 'Copper', 'Half a mile of line goes missing between two fields.'],
  [3, 'Signal Strength', 'The regional office sends a man with a meter and a clipboard.'],
  [3, 'Engaged', 'A line that is never free turns out not to be a line at all.'],
  [3, 'The Last Pole', 'The end of the run, and the beginning of somebody else.'],
  [3, 'Reverse Charge', 'Somebody has been accepting calls on an account that was closed.'],
  [3, 'Sign Here', 'The paperwork catches up with the exchange, three years late.'],
  [4, 'Cold Start', 'A new year, a new supervisor, and the same fault on the same pair.'],
  [4, 'The Repeater', 'Twelve miles out, a box amplifies more than it should.'],
  [4, 'Static', 'Weather takes the overheads down and everybody has to talk in person.'],
  [4, 'The Tone', 'A single note on an unused circuit, holding for six days.'],
  [4, 'Tapped', 'An inspection finds a second pair of headphones in the cupboard.'],
  [4, 'Line Fault', 'The book says a fault like this cannot happen. The book is from 1958.'],
  [4, 'The Duct', 'Under the high street, in the wet, a length of cable nobody ordered.'],
  [4, 'Overhead', 'Three poles replaced, and a route quietly changed on the plan.'],
  [4, 'Silent Line', 'A subscriber who never speaks keeps paying the quarterly bill.'],
  [4, 'The Splice', 'A join made with the wrong gauge tells Marsh who did it.'],
  [4, 'Hold, Please', 'The regional office puts the whole exchange on hold for a morning.'],
  [4, 'The Trunk Road', 'Widening the A-road means moving a run that should not be moved.'],
  [4, 'Interference', 'Somebody at the county office starts asking for the call logs.'],
  [4, 'Answering', 'The first answering machine on the network records the wrong thing.'],
  [4, 'The Test Call', 'Every circuit is tested. One of them tests back.'],
  [4, 'Off Hook', 'A receiver left off for a fortnight, in a house with nobody in it.'],
  [4, 'Terminal', 'The old frame comes out. What is behind it does not.'],
  [4, 'Bell Wire', 'A doorbell circuit carries a conversation across two streets.'],
  [4, 'The Kiosk', 'Box 4 on the green is used eleven times in one night.'],
  [4, 'Directory', 'A name in the book that no living person in the town recognises.'],
  [4, 'Subscriber', 'An account opened in 1949 has never once been closed.'],
  [4, 'Lines Down', 'The worst night of the winter, and everything has to hold.'],
  [5, 'The Cut', 'The exchange is scheduled for closure. Marsh has ninety days.'],
  [5, 'Insulator', 'A green glass cap from the old run turns up in a desk drawer.'],
  [5, 'The Frame', 'Every jumper on the main frame is photographed before it is pulled.'],
  [5, 'Recorded Message', 'A voice announcement plays a name it was never given.'],
  [5, 'The Loop', 'Two exchanges hand the same call back and forth for an hour.'],
  [5, 'Earth', 'A fault to ground, in ground that has been dug over twice.'],
  [5, 'No Dial Tone', 'Half the town wakes up to nothing, and nobody rings to say so.'],
  [5, 'Carrier', 'The new equipment arrives and the old equipment will not go quietly.'],
  [5, 'The Mast', 'Everything is going to microwave. Marsh drives out to look at it.'],
  [5, 'Open Circuit', 'The last fault on the books, and it is the one from the first episode.'],
  [5, 'The Handover', 'Keys, logs, and a list of what was never written down.'],
  [5, 'Down the Line', 'The exchange goes dark at 04:00. Somebody is still on.'],
]

function buildLongWire(): Episode[] {
  const counters = new Map<number, number>()
  return LONG_WIRE_TITLES.map(([season, title, desc], idx) => {
    const n = (counters.get(season) ?? 0) + 1
    counters.set(season, n)
    // twelve watched, all early; one part-way through in season 4
    const watched = idx < 12
    const progress = idx === 30 ? 0.62 : idx === 31 ? 0.18 : 0
    return {
      id: `lw-s${season}e${n}`,
      season,
      number: n,
      title,
      desc,
      runtime: 46 + (idx % 5),
      watched,
      progress,
      hasSubs: idx % 3 !== 1,
    }
  })
}

/* --- everything else gets a shorter, generated run ----------------------- */

const GENERIC_TITLES = [
  'First Light', 'The Quarry', 'Hard Frost', 'Low Water', 'The Allotment',
  'Blackout', 'The Visitor', 'Pike Pool', 'Old Ground', 'The Inquest',
  'Slack Tide', 'The Long Field', 'Bonfire', 'Two Bells', 'The Lock Keeper',
  'Nine Elms', 'The Verge', 'Last Bus', 'The Dig', 'Close of Play',
  'The Bell Tent', 'Heavy Weather',
]

const GENERIC_DESCS = [
  'An early start, and a door that was open when it should not have been.',
  'What was found in the water does not match what was reported missing.',
  'Two people agree on a story, then one of them writes it down.',
  'A favour is called in that nobody remembers granting.',
  'The paperwork says one thing and the neighbours say another.',
  'A night shift that should have been quiet, and was not.',
  'Somebody comes back to town after eleven years and asks for directions.',
  'The search moves to the far bank, against advice.',
  'An old debt is settled in a way that creates a new one.',
  'A hearing that turns on the time on a till receipt.',
  'The tide takes what was left on the flats, and brings something else.',
  'A boundary dispute that has been running since before the war.',
]

function generateEpisodes(prefix: string, seasons: number[], perSeason: number, watchedUpTo: number): Episode[] {
  const out: Episode[] = []
  let i = 0
  for (const s of seasons) {
    for (let n = 1; n <= perSeason; n++) {
      out.push({
        id: `${prefix}-s${s}e${n}`,
        season: s,
        number: n,
        title: GENERIC_TITLES[(i + prefix.length * 3) % GENERIC_TITLES.length],
        desc: GENERIC_DESCS[(i + prefix.length) % GENERIC_DESCS.length],
        runtime: 42 + ((i * 7) % 12),
        watched: i < watchedUpTo,
        progress: i === watchedUpTo ? 0.44 : 0,
        hasSubs: i % 4 !== 2,
      })
      i++
    }
  }
  return out
}

/* --- the shelf ----------------------------------------------------------- */

export const SERIES: Series[] = [
  {
    id: 'long-wire',
    title: 'The Long Wire',
    year: 1994,
    endYear: 1997,
    rating: 8.4,
    synopsis:
      'A rural telephone exchange in the last years before everything went digital, and the supervisor who keeps the log nobody asks to see. Seasons one and two are not on this drive.',
    seasons: [3, 4, 5],
    episodeCount: 54,
    watchedCount: 12,
    watched: false,
    episodes: buildLongWire(),
  },
  {
    id: 'harrowgate',
    title: 'Harrowgate',
    year: 2017,
    endYear: 2019,
    rating: 8.1,
    synopsis:
      'A detective returns to the moorland town she grew up in to close a case her father opened, and finds most of the witnesses are related to her.',
    seasons: [1, 2],
    episodeCount: 12,
    watchedCount: 9,
    watched: false,
    episodes: generateEpisodes('hg', [1, 2], 6, 9),
  },
  {
    id: 'nightjar',
    title: 'Nightjar',
    year: 2019,
    rating: 7.6,
    synopsis:
      'Three summers on a heath that is being sold off in parcels, told entirely between dusk and dawn.',
    seasons: [1],
    episodeCount: 8,
    watchedCount: 3,
    watched: false,
    episodes: generateEpisodes('nj', [1], 8, 3),
  },
  {
    id: 'saltmarsh',
    title: 'Saltmarsh',
    year: 2014,
    endYear: 2016,
    rating: 7.9,
    synopsis:
      'A coastal parish loses forty acres a year to the sea, and a planning officer has to decide which houses are worth defending.',
    seasons: [1, 2, 3],
    episodeCount: 18,
    watchedCount: 6,
    watched: false,
    episodes: generateEpisodes('sm', [1, 2, 3], 6, 6),
  },
  {
    id: 'undercroft',
    title: 'The Undercroft',
    year: 2021,
    rating: 8.8,
    synopsis:
      'Six nights in the basement archive of a cathedral library, and the conservator who will not go home.',
    seasons: [1],
    episodeCount: 6,
    watchedCount: 6,
    watched: true,
    episodes: generateEpisodes('uc', [1], 6, 6),
  },
  {
    id: 'bellweather',
    title: 'Bellweather',
    year: 2008,
    endYear: 2011,
    rating: 7.2,
    synopsis:
      'A hill farm, four generations, and a right of way that runs straight through the yard.',
    seasons: [2, 3, 4],
    episodeCount: 21,
    watchedCount: 0,
    watched: false,
    episodes: generateEpisodes('bw', [2, 3, 4], 7, 0),
  },
  {
    id: 'quiet-signal',
    title: 'Quiet Signal',
    year: 2020,
    endYear: 2022,
    rating: 8.0,
    synopsis:
      'A listening station on a headland, staffed by four people who are not allowed to say what they hear.',
    seasons: [1, 2],
    episodeCount: 16,
    watchedCount: 11,
    watched: false,
    episodes: generateEpisodes('qs', [1, 2], 8, 11),
  },
  {
    id: 'pike-and-fenn',
    title: 'Pike and Fenn',
    year: 2016,
    endYear: 2020,
    rating: 6.9,
    synopsis:
      'Two solicitors in a market town take the work nobody else will, mostly involving boundaries, boats and wills.',
    seasons: [1, 2, 3, 4, 5],
    episodeCount: 30,
    watchedCount: 30,
    watched: true,
    episodes: generateEpisodes('pf', [1, 2, 3, 4, 5], 6, 30),
  },
]

export const FILMS: Film[] = [
  { id: 'f-leith', title: 'A Cold Morning in Leith', year: 2009, rating: 7.8, runtime: 104,
    synopsis: 'A dock foreman gets one day to find a container that was never on the manifest.',
    progress: 0, watched: true },
  { id: 'f-ferryman', title: "Ferryman's Reach", year: 1998, rating: 8.2, runtime: 127,
    synopsis: 'The last crossing of the season, and the six people who insist on making it.',
    progress: 0.31, watched: false },
  { id: 'f-paperboat', title: 'The Paper Boat', year: 2013, rating: 7.1, runtime: 96,
    synopsis: 'A child learns the flood is coming a week before anyone will believe it.',
    progress: 0, watched: false },
  { id: 'f-dungeness', title: 'Low Tide at Dungeness', year: 2016, rating: 8.5, runtime: 118,
    synopsis: 'Two fishermen, one shingle bank, and a power station that never switches off.',
    progress: 0.61, watched: false },
  { id: 'f-rain', title: 'Sixteen Hours of Rain', year: 2004, rating: 6.8, runtime: 88,
    synopsis: 'A wedding party is stranded in a village hall and the tape runs in real time.',
    progress: 0, watched: true },
  { id: 'f-understudy', title: 'The Understudy', year: 2019, rating: 7.4, runtime: 111,
    synopsis: 'A repertory company loses its lead on press night and closes ranks.',
    progress: 0, watched: false },
  { id: 'f-allotment', title: 'Winter Allotment', year: 2021, rating: 7.9, runtime: 94,
    synopsis: 'Nine plots, one water tap, and a committee election that turns nasty.',
    progress: 0.12, watched: false },
  { id: 'f-brickfield', title: 'Brickfield', year: 1994, rating: 8.0, runtime: 135,
    synopsis: 'The kiln closes, the clay pit floods, and the town votes on what to do with it.',
    progress: 0, watched: true },
  { id: 'f-padstow', title: 'The Long Way to Padstow', year: 2012, rating: 6.5, runtime: 99,
    synopsis: 'A hearse breaks down in Bodmin and the mourners carry on by bus.',
    progress: 0, watched: false },
  { id: 'f-nightshift', title: 'Nightshift', year: 2018, rating: 7.6, runtime: 106,
    synopsis: 'Twelve hours on a distribution centre floor, from clock-in to clock-out.',
    progress: 0, watched: false },
  { id: 'f-orrery', title: 'Orrery', year: 2022, rating: 8.3, runtime: 122,
    synopsis: 'A clockmaker is asked to repair a model of a solar system that has one planet too many.',
    progress: 0.05, watched: false },
  { id: 'f-wicken', title: 'The Keeper of Wicken Fen', year: 2007, rating: 7.3, runtime: 101,
    synopsis: 'Forty years of fen records, and the winter the water came up early.',
    progress: 0, watched: true },
]

/* --- what you are part of the way through -------------------------------- */

export type Ongoing = {
  id: string
  seriesId?: string
  title: string
  where: string
  minutesLeft: number
  progress: number
  tint: 1 | 2 | 3 | 4 | 5
}

export const HERO = {
  seriesId: 'harrowgate',
  title: 'Harrowgate',
  where: 'S2E4',
  episodeTitle: 'The Allotment',
  minutesLeft: 38,
  progress: 0.42,
  elapsedSeconds: 27 * 60 + 14,
  totalSeconds: 65 * 60 + 40,
  synopsis:
    'A detective returns to the moorland town she grew up in to close a case her father opened, and finds most of the witnesses are related to her.',
}

export const ONGOING: Ongoing[] = [
  { id: 'og-1', seriesId: 'long-wire', title: 'The Long Wire', where: 'S4E11 · Hold, Please', minutesLeft: 17, progress: 0.62, tint: 2 },
  { id: 'og-2', title: 'Low Tide at Dungeness', where: 'Film', minutesLeft: 46, progress: 0.61, tint: 3 },
  { id: 'og-3', seriesId: 'quiet-signal', title: 'Quiet Signal', where: 'S2E4 · The Verge', minutesLeft: 29, progress: 0.34, tint: 1 },
  { id: 'og-4', seriesId: 'saltmarsh', title: 'Saltmarsh', where: 'S2E1 · Slack Tide', minutesLeft: 24, progress: 0.44, tint: 4 },
  { id: 'og-5', title: "Ferryman's Reach", where: 'Film', minutesLeft: 87, progress: 0.31, tint: 5 },
]

/* --- player tracks -------------------------------------------------------- */

export const SUBTITLE_TRACKS = [
  { id: 'off', name: 'Off', detail: '' },
  { id: 'sub-1', name: 'English', detail: 'embedded · SRT · forced off' },
  { id: 'sub-2', name: 'English (hard of hearing)', detail: 'embedded · SRT' },
  { id: 'sub-3', name: 'Welsh', detail: 'Harrowgate.S02E04.cy.srt' },
  { id: 'sub-4', name: 'French', detail: 'Harrowgate.S02E04.fr.srt' },
]

export const AUDIO_TRACKS = [
  { id: 'aud-1', name: 'English', detail: '5.1 · E-AC-3 · 640 kbps' },
  { id: 'aud-2', name: 'English', detail: 'Stereo · AAC · 192 kbps' },
  { id: 'aud-3', name: 'Commentary with the director', detail: 'Stereo · AAC · 128 kbps' },
]

export const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]

export const SLEEP_OPTIONS = [
  { id: 'off', label: 'Off' },
  { id: 'ep', label: 'Stop after this episode' },
  { id: '15', label: 'In 15 minutes' },
  { id: '30', label: 'In 30 minutes' },
  { id: '60', label: 'In an hour' },
]

/* --- subtitle search results --------------------------------------------- */

export type SubResult = { ep: string; file: string | null; lang?: string; downloads?: number }

export const SUB_RESULTS: SubResult[] = [
  { ep: 'S4E1', file: 'The.Long.Wire.S04E01.DVDRip.en.srt', lang: 'English', downloads: 4102 },
  { ep: 'S4E2', file: 'The.Long.Wire.S04E02.DVDRip.en.srt', lang: 'English', downloads: 3877 },
  { ep: 'S4E3', file: null },
  { ep: 'S4E4', file: 'The.Long.Wire.S04E04.PAL.en.srt', lang: 'English', downloads: 2914 },
  { ep: 'S4E5', file: 'The.Long.Wire.S04E05.PAL.en.srt', lang: 'English', downloads: 2860 },
  { ep: 'S4E6', file: null },
  { ep: 'S4E7', file: 'The.Long.Wire.S04E07.DVDRip.cy.srt', lang: 'Welsh', downloads: 311 },
  { ep: 'S4E8', file: 'The.Long.Wire.S04E08.DVDRip.en.srt', lang: 'English', downloads: 2705 },
]

/* --- settings ------------------------------------------------------------- */

export const SUB_LANGUAGES = ['English', 'Welsh', 'French', 'Norwegian']
export const AUDIO_LANGUAGES = ['English', 'Japanese', 'Danish']

export type Control = { action: string; keys: string[] }
export type ControlGroup = { group: string; rows: Control[] }

export const CONTROLS: ControlGroup[] = [
  {
    group: 'Playing',
    rows: [
      { action: 'Play or pause', keys: ['Space'] },
      { action: 'Play or pause with the mouse', keys: ['Left click'] },
      { action: 'Stop and close the player', keys: ['Esc'] },
      { action: 'Back ten seconds', keys: ['←'] },
      { action: 'Forward thirty seconds', keys: ['→'] },
      { action: 'Back one minute', keys: ['Shift', '←'] },
      { action: 'Forward one minute', keys: ['Shift', '→'] },
      { action: 'Previous episode', keys: ['P'] },
      { action: 'Next episode', keys: ['N'] },
      { action: 'Cycle playback speed', keys: [']'] },
    ],
  },
  {
    group: 'Sound',
    rows: [
      { action: 'Volume up', keys: ['↑'] },
      { action: 'Volume down', keys: ['↓'] },
      { action: 'Volume with the wheel', keys: ['Wheel'] },
      { action: 'Mute', keys: ['M'] },
      { action: 'Next audio track', keys: ['A'] },
    ],
  },
  {
    group: 'Subtitles',
    rows: [
      { action: 'Subtitles on or off', keys: ['V'] },
      { action: 'Next subtitle track', keys: ['S'] },
      { action: 'Nudge subtitles earlier', keys: ['Z'] },
      { action: 'Nudge subtitles later', keys: ['X'] },
      { action: 'Find subtitles online', keys: ['Ctrl', 'F'] },
    ],
  },
  {
    group: 'Window',
    rows: [
      { action: 'Fullscreen', keys: ['F'] },
      { action: 'Fullscreen with the mouse', keys: ['Double click'] },
      { action: 'Leave fullscreen', keys: ['Esc'] },
      { action: 'Keep above other windows', keys: ['T'] },
      { action: 'Show or hide the controls', keys: ['C'] },
    ],
  },
  {
    group: 'Library',
    rows: [
      { action: 'Search', keys: ['Ctrl', 'K'] },
      { action: 'Go back', keys: ['Backspace'] },
      { action: 'Go back with the mouse', keys: ['Mouse 4'] },
      { action: 'Rescan the folder', keys: ['F5'] },
      { action: 'Mark as watched', keys: ['W'] },
    ],
  },
]

export const controlCount = CONTROLS.reduce((n, g) => n + g.rows.length, 0)

/* --- scanning ------------------------------------------------------------- */

export const SCAN_PATHS = [
  'D:\\Media\\Series\\The Long Wire\\Season 4',
  'D:\\Media\\Series\\Harrowgate\\Season 2',
  'D:\\Media\\Films\\Low Tide at Dungeness (2016)',
  'D:\\Media\\Series\\Quiet Signal\\Season 1',
  'D:\\Media\\Films\\Brickfield (1994)',
  'D:\\Media\\Series\\Bellweather\\Season 3',
  'D:\\Media\\Films\\Orrery (2022)',
  'D:\\Media\\Series\\Pike and Fenn\\Season 5',
]

export const MEDIA_FOLDER = 'D:\\Media'

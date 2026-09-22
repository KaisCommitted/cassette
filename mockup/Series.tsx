/* ===========================================================================
   Cassette — one series.
   The season tabs are the labels off the spine of the tape: stuck on by
   hand, slightly out of true.
   =========================================================================== */
import React, { useEffect, useMemo, useState } from 'react'
import {
  Slot, SpoolMark, Rolling, IconPlay, IconBack, IconTick, IconSubtitles, IconClose,
} from './icons'
import { Series as SeriesType, SUB_RESULTS, seasonSpan } from './data'
import { Playing } from './Player'

type Search = { scope: 'series' | 'season'; stage: 'searching' | 'done' } | null

export default function SeriesScreen({
  series,
  onBack,
  onPlay,
}: { series: SeriesType; onBack: () => void; onPlay: (p: Playing) => void }) {
  const [season, setSeason] = useState(series.seasons[0])
  const [watched, setWatched] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState<Search>(null)

  const episodes = useMemo(
    () => series.episodes.filter((e) => e.season === season),
    [series, season]
  )

  useEffect(() => {
    if (search?.stage !== 'searching') return
    const t = window.setTimeout(() => setSearch((s) => (s ? { ...s, stage: 'done' } : null)), 1400)
    return () => window.clearTimeout(t)
  }, [search])

  const isWatched = (id: string, fallback: boolean) => watched[id] ?? fallback
  const toggleWatched = (id: string, fallback: boolean) =>
    setWatched((w) => ({ ...w, [id]: !(w[id] ?? fallback) }))

  const nextUp = series.episodes.find((e) => e.progress > 0) ?? series.episodes.find((e) => !e.watched)

  const resume = () =>
    nextUp &&
    onPlay({
      title: series.title,
      where: `S${nextUp.season}E${nextUp.number} · ${nextUp.title}`,
      elapsed: Math.round(nextUp.runtime * 60 * nextUp.progress),
      total: nextUp.runtime * 60,
      counter: 60 + Math.round(nextUp.progress * 300),
    })

  // the search covers whichever episodes you asked about, and names the files
  // after them, so the panel reads like a real result and not a sample
  const slug = series.title.replace(/[^A-Za-z0-9]+/g, '.')
  const searched = (search?.scope === 'series' ? series.episodes : episodes).slice(0, 8)
  const seasonResults = searched.map((e, i) => {
    const template = SUB_RESULTS[i % SUB_RESULTS.length]
    const n = `S${String(e.season).padStart(2, '0')}E${String(e.number).padStart(2, '0')}`
    return {
      ep: `S${e.season}E${e.number}`,
      lang: template.lang,
      file: template.file ? `${slug}.${n}.${template.file.split('.').slice(-3).join('.')}` : null,
    }
  })
  const found = seasonResults.filter((r) => r.file).length

  return (
    <>
      <header className="serieshead">
        <div className="serieshead__art">
          <Slot ratio="16x9" label="backdrop 16:9" tint={4} fill />
          <div className="serieshead__veil" />
        </div>
        <div className="serieshead__body">
          <button className="btn btn--quiet serieshead__back" onClick={onBack}>
            <IconBack />
            Library
          </button>
          <h2 className="serieshead__title">{series.title}</h2>
          <p className="serieshead__facts">
            <span>{series.year}{series.endYear ? `–${series.endYear}` : ''}</span>
            <span className="dot">·</span>
            <span>
              <Rolling text={String(series.episodeCount)} /> episodes across {seasonSpan(series.seasons)}
            </span>
            <span className="dot">·</span>
            <span>
              <b><Rolling text={String(series.watchedCount)} /></b> watched
            </span>
          </p>
          <p className="serieshead__synopsis">{series.synopsis}</p>
          <div className="serieshead__actions">
            <button className="btn btn--accent btn--lg" onClick={resume} disabled={!nextUp}>
              <IconPlay size={15} />
              {nextUp && nextUp.progress > 0
                ? `Resume S${nextUp.season}E${nextUp.number}`
                : nextUp
                  ? `Play S${nextUp.season}E${nextUp.number}`
                  : 'All watched'}
            </button>
            <button className="btn btn--lg" onClick={() => setSearch({ scope: 'series', stage: 'searching' })}>
              <IconSubtitles size={16} />
              Find subtitles for the series
            </button>
            <button className="btn btn--lg" onClick={() => setSearch({ scope: 'season', stage: 'searching' })}>
              <IconSubtitles size={16} />
              Find subtitles for season {season}
            </button>
          </div>
        </div>
      </header>

      <div className="page" style={{ paddingTop: 0 }}>
        <div className="spines" role="tablist" aria-label="Seasons">
          {series.seasons.map((s) => (
            <button
              key={s}
              role="tab"
              className="spine"
              aria-selected={s === season}
              onClick={() => setSeason(s)}
            >
              <span className="spine__n">Season {s}</span>
              <span className="spine__count">
                {series.episodes.filter((e) => e.season === s).length} eps
              </span>
            </button>
          ))}
        </div>

        {search && (
          <div className="results">
            <div className="results__head">
              {search.stage === 'searching' ? (
                <>
                  <SpoolMark size={20} running />
                  <span>
                    Searching for {search.scope === 'series' ? 'the whole series' : `season ${season}`}…
                  </span>
                </>
              ) : (
                <>
                  <SpoolMark size={20} />
                  <strong>
                    {found} of {seasonResults.length} episodes matched
                  </strong>
                  <span className="muted">English, then Welsh</span>
                </>
              )}
              <button className="update__x" onClick={() => setSearch(null)} aria-label="Close results">
                <IconClose size={14} />
              </button>
            </div>
            {search.stage === 'done' &&
              seasonResults.map((r) => (
                <div className="results__row" key={r.ep}>
                  <span className="results__ep">{r.ep}</span>
                  {r.file ? (
                    <span className="results__file">{r.file}</span>
                  ) : (
                    <span className="results__miss">Nothing found for this one</span>
                  )}
                  {r.file ? (
                    <span className="check" aria-pressed="true">
                      <IconTick size={12} /> Added
                    </span>
                  ) : (
                    <span className="results__miss mono">—</span>
                  )}
                </div>
              ))}
          </div>
        )}

        <div className="eps">
          {episodes.map((e, idx) => {
            const done = isWatched(e.id, e.watched)
            const left = Math.round(e.runtime * (1 - e.progress))
            return (
              <article className="ep" key={e.id}>
                <div className="ep__art">
                  <Slot ratio="16x9" label="still 16:9" tint={((idx % 5) + 1) as 1 | 2 | 3 | 4 | 5} />
                  <button
                    className="ep__play"
                    aria-label={`Play ${e.title}`}
                    onClick={() =>
                      onPlay({
                        title: series.title,
                        where: `S${e.season}E${e.number} · ${e.title}`,
                        elapsed: Math.round(e.runtime * 60 * e.progress),
                        total: e.runtime * 60,
                        counter: 40 + idx * 13,
                      })
                    }
                  >
                    <IconPlay size={26} />
                  </button>
                  {e.progress > 0 && (
                    <span className="tile__progress">
                      <span className="progress">
                        <span className="progress__fill" style={{ ['--pct' as string]: `${Math.round(e.progress * 100)}%` }} />
                      </span>
                    </span>
                  )}
                </div>

                <div>
                  <p className="ep__num">
                    S{e.season}E{String(e.number).padStart(2, '0')}
                  </p>
                  <h4 className="ep__title">{e.title}</h4>
                  <p className="ep__desc">{e.desc}</p>
                  <div className="ep__state">
                    {done ? (
                      <span className="ep__left">{e.runtime} min · Watched</span>
                    ) : e.progress > 0 ? (
                      <>
                        <span className="ep__left">{left} min left</span>
                        <span className="progress">
                          <span className="progress__fill" style={{ ['--pct' as string]: `${Math.round(e.progress * 100)}%` }} />
                        </span>
                      </>
                    ) : (
                      <span className="ep__left">{e.runtime} min</span>
                    )}
                  </div>
                </div>

                <div className="ep__tools">
                  <button
                    className="check"
                    aria-pressed={done}
                    onClick={() => toggleWatched(e.id, e.watched)}
                  >
                    <IconTick size={12} />
                    {done ? 'Watched' : 'Mark watched'}
                  </button>
                  <button className="check" aria-pressed={e.hasSubs}>
                    <IconSubtitles size={14} />
                    {e.hasSubs ? 'Subtitles' : 'Find subtitles'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </>
  )
}

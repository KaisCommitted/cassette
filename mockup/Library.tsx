/* ===========================================================================
   Cassette — the library.
   What you are part-way through, then everything else. The search filters
   both grids as you type.
   =========================================================================== */
import React, { useMemo, useState } from 'react'
import {
  JCard, Slot, SpoolMark, TapeCounter, Rolling, stockFor, sourceFor,
  IconPlay, IconSearch, IconList, IconTick,
} from './icons'
import { SERIES, FILMS, ONGOING, HERO, hhmm, seasonSpan, Series, Film } from './data'
import { Playing } from './Player'

/* --- one poster: a J-card with the marks laid over it --------------------- */

function Poster({
  id, title, kind, meta, stamp, code, rating, progress, watched, name, sub, onOpen,
}: {
  id: string; title: string; kind: string; meta: string; stamp: string; code: string
  rating: number; progress: number; watched: boolean; name: string; sub: string
  onOpen: () => void
}) {
  return (
    <button className="tile" onClick={onOpen}>
      <span className="tile__art">
        <JCard title={title} kind={kind} meta={meta} stamp={stamp} code={code} stock={stockFor(id)} />
        <span className="tile__badge">{rating.toFixed(1)}</span>
        {watched && (
          <span className="tile__watched">
            <IconTick size={11} /> Watched
          </span>
        )}
        {progress > 0 && !watched && (
          <span className="tile__progress">
            <span className="progress">
              <span className="progress__fill" style={{ ['--pct' as string]: `${Math.round(progress * 100)}%` }} />
            </span>
          </span>
        )}
      </span>
      <span className="tile__name">{name}</span>
      <span className="tile__sub">{sub}</span>
    </button>
  )
}

/* --- the screen ----------------------------------------------------------- */

export default function Library({
  onOpenSeries,
  onPlay,
}: { onOpenSeries: (id: string) => void; onPlay: (p: Playing) => void }) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const series = useMemo(() => SERIES.filter((s) => !q || s.title.toLowerCase().includes(q)), [q])
  const films = useMemo(() => FILMS.filter((f) => !q || f.title.toLowerCase().includes(q)), [q])
  const nothing = q !== '' && series.length === 0 && films.length === 0

  const resumeHero = () =>
    onPlay({
      title: HERO.title,
      where: `${HERO.where} · ${HERO.episodeTitle}`,
      elapsed: HERO.elapsedSeconds,
      total: HERO.totalSeconds,
      counter: 142,
    })

  const seriesSub = (s: Series) =>
    `${s.episodeCount} episodes, ${seasonSpan(s.seasons)}`

  return (
    <>
      <header className="libhead">
        <div className="libhead__inner">
          <div className="libhead__search">
            <IconSearch />
            <input
              className="field"
              type="search"
              placeholder="Search your shelf"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search your shelf"
            />
          </div>
          <div className="libhead__count">
            <span className="counter__label">On the shelf</span>
            <TapeCounter value={series.length + films.length} label="Titles shown" />
          </div>
        </div>
      </header>

      <div className="page">
        {/* ---- the hero: what you left half-finished. It steps out of the way
               as soon as you start searching, so the results are the page. ---- */}
        {!q && (
        <section className="hero" aria-label="Still watching">
          <div className="hero__body">
            <p className="hero__eyebrow">Still watching</p>
            <h2 className="hero__title">{HERO.title}</h2>
            <p className="hero__where">
              {HERO.where} <span className="dot">·</span> {HERO.episodeTitle}{' '}
              <span className="dot">·</span> <Rolling text={String(HERO.minutesLeft)} /> minutes left
            </p>
            <p className="hero__synopsis">{HERO.synopsis}</p>
            <div className="hero__bar">
              <div className="progress">
                <div className="progress__fill" style={{ ['--pct' as string]: `${Math.round(HERO.progress * 100)}%` }} />
              </div>
              <p className="hero__barnote">27:14 of 1:05:40</p>
            </div>
            <div className="hero__actions">
              <button className="btn btn--accent btn--lg" onClick={resumeHero}>
                <IconPlay size={15} />
                Resume
              </button>
              <button className="btn btn--lg" onClick={() => onOpenSeries(HERO.seriesId)}>
                <IconList />
                All episodes
              </button>
            </div>
          </div>

          <div className="hero__art">
            <Slot ratio="16x9" label="backdrop 16:9" tint={2} fill />
            <div className="hero__spools">
              <SpoolMark size={72} />
            </div>
          </div>
        </section>
        )}

        {/* ---- also on the go ---- */}
        {!q && (
          <section className="section" aria-label="Also on the go">
            <div className="section__head">
              <h3 className="section__title">Also on the go</h3>
              <p className="section__note">Five things waiting where you left them</p>
            </div>
            <div className="ongoing">
              {ONGOING.map((o) => (
                <button
                  key={o.id}
                  className="ongoing__card"
                  onClick={() =>
                    onPlay({
                      title: o.title,
                      where: o.where,
                      elapsed: Math.round(o.minutesLeft * 60 * (o.progress / (1 - o.progress))),
                      total: Math.round((o.minutesLeft * 60) / (1 - o.progress)),
                      counter: 100 + Math.round(o.progress * 300),
                    })
                  }
                >
                  <span className="ongoing__art">
                    <Slot ratio="16x9" label="still 16:9" tint={o.tint} />
                    <span className="ongoing__left">{o.minutesLeft} min left</span>
                    <span className="tile__progress">
                      <span className="progress">
                        <span className="progress__fill" style={{ ['--pct' as string]: `${Math.round(o.progress * 100)}%` }} />
                      </span>
                    </span>
                  </span>
                  <span className="ongoing__name">{o.title}</span>
                  <span className="ongoing__sub">{o.where}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---- series ---- */}
        {series.length > 0 && (
          <section className="section" aria-label="Series">
            <div className="section__head">
              <h3 className="section__title">Series</h3>
              <p className="section__note">{series.length} on the shelf</p>
            </div>
            <div className="grid">
              {series.map((s) => (
                <Poster
                  key={s.id}
                  id={s.id}
                  title={s.title}
                  kind="Series"
                  meta={`${s.year}${s.endYear ? `–${s.endYear}` : ''} · ${s.episodeCount} episodes`}
                  stamp={hhmm(s.episodeCount * 47)}
                  code={sourceFor(s.id)}
                  rating={s.rating}
                  progress={s.watchedCount / s.episodeCount}
                  watched={s.watched}
                  name={s.title}
                  sub={seriesSub(s)}
                  onOpen={() => onOpenSeries(s.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ---- films ---- */}
        {films.length > 0 && (
          <section className="section" aria-label="Films">
            <div className="section__head">
              <h3 className="section__title">Films</h3>
              <p className="section__note">{films.length} on the shelf</p>
            </div>
            <div className="grid">
              {films.map((f: Film) => (
                <Poster
                  key={f.id}
                  id={f.id}
                  title={f.title}
                  kind="Film"
                  meta={`${f.year} · ${hhmm(f.runtime)}`}
                  stamp={hhmm(f.runtime)}
                  code={sourceFor(f.id)}
                  rating={f.rating}
                  progress={f.progress}
                  watched={f.watched}
                  name={f.title}
                  sub={
                    f.watched
                      ? `${f.year} · Watched`
                      : f.progress > 0
                        ? `${f.year} · ${Math.round(f.runtime * (1 - f.progress))} min left`
                        : `${f.year} · ${hhmm(f.runtime)}`
                  }
                  onOpen={() =>
                    onPlay({
                      title: f.title,
                      where: `Film · ${f.year}`,
                      elapsed: Math.round(f.runtime * 60 * f.progress),
                      total: f.runtime * 60,
                      counter: 12 + Math.round(f.progress * 400),
                    })
                  }
                />
              ))}
            </div>
          </section>
        )}

        {nothing && (
          <div className="empty">
            <strong>Nothing matches that.</strong>
            Try part of a title.
          </div>
        )}
      </div>
    </>
  )
}

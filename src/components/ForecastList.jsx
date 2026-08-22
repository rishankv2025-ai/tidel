import { useState } from 'react'
import { fmtHt, availableDays, extremesForDay, toDatum } from '../lib/tide.js'
import { t, localeFor } from '../lib/i18n.js'

export default function ForecastList({ ex, startKey, lang, datum, mslOffset }) {
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState({})
  const L = t(lang)
  const loc = localeFor(lang)

  const all = availableDays(ex)
  const days = all.filter(k => k >= startKey).slice(0, 7)

  const toggle = k => setOpen(o => ({ ...o, [k]: !o[k] }))
  const filterLabel = f => f === 'all' ? L.filterAll : f === 'high' ? L.filterHigh : L.filterLow
  // for "No <x> tides this day" — the bare tide word, not the filter button label
  const filterWord = f => f === 'all' ? '' : f === 'high' ? L.high : L.low

  // Every day shows two highs and two lows, because a row that changes width day
  // to day is hard to read across and the fourth tile is almost always there in
  // reality — it has just drifted across midnight.
  //
  // The raw data is not uniform. Over 29 days: 24 days carry four extremes, four
  // carry three, one carries six.
  //
  // Short days: the semidiurnal cycle is about 12h25m, so the pattern slips ~50
  // minutes later each day and roughly every fortnight the fourth extreme falls
  // past midnight. It is a real tide belonging to this cycle, so it is pulled
  // back in and tagged as tomorrow's. That does mean it appears twice while
  // scrolling — once here, once as tomorrow's own first tile — which is the
  // trade for never showing a short row.
  //
  // Long days: those extra extremes are shallow-water ripples on a plateau, not
  // separate tides. On 23 Aug the last four sit within 0.05 m of one another.
  // Ranking by height keeps the two that matter and drops the wobble.
  const PER_TYPE = 2

  // two lowest lows, or two highest highs
  const pick = (list, type) => list
    .filter(t2 => t2.type === type)
    .sort((a, b) => type === 'high' ? b.m - a.m : a.m - b.m)
    .slice(0, PER_TYPE)

  const rowFor = (k) => {
    const own = extremesForDay(ex, k)
    const out = []

    for (const type of ['high', 'low']) {
      const chosen = pick(own, type)
      out.push(...chosen.map(t2 => ({ t: t2, next: false })))

      // Short of two of this type — walk forward through the following days and
      // take the earliest of the missing type. Scanning days rather than only
      // the next one means a gap at the end of the table cannot leave a hole.
      let need = PER_TYPE - chosen.length
      for (let i = all.indexOf(k) + 1; need > 0 && i < all.length; i++) {
        for (const t2 of extremesForDay(ex, all[i])) {
          if (need === 0 || t2.type !== type) continue
          out.push({ t: t2, next: true })
          need--
        }
      }
    }

    // Chronological. A borrowed tide is always later than the day's own, so this
    // naturally lands it at the end of the row.
    return out
      .sort((a, b) => a.t.ts - b.t.ts)
      .filter(({ t: t2 }) => filter === 'all' || t2.type === filter)
  }

  return (
    <div className="glass pad section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="title" style={{ margin: 0 }}>{L.forecastTitle}</h2>
        <div className="filters">
          {['all', 'high', 'low'].map(f => (
            <button key={f} className={'btn' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>
              {filterLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {days.map((k, i) => {
        const d = new Date(k + 'T00:00:00')
        const tides = rowFor(k)
        const collapsed = open[k] === undefined ? i > 0 : !open[k]
        return (
          <div className="day" key={k}>
            <div className="dhead" onClick={() => toggle(k)}>
              <span className="dname">{d.toLocaleDateString(loc, { weekday: 'long' })}</span>
              <span className="ddate">
                {d.toLocaleDateString(loc, { day: 'numeric', month: 'long' })} {collapsed ? '▸' : '▾'}
              </span>
            </div>
            {!collapsed && (
              <div className="tiles">
                {tides.length ? tides.map(({ t: t2, next }, j) => (
                  <div className={'tile ' + t2.type + (next ? ' nextday' : '')} key={j}>
                    <span className="tt">{t2.type === 'high' ? L.high : L.low}</span>
                    <span className="tm">{t2.disp}</span>
                    <span className="th">
                      {fmtHt(toDatum(t2.m, mslOffset, datum))}
                      {/* name the day it really falls on, so a borrowed tile is
                          never mistaken for one of this day's own */}
                      {next && <em className="nd">{L.nextDay}</em>}
                    </span>
                  </div>
                )) : <span className="ddate">{L.noTidesFiltered(filterWord(filter))}</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

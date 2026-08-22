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

  // Each day shows exactly the tides that fall on it — nothing borrowed.
  //
  // Most days have four, but some genuinely have three: the semidiurnal cycle is
  // about 12h25m, so the pattern drifts ~50 minutes later each day and roughly
  // every fortnight the fourth extreme slips past midnight into the next day.
  // A few days have more than four, where a shallow secondary extremum shows up.
  //
  // This used to pad short rows to four by pulling the next day's opening tides
  // in and tagging them "next day". Every tile was a real tide, but the same tide
  // then appeared twice in one scroll — once as tomorrow's borrowed tile and again
  // as tomorrow's own first tile. Reading a tide off the wrong day is worse than
  // seeing a row of three, so the day now stands on its own.
  const rowFor = k => extremesForDay(ex, k)
    .filter(t2 => filter === 'all' || t2.type === filter)

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
                {tides.length ? tides.map((t2, j) => (
                  <div className={'tile ' + t2.type} key={j}>
                    <span className="tt">{t2.type === 'high' ? L.high : L.low}</span>
                    <span className="tm">{t2.disp}</span>
                    <span className="th">{fmtHt(toDatum(t2.m, mslOffset, datum))}</span>
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

import { useState } from 'react'
import { fmtHt, availableDays, extremesForDay } from '../lib/tide.js'
import { t, localeFor } from '../lib/i18n.js'

export default function ForecastList({ ex, startKey, lang }) {
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

  // Most days have four tides, but some genuinely have three. The semidiurnal
  // cycle is about 12h25m, so the pattern drifts ~50 minutes later each day and
  // roughly every fortnight the fourth extreme slips past midnight into the next
  // day. In this dataset 30 Jul, 7 Aug, 13 Aug and 22 Aug each have three; the
  // "missing" one is the next morning's first tide (30 Jul's is 31 Jul 00:10).
  //
  // A three-tile row looks broken even though the data is right, so borrow the
  // next day's opening tides to fill out to four and mark them as belonging to
  // tomorrow. Borrowing invents nothing — every tile is a real tide, just
  // labelled with the day it actually falls on.
  //
  // Only when showing everything: under "High only" or "Low only" a short row is
  // the honest answer to the filter, and padding it would misrepresent the day.
  const TILES = 4
  const rowFor = (k, idx) => {
    const own = extremesForDay(ex, k).filter(t2 => filter === 'all' || t2.type === filter)
    if (filter !== 'all' || own.length >= TILES) return own.map(t2 => ({ t: t2, next: false }))
    const nextKey = days[idx + 1] || all[all.indexOf(k) + 1]
    const borrowed = nextKey
      ? extremesForDay(ex, nextKey).slice(0, TILES - own.length).map(t2 => ({ t: t2, next: true }))
      : []
    return [...own.map(t2 => ({ t: t2, next: false })), ...borrowed]
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
        const tides = rowFor(k, i)
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
                      {fmtHt(t2.m)}
                      {/* say which day it belongs to, so a borrowed tile is never
                          mistaken for one of this day's own */}
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

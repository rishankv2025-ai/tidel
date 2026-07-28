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
        const tides = extremesForDay(ex, k).filter(t2 => filter === 'all' || t2.type === filter)
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
                    <span className="th">{fmtHt(t2.m)}</span>
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

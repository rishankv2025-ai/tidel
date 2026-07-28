import { levelAt, fmtHt } from '../lib/tide.js'
import { t } from '../lib/i18n.js'

const Wave = () => (
  <svg viewBox="0 0 120 16" preserveAspectRatio="none">
    <path d="M0 9 Q 15 1 30 9 T 60 9 T 90 9 T 120 9 V16 H0 Z" fill="#3fd0ff" />
  </svg>
)

export default function TideDashboardCard({ ex, range, isToday, refTs, stationLabel, lang }) {
  const L = t(lang)
  const cur = levelAt(ex, refTs)
  const span = (range.max - range.min) || 1
  const frac = cur ? (cur.m - range.min) / span : 0.5
  const pct = Math.max(8, Math.min(96, frac * 100))
  const next = ex.find(e => e.ts > refTs)

  return (
    <div className="glass pad tidecard">
      <h2 className="title">{L.tideTitle} — {isToday ? L.now : L.atNoon}</h2>
      <div className="tidehead">
        <div>
          <div className="lvl">{cur ? cur.m.toFixed(2) : '—'} <small>m</small></div>
          <div className="hint">{stationLabel} · {L.aboveDatum}</div>
        </div>
        <span className={'chip ' + (cur && cur.rising ? 'rise' : 'fall')}>
          {cur && cur.rising ? L.rising : L.falling}
        </span>
      </div>

      <div className="wavebox">
        <span className="gauge">{range.min.toFixed(1)}–{range.max.toFixed(1)} m</span>
        <div className="water" style={{ height: pct + '%' }}>
          <div className="wave w1"><Wave /><Wave /></div>
          <div className="wave w2"><Wave /><Wave /></div>
          <div className="fill" />
        </div>
      </div>

      <div className="nextline">
        {next
          ? L.nextTide(next.type === 'high' ? L.high : L.low, next.disp, fmtHt(next.m))
              .map((p, i) => typeof p === 'string' ? p : <b key={i}>{p.b}</b>)
          : L.noFurtherTides}
      </div>
    </div>
  )
}

import { useMemo } from 'react'
import { localeFor } from '../lib/i18n.js'

// ── Per-report line chart ───────────────────────────────────────────────────
//
// Form: catch weight over time, one point per report. The job is change over
// time plus "which report was that", so a line with visible markers is right —
// bars would imply each report is a category, and the sequence is the point.
//
// Y runs 0 -> max, as asked. Starting at zero matters here: a truncated axis
// exaggerates differences, and with catch weights the distance from zero IS the
// quantity, so a non-zero baseline would misrepresent every point.
//
// One series, so no legend — the heading names it. Markers are 9px (the skill's
// floor is 8) with a much larger transparent hit circle, because on a phone the
// finger target has to be far bigger than the dot.
export default function CatchLineChart({ rows, selectedId, onPick, lang, L }) {
  const W = 640, H = 240
  const PAD = { l: 42, r: 14, t: 14, b: 30 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b

  const geom = useMemo(() => {
    if (!rows.length) return null
    const ts = rows.map(r => new Date(r.at).getTime())
    const t0 = Math.min(...ts), t1 = Math.max(...ts)
    const span = t1 - t0 || 1
    const max = Math.max(...rows.map(r => r.kg), 0.1)
    // a round-ish top so the axis labels read cleanly
    const top = max <= 1 ? Math.ceil(max * 10) / 10 : Math.ceil(max)
    const x = i => PAD.l + (rows.length === 1 ? iw / 2 : ((ts[i] - t0) / span) * iw)
    const y = v => PAD.t + ih - (v / top) * ih
    return { pts: rows.map((r, i) => ({ r, x: x(i), y: y(r.kg) })), top, t0, t1 }
  }, [rows])

  if (!geom) return null
  const { pts, top } = geom
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const ticks = [0, top / 2, top]
  // one decimal rule for the whole axis, or the ticks read 0.00 / 5.0 / 10.0
  const dec = top < 1 ? 2 : top < 10 ? 1 : 0
  const fmtDay = ms => new Date(ms).toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'short' })

  return (
    <div className="lc">
      <svg viewBox={`0 0 ${W} ${H}`} className="lcsvg" role="img"
        aria-label={`${L.dashEveryReport}: ${rows.length}`}>
        {/* recessive grid — present for reading values, never competing with the data */}
        {ticks.map((v, i) => {
          const yy = PAD.t + ih - (v / top) * ih
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} className="lcgrid" />
              <text x={PAD.l - 8} y={yy + 4} className="lctick" textAnchor="end">{v.toFixed(dec)}</text>
            </g>
          )
        })}
        <text x={PAD.l - 8} y={PAD.t - 4} className="lcaxis" textAnchor="end">{L.dashAxisKg}</text>
        <text x={PAD.l} y={H - 8} className="lctick" textAnchor="start">{fmtDay(geom.t0)}</text>
        {rows.length > 1 && <text x={W - PAD.r} y={H - 8} className="lctick" textAnchor="end">{fmtDay(geom.t1)}</text>}

        <path d={path} className="lcline" />

        {pts.map(p => (
          <g key={p.r.id}
            onClick={() => onPick(p.r.id === selectedId ? null : p.r.id)}
            className={'lcpt' + (p.r.id === selectedId ? ' on' : '')}>
            {/* oversized invisible target: a 9px dot is not a finger target */}
            <circle cx={p.x} cy={p.y} r="18" className="lchit" />
            <circle cx={p.x} cy={p.y} r={p.r.id === selectedId ? 7 : 4.5} className="lcdot" />
            <title>{`${p.r.kg} ${L.dashAxisKg} · ${new Date(p.r.at).toLocaleString(localeFor(lang))}`}</title>
          </g>
        ))}
      </svg>
      <div className="hint">{L.dashPickPoint}</div>
    </div>
  )
}

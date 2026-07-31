import { Fragment, useEffect, useMemo, useState } from 'react'
import { t, phaseName, localeFor } from '../lib/i18n.js'

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
function LineChart({ rows, selectedId, onPick, lang, L }) {
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

function bucketLabel(v, lang, L) {
  const map = {
    rising: L.bRising, falling: L.bFalling,
    fish: L.fish, crab: L.crab, other: L.other,
    Night: L.bNight, Morning: L.bMorning, Afternoon: L.bAfternoon, Evening: L.bEvening,
  }
  if (map[v]) return map[v]
  return phaseName(lang, v) || v
}

const FACTOR_LABELS = L => ({
  tideState: L.fTideState, moonPhase: L.fMoonPhase, tideHeight: L.fTideHeightBand,
  wind: L.fWindBand, wave: L.fWaveBand, timeOfDay: L.fTimeOfDay,
  catchType: L.fCatchKind, location: L.fLocation,
})

export default function CatchDashboard({ lang, onClose }) {
  const L = t(lang)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState('chart')
  const [selId, setSelId] = useState(null)

  useEffect(() => {
    let live = true
    fetch('/api/catch-stats')
      .then(async r => {
        // Under plain `vite dev` there is no function: the SPA fallback answers
        // with index.html and a 200. Report "not configured" rather than a
        // misleading load failure.
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) return { configured: false }
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then(d => { if (live) setData(d) })
      .catch(e => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [])

  const labels = FACTOR_LABELS(L)
  const rows = (data && data.rows) || []
  const sel = rows.find(r => r.id === selId) || null
  const fmtWhen = iso => new Date(iso).toLocaleString(localeFor(lang),
    { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
  const val = (v, unit) => (v == null || v === '' ? <small>{L.dashNoData}</small> : `${v}${unit || ''}`)

  // "When is the catch biggest" — only from buckets that clear the sample-size
  // floor. An average over three trips is not an answer to that question.
  const topConditions = useMemo(() => {
    if (!data || !data.factors) return []
    return data.factors
      .flatMap(f => f.buckets.filter(b => b.reliable).map(b => ({ factor: f.label, ...b })))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 4)
  }, [data])

  return (
    <div className="glass pad section">
      <div className="notif" style={{ marginBottom: 4 }}>
        <h2 className="title" style={{ margin: 0 }}>{L.dashTitle}</h2>
        <button className="btn" onClick={onClose}>{L.closeDash}</button>
      </div>

      {err && <div className="warn">{L.dashFail}</div>}
      {!data && !err && <p className="hint">{L.dashLoading}</p>}
      {data && data.configured === false && <div className="warn">{L.dashNotConfigured}</div>}
      {data && data.configured && data.total === 0 && <div className="warn">{L.dashEmpty}</div>}

      {data && data.configured && data.total > 0 && (
        <>
          <div className="mmeta" style={{ marginTop: 12 }}>
            <div><div className="k">{L.dashReports}</div><div className="v">{data.total}</div></div>
            <div><div className="k">{L.dashOverallAvg}</div><div className="v">{data.overallAvg} <small>kg</small></div></div>
          </div>

          <div className="filters" style={{ marginTop: 14 }}>
            {['chart', 'table'].map(v => (
              <button key={v} className={'btn' + (view === v ? ' on' : '')} onClick={() => setView(v)}>
                {v === 'chart' ? L.dashChart : L.dashTable}
              </button>
            ))}
          </div>

          {view === 'chart' ? (
            <>
              <h3 className="fctitle" style={{ marginTop: 16 }}>{L.dashEveryReport}</h3>
              <LineChart rows={rows} selectedId={selId} onPick={setSelId} lang={lang} L={L} />

              {sel && (
                <div className="rdetail">
                  <div className="notif" style={{ marginBottom: 8 }}>
                    <b>{L.dashReportN(sel.id)}</b>
                    <button className="btn" onClick={() => setSelId(null)}>{L.dashCloseDetail}</button>
                  </div>
                  <div className="mmeta">
                    <div><div className="k">{L.dashQty}</div><div className="v">{sel.kg} <small>kg</small></div></div>
                    <div><div className="k">{L.dashCaught}</div><div className="v">{bucketLabel(sel.type, lang, L)}{sel.other ? ` · ${sel.other}` : ''}</div></div>
                    <div><div className="k">{L.dashWhen}</div><div className="v" style={{ fontSize: '.92rem' }}>{fmtWhen(sel.at)}</div></div>
                    <div><div className="k">{L.dashPlace}</div><div className="v" style={{ fontSize: '.92rem' }}>{sel.place || <small>{L.dashNoData}</small>}</div></div>
                    <div><div className="k">{L.dashDevice}</div><div className="v" style={{ fontSize: '.92rem', fontFamily: 'monospace' }}>{sel.device || <small>{L.dashNoData}</small>}</div></div>
                  </div>
                  <div className="k" style={{ marginTop: 14, marginBottom: 6 }}>{L.dashConditions}</div>
                  <div className="mmeta">
                    <div><div className="k">{L.fTideState}</div><div className="v">{sel.tideState ? bucketLabel(sel.tideState, lang, L) : <small>{L.dashNoData}</small>}</div></div>
                    <div><div className="k">{L.fTideHeight}</div><div className="v">{val(sel.tideHeight, ' m')}</div></div>
                    <div><div className="k">{L.fMoonPhase}</div><div className="v" style={{ fontSize: '.92rem' }}>{sel.moon ? phaseName(lang, sel.moon) : <small>{L.dashNoData}</small>}</div></div>
                    <div><div className="k">{L.illumination}</div><div className="v">{val(sel.moonIllum, '%')}</div></div>
                    <div><div className="k">{L.fWindSpeed}</div><div className="v">{val(sel.wind, ' km/h')}</div></div>
                    <div><div className="k">{L.waveHeight}</div><div className="v">{val(sel.wave, ' m')}</div></div>
                    <div><div className="k">{L.humidity}</div><div className="v">{val(sel.humidity, '%')}</div></div>
                  </div>
                  {sel.notes && (
                    <>
                      <div className="k" style={{ marginTop: 12 }}>{L.dashNotes}</div>
                      <div className="hint" style={{ fontSize: '.86rem', color: 'var(--txt)' }}>{sel.notes}</div>
                    </>
                  )}
                </div>
              )}

              {/* the question the whole dashboard exists to answer */}
              <div className="biggest">
                <h3 className="fctitle">{L.dashBiggest}</h3>
                {topConditions.length === 0
                  ? <div className="warn">{L.dashBiggestNone(data.minN)}</div>
                  : (
                    <>
                      <div className="hint" style={{ marginBottom: 8 }}>{L.dashBiggestLead}</div>
                      {topConditions.map((c, i) => (
                        <div className="bigrow" key={i}>
                          <span className="bigk">{labels[c.factor] || c.factor}</span>
                          <span className="bigv">{bucketLabel(c.bucket, lang, L)}</span>
                          <span className="bign">{c.avg} <small>kg</small> <em>{L.dashSamples(c.n)}</em></span>
                        </div>
                      ))}
                    </>
                  )}
                <div className="hint" style={{ marginTop: 10 }}>{L.dashCaveat(data.minN)}</div>
              </div>
            </>
          ) : (
            <div className="tablewrap">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>#</th><th>{L.dashWhen}</th><th>{L.dashCaught}</th><th>kg</th>
                    <th>{L.dashPlace}</th><th>{L.fTideState}</th><th>m</th>
                    <th>{L.fMoonPhase}</th><th>%</th>
                    <th>km/h</th><th>{L.waveHeight}</th><th>{L.dashDevice}</th><th>{L.dashNotes}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map(r => (
                    <tr key={r.id} className={r.id === selId ? 'selrow' : ''} onClick={() => setSelId(r.id)}>
                      <td>{r.id}</td>
                      <td className="nowrap">{fmtWhen(r.at)}</td>
                      <td>{bucketLabel(r.type, lang, L)}{r.other ? ` (${r.other})` : ''}</td>
                      <td>{r.kg}</td>
                      <td>{r.place || '—'}</td>
                      <td>{r.tideState ? bucketLabel(r.tideState, lang, L) : '—'}</td>
                      <td>{r.tideHeight ?? '—'}</td>
                      <td>{r.moon ? phaseName(lang, r.moon) : '—'}</td>
                      <td>{r.moonIllum ?? '—'}</td>
                      <td>{r.wind ?? '—'}</td>
                      <td>{r.wave ?? '—'}</td>
                      <td className="mono">{r.device || '—'}</td>
                      <td>{r.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

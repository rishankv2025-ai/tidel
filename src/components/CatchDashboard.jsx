import { useEffect, useMemo, useState } from 'react'
import { t, phaseName, localeFor } from '../lib/i18n.js'
import CatchLineChart from './CatchLineChart.jsx'

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
              <CatchLineChart rows={rows} selectedId={selId} onPick={setSelId} lang={lang} L={L} />

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

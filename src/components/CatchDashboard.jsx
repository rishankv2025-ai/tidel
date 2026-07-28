import { Fragment, useEffect, useState } from 'react'
import { t, phaseName } from '../lib/i18n.js'

// Horizontal bars, one series per factor.
//
// Design notes, because the choices here are deliberate:
//  * Horizontal, because the category labels are long ("Waxing Crescent",
//    "10–20 km/h") and would collide as rotated x-axis ticks.
//  * Magnitude is carried by BAR LENGTH and SORT ORDER, not by colour. The
//    obvious idea — green for good, orange for bad — fails colour-vision
//    checks: that pair separates by only ΔE 6.7 under deuteranopia. Position
//    encoding is safe by construction.
//  * A dashed reference line marks the overall average, so "above/below
//    typical" is readable without colour too.
//  * One series per chart, so no legend is needed — the heading names it.
//  * Every bar shows its sample size, and thin groups are dimmed and excluded
//    from the headline. An average over three trips is not a finding.
function FactorChart({ label, buckets, overallAvg, minN, lang, L }) {
  const max = Math.max(...buckets.map(b => b.avg), overallAvg || 0) || 1
  const pct = v => Math.max(1.5, (v / max) * 100)

  return (
    <div className="fchart">
      <h3 className="fctitle">
        {label}
        {/* the dashed reference line needs naming, or it reads as decoration */}
        {overallAvg > 0 && <span className="fcmeankey">┄ {L.dashMeanLine} {overallAvg} kg</span>}
      </h3>
      <div className="fcbars" style={{ '--meanpct': `${pct(overallAvg)}%` }}>
        {/* reference line at the overall average — position, not colour */}
        {overallAvg > 0 && <span className="fcmean" aria-hidden="true" />}
        {buckets.map(b => (
          <div className={'fcrow' + (b.reliable ? '' : ' thin')} key={b.bucket}>
            <span className="fclabel" title={b.bucket}>{bucketLabel(b.bucket, lang, L)}</span>
            <span className="fctrack">
              <span
                className="fcbar"
                style={{ width: `${pct(b.avg)}%` }}
                title={`${b.avg} kg · ${L.dashSamples(b.n)}${b.sd != null ? ` · sd ${b.sd}` : ''}`}
              />
            </span>
            <span className="fcval">
              {b.avg}<small> kg</small>
              <em className="fcn">{L.dashSamples(b.n)}{b.reliable ? '' : ` · ${L.dashTooFew}`}</em>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// DB values are canonical English; render them in the chosen language.
function bucketLabel(v, lang, L) {
  const map = {
    rising: L.bRising, falling: L.bFalling,
    fish: L.fish, crab: L.crab, other: L.other,
    Night: L.bNight, Morning: L.bMorning, Afternoon: L.bAfternoon, Evening: L.bEvening,
  }
  if (map[v]) return map[v]
  const moon = phaseName(lang, v)      // passes through unchanged if not a phase
  return moon || v
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

  useEffect(() => {
    let live = true
    fetch('/api/catch-stats')
      .then(async r => {
        // Under plain `vite dev` there is no function: the SPA fallback answers
        // with index.html and a 200. Detect that and report "not configured"
        // rather than a misleading load failure.
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
            {data.best && (
              <div><div className="k">{L.dashBest}</div>
                <div className="v" style={{ fontSize: '.95rem' }}>
                  {bucketLabel(data.best.bucket, lang, L)} · {data.best.avg} kg <small>{L.dashSamples(data.best.n)}</small>
                </div></div>
            )}
            {data.worst && (
              <div><div className="k">{L.dashWorst}</div>
                <div className="v" style={{ fontSize: '.95rem' }}>
                  {bucketLabel(data.worst.bucket, lang, L)} · {data.worst.avg} kg <small>{L.dashSamples(data.worst.n)}</small>
                </div></div>
            )}
          </div>

          {/* If nothing clears the threshold, say so plainly instead of
              presenting noise as insight. */}
          {data.reliableBuckets === 0 && <div className="warn">{L.dashThin(data.minN)}</div>}

          <div className="filters" style={{ marginTop: 14 }}>
            {['chart', 'table'].map(v => (
              <button key={v} className={'btn' + (view === v ? ' on' : '')} onClick={() => setView(v)}>
                {v === 'chart' ? L.dashChart : L.dashTable}
              </button>
            ))}
          </div>

          {view === 'chart'
            ? data.factors.filter(f => f.buckets.length).map(f => (
                <FactorChart
                  key={f.label}
                  label={labels[f.label] || f.label}
                  buckets={f.buckets}
                  overallAvg={data.overallAvg}
                  minN={data.minN}
                  lang={lang}
                  L={L}
                />
              ))
            : (
              /* table view is the accessibility path — same numbers, no geometry */
              <div className="tablewrap">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th>{L.dashTitle}</th><th>kg</th><th>n</th><th>sd</th><th>max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.factors.filter(f => f.buckets.length).map(f => (
                      // key belongs on the Fragment, not its children, or React
                      // cannot reconcile the group and warns
                      <Fragment key={f.label}>
                        <tr className="dgroup"><td colSpan="5">{labels[f.label] || f.label}</td></tr>
                        {f.buckets.map(b => (
                          <tr key={f.label + b.bucket} className={b.reliable ? '' : 'thin'}>
                            <td>{bucketLabel(b.bucket, lang, L)}</td>
                            <td>{b.avg}</td><td>{b.n}</td><td>{b.sd ?? '—'}</td><td>{b.max}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          <div className="hint" style={{ marginTop: 12 }}>{L.dashCaveat(data.minN)}</div>
        </>
      )}
    </div>
  )
}

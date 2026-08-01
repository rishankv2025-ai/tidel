import { useEffect, useMemo, useState } from 'react'
import { fetchWeather, compass, fetchMonthWaves, monthTideStats } from '../lib/weather.js'
import { t, localeFor } from '../lib/i18n.js'

const n1 = v => (v == null ? '—' : Number(v).toFixed(1))
const n0 = v => (v == null ? '—' : Math.round(Number(v)))
const n2 = v => (v == null ? '—' : Number(v).toFixed(2))

// The provenance footnote (model time, model names, and what the ± means) was
// removed from this card. The ± figures themselves stay on the humidity and wind
// values, so the disagreement between models is still visible — just no longer
// explained here. weather.js still returns observedAt, gridOffsetKm and both
// spreads; they are data, not display, so restoring the note needs no rewrite.

export default function WeatherCard({ lat, lon, lang, onLoad, ex }) {
  const L = t(lang)
  const [w, setW] = useState(null)
  const [err, setErr] = useState('')
  const [month, setMonth] = useState(undefined)   // undefined = loading, null = none

  // What the sea has actually done this month, so "18 km/h" can be read as calm
  // or rough for the season rather than as a bare number.
  useEffect(() => {
    if (lat == null || lon == null) return
    let live = true
    setMonth(undefined)
    fetchMonthWaves(lat, lon)
      .then(d => { if (live) setMonth(d) })
      .catch(() => { if (live) setMonth(null) })
    return () => { live = false }
  }, [lat, lon])

  const tideMonth = useMemo(() => (ex && ex.length ? monthTideStats(ex) : null), [ex])
  const dayName = iso => new Date(iso + 'T12:00:00').toLocaleDateString(localeFor(lang),
    { day: 'numeric', month: 'short' })

  useEffect(() => {
    if (lat == null || lon == null) return
    let live = true
    setErr(''); setW(null)
    fetchWeather(lat, lon)
      .then(d => { if (!live) return; setW(d); onLoad && onLoad(d) })
      .catch(e => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [lat, lon])

  return (
    <div className="glass pad section">
      <h2 className="title">{L.weatherTitle}</h2>

      {err && <div className="warn">{L.weatherFail}</div>}
      {!w && !err && <p className="hint">{L.weatherLoading}</p>}

      {w && (
        <>
          <div className="wxhead">
            <div>
              <div className="lvl">
                {n1(w.windSpeed)} <small>km/h{w.windSpread ? ` ±${n1(w.windSpread)}` : ''}</small>
              </div>
              <div className="hint">{L.wind} · {compass(w.windDir, lang)} ({n0(w.windDir)}°)</div>
            </div>
            <span className="chip rise">{L.gusts} {n1(w.windGust)} km/h</span>
          </div>

          <div className="mmeta">
            <div>
              <div className="k">{L.humidity}</div>
              <div className="v">{n0(w.humidity)}% {w.humiditySpread ? <small>±{n0(w.humiditySpread)}</small> : null}</div>
            </div>
            <div><div className="k">{L.altitude}</div><div className="v">{n1(w.elevation)} <small>m</small></div></div>
            <div><div className="k">{L.temp}</div><div className="v">{n1(w.temp)}°C</div></div>
            <div><div className="k">{L.feelsLike}</div><div className="v">{n1(w.feels)}°C</div></div>
            <div><div className="k">{L.pressure}</div><div className="v">{n0(w.pressure)} <small>hPa</small></div></div>
            <div><div className="k">{L.rain}</div><div className="v">{n1(w.precip)} <small>mm</small></div></div>
            <div>
              <div className="k">{L.waveHeight}</div>
              <div className="v">
                {w.waveHeight == null
                  ? <small>{L.noWaveData}</small>
                  : <>{n1(w.waveHeight)} <small>m · {compass(w.waveDir, lang)}</small></>}
              </div>
            </div>
            <div>
              <div className="k">{L.wavePeriod}</div>
              <div className="v">{w.wavePeriod == null ? '—' : <>{n1(w.wavePeriod)} <small>s</small></>}</div>
            </div>
          </div>

          {/* Recorded, not forecast: Open-Meteo serves daily marine aggregates
              for past dates, and the tide figures come from the bundled table.
              The day count is shown because the tide table covers a rolling
              ~30 days rather than a calendar month, so early in a month it can
              legitimately hold only a few days. */}
          {(month !== null || tideMonth) && (
            <div className="monthnote">
              <div className="mnhead">{L.monthTitle}</div>

              {month === undefined && <div className="hint">{L.monthLoading}</div>}

              {/* Just the bounds: lowest and highest for this place. No dates —
                  the question is "how low and how high does it get here", not
                  "when". */}
              <div className="mngrid">
                <div className="mnh" />
                <div className="mnh">{L.monthMin}</div>
                <div className="mnh">{L.monthMax}</div>

                {tideMonth && (
                  <>
                    <div className="mnlabel">🌘 {L.monthTides}</div>
                    <div className="mnnum">{n2(tideMonth.lo)} <small>m</small></div>
                    <div className="mnnum">{n2(tideMonth.hi)} <small>m</small></div>
                  </>
                )}
                {month && (
                  <>
                    <div className="mnlabel">🌊 {L.monthWaveHeight}</div>
                    <div className="mnnum">{n1(month.minH)} <small>m</small></div>
                    <div className="mnnum">{n1(month.maxH)} <small>m</small></div>
                  </>
                )}
                {month && month.maxP != null && (
                  <>
                    <div className="mnlabel">〰 {L.monthSwell}</div>
                    <div className="mnnum">{n1(month.minP)} <small>s</small></div>
                    <div className="mnnum">{n1(month.maxP)} <small>s</small></div>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

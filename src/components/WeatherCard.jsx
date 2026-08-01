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

              {month && (
                <div className="mnrow">
                  <span className="mnk">🌊 {L.monthWaves}</span>
                  <span className="mnv">
                    <b>{n1(month.minH)}–{n1(month.maxH)} m</b>
                    <small> · {L.monthTypical} {n1(month.avgH)} m · {L.monthBiggest(dayName(month.biggestDay))}</small>
                    {month.maxP != null && <small> · {L.monthPeriodUpTo} {n1(month.maxP)} s</small>}
                    <em className="mnn">{L.monthSpan(dayName(month.from), dayName(month.to), month.days)}</em>
                  </span>
                </div>
              )}

              {tideMonth && (
                <div className="mnrow">
                  <span className="mnk">🌘 {L.monthTides}</span>
                  <span className="mnv">
                    <b>{n2(tideMonth.lo)}–{n2(tideMonth.hi)} m</b>
                    <small> · {L.monthTideRange} {n2(tideMonth.range)} m</small>
                    <small> · {L.high} {dayName(tideMonth.hiDate)} {tideMonth.hiTime} · {L.low} {dayName(tideMonth.loDate)} {tideMonth.loTime}</small>
                    <em className="mnn">{L.monthSpan(dayName(tideMonth.from), dayName(tideMonth.to), tideMonth.days)}</em>
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

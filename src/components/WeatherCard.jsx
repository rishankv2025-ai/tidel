import { useEffect, useState } from 'react'
import { fetchWeather, compass } from '../lib/weather.js'
import { t, localeFor } from '../lib/i18n.js'

const n1 = v => (v == null ? '—' : Number(v).toFixed(1))
const n0 = v => (v == null ? '—' : Math.round(Number(v)))

// Open-Meteo returns a bare local ISO string like "2026-07-27T03:15" (already in
// Asia/Kolkata because of the timezone param). Render it as a readable clock time
// rather than dumping the raw ISO at the user.
function fmtModelTime(iso, lang) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(localeFor(lang), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function WeatherCard({ lat, lon, lang, onLoad }) {
  const L = t(lang)
  const [w, setW] = useState(null)
  const [err, setErr] = useState('')

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

          <div className="hint" style={{ marginTop: 12 }}>
            {L.modelTime} {fmtModelTime(w.observedAt, lang)} · {L.weatherSrc}
            {(w.humiditySpread != null || w.windSpread != null) && <><br />{L.spreadNote}</>}
            {w.gridOffsetKm != null && <><br />{L.gridOffset(w.gridOffsetKm.toFixed(1))}</>}
          </div>
        </>
      )}
    </div>
  )
}

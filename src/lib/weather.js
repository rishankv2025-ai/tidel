// Current conditions from Open-Meteo. No API key, and the service sends
// access-control-allow-origin:* so the browser calls it directly — no proxy.
// Two endpoints: land (wind/humidity/elevation) and marine (waves).
//
// IMPORTANT, and surfaced in the UI: these are FORECAST MODEL values, not
// observations. There is no tide gauge or weather station behind them. The
// request is snapped to the nearest model grid point, which around Kannur sits
// 5–8 km away — close enough that Azhikkal, Mattool and Puthiyangadi all land in
// the SAME cell and return identical wind and humidity. Model spread on the same
// point is real too (~12 points of humidity between GFS and ECMWF).
//
// `elevation` is the exception: it is a Copernicus DEM lookup at the requested
// coordinate (~90 m resolution), not a grid-cell value, and varies over ~100 m.

import { haversineKm } from './tide.js'

const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const MARINE = 'https://marine-api.open-meteo.com/v1/marine'

const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'precipitation', 'surface_pressure', 'wind_speed_10m',
  'wind_direction_10m', 'wind_gusts_10m',
].join(',')

// Model choice, measured against METAR at 8 Indian airport instruments (the
// model was queried at each instrument's own coordinate, so this isolates model
// error from grid distance):
//
//   model          humidity bias / abs err    wind abs err
//   best_match       +4.5pt / 7.7pt            4.3 km/h   <- Open-Meteo default
//   gfs_seamless     -4.4pt / 7.7pt            3.4 km/h   <- best wind
//   ecmwf_ifs025     +5.1pt / 8.9pt            3.9 km/h
//   icon_seamless    +1.4pt / 5.2pt            5.1 km/h   <- best humidity
//
// The default is best at neither, and pins humidity near 99% on the Kerala coast
// (instruments at Calicut and Mangalore both read 89%). So take moisture and
// temperature from ICON and wind from GFS, and keep the disagreement between
// them as an honest uncertainty figure rather than showing false precision.
//
// NOTE: `current=` silently ignores all but one model when several are passed to
// one request — each model genuinely needs its own call.
const MODEL_THERMO = 'icon_seamless'
const MODEL_WIND = 'gfs_seamless'

const MARINE_CURRENT = 'wave_height,wave_direction,wave_period'

// 8-point compass — 16 points get unwieldy in Malayalam and add no real value here.
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const DIRS_ML = ['വടക്ക്', 'വടക്കുകിഴക്ക്', 'കിഴക്ക്', 'തെക്കുകിഴക്ക്', 'തെക്ക്', 'തെക്കുപടിഞ്ഞാറ്', 'പടിഞ്ഞാറ്', 'വടക്കുപടിഞ്ഞാറ്']

export function compass(deg, lang) {
  if (deg == null) return '—'
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8
  return lang === 'ml' ? DIRS_ML[i] : DIRS[i]
}

// ── Hourly forecast, for alert conditions ───────────────────────────────────
// A rule like "wind under 15 km/h" is about the weather AT the tide, which may
// be hours away — current conditions cannot answer it. This fetches the hourly
// series and reads the values at a given timestamp.
const HOURLY = 'relative_humidity_2m,wind_speed_10m,wind_gusts_10m'
const hourlyCache = new Map()

export async function fetchHourly(lat, lon) {
  const k = key(lat, lon)
  const hit = hourlyCache.get(k)
  if (hit && Date.now() - hit.at < TTL) return hit.data

  const land = `${FORECAST}?latitude=${lat}&longitude=${lon}&hourly=${HOURLY}` +
    `&models=${MODEL_WIND}&forecast_days=3&timezone=Asia%2FKolkata&wind_speed_unit=kmh`
  const sea = `${MARINE}?latitude=${lat}&longitude=${lon}&hourly=wave_height` +
    `&forecast_days=3&timezone=Asia%2FKolkata`

  const [lr, mr] = await Promise.all([
    fetch(land).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))),
    fetch(sea).then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  const h = lr.hourly || {}
  // Open-Meteo returns naive local ISO strings ("2026-07-28T04:00") because of
  // the timezone param; parse them as IST so lookups line up with tide stamps.
  const data = {
    ts: (h.time || []).map(s => new Date(`${s}:00+05:30`).getTime()),
    windSpeed: h.wind_speed_10m || [],
    windGust: h.wind_gusts_10m || [],
    humidity: h.relative_humidity_2m || [],
    waveTs: (mr?.hourly?.time || []).map(s => new Date(`${s}:00+05:30`).getTime()),
    waveHeight: mr?.hourly?.wave_height || [],
  }
  hourlyCache.set(k, { at: Date.now(), data })
  return data
}

// nearest sample to `when`; null if the series does not reach that far
function nearest(stamps, values, when) {
  if (!stamps.length) return null
  let bi = -1, bd = Infinity
  for (let i = 0; i < stamps.length; i++) {
    const d = Math.abs(stamps[i] - when)
    if (d < bd) { bd = d; bi = i }
  }
  // more than 90 min away means we are extrapolating past the series
  if (bd > 90 * 60 * 1000) return null
  const v = values[bi]
  return v === undefined || v === null ? null : v
}

export function conditionsAt(hourly, when) {
  if (!hourly) return null
  return {
    windSpeed: nearest(hourly.ts, hourly.windSpeed, when),
    windGust: nearest(hourly.ts, hourly.windGust, when),
    humidity: nearest(hourly.ts, hourly.humidity, when),
    waveHeight: nearest(hourly.waveTs, hourly.waveHeight, when),
  }
}

// round coords so nearby spots reuse one cached response
const key = (lat, lon) => `${lat.toFixed(2)},${lon.toFixed(2)}`
const cache = new Map()
const TTL = 10 * 60 * 1000

// Provider dispatch. Tries the server function first — that is the only place a
// paid API key can live — and falls back to calling Open-Meteo straight from the
// browser. The fallback is what keeps `npm run dev` (Vite alone, no functions)
// working, and what keeps the card alive if Google is misconfigured or over quota.
let serverProvider = null   // null = untried, 'google' = use it, false = unavailable

export async function fetchWeather(lat, lon) {
  const k = key(lat, lon)
  const hit = cache.get(k)
  if (hit && Date.now() - hit.at < TTL) return hit.data

  if (serverProvider !== false) {
    try {
      const r = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      if (r.ok) {
        const d = await r.json()
        if (d.provider === 'google') {
          serverProvider = 'google'
          cache.set(k, { at: Date.now(), data: d })
          return d
        }
        // provider:'none' — no key set, or Google refused. Log the reason once so
        // a misconfigured key is visible instead of silently falling back forever.
        if (d.googleError) console.warn('Google Weather unavailable, using Open-Meteo:', d.googleStatus, d.googleError)
        serverProvider = false
      } else {
        serverProvider = false        // 404 in plain `vite dev`, no function deployed
      }
    } catch {
      serverProvider = false
    }
  }

  return fetchOpenMeteo(lat, lon, k)
}

async function fetchOpenMeteo(lat, lon, k) {
  const land = model => `${FORECAST}?latitude=${lat}&longitude=${lon}&current=${CURRENT}` +
    `&models=${model}&timezone=Asia%2FKolkata&wind_speed_unit=kmh`
  const sea = `${MARINE}?latitude=${lat}&longitude=${lon}&current=${MARINE_CURRENT}` +
    `&timezone=Asia%2FKolkata`

  // Thermo model is required; wind model and marine are best-effort. Marine has
  // no coverage inland, so treat its failure as "no wave data", not an error.
  const [tr, wr, mr] = await Promise.all([
    fetch(land(MODEL_THERMO)).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))),
    fetch(land(MODEL_WIND)).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(sea).then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  const lr = tr
  const c = tr.current || {}
  const wc = (wr && wr.current) || {}          // GFS — wind only
  const mc = (mr && mr.current) || {}
  // if the wind model call failed, fall back to the thermo model's own wind
  const pick = (a, b) => (a === undefined || a === null ? b : a)
  const data = {
    provider: 'open-meteo',
    // how far the model grid point is from where you asked — shown in the UI so
    // identical readings across nearby spots are explained, not mysterious
    gridOffsetKm: haversineKm(lat, lon, lr.latitude, lr.longitude),
    elevation: lr.elevation,              // DEM at the requested point, ~90 m res
    temp: c.temperature_2m,               // ICON
    feels: c.apparent_temperature,        // ICON
    humidity: c.relative_humidity_2m,     // ICON, %  (best-scoring model)
    pressure: c.surface_pressure,         // ICON, hPa
    precip: c.precipitation,              // ICON, mm
    windSpeed: pick(wc.wind_speed_10m, c.wind_speed_10m),        // GFS, km/h
    windDir: pick(wc.wind_direction_10m, c.wind_direction_10m),  // GFS, degrees
    windGust: pick(wc.wind_gusts_10m, c.wind_gusts_10m),         // GFS, km/h
    // how far apart the two models are — real uncertainty, not decoration
    humiditySpread: wc.relative_humidity_2m == null ? null
      : Math.abs(wc.relative_humidity_2m - c.relative_humidity_2m),
    windSpread: wc.wind_speed_10m == null ? null
      : Math.abs(wc.wind_speed_10m - c.wind_speed_10m),
    models: { thermo: MODEL_THERMO, wind: wr ? MODEL_WIND : MODEL_THERMO },
    waveHeight: mc.wave_height ?? null,   // m
    waveDir: mc.wave_direction ?? null,
    wavePeriod: mc.wave_period ?? null,   // s
    observedAt: c.time,
  }
  cache.set(k, { at: Date.now(), data })
  return data
}

// Weather provider behind the server, so a paid API key never reaches the browser.
//
// Provider is chosen by env var:
//   GOOGLE_MAPS_API_KEY set  -> Google Maps Platform Weather API
//   not set                  -> tells the client to use Open-Meteo directly
//
// Google's currentConditions response has NO elevation field (verified against
// the REST reference), so altitude always comes from Open-Meteo's free elevation
// endpoint, and waves always come from Open-Meteo marine. Google only replaces
// the thermo/wind block.
//
// Contract (verified against Google's docs):
//   GET https://weather.googleapis.com/v1/currentConditions:lookup
//       ?key=KEY&location.latitude=LAT&location.longitude=LON
//   Metric is the default, so speeds arrive in km/h and temps in Celsius.

const GOOGLE = 'https://weather.googleapis.com/v1/currentConditions:lookup'
const OM_ELEV = 'https://api.open-meteo.com/v1/elevation'
const OM_MARINE = 'https://marine-api.open-meteo.com/v1/marine'

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' },
  })

export default async (req) => {
  const url = new URL(req.url)
  const rawLat = url.searchParams.get('lat')
  const rawLon = url.searchParams.get('lon')
  // Number(null) and Number('') are both 0, which is a valid latitude — so the
  // params must be checked for presence before being coerced, or a missing
  // coordinate silently becomes 0,0 in the Gulf of Guinea.
  if (!rawLat || !rawLon) return json(400, { error: 'lat and lon required' })
  const lat = Number(rawLat)
  const lon = Number(rawLon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json(400, { error: 'lat and lon out of range' })
  }

  const key = process.env.GOOGLE_MAPS_API_KEY
  // No key configured: say so plainly and let the client fall back to Open-Meteo.
  if (!key) return json(200, { provider: 'none' })

  const gUrl = `${GOOGLE}?key=${encodeURIComponent(key)}` +
    `&location.latitude=${lat}&location.longitude=${lon}`

  const [gRes, elev, marine] = await Promise.all([
    fetch(gUrl).then(async r => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })),
    fetch(`${OM_ELEV}?latitude=${lat}&longitude=${lon}`).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch(`${OM_MARINE}?latitude=${lat}&longitude=${lon}&current=wave_height,wave_direction,wave_period&timezone=Asia%2FKolkata`)
      .then(r => r.ok ? r.json() : null).catch(() => null),
  ])

  if (!gRes.ok) {
    // Surface Google's own message — 403 here almost always means the Weather API
    // is not enabled on the project, billing is off, or the key is restricted.
    const msg = gRes.body?.error?.message || `HTTP ${gRes.status}`
    console.error('google weather failed:', gRes.status, msg)
    return json(200, { provider: 'none', googleError: msg, googleStatus: gRes.status })
  }

  const g = gRes.body || {}
  const mc = marine?.current || {}
  const n = v => (v === undefined || v === null ? null : Number(v))

  return json(200, {
    provider: 'google',
    gridOffsetKm: null,                 // Google is point-based; no published grid
    elevation: elev?.elevation?.[0] ?? null,
    temp: n(g.temperature?.degrees),
    feels: n(g.feelsLikeTemperature?.degrees),
    dewPoint: n(g.dewPoint?.degrees),
    humidity: n(g.relativeHumidity),
    pressure: n(g.airPressure?.meanSeaLevelMillibars),
    // Precipitation nesting is not fully documented; read defensively rather
    // than guess a shape, and degrade to null instead of throwing.
    precip: n(g.precipitation?.qpf?.quantity ?? g.precipitation?.snowQpf?.quantity),
    precipProbability: n(g.precipitation?.probability?.percent),
    windSpeed: n(g.wind?.speed?.value),
    windDir: n(g.wind?.direction?.degrees),
    windGust: n(g.wind?.gust?.value),
    windCardinal: g.wind?.direction?.cardinal ?? null,
    uvIndex: n(g.uvIndex),
    cloudCover: n(g.cloudCover),
    thunderstormProbability: n(g.thunderstormProbability),
    condition: g.weatherCondition?.description?.text ?? null,
    waveHeight: mc.wave_height ?? null,
    waveDir: mc.wave_direction ?? null,
    wavePeriod: mc.wave_period ?? null,
    observedAt: g.currentTime ?? null,
    humiditySpread: null,               // single provider, no cross-model spread
    windSpread: null,
    models: { thermo: 'google', wind: 'google' },
  })
}

export const config = { path: '/api/weather' }

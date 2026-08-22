// Tide helpers: build extremes from station days, interpolate level, format, geo.
export const TZ = 'Asia/Kolkata'

// A tide sitting a few millimetres below mean sea level rounds to "-0.00 m",
// which reads as an error rather than as zero. Collapse anything inside the
// rounding window to a clean 0 before formatting.
export const noNegZero = (v, dp = 2) => (Math.abs(v) < 0.5 / 10 ** dp ? 0 : v)

export function fmtHt(v) { return (v == null ? '—' : noNegZero(v).toFixed(2) + ' m') }

// Tide heights are stored above Chart Datum (Lowest Astronomical Tide) — the
// lowest the water ever falls — which is why no stored height is negative.
// Mean Sea Level is the average level, so it sits `offset` metres higher and a
// tide below average reads negative against it. Both describe the same water;
// only the line you measure from moves, so the difference between any two tides
// is identical either way.
//
// offset comes from stations[].mslOffset, written by scripts/refresh-tides.mjs.
// A data file predating that field yields undefined, which falls back to 0 and
// shows Chart Datum rather than silently shifting everything to nonsense.
export const CHART_DATUM = 'cd'
export const MEAN_SEA_LEVEL = 'msl'

export function toDatum(m, offset, datum) {
  if (m == null) return null
  return datum === MEAN_SEA_LEVEL ? m - (offset || 0) : m
}
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
}
export function dayKey(ts) { return new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ }) }
export function prettyTime(t) { return String(t).replace(/\s*(AM|PM)/i, ' $1').trim() }

// Convert one station's [{date,tides:[{t,m,type,ts}]}] into a flat sorted extremes list.
export function stationExtremes(days) {
  if (!days) return []
  const ex = []
  days.forEach(d => d.tides.forEach(t => ex.push({
    ts: t.ts * 1000,
    disp: prettyTime(t.t),
    m: +t.m,
    type: /high/i.test(t.type) ? 'high' : 'low',
    date: d.date,
  })))
  ex.sort((a, b) => a.ts - b.ts)
  return ex
}

// smooth cosine interpolation between the two surrounding extremes
export function levelAt(ex, tms) {
  if (!ex.length) return null
  if (tms <= ex[0].ts) return { m: ex[0].m, rising: ex.length > 1 ? ex[1].m > ex[0].m : true }
  if (tms >= ex[ex.length - 1].ts) { const a = ex[ex.length - 1]; return { m: a.m, rising: false } }
  let i = 0
  while (i < ex.length - 1 && !(ex[i].ts <= tms && tms < ex[i + 1].ts)) i++
  const a = ex[i], b = ex[i + 1], f = (tms - a.ts) / (b.ts - a.ts)
  return { m: a.m + (b.m - a.m) * (1 - Math.cos(Math.PI * f)) / 2, rising: b.m > a.m }
}

// min/max height across a station's whole dataset (for wave-fill scaling)
export function heightRange(ex) {
  if (!ex.length) return { min: 0, max: 1 }
  let min = Infinity, max = -Infinity
  ex.forEach(e => { if (e.m < min) min = e.m; if (e.m > max) max = e.m })
  if (max === min) max = min + 1
  return { min, max }
}

export function extremesForDay(ex, key) { return ex.filter(e => dayKey(e.ts) === key) }

// distinct sorted day keys available for a station
export function availableDays(ex) {
  const s = new Set(ex.map(e => dayKey(e.ts)))
  return [...s].sort()
}

// ---- geo ----
export function haversineKm(a, b, c, d) {
  const R = 6371, r = Math.PI / 180
  const dLat = (c - a) * r, dLon = (d - b) * r
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
export function nearestStation(lat, lon, stations) {
  let best = null, bestD = Infinity
  stations.forEach(s => {
    const dist = haversineKm(lat, lon, s.lat, s.lon)
    if (dist < bestD) { bestD = dist; best = { ...s, distKm: dist } }
  })
  return best
}

// Tide helpers: build extremes from station days, interpolate level, format, geo.
export const TZ = 'Asia/Kolkata'

export function fmtHt(v) { return (v == null ? '—' : v.toFixed(2) + ' m') }
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

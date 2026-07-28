// Aggregates for the catch analysis dashboard.
//
// WHY THIS EXISTS rather than the browser querying Supabase directly:
//
//  1. RLS. The catch_reports table has Row Level Security enabled with no
//     policies, so a browser holding the anon key gets zero rows. The only way
//     to read it is with the service key, which must stay server-side.
//  2. Privacy. This never selects the `ip` column. Raw IPs — personal data under
//     the DPDP Act — never leave the database. A browser-side query with a read
//     policy would expose every reporter's IP to anyone who opened DevTools.
//  3. Payload. Aggregating here sends a few dozen numbers instead of every row.

const ANALYSIS_COLUMNS = [
  'created_at', 'quantity_kg', 'catch_type', 'location_label',
  'tide_state', 'tide_height_m', 'moon_phase', 'moon_illum_pct',
  'wind_kmh', 'wave_height_m', 'humidity_pct',
].join(',')

// Below this many reports in a bucket, an average is noise. The UI must not
// present such a bucket as a finding.
const MIN_N = 5
const ROW_CAP = 5000

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const round = (v, p = 2) => (v == null ? null : Math.round(v * 10 ** p) / 10 ** p)

function summarise(rows, keyFn, label) {
  const groups = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (k == null || k === '') continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(Number(r.quantity_kg))
  }
  const out = []
  for (const [k, vals] of groups) {
    const n = vals.length
    const mean = vals.reduce((a, b) => a + b, 0) / n
    const sd = n > 1
      ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
      : null
    out.push({
      bucket: String(k),
      n,
      avg: round(mean),
      sd: round(sd),
      max: round(Math.max(...vals)),
      // enough data for this bucket to be worth reading at all
      reliable: n >= MIN_N,
    })
  }
  out.sort((a, b) => b.avg - a.avg)
  return { label, minN: MIN_N, buckets: out }
}

const band = (v, edges, labels) => {
  if (v == null) return null
  const n = Number(v)
  for (let i = 0; i < edges.length; i++) if (n < edges[i]) return labels[i]
  return labels[labels.length - 1]
}

export default async (req) => {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(200, { configured: false })
  }

  let rows
  try {
    const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/catch_reports` +
      `?select=${encodeURIComponent(ANALYSIS_COLUMNS)}&order=created_at.desc&limit=${ROW_CAP}`
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    })
    if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`)
    rows = await res.json()
  } catch (e) {
    console.error('catch-stats failed:', e)
    return json(502, { error: 'could not read reports', detail: String(e.message || e) })
  }

  rows = (rows || []).filter(r => Number.isFinite(Number(r.quantity_kg)))
  if (!rows.length) return json(200, { configured: true, total: 0, factors: [] })

  const all = rows.map(r => Number(r.quantity_kg))
  const overallAvg = all.reduce((a, b) => a + b, 0) / all.length

  const factors = [
    summarise(rows, r => r.tide_state, 'tideState'),
    summarise(rows, r => r.moon_phase, 'moonPhase'),
    summarise(rows, r => band(r.tide_height_m, [0.2, 0.4], ['<0.2 m', '0.2–0.4 m', '0.4 m+']), 'tideHeight'),
    summarise(rows, r => band(r.wind_kmh, [10, 20, 30], ['<10 km/h', '10–20 km/h', '20–30 km/h', '30 km/h+']), 'wind'),
    summarise(rows, r => band(r.wave_height_m, [0.5, 1.0], ['<0.5 m', '0.5–1.0 m', '1.0 m+']), 'wave'),
    summarise(rows, r => {
      const h = new Date(r.created_at).getUTCHours() + 5.5   // IST
      const ist = ((Math.floor(h) % 24) + 24) % 24
      return band(ist, [6, 12, 17], ['Night', 'Morning', 'Afternoon', 'Evening'])
    }, 'timeOfDay'),
    summarise(rows, r => r.catch_type, 'catchType'),
    summarise(rows, r => r.location_label, 'location'),
  ]

  // Headline only from buckets with enough data, and only if a real spread exists.
  const reliable = factors.flatMap(f =>
    f.buckets.filter(b => b.reliable).map(b => ({ factor: f.label, ...b })))
  reliable.sort((a, b) => b.avg - a.avg)
  const best = reliable[0] || null
  const worst = reliable.length > 1 ? reliable[reliable.length - 1] : null

  return json(200, {
    configured: true,
    total: rows.length,
    overallAvg: round(overallAvg),
    minN: MIN_N,
    // how many reports are still needed before any factor is readable
    reliableBuckets: reliable.length,
    best, worst,
    factors,
  })
}

export const config = { path: '/api/catch-stats' }

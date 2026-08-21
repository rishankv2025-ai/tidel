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
  'id', 'created_at', 'quantity_kg', 'catch_type', 'catch_other', 'notes', 'device_id',
  'location_label',
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

// Supabase's two key formats need different headers — a legacy JWT ("eyJ...")
// takes apikey + Authorization: Bearer, while a new "sb_secret_..." key is not a
// JWT and must go in apikey alone. Handling both means a key rotation between
// formats does not break reads.
function supabaseHeaders(key) {
  const h = { apikey: key }
  if (key.startsWith('eyJ')) h.authorization = `Bearer ${key}`
  return h
}

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
    const res = await fetch(url, { headers: supabaseHeaders(SUPABASE_SERVICE_KEY) })
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
    // Thirds of the real Kannur range (0.17–1.50 m above MLLW). The previous
    // 0.2/0.4 m cuts were drawn against tide heights that were all 3.28x too
    // small, so on corrected data every report but the lowest few would pile
    // into a single bucket and the factor would tell you nothing.
    summarise(rows, r => band(r.tide_height_m, [0.6, 1.1], ['<0.6 m', '0.6–1.1 m', '1.1 m+']), 'tideHeight'),
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
    // Individual reports, oldest first, for the per-report line chart and the
    // detail table. Deliberately still no `ip` column: aggregates never needed
    // it and neither does the UI, so the one piece of personal data in the
    // table never leaves the database.
    rows: [...rows].reverse().map(r => ({
      id: r.id,
      at: r.created_at,
      kg: Number(r.quantity_kg),
      type: r.catch_type,
      other: r.catch_other || '',
      notes: r.notes || '',
      // shortened purely for display; the full value stays in the database
      device: r.device_id ? String(r.device_id).slice(0, 8) : '',
      place: r.location_label || '',
      tideState: r.tide_state || '',
      tideHeight: r.tide_height_m == null ? null : Number(r.tide_height_m),
      moon: r.moon_phase || '',
      moonIllum: r.moon_illum_pct == null ? null : Number(r.moon_illum_pct),
      wind: r.wind_kmh == null ? null : Number(r.wind_kmh),
      wave: r.wave_height_m == null ? null : Number(r.wave_height_m),
      humidity: r.humidity_pct == null ? null : Number(r.humidity_pct),
    })),
    overallAvg: round(overallAvg),
    minN: MIN_N,
    // how many reports are still needed before any factor is readable
    reliableBuckets: reliable.length,
    best, worst,
    factors,
  })
}

export const config = { path: '/api/catch-stats' }

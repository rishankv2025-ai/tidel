// Stores one catch report. Two providers, chosen by env:
//
//   SUPABASE_URL + SUPABASE_SERVICE_KEY  -> Supabase (preferred)
//   GOOGLE_* + SHEET_ID                  -> Google Sheet (fallback)
//
// WHY THIS RUNS SERVER-SIDE, rather than calling Supabase from the browser:
//
//  1. The client IP is only visible here. A page cannot read its own public IP,
//     and the report schema records it. A browser-side insert would silently
//     write NULL for every ip value.
//  2. The service key never reaches the browser. A VITE_-prefixed variable is
//     compiled into the public bundle and readable by any visitor — fine for a
//     Supabase *anon* key guarded by RLS, fatal for a service key.
//  3. Validation cannot be bypassed. A browser-side insert with an anon key
//     trusts whatever the client sends.
//
// Auth uses plain REST + fetch, so no @supabase/supabase-js dependency.
// Google Sheets auth is a service-account JWT signed with node:crypto.

import crypto from 'node:crypto'

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// Sheet column order. Supabase uses these as column names too, so the two
// providers stay comparable and one can be migrated into the other.
const COLUMNS = [
  'timestamp_utc', 'timestamp_local', 'device_id', 'ip',
  'location_label', 'lat', 'lon',
  'catch_type', 'catch_other', 'quantity_kg',
  'tide_state', 'tide_height_m', 'next_extreme_type', 'next_extreme_time',
  'moon_phase', 'moon_illum_pct',
  'wind_kmh', 'wind_dir_deg', 'wind_gust_kmh', 'humidity_pct',
  'elevation_m', 'wave_height_m',
  'notes', 'lang',
]

const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64url')

async function accessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned =
    b64url({ alg: 'RS256', typ: 'JWT' }) + '.' +
    b64url({ iss: email, scope: SCOPE, aud: TOKEN_URL, exp: now + 3600, iat: now })
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}

async function sheetsCall(token, path, init = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  })
  if (!res.ok) throw new Error(`sheets ${res.status}: ${await res.text()}`)
  return res.json()
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// keep free-text from becoming a formula when Sheets parses it
const safe = v => {
  const s = v == null ? '' : String(v)
  return /^[=+\-@]/.test(s) ? `'${s}` : s
}
const num = v => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v))

// Supabase has two key formats and they are NOT interchangeable in headers:
//   legacy JWT  "eyJ..."        -> apikey + Authorization: Bearer
//   new secret  "sb_secret_..." -> apikey only; it is not a JWT, so sending it
//                                  as a Bearer token fails validation
// Sending the right headers for the key given means rotating from one format to
// the other does not break the site.
function supabaseHeaders(key) {
  const h = { apikey: key, 'content-type': 'application/json' }
  if (key.startsWith('eyJ')) h.authorization = `Bearer ${key}`
  return h
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const {
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID,
  } = process.env
  const supabaseReady = !!(SUPABASE_URL && SUPABASE_SERVICE_KEY)
  const sheetsReady = !!(GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY && SHEET_ID)
  if (!supabaseReady && !sheetsReady) {
    return json(500, { error: 'No storage configured — see SETUP-SUPABASE.md or SETUP-SHEETS.md' })
  }

  let body
  try { body = await req.json() } catch { return json(400, { error: 'invalid JSON' }) }

  const type = String(body.catchType || '')
  if (!['fish', 'crab', 'other'].includes(type)) return json(400, { error: 'catchType must be fish, crab or other' })
  const qty = Number(body.quantity)
  if (!Number.isFinite(qty) || qty < 0 || qty > 1000) return json(400, { error: 'quantity out of range' })

  // the browser cannot see its own public IP — take it from the edge
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || ''

  const w = body.weather || {}
  const t = body.tide || {}
  const m = body.moon || {}
  const record = {
    timestamp_utc: new Date().toISOString(),
    timestamp_local: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    device_id: safe(body.deviceId),
    ip: safe(ip),
    location_label: safe(body.locationLabel),
    lat: num(body.lat), lon: num(body.lon),
    catch_type: type,
    catch_other: safe(body.catchOther),
    quantity_kg: qty,
    tide_state: safe(t.state),
    tide_height_m: num(t.height),
    next_extreme_type: safe(t.nextType),
    next_extreme_time: safe(t.nextTime),
    moon_phase: safe(m.phase),
    moon_illum_pct: num(m.illum),
    wind_kmh: num(w.windSpeed),
    wind_dir_deg: num(w.windDir),
    wind_gust_kmh: num(w.windGust),
    humidity_pct: num(w.humidity),
    elevation_m: num(w.elevation),
    wave_height_m: num(w.waveHeight),
    notes: safe(body.notes),
    lang: safe(body.lang),
  }

  try {
    if (supabaseReady) {
      const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/catch_reports`, {
        method: 'POST',
        headers: { ...supabaseHeaders(SUPABASE_SERVICE_KEY), prefer: 'return=minimal' },
        body: JSON.stringify(record),
      })
      if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`)
      return json(200, { ok: true, provider: 'supabase' })
    }

    // Google Sheets: same values, positional
    const token = await accessToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'))
    const tab = process.env.SHEET_TAB || 'reports'
    const row = COLUMNS.map(c => (record[c] === null ? '' : record[c]))
    // write the header row once, so a blank sheet is all the setup you need
    const head = await sheetsCall(token, `${SHEET_ID}/values/${encodeURIComponent(tab)}!A1:A1`)
    const rows = head.values && head.values.length ? [row] : [COLUMNS, row]
    await sheetsCall(
      token,
      `${SHEET_ID}/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: rows }) }
    )
    return json(200, { ok: true, provider: 'sheets' })
  } catch (e) {
    console.error('catch-report failed:', e)
    return json(502, { error: 'could not store report', detail: String(e.message || e) })
  }
}

export const config = { path: '/api/catch-report' }

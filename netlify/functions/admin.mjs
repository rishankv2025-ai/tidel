// Admin API for the catch report table: list, create, update, delete.
//
// SECURITY, and why it is built this way:
//
// A username/password checked in React is not authentication. The bundle is
// public, so the credential would be readable by anyone, and — worse — the API
// itself would still be open: `curl -X POST /api/admin -d '{"action":"delete"}'`
// would wipe the table without ever loading the login screen. The password is
// therefore verified HERE, on every single request, and the client's login form
// does nothing except collect it.
//
// The credential lives in environment variables, never in this file. If they are
// unset the admin API refuses everything rather than falling back to a default,
// because a default password committed to a public repo is the same as no
// password at all.
//
// Comparison is timing-safe: both sides are SHA-256'd first so the digests are
// always equal length (timingSafeEqual throws on a length mismatch, and the
// throw itself would leak the password length).

import crypto from 'node:crypto'
import { sb, supabaseReady, json } from './_supabase.mjs'

// Columns the admin may write. Anything not listed is ignored, so a crafted
// request cannot set id, created_at, or ip.
const EDITABLE = [
  'location_label', 'catch_type', 'catch_other', 'quantity_kg', 'notes',
  'tide_state', 'tide_height_m', 'moon_phase', 'moon_illum_pct',
  'wind_kmh', 'wind_dir_deg', 'wind_gust_kmh', 'humidity_pct',
  'wave_height_m', 'elevation_m', 'lat', 'lon', 'device_id', 'lang',
]

const NUMERIC = new Set(['quantity_kg', 'tide_height_m', 'moon_illum_pct', 'wind_kmh',
  'wind_dir_deg', 'wind_gust_kmh', 'humidity_pct', 'wave_height_m', 'elevation_m', 'lat', 'lon'])

const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest()

function safeEqual(a, b) {
  const da = sha(a), db = sha(b)
  return crypto.timingSafeEqual(da, db)
}

// Returns null when authorised, or a Response when not.
function authFail(req) {
  const { ADMIN_USER, ADMIN_PASSWORD } = process.env
  if (!ADMIN_USER || !ADMIN_PASSWORD) {
    return json(503, { error: 'admin_not_configured' })
  }
  const header = req.headers.get('authorization') || ''
  const [scheme, encoded] = header.split(' ')
  if (!/^basic$/i.test(scheme || '') || !encoded) {
    return json(401, { error: 'auth_required' })
  }
  let user = '', pass = ''
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    const i = decoded.indexOf(':')
    user = decoded.slice(0, i)
    pass = decoded.slice(i + 1)
  } catch { return json(401, { error: 'bad_credentials' }) }

  // Compare BOTH regardless of whether the first matched, so the response time
  // does not reveal which half was wrong.
  const okUser = safeEqual(user, ADMIN_USER)
  const okPass = safeEqual(pass, ADMIN_PASSWORD)
  if (!(okUser && okPass)) return json(401, { error: 'bad_credentials' })
  return null
}

function cleanPatch(input) {
  const out = {}
  for (const k of EDITABLE) {
    if (!(k in input)) continue
    let v = input[k]
    if (v === '' || v === null || v === undefined) { out[k] = null; continue }
    if (NUMERIC.has(k)) {
      const n = Number(v)
      if (!Number.isFinite(n)) continue
      out[k] = n
    } else {
      out[k] = String(v)
    }
  }
  // Reject a value that is PRESENT and wrong. A null means "clear this field" or
  // "the form sent nothing", and for create the defaults below fill it in — so
  // rejecting null here made the create default unreachable and every new row
  // failed with "catch_type must be fish, crab or other".
  if (out.catch_type != null && !['fish', 'crab', 'other'].includes(out.catch_type)) {
    throw new Error('catch_type must be fish, crab or other')
  }
  if (out.quantity_kg != null && (out.quantity_kg < 0 || out.quantity_kg > 1000)) {
    throw new Error('quantity_kg must be between 0 and 1000')
  }
  return out
}

// Final gate, applied after defaults, so nothing reaches the database that the
// public app or the table constraints would reject.
function assertWritable(row) {
  if (!['fish', 'crab', 'other'].includes(row.catch_type)) {
    throw new Error('catch_type must be fish, crab or other')
  }
  const q = Number(row.quantity_kg)
  if (!Number.isFinite(q) || q < 0 || q > 1000) {
    throw new Error('quantity_kg must be between 0 and 1000')
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const denied = authFail(req)
  if (denied) return denied
  if (!supabaseReady()) return json(503, { error: 'database_not_configured' })

  let body
  try { body = await req.json() } catch { return json(400, { error: 'invalid JSON' }) }
  const action = String(body.action || '')

  try {
    switch (action) {
      // Lets the login screen verify credentials without side effects.
      case 'login':
        return json(200, { ok: true, user: process.env.ADMIN_USER })

      case 'list': {
        const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 2000)
        const rows = await sb(`catch_reports?select=*&order=id.desc&limit=${limit}`)
        return json(200, { ok: true, rows: rows || [] })
      }

      case 'create': {
        const patch = cleanPatch(body.row || {})
        if (!patch.catch_type) patch.catch_type = 'fish'
        if (patch.quantity_kg == null) patch.quantity_kg = 0
        assertWritable(patch)
        patch.timestamp_utc = new Date().toISOString()
        patch.timestamp_local = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        const created = await sb('catch_reports', {
          method: 'POST',
          headers: { prefer: 'return=representation' },
          body: JSON.stringify(patch),
        })
        return json(200, { ok: true, row: Array.isArray(created) ? created[0] : created })
      }

      case 'update': {
        const id = Number(body.id)
        if (!Number.isInteger(id)) return json(400, { error: 'id required' })
        const patch = cleanPatch(body.patch || {})
        if (!Object.keys(patch).length) return json(400, { error: 'nothing to update' })
        const updated = await sb(`catch_reports?id=eq.${id}`, {
          method: 'PATCH',
          headers: { prefer: 'return=representation' },
          body: JSON.stringify(patch),
        })
        return json(200, { ok: true, row: Array.isArray(updated) ? updated[0] : updated })
      }

      case 'delete': {
        // Always a list, so single and bulk delete take one code path.
        const ids = (Array.isArray(body.ids) ? body.ids : [body.id])
          .map(Number).filter(Number.isInteger)
        if (!ids.length) return json(400, { error: 'no ids' })
        if (ids.length > 500) return json(400, { error: 'too many ids in one request' })
        await sb(`catch_reports?id=in.(${ids.join(',')})`, {
          method: 'DELETE',
          headers: { prefer: 'return=minimal' },
        })
        return json(200, { ok: true, deleted: ids.length })
      }

      default:
        return json(400, { error: 'unknown action' })
    }
  } catch (e) {
    console.error('admin action failed:', action, e)
    return json(502, { error: 'action_failed', detail: String(e.message || e) })
  }
}

export const config = { path: '/api/admin' }

// Records a browser's push subscription together with the alert rule it wants.
//
// POST   { subscription, deviceId, stationId, lat, lon, lang, rule }  -> upsert
// DELETE { endpoint }                                                -> remove
//
// The rule is stored server-side because the cron job, not the page, decides
// when to notify. A rule that lived only in localStorage would be invisible to
// the sender, which is the whole reason alerts never arrived with the app shut.
//
// Validation mirrors src/lib/alerts.js deliberately: the browser is not trusted
// to have validated anything, and a bad lead_minutes would fail the CHECK
// constraint with an opaque 400 from PostgREST rather than a useful message.

import { sb, supabaseReady, json } from './_supabase.mjs'

const LEAD_CHOICES = [0, 15, 30, 45, 60, 90, 120, 180, 240, 300, 360]
const FIELDS = ['tideHeight', 'windSpeed', 'windGust', 'waveHeight', 'humidity']
const OPS = ['lt', 'gt']

const cleanConditions = c => (Array.isArray(c) ? c : [])
  .filter(x => x && FIELDS.includes(x.field) && OPS.includes(x.op) && Number.isFinite(+x.value))
  .map(x => ({ field: x.field, op: x.op, value: +x.value }))
  .slice(0, 8)          // a rule with more conditions than this is a bug or an attack

const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// The daily summary is stored server-side ONLY when the device opted into
// closed-app delivery. Otherwise every daily column is nulled out, so "keep it
// on this device" is enforced by what is written rather than by the UI hiding it.
function dailyColumns(daily, fallbackStation) {
  const d = daily || {}
  const on = d.enabled === true && d.push === true && TIME_RE.test(d.time)
  if (!on) {
    return {
      daily_enabled: false,
      daily_time: null,
      daily_station_id: null,
      daily_lat: null,
      daily_lon: null,
      last_daily_key: null,
    }
  }
  return {
    daily_enabled: true,
    daily_time: d.time,
    daily_station_id: d.stationId ? String(d.stationId) : fallbackStation,
    daily_lat: num(d.lat),
    daily_lon: num(d.lon),
    // Clearing this lets a changed time fire again today rather than waiting for
    // tomorrow, which is what someone adjusting the setting expects.
    last_daily_key: null,
  }
}

export default async (req) => {
  if (!supabaseReady()) {
    return json(503, { error: 'push store not configured — see SETUP-PUSH.md' })
  }

  let body
  try { body = await req.json() } catch { return json(400, { error: 'invalid JSON' }) }

  // ── unsubscribe ───────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const endpoint = String(body.endpoint || '')
    if (!endpoint) return json(400, { error: 'endpoint required' })
    try {
      await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
        { method: 'DELETE', headers: { prefer: 'return=minimal' } })
      return json(200, { ok: true, removed: true })
    } catch (e) {
      console.error('push-subscribe delete failed:', e)
      return json(502, { error: 'could not remove subscription', detail: String(e.message || e) })
    }
  }

  if (req.method !== 'POST') return json(405, { error: 'POST or DELETE only' })

  const s = body.subscription || {}
  const endpoint = String(s.endpoint || '')
  const p256dh = String(s.keys?.p256dh || '')
  const auth = String(s.keys?.auth || '')
  // All three are required: without the keys the payload cannot be encrypted,
  // and a row missing them would fail silently at send time instead of here.
  if (!endpoint || !p256dh || !auth) {
    return json(400, { error: 'subscription must carry endpoint and keys.p256dh/auth' })
  }
  if (!/^https:\/\//.test(endpoint)) return json(400, { error: 'endpoint must be https' })

  const stationId = String(body.stationId || '')
  if (!stationId) return json(400, { error: 'stationId required' })

  const rule = body.rule || {}
  const lead = LEAD_CHOICES.includes(+rule.leadMinutes) ? +rule.leadMinutes : 30
  const tideType = ['low', 'high', 'any'].includes(rule.tideType) ? rule.tideType : 'low'
  const lang = body.lang === 'ml' ? 'ml' : 'en'

  const row = {
    endpoint, p256dh, auth,
    device_id: body.deviceId ? String(body.deviceId).slice(0, 64) : null,
    station_id: stationId,
    lat: num(body.lat), lon: num(body.lon),
    lang,
    enabled: rule.enabled !== false,
    lead_minutes: lead,
    tide_type: tideType,
    conditions: cleanConditions(rule.conditions),
    updated_at: new Date().toISOString(),
    // A changed rule must be allowed to fire for a tide the previous rule
    // already covered, so clear the dedup marker and the failure count on every
    // resubscribe. Otherwise switching from 30 min to 6 hours would be ignored
    // until the following tide.
    last_sent_key: null,
    failures: 0,
    ...dailyColumns(body.daily, stationId),
  }

  try {
    await sb('push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    })
    return json(200, {
      ok: true, leadMinutes: lead, tideType, station: stationId,
      // Echoed so the client can confirm what the server actually kept — useful
      // when the answer is "nothing", which is the point of the local-only mode.
      daily: row.daily_enabled ? { time: row.daily_time, station: row.daily_station_id } : null,
    })
  } catch (e) {
    console.error('push-subscribe failed:', e)
    return json(502, { error: 'could not save subscription', detail: String(e.message || e) })
  }
}

export const config = { path: '/api/push-subscribe' }

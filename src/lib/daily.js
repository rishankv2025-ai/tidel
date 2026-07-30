// Daily summary alert: "tell me today's tides and moon every morning at 05:30".
//
// Two delivery routes, chosen per device by the `push` flag:
//
//   push:false (default) — the time NEVER leaves the phone. It lives in
//     localStorage and is delivered by a timer in NotificationManager, so it
//     only arrives while the app is open. This is the privacy-preserving
//     option and it is the default precisely because it asks nothing of anyone.
//   push:true — the time is also stored in the device's push_subscriptions row
//     so the scheduled function can send it with the app closed. That row holds
//     no IP address; see supabase/migrations/0002_push_subscriptions.sql.
//
// All times are Asia/Kolkata wall-clock. India has no DST, so a fixed +05:30 is
// exact and a stored "05:30" means the same instant every day of the year —
// which is why the time is kept as HH:MM text rather than a UTC offset.

import { dayKey } from './tide.js'

const KEY = 'tide_daily_alert'
const FIRED_KEY = 'tide_daily_fired'

export const IST_OFFSET = '+05:30'
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// A daily summary is still worth reading some hours late — it describes the
// whole day. Past this the app stays quiet rather than pushing stale news.
export const DAILY_GRACE_MS = 4 * 3600000

export const DEFAULT_DAILY = {
  enabled: false,
  time: '05:30',      // before dawn, when the decision to go out is actually made
  push: false,        // local-only until explicitly opted in
  stationId: '',      // '' means "use whatever place is selected"
  label: '',
  ml: '',
  lat: null,
  lon: null,
}

export function minutesOfDay(time) {
  const m = TIME_RE.exec(String(time || ''))
  return m ? (+m[1]) * 60 + (+m[2]) : null
}

export function loadDaily() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_DAILY }
    const d = JSON.parse(raw)
    return {
      enabled: d.enabled === true,
      time: TIME_RE.test(d.time) ? d.time : DEFAULT_DAILY.time,
      push: d.push === true,
      stationId: typeof d.stationId === 'string' ? d.stationId : '',
      label: typeof d.label === 'string' ? d.label : '',
      ml: typeof d.ml === 'string' ? d.ml : '',
      lat: Number.isFinite(+d.lat) && d.lat !== null ? +d.lat : null,
      lon: Number.isFinite(+d.lon) && d.lon !== null ? +d.lon : null,
    }
  } catch { return { ...DEFAULT_DAILY } }
}

export function saveDaily(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* private mode */ }
}

/** The instant HH:MM falls on a given IST date. */
export function atOn(dateKey, time) {
  return new Date(`${dateKey}T${time}:00${IST_OFFSET}`).getTime()
}

/**
 * Strictly the next future occurrence of HH:MM in IST.
 * Adding a flat 24h is exact here because IST has no daylight saving.
 */
export function nextDailyAt(time, nowMs = Date.now()) {
  if (minutesOfDay(time) == null) return null
  const at = atOn(dayKey(nowMs), time)
  return at > nowMs ? at : at + 86400000
}

/**
 * Is a summary owed right now? Returns the IST date key it would be for, or
 * null. Separate from nextDailyAt so a device that was asleep at 05:30 still
 * gets the summary when it wakes at 06:10, rather than silently waiting a day.
 */
export function dueDaily(daily, nowMs = Date.now(), lastKey = null) {
  if (!daily || !daily.enabled) return null
  if (minutesOfDay(daily.time) == null) return null
  // Today's scheduled instant first, then yesterday's. The fallback matters for a
  // late-night time: a 23:56 alarm's catch-up window runs past midnight, and by
  // then dayKey() has rolled over, so today's instant is in the future and the
  // summary would be lost. Keying by the scheduled day keeps it one per day.
  for (const key of [dayKey(nowMs), dayKey(nowMs - 86400000)]) {
    if (lastKey === key) continue
    const at = atOn(key, daily.time)
    if (nowMs >= at && nowMs < at + DAILY_GRACE_MS) return key
  }
  return null
}

// ── one-per-day marker ──────────────────────────────────────────────────────
// Survives reloads, so reopening the app after the summary arrived does not
// show it again — the catch-up window is hours wide, which would otherwise make
// every visit before mid-morning re-notify.

export function dailyFired() {
  try { return localStorage.getItem(FIRED_KEY) } catch { return null }
}

export function markDailyFired(key) {
  try { localStorage.setItem(FIRED_KEY, key) } catch { /* private mode */ }
}

/** Human "05:30 AM" for the settings panel, in the user's locale. */
export function fmtDailyTime(time, locale = 'en-IN') {
  const mins = minutesOfDay(time)
  if (mins == null) return time
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(mins / 60), mins % 60))
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
}

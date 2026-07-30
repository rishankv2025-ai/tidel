// Scheduled sender. This is the piece that makes an alert arrive when the app
// is closed — a page cannot wake itself, so a cron job has to do the waking.
//
// Runs every 5 minutes. On each run, for every enabled subscription:
//   1. find the tide whose warning moment has arrived and which has not passed
//   2. re-check the rule's conditions against the forecast AT THAT TIDE
//   3. send an encrypted web push, then mark the tide so the next run skips it
//
// Tide data is read from the deployed site's own /tidedata.json rather than
// duplicated here, so a data refresh needs no change to this function.
//
// Wording comes from src/lib/i18n.js and heights from src/lib/tide.js, so a push
// reads identically to the in-app notification it replaces.

import webpush from 'web-push'
import { stationExtremes, fmtHt, dayKey } from '../../src/lib/tide.js'
import { evaluate } from '../../src/lib/alerts.js'
import { fetchHourly, conditionsAt } from '../../src/lib/weather.js'
import { t } from '../../src/lib/i18n.js'
import { todaySummary } from '../../src/lib/summary.js'
import { atOn, minutesOfDay } from '../../src/lib/daily.js'
import { sb, supabaseReady } from './_supabase.mjs'

// How long after the tide a late alert is still worth sending. Past this a
// "tide soon" notification is simply false, so it is dropped.
const GRACE_MS = 10 * 60000
// Cron period. Only used to explain lateness in the logs — the window is driven
// by the tide, not by this number.
const PERIOD_MIN = 5

/**
 * The tide this subscription is currently due to be warned about, if any.
 *
 * Exported and pure so it can be tested against a fake clock. `find` on a
 * timestamp-sorted list yields the most imminent qualifying tide, which is the
 * right one: if a run is missed and two tides qualify, the earlier is the one
 * the user is standing in front of.
 */
export function dueTide(extremes, sub, nowMs) {
  const lead = sub.lead_minutes * 60000
  return extremes.find(e =>
    (sub.tide_type === 'any' || e.type === sub.tide_type) &&
    e.ts - lead <= nowMs &&        // warning moment has arrived
    nowMs < e.ts + GRACE_MS        // and the tide is not long gone
  ) || null
}

export const sentKey = (sub, tide) =>
  `${sub.station_id}|${tide.ts}|${sub.lead_minutes}|${sub.tide_type}`

// How long after its time a daily summary may still be sent. Wide on purpose:
// the cron granularity is 5 minutes but a run can be delayed, and a summary of
// the day is still useful an hour late. `last_daily_key` is what stops repeats,
// so widening this window costs nothing.
const DAILY_WINDOW_MS = 30 * 60000

/**
 * The IST date key a daily summary is owed for, or null.
 *
 * Checks today's scheduled instant, then yesterday's. The fallback is not
 * decoration: a late-night time such as 23:56 has a window that runs past
 * midnight, and by the time a 5-minute cron next fires, dayKey() has already
 * rolled over — so today's instant is in the future and the summary would be
 * unreachable. Clamping the window at midnight instead (the first attempt here)
 * left every time in the last 5 minutes of the day permanently undeliverable.
 *
 * The key is the day the alert was scheduled for, so last_daily_key still
 * guarantees one summary per scheduled day.
 *
 * Exported and pure so the window and the midnight boundary can be tested.
 */
export function dueDailyKey(sub, nowMs) {
  if (!sub.daily_enabled) return null
  if (minutesOfDay(sub.daily_time) == null) return null
  for (const key of [dayKey(nowMs), dayKey(nowMs - 86400000)]) {
    if (sub.last_daily_key === key) continue
    const at = atOn(key, sub.daily_time)
    if (nowMs >= at && nowMs < at + DAILY_WINDOW_MS) return key
  }
  return null
}

async function loadTideData() {
  // URL is set by Netlify to the site's primary address; the override exists for
  // local `netlify functions:invoke`, where URL points at localhost.
  const base = process.env.TIDEDATA_URL ||
    `${(process.env.URL || '').replace(/\/+$/, '')}/tidedata.json`
  if (!base) throw new Error('no tide data URL — set URL or TIDEDATA_URL')
  const res = await fetch(base, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error(`tidedata ${res.status} from ${base}`)
  return res.json()
}

export default async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('push-send: no VAPID keys, nothing to do')
    return new Response('no keys', { status: 200 })
  }
  if (!supabaseReady()) {
    console.log('push-send: no Supabase, nothing to do')
    return new Response('no store', { status: 200 })
  }

  // mailto: is required by the VAPID spec so a push service can contact the
  // sender about abuse; browsers reject a subject that is not mailto: or https:.
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  )

  let subs, data
  try {
    ;[subs, data] = await Promise.all([
      sb('push_subscriptions?select=*&enabled=is.true&limit=5000'),
      loadTideData(),
    ])
  } catch (e) {
    console.error('push-send setup failed:', e)
    return new Response(String(e.message || e), { status: 500 })
  }

  subs = subs || []
  if (!subs.length) {
    console.log('push-send: no enabled subscriptions')
    return new Response('none', { status: 200 })
  }

  const now = Date.now()
  // One extremes list per station, not per subscription — many devices share a
  // station and stationExtremes sorts the whole month each call.
  const exByStation = new Map()
  const extremesFor = id => {
    if (!exByStation.has(id)) exByStation.set(id, stationExtremes(data.tides?.[id]))
    return exByStation.get(id)
  }

  let sent = 0, skipped = 0, blocked = 0, dropped = 0, failed = 0, daily = 0

  for (const sub of subs) {
    try {
      // ── daily summary ─────────────────────────────────────────────────────
      // Independent of the tide rule: its own time, its own area, its own dedup.
      // Only ever populated for devices that opted into closed-app delivery.
      const dailyKey = dueDailyKey(sub, now)
      if (dailyKey) {
        const dex = extremesFor(sub.daily_station_id || sub.station_id)
        const L = t(sub.lang)
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: L.todaysTides,
            // Same builder the app uses, so the push and the in-app summary
            // cannot drift apart.
            body: todaySummary(dex, sub.lang, now),
            tag: 'tide-daily',
            url: '/',
          }),
          { TTL: 3600, urgency: 'normal' },
        )
        await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
          method: 'PATCH',
          headers: { prefer: 'return=minimal' },
          body: JSON.stringify({ last_daily_key: dailyKey, last_daily_at: new Date().toISOString() }),
        })
        daily++
      }

      // ── tide alert ────────────────────────────────────────────────────────
      const ex = extremesFor(sub.station_id)
      if (!ex.length) { skipped++; continue }

      const tide = dueTide(ex, sub, now)
      if (!tide) { skipped++; continue }

      const key = sentKey(sub, tide)
      if (sub.last_sent_key === key) { skipped++; continue }

      // Conditions are about the weather AT THE TIDE, which may be hours out, so
      // the hourly series is consulted rather than current conditions. The cache
      // inside weather.js is keyed on rounded coordinates, so subscriptions at
      // the same spot cost one request per run.
      const conditions = Array.isArray(sub.conditions) ? sub.conditions : []
      if (conditions.length && sub.lat != null) {
        let actuals = null
        try {
          actuals = conditionsAt(await fetchHourly(sub.lat, sub.lon), tide.ts)
        } catch (e) {
          // Forecast down. Matching the in-app behaviour, that must not suppress
          // the alert — a missing forecast is not a reason to stay silent about
          // a tide that is definitely happening.
          console.warn('push-send: forecast unavailable, sending anyway:', String(e.message || e))
        }
        if (actuals) {
          const verdict = evaluate({ conditions }, { ...actuals, tideHeight: tide.m })
          if (!verdict.pass) { blocked++; continue }
        }
      }

      const L = t(sub.lang)
      const kind = tide.type === 'high' ? L.high : L.low
      const payload = JSON.stringify({
        title: `${kind} — ${L.lowTideSoon}`,
        body: L.lowTideAt(tide.disp, fmtHt(tide.m)),
        tag: 'tide-alert',
        url: '/',
      })

      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        // Expire alongside the tide's usefulness: if the push service cannot
        // deliver within the grace window there is no point delivering at all.
        { TTL: Math.max(60, Math.round((tide.ts + GRACE_MS - now) / 1000)), urgency: 'high' },
      )

      await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify({ last_sent_key: key, last_sent_at: new Date().toISOString(), failures: 0 }),
      })
      sent++
    } catch (e) {
      const code = e?.statusCode
      // 404/410 mean the browser threw the subscription away — uninstalled, site
      // data cleared, or permission revoked. It will never work again, so delete
      // it rather than retrying forever.
      if (code === 404 || code === 410) {
        try {
          await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
            { method: 'DELETE', headers: { prefer: 'return=minimal' } })
          dropped++
        } catch (e2) { console.error('push-send: could not prune dead endpoint:', e2) }
      } else {
        failed++
        console.error('push-send: send failed', code || '', String(e?.message || e))
        try {
          await sb(`push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
            method: 'PATCH',
            headers: { prefer: 'return=minimal' },
            body: JSON.stringify({ failures: (sub.failures || 0) + 1 }),
          })
        } catch { /* the counter is diagnostic; losing it must not abort the run */ }
      }
    }
  }

  const summary = `push-send: ${subs.length} subs · tide ${sent} · daily ${daily} · blocked ${blocked} · skipped ${skipped} · dropped ${dropped} · failed ${failed} (period ${PERIOD_MIN}m)`
  console.log(summary)
  return new Response(summary, { status: 200 })
}

// Every 5 minutes. An alert therefore lands between its lead time and lead
// time minus 5 minutes — for a 30-minute warning, 25–30 minutes before the
// tide. Tightening this to "* * * * *" costs 288x the invocations for accuracy
// nobody standing on a beach can use.
export const config = { schedule: '*/5 * * * *' }

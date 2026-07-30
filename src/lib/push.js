// Web push registration, browser side.
//
// This exists because an in-page timer cannot deliver a tide alert on a phone:
// Android freezes a backgrounded tab and then discards it, so the alert only
// appeared when the app was reopened. Registering here lets the server send the
// notification instead, which works with the browser closed.
//
// Everything is best-effort and reports why it failed. Push has many ways to be
// unavailable that are not errors — no keys configured, iOS not installed to the
// Home Screen, permission denied — and each needs different advice.

import { deviceId } from './device.js'

// The applicationServerKey must be raw bytes; the server serves it base64url.
function urlB64ToUint8Array(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - base64.length % 4) % 4)
  const raw = atob(padded)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export function pushSupported() {
  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof PushManager !== 'undefined' &&
    typeof Notification !== 'undefined'
}

// iOS only exposes push to a PWA that has been added to the Home Screen. In
// Safari proper the APIs are missing entirely, so "unsupported" would be a
// misleading thing to tell the user — they need to install the app.
export function isIosBrowser() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)   // iPadOS reports as Mac
  return iOS && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone
}

let cachedConfig = null

export async function pushConfig() {
  if (cachedConfig) return cachedConfig
  try {
    const r = await fetch('/api/push-config')
    // Under plain `vite dev` there is no function and the SPA fallback answers
    // with index.html and a 200 — detect that rather than trying to parse HTML.
    const ct = r.headers.get('content-type') || ''
    if (!r.ok || !ct.includes('application/json')) {
      cachedConfig = { configured: false, reason: 'no-function' }
      return cachedConfig
    }
    cachedConfig = await r.json()
    return cachedConfig
  } catch {
    cachedConfig = { configured: false, reason: 'no-function' }
    return cachedConfig
  }
}

/**
 * Create or refresh this browser's subscription and store it with the rule.
 * Safe to call repeatedly — it is how a rule change reaches the server.
 *
 * @returns {Promise<{ok: boolean, reason?: string, detail?: string}>}
 */
export async function syncPush({ stationId, lat, lon, lang, rule, daily }) {
  if (!pushSupported()) {
    return { ok: false, reason: isIosBrowser() ? 'ios-install' : 'unsupported' }
  }
  if (Notification.permission !== 'granted') return { ok: false, reason: 'permission' }
  if (!stationId) return { ok: false, reason: 'no-station' }

  const cfg = await pushConfig()
  if (!cfg.configured) {
    return { ok: false, reason: cfg.haveStore === false && cfg.haveKeys ? 'no-store' : 'not-configured' }
  }

  let reg
  try {
    reg = await navigator.serviceWorker.ready
  } catch {
    return { ok: false, reason: 'no-worker' }
  }

  let sub
  try {
    sub = await reg.pushManager.getSubscription()
    const wantKey = urlB64ToUint8Array(cfg.publicKey)
    // An existing subscription created under a different VAPID key cannot be
    // reused — subscribe() rejects with InvalidStateError. Rotating keys would
    // then break push permanently for existing installs, so drop and remake it.
    if (sub) {
      const have = new Uint8Array(sub.options?.applicationServerKey || new ArrayBuffer(0))
      const same = have.length === wantKey.length && have.every((b, i) => b === wantKey[i])
      if (!same) { try { await sub.unsubscribe() } catch { /* ignore */ } sub = null }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,          // required by Chrome; we always show one
        applicationServerKey: wantKey,
      })
    }
  } catch (e) {
    return { ok: false, reason: 'subscribe-failed', detail: String(e.message || e) }
  }

  try {
    const res = await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        deviceId: deviceId(),
        stationId, lat, lon, lang, rule,
        // Absent unless the user opted into closed-app delivery; the server
        // treats a missing or disabled block as "store no time".
        daily: daily && daily.enabled ? daily : { enabled: false },
      }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      return { ok: false, reason: 'save-failed', detail: [b.error, b.detail].filter(Boolean).join(' · ') }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'save-failed', detail: String(e.message || e) }
  }
}

// Remove the subscription both locally and server-side. Dropping only the local
// one would leave the cron job pushing to an endpoint the browser has discarded.
export async function stopPush() {
  if (!pushSupported()) return { ok: true }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return { ok: true }
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    await fetch('/api/push-subscribe', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, detail: String(e.message || e) }
  }
}

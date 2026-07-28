// One way to raise a notification, because the two platforms disagree.
//
// ANDROID CHROME FORBIDS `new Notification()`. It throws:
//   "Failed to construct 'Notification': Illegal constructor.
//    Use ServiceWorkerRegistration.showNotification() instead."
// Desktop Chrome allows the constructor, so a desktop-only test passes while
// every Android user gets nothing. Always prefer the service-worker path and
// keep the constructor only as a fallback for when no worker is registered
// (notably `npm run dev`, where the worker is deliberately not installed).
//
// The service-worker path is better anyway: its promise resolves once the
// notification has actually been shown, so success is observed rather than
// assumed, and it supports icon/badge/vibrate, which the constructor ignores
// on mobile.

const ICON = '/icons/icon-192.png'

// navigator.serviceWorker.ready never settles when nothing is registered, so it
// must be raced against a timeout or the caller hangs forever.
function readyWithin(ms) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('no service worker')), ms)),
  ])
}

/**
 * Show a notification.
 * @returns {Promise<'serviceworker'|'constructor'>} which path succeeded
 * @throws if permission is missing or both paths fail
 */
export async function notify(title, options = {}) {
  if (typeof Notification === 'undefined') throw new Error('Notification API unavailable')
  if (Notification.permission !== 'granted') throw new Error('permission not granted')

  const opts = { icon: ICON, badge: ICON, ...options }

  if ('serviceWorker' in navigator) {
    try {
      const reg = await readyWithin(3000)
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, opts)
        return 'serviceworker'
      }
    } catch { /* fall through — no worker, or it refused */ }
  }

  // Desktop fallback. Throws on Android, which is the whole reason the branch
  // above exists; let the error surface so the UI can report it.
  new Notification(title, opts)
  return 'constructor'
}

export function canNotify() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

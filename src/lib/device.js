// Stable per-device identifier for catch reports.
//
// Why this exists alongside the IP: mobile carriers put many users behind one
// shared IP (CGNAT) and rotate them, so an IP alone merges different fishermen
// and splits the same one over time. This ID survives IP changes and is unique
// per device, which is what makes per-user analysis meaningful. The IP is still
// recorded server-side (the browser cannot read its own public IP).

const KEY = 'tide_device_id'

export function deviceId() {
  let id = null
  try { id = localStorage.getItem(KEY) } catch { /* private mode */ }
  if (id) return id
  id = (crypto.randomUUID
    ? crypto.randomUUID()
    : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
  try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
  return id
}

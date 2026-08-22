// Where the tide table comes from.
//
// The bundled copy ships inside the build, so it ages: the window is fixed when
// the file is scraped and a site that is not redeployed eventually runs out of
// days. That is exactly how the forecast went empty in August.
//
// A scheduled GitHub Action now re-scrapes the file in the repository every
// week, and this reads that copy at runtime. New data therefore reaches readers
// without a Netlify build, which matters because builds cost credits and
// running out of them is what blocked the fix last time.
//
// Both copies are read and the newer generatedAt wins. That ordering, rather
// than simply preferring the remote, is what makes this safe:
//
//   * a fresh deploy is never overwritten by an older remote copy
//   * a reader still gets tides when GitHub is unreachable, blocked, or slow
//   * offline, the service worker serves the bundled copy and this still works
//   * a corrupted remote file is rejected before it can replace a good one

const REMOTE = import.meta.env.VITE_TIDE_DATA_URL ||
  'https://raw.githubusercontent.com/rishankv2025-ai/tidel/main/public/tidedata.json'

// The remote is an optimisation, never a dependency, so it gets a short leash.
const REMOTE_TIMEOUT_MS = 8000

// Guard against replacing a working table with something that merely parsed.
// raw.githubusercontent.com serves text/plain, and a repository mid-write or a
// captive-portal login page would both come back as "valid JSON" otherwise.
function looksLikeTideData(d) {
  return !!d && typeof d.generatedAt === 'string' &&
    Array.isArray(d.stations) && d.stations.length > 0 &&
    Array.isArray(d.spots) && d.spots.length > 0 &&
    !!d.tides && Object.keys(d.tides).length > 0 &&
    Number.isFinite(Date.parse(d.generatedAt))
}

async function getJson(url, signal) {
  const r = await fetch(url, signal ? { signal } : undefined)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const d = await r.json()
  if (!looksLikeTideData(d)) throw new Error('not a tide table')
  return d
}

export function fetchBundled() {
  return getJson(`${import.meta.env.BASE_URL}tidedata.json`)
}

// Resolves to null on any failure — timeout, offline, 404, bad shape. The
// caller keeps whatever it already has.
export function fetchRemote() {
  if (!REMOTE) return Promise.resolve(null)
  const ctl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), REMOTE_TIMEOUT_MS) : null
  return getJson(REMOTE, ctl && ctl.signal)
    .catch(() => null)
    .finally(() => { if (timer) clearTimeout(timer) })
}

// True when b is a strictly newer table than a. Equal timestamps count as not
// newer, so an unchanged remote copy never triggers a pointless re-render.
export function isNewer(b, a) {
  if (!b) return false
  if (!a) return true
  return Date.parse(b.generatedAt) > Date.parse(a.generatedAt)
}

export const REMOTE_URL = REMOTE

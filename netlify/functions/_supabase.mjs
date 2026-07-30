// Shared Supabase REST helpers for the functions.
//
// Extracted because push-subscribe and push-send both need them and the key
// header rule is genuinely easy to get wrong (see below). catch-report.mjs and
// catch-stats.mjs keep their own inline copies so nothing that already works in
// production changes shape.

// Supabase has two key formats and they are NOT interchangeable in headers:
//   legacy JWT  "eyJ..."        -> apikey + Authorization: Bearer
//   new secret  "sb_secret_..." -> apikey only; it is not a JWT, so sending it
//                                  as a Bearer token fails validation
export function supabaseHeaders(key, extra = {}) {
  const h = { apikey: key, ...extra }
  if (key.startsWith('eyJ')) h.authorization = `Bearer ${key}`
  return h
}

export function supabaseReady() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  return !!(SUPABASE_URL && SUPABASE_SERVICE_KEY)
}

// Thin wrapper: builds the URL, attaches the right headers, throws with the
// provider's own message so a misconfiguration says what to fix.
export async function sb(path, init = {}) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${path}`
  const res = await fetch(url, {
    ...init,
    headers: supabaseHeaders(SUPABASE_SERVICE_KEY, {
      'content-type': 'application/json',
      ...(init.headers || {}),
    }),
  })
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`)
  // 204 from a PATCH/DELETE with return=minimal has no body to parse
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

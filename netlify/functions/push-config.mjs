// Tells the browser whether push is available, and hands over the VAPID public
// key it needs to create a subscription.
//
// WHY THIS IS AN ENDPOINT rather than a VITE_ build variable: the public key is
// not secret, so baking it in would be safe — but it would also be frozen into
// every cached bundle. Rotating the keypair would then silently break push for
// anyone holding an old build, with no error anywhere. Served at runtime, a
// rotation takes effect on the next page load.

import { supabaseReady, json } from './_supabase.mjs'

export default async () => {
  const key = process.env.VAPID_PUBLIC_KEY
  const haveKeys = !!(key && process.env.VAPID_PRIVATE_KEY)

  return json(200, {
    // Push needs BOTH a keypair to sign with and somewhere to record who to
    // notify. Reporting them separately means the setup docs can say which half
    // is missing instead of just "not configured".
    configured: haveKeys && supabaseReady(),
    haveKeys,
    haveStore: supabaseReady(),
    publicKey: haveKeys ? key : null,
  })
}

export const config = { path: '/api/push-config' }

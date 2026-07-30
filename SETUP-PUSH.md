# Background alerts (web push)

This makes tide alerts arrive **when the app is closed**. Without it the app
still alerts, but only while it is open.

## Why it is needed

A web page cannot wake itself. Android freezes a backgrounded tab within a few
minutes and then discards it entirely, so a `setTimeout` waiting for a tide
never runs — the notification appears only when you reopen the app, which is
exactly the symptom this setup fixes. Reaching a closed browser requires a push
message sent by a server, so the alert rule has to live on the server too.

The pieces:

| Piece | Job |
|---|---|
| `supabase/migrations/0002_push_subscriptions.sql` | stores each device's subscription + its rule |
| `netlify/functions/push-config.mjs` | serves the VAPID public key to the browser |
| `netlify/functions/push-subscribe.mjs` | saves / removes a subscription |
| `netlify/functions/push-send.mjs` | cron, every 5 min — decides who is due and sends |
| `public/sw.js` | receives the push and shows the notification |
| `src/lib/push.js` | registers the browser and keeps the rule in sync |

---

## 1. Install the dependency

```bash
npm install
```

This adds `web-push`, which handles the payload encryption. Hand-rolling that
(ECDH + HKDF + AES-GCM) is the one part of this worth not writing yourself.

## 2. Create the table

Supabase dashboard → **SQL Editor** → **New query** → run these two, in order:

1. `supabase/migrations/0002_push_subscriptions.sql`
2. `supabase/migrations/0003_daily_summary.sql`

Row Level Security is enabled with no policies, exactly as `catch_reports`. That
matters more here: an endpoint together with its `p256dh`/`auth` pair is enough
to send notifications to that device, so only the service role may read it.

## 3. Generate a VAPID keypair

```bash
npx web-push generate-vapid-keys
```

> A keypair has already been generated into your local `.env`. You only need
> this command if you want to replace it.

VAPID is how a push service knows the message really came from your site. The
public key is handed to the browser; the private key signs, and never leaves the
server.

## 4. Set the environment variables

Locally in `.env`, and in **Netlify → Site configuration → Environment
variables** for production:

```
VAPID_PUBLIC_KEY=B...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

Plus the `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` pair you already have for catch
reports — push reuses it.

`VAPID_SUBJECT` must be `mailto:` or `https:`. Push services reject anything
else; it is how they contact you about a sender behaving badly.

> Note: none of these carry a `VITE_` prefix, deliberately. A `VITE_` variable is
> compiled into the public bundle. The public key would survive that, but the
> private key must not, and keeping both server-side means rotating them needs no
> rebuild.

## 5. Deploy

```bash
netlify deploy --build --prod
```

The schedule lives in code — `export const config = { schedule: '*/5 * * * *' }`
at the bottom of `push-send.mjs` — so Netlify registers the cron on deploy. Check
**Netlify → Functions → push-send** afterwards; it should list a schedule and
start logging a line per run:

```
push-send: 3 subs · tide 1 · daily 0 · blocked 0 · skipped 2 · dropped 0 · failed 0 (period 5m)
```

## 6. Turn it on in the app

Open the site, press **Enable alerts**, accept the browser prompt. The card
should then read:

> ✓ Alerts arrive even with the app closed.

If it instead says *"Alerts arrive only while the app is open"*, the server half
is not ready — the message names which half. `/api/push-config` reports it
directly:

```json
{ "configured": true, "haveKeys": true, "haveStore": true, "publicKey": "B..." }
```

---

## iPhone / iPad

iOS only allows push to a PWA **installed to the Home Screen**. In a Safari tab
the APIs do not exist at all, so the app says so rather than claiming to be
unsupported:

1. Open the site in Safari
2. Share → **Add to Home Screen**
3. Open it from the Home Screen icon
4. Press **Enable alerts** there

Requires iOS 16.4 or later.

## Android

Works in a normal Chrome tab, but installing it (**⋮ → Add to Home screen**)
makes Android less eager to reclaim the app and gives notifications a proper
icon.

---

## The daily summary

Separate from the tide alert: a fixed time of day rather than an offset from a
tide. It lives in the same **⚙ Alert rule** panel — enable it, pick a time, pick
which area it should report on, and decide whether it may leave the device.

**It is device-only by default.** With *"Deliver even when the app is closed"*
off, the time is written to `localStorage` and nowhere else — `push-subscribe`
explicitly nulls `daily_time` and sets `daily_enabled = false`, so the database
holds no schedule at all. That is enforced by what gets written, not by the UI
hiding a field. The cost is the usual one: it can only arrive while the app is
open.

Turn the switch on and the time, the area and its coordinates go into this
device's `push_subscriptions` row so the cron can send it with the app closed.
That row still has **no IP column** — see `0002_push_subscriptions.sql`.

Exactly one summary is sent per scheduled day, tracked by `last_daily_key`
(server) and `tide_daily_fired` (device). Both check today's scheduled instant
and yesterday's, so a time like `23:56` — whose window crosses midnight, by which
point the IST date has rolled over — is still delivered rather than silently
lost. A phone asleep at 05:30 gets the summary when it wakes, up to 4 hours
later; past that the app stays quiet instead of pushing stale news.

Content is built by `src/lib/summary.js`, which both the app and the sender
import, so the push and the in-app summary cannot drift apart.

## Timing, honestly

The cron runs every 5 minutes, so an alert lands **between its lead time and
5 minutes earlier** — a 30-minute warning arrives 25–30 minutes before the tide.
Push services add their own small, unpredictable delay on top. Anything past
10 minutes **after** the tide is dropped rather than sent, because "low tide
soon" would by then be false.

Tightening the schedule to `* * * * *` costs 288× the invocations to buy accuracy
nobody standing on a beach can use.

## Testing

Locally, functions and cron do not run under plain `vite dev` — use:

```bash
npm run dev:api                                  # netlify dev, functions available
netlify functions:invoke push-send --no-identity  # force one send cycle
```

`netlify dev` sets `URL` to localhost, where `/tidedata.json` is served, so the
sender finds tide data. If it cannot, point `TIDEDATA_URL` at your deployed file.

To prove delivery end to end, set the lead time to **at the tide** and pick a
station whose next tide is a few minutes out, then invoke the sender manually.

## Troubleshooting

**Nothing arrives, logs say `skipped`.**
Every subscription was checked and none was due. `skipped` also counts a tide
already sent (`last_sent_key`) and a station with no tide data — check
`public/tidedata.json` has not expired.

**Logs say `blocked`.**
The rule's conditions do not hold in the forecast at that tide. This is the rule
working; loosen it or remove conditions.

**Logs say `dropped`.**
The browser threw the subscription away — uninstalled, site data cleared, or
notifications revoked. The row is deleted; re-enable alerts in the app.

**`failed` with a 401 or 403.**
The keypair does not match the one the subscription was created with. This
happens after rotating VAPID keys: existing subscriptions are dead. Clearing the
`push_subscriptions` table forces every device to re-register on next open.

**Alerts arrive twice.**
Should not happen — the app arms its own timer only while push is unregistered,
and both routes use the notification tag `tide-alert`, so one replaces the other.
If it does, check whether two different origins (`example.netlify.app` and a
custom domain) are both subscribed; those are separate registrations.

**A notification saying "This site has been updated in the background".**
The service worker received a push and showed nothing. Every branch of the `push`
handler in `sw.js` calls `showNotification`, so this means the handler threw —
check for a stale cached worker and hard-reload.

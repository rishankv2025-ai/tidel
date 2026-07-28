# Setting up Google Weather API

Optional. The dashboard works without this — it falls back to Open-Meteo, which
is free and needs no key. Do this only if you want to test whether Google's data
is better for your coast.

The app reads `GOOGLE_MAPS_API_KEY`. If set, [netlify/functions/weather.mjs](netlify/functions/weather.mjs)
uses Google. If not set, or if Google refuses, the browser falls back to
Open-Meteo automatically. **You cannot break the dashboard by getting this wrong.**

---

## Read this first — four things that matter

**1. You are in India, so your pricing is not the pricing on most pages.**
Google maintains a separate India price list. This is a large difference:

| | Free calls/month | Price after |
|---|---|---|
| Global SKU `Weather Usage` (9DB8-727A-ACFE) | 10,000 | $0.15 / 1,000 |
| **India SKU `Weather Usage (India)` (0E82-7FAF-9FD2)** | **70,000** | **$0.06 / 1,000** |

7× the free allowance at 40% the price. Note `mapsplatform.google.com/pricing`
geo-localises, so you may be shown either — if you see 70,000 you're on the India
list, if you see 10,000 you're on the global one.

**2. You can start with no credit card.** Google documents a **Maps Demo Key** —
no billing account, no card — and the Weather API is on its supported list. It is
for prototyping only and has an unpublished daily limit, but if you hit it "your
usage is paused until the following day with no risk of charges." See Route A.

**3. There is no daily spending limit by default.** This is the single biggest
risk and it surprised me. Google's FAQ says verbatim: *"There are no maximum daily
limits on the number of requests you can make to Google Maps Platform products,
and the only usage limits are related to the maximum number of queries per minute."*
The default is **6,000 QPM** — a runaway loop could theoretically bill ~8.6M calls
in a day. **A budget alert does not stop this.** Only a quota cap does. Step 6 is
not optional.

**4. Google returns no elevation.** I checked the full response schema — there is
no elevation or altitude field. So altitude keeps coming from Open-Meteo's free
elevation endpoint and waves from Open-Meteo marine, even with Google enabled.
Google only replaces temperature, humidity, wind and pressure.

---

# Route A — Demo Key (no card, start here)

1. Go to <https://developers.google.com/maps/documentation/weather/demo-key>
2. Sign in with your Google account.
3. Click **Get a Demo Key**, accept the terms. The key displays immediately.
4. Skip to step 7 below to plug it in.

Prototyping only — not for production, and the daily quota isn't published. When
you outgrow it, do Route B.

---

# Route B — Standard key (production)

## Step 1 — Create or select a project

Easiest path, which Google now points at first: open the onboarding wizard at
<https://console.cloud.google.com/google/maps-apis/start> — it creates the
project, prompts for billing, enables the API and mints a key in one flow.

Manual equivalent: <https://console.cloud.google.com/projectselector2/home/dashboard>
→ **Create Project**. Confirm the right project is selected before continuing —
most "it doesn't work" reports come down to this.

## Step 2 — Link billing

<https://console.cloud.google.com/project/_/billing>

The current labels are **My projects** tab → the project's **Actions** (⋮) menu →
**Change billing** → pick the account → **Set account**. (Older guides say "Link
a billing account"; that wording is gone.)

Required for a standard key. Google's docs are explicit: *"To use the Weather API,
you must enable billing on each of your projects."* Enabling the API without
billing appears to succeed but every request fails.

New Cloud customers get a **one-time $300 credit over ~90 days** that applies to
Maps Platform. Note it's single-use per customer and tied to your first billing
account — don't model it as ongoing headroom. The old **$200/month Maps credit no
longer exists** — it was discontinued 1 March 2025 and replaced by the per-SKU
free allowances in the table above.

## Step 3 — Enable the Weather API

Use the **Maps-specific** library, not the generic one:
<https://console.cloud.google.com/project/_/google/maps-apis/api-list>

Find the **Weather API** tile (it sits under the **Environment** category with Air
Quality, Pollen and Solar) and click **ENABLE**. If it says **MANAGE**, it's
already on.

Direct deep link: <https://console.cloud.google.com/apis/library/weather.googleapis.com>

Or skip the console entirely:

```bash
gcloud services enable --project "YOUR_PROJECT" "weather.googleapis.com"
```

Don't accidentally enable Air Quality, Pollen or Solar — separate products,
separate charges.

## Step 4 — Create the key

<https://console.cloud.google.com/project/_/google/maps-apis/credentials>

**Create credentials** → **API key** → copy the `AIza...` value → **Close**.

## Step 5 — Restrict the key

**API restrictions — always do this.** Select **Restrict key**, tick **Weather API**
only, **Save**. Google puts the liability on you: *"You are financially responsible
for charges caused by abuse of unrestricted API keys."*

**Application restrictions — read carefully, this is genuinely awkward.**

Google's documented answer is **IP addresses**. The Weather API is classified as a
*Web Service* API, and its documented credential is "API key with IP address
restriction". Two consequences:

- **Never use an HTTP-referrer restriction.** A referrer-restricted key doesn't
  just fail to protect you — it's *rejected*, with `API keys cannot have referer
  restrictions when used with this API`.
- **Never call `weather.googleapis.com` from browser JavaScript.** That's why this
  repo routes it through a Netlify function.

The awkward part: IP restriction requires a stable outbound IP, and **Netlify
functions have dynamic egress IPs that Netlify does not publish or guarantee**.
Pinning one works until it silently doesn't. Google's docs don't cover non-GCP
serverless platforms at all, so there's no official answer here.

So the practical position for this project:

- Set Application restrictions to **None**
- Rely on the **API restriction** (step 5, first paragraph) plus the **quota cap**
  (step 6) as your actual guardrails
- Keep the key out of git

Be clear-eyed that this is a deliberate departure from Google's advice, forced by
the hosting platform — which is exactly why step 6 matters so much. If you later
move to a host with static egress IPs, add the IP restriction then.

Never put this key in the React code. Anything with a `VITE_` prefix is compiled
into the public bundle and readable by any visitor — the same warning the README
already gives about the Apify token.

## Step 6 — Cap the spend (do not skip)

**A budget only alerts.** Google states it plainly: *"Setting a budget does not
automatically cap Google Cloud or Google Maps Platform usage or spending."*

**The hard stop is a quota limit:**

Cloud console → **Google Maps Platform** → **Quotas** → select **Weather API** →
choose the quota → **Edit** → enter a low value → **Submit request**

Documented behaviour once reached: *"your service stops responding to requests."*
Your dashboard handles that gracefully — it falls back to Open-Meteo.

Also set a **usage alert** so you're warned before the cap starts erroring:
Quotas page → select the API → ⋮ → **Create usage alert** (email, SMS, webhook,
PagerDuty, Pub/Sub).

And add a budget anyway, for visibility: **Billing** → **Budgets & alerts** →
**Create budget**, small amount, alerts at 50/90/100%.

One caveat I could not fully confirm: quota dimensions are per-minute and
possibly per-day, **not per-month**, so you likely cannot cap to exactly the free
allowance. If a per-day dimension is exposed, roughly 2,300/day approximates the
70,000 India monthly allowance. Check what the console actually offers.

## Step 7 — Give the key to the app

**Netlify:** Site configuration → Environment variables:

| Variable | Value |
|---|---|
| `GOOGLE_MAPS_API_KEY` | the `AIza...` key |

Redeploy to take effect.

**Locally:** put the same line in `.env` at the repo root and run `netlify dev`
(plain `npm run dev` doesn't run functions, so weather uses the Open-Meteo
fallback):

```
GOOGLE_MAPS_API_KEY=AIza...
```

Confirm `.env` is in `.gitignore`.

## Step 8 — Verify it switched

With `netlify dev` running:

```bash
curl "http://localhost:8888/api/weather?lat=11.939&lon=75.312"
```

| Response | Meaning |
|---|---|
| `{"provider":"google", ...}` | working |
| `{"provider":"none"}` | no key found — check the variable name, redeploy |
| `{"provider":"none","googleError":"...","googleStatus":403}` | key reached Google and was refused; read the message |

In the browser, DevTools → Console shows one warning naming the exact reason if
Google is misconfigured, then the card quietly uses Open-Meteo.

## Error reference

Worth knowing: **the Weather API has no error-handling page** in Google's docs
(`/weather/error-handling` returns 404). The codes below follow Google's
platform-wide conventions and my own testing rather than Weather-specific
documentation, so treat the exact message strings as indicative.

| Symptom | Likely cause | Fix |
|---|---|---|
| `400 API key not valid` | key wrong or truncated | re-copy from Credentials (confirmed by my own test with a fake key) |
| `403` mentioning the API not being used/enabled | Weather API not enabled | step 3 |
| `403` mentioning billing | no billing account linked | step 2 |
| `403` blocked-request wording | API restriction excludes Weather API | step 5 |
| `API keys cannot have referer restrictions when used with this API` | HTTP-referrer restriction set | step 5 — use None (or IP) |
| `429` | over 6,000 QPM, or your own quota cap | step 6 |
| `provider:"none"` with no `googleError` | env var missing | step 7, then redeploy |

---

## Cost sanity check for this app

All Weather endpoints bill to **one** SKU — there's no separate current-conditions
price, and the free allowance is per **billing account**, not per project (extra
projects don't multiply it).

This dashboard caches 10 minutes per rounded coordinate. Even with continuous use
across all 8 spots you'd generate a few hundred calls a day — comfortably inside
the India free allowance of 70,000/month. Subscription plans (Starter $100/mo etc.)
make no sense for Weather alone; pay-as-you-go with a quota cap is right.

## Is it actually worth it?

Measured against real airport instruments at their own coordinates, Open-Meteo
with this repo's current model choice (ICON for moisture, GFS for wind):

| | humidity bias | humidity abs err | wind abs err |
|---|---|---|---|
| Open-Meteo default `best_match` | +4.5 pt | 7.7 pt | 4.3 km/h |
| **This repo now** (ICON + GFS) | +2.0 pt | 6.8 pt | 3.3 km/h |

Google's GA service is powered by their MetNet model and blends observations
rather than interpolating a single forecast model, so it *should* beat that —
but **I have not measured it**, because that needs a real key. Get a Demo Key
(Route A, no card) and compare before committing to the billing setup.

The hard limit is unchanged by any provider: nothing resolves Azhikkal separately
from Mattool 7 km away. That difference is smaller than every model's error bar.

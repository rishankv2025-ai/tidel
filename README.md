# Kannur Tide & Moon 🌊🌙

A premium React dashboard for **Moon phases** and **accurate tidal forecasts** for the Kannur (Kerala) coast and other Indian stations. Dark glassmorphism UI, a scrollable date timeline, location search + GPS, and in-app tide alerts.

Built with **Vite + React**. Tide data is bundled as a static JSON file that a scraper regenerates on demand. Live weather comes from Open-Meteo (free, keyless). Two optional **Netlify serverless functions** add a Google Weather provider and log catch reports to Google Sheets — those need secrets, which live in environment variables and never in the bundle. See [.env.example](.env.example).

**The dashboard runs fully without either function** — no keys, no billing, no setup.

---

## Quick start (local)

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs to dist/
npm run preview    # preview the production build
```

> A simple, dependency-free version also lives in `legacy/index.html` — just double-click it to open in a browser (no build needed).

---

## Deploy to Netlify

The repo already includes `netlify.toml`. Two ways:

**A. Drag-and-drop:** run `npm run build`, then drag the `dist/` folder onto <https://app.netlify.com/drop>.

**B. Git / CLI (auto-build):** push this folder to a Git repo and "Add new site → Import" in Netlify, or run:

```bash
npm i -g netlify-cli
netlify deploy --build --prod
```

Netlify reads `netlify.toml` (build = `npm run build`, publish = `dist`) and the SPA redirect, so it just works.

---

## How the data works (important)

- Tide predictions come from **Tide-Forecast.com** (harmonic model, heights above **Mean Lower Low Water**), scraped by `scripts/refresh-tides.mjs`.
- The scraped results are saved to **`public/tidedata.json`**. The app reads only this file — **there is no API token anywhere**, in the app or in the scraper, so nothing sensitive ships to the browser.
- Two stations are pre-loaded with data (**Kannur**, **Cochin**). Five more (Mangalore, Mumbai, Chennai, Kolkata, Bhavnagar, Vishakhapatnam) are **registered** with coordinates so "nearest station" / GPS works; their tide tables load once you add them in a refresh.
- The moon phase, illumination, age and zodiac are **computed on-device** — no data source needed.
- The "Now" tide level is **not** a data point — it is cosine-interpolated between the two scraped extremes that bracket the current time (`levelAt()` in `src/lib/tide.js`).
- **Weather** (wind, humidity, altitude, waves) is fetched live from **Open-Meteo** — no key, no proxy. These are *forecast model* values, not observations: the request snaps to a model grid point 5–8 km away, so spots closer together than that read identically. Scored against real airport instruments, this repo uses ICON for moisture and GFS for wind because Open-Meteo's `best_match` default pins Kerala humidity near 99% when instruments read ~89%. Altitude is the exception — a real ~90 m DEM lookup at the exact coordinate.
- **Catch reports** are user input, stored to Google Sheets with a snapshot of the tide, moon and weather at submission time. Optional — see [SETUP-SHEETS.md](SETUP-SHEETS.md).

### Refreshing / adding station data

Each scrape covers ~30 days, so **refresh roughly monthly**:

```bash
node scripts/refresh-tides.mjs --dry   # parse and report, write nothing
node scripts/refresh-tides.mjs         # rewrite public/tidedata.json
npm run build                          # then commit and redeploy
```

The script fetches `https://www.tide-forecast.com/locations/<slug>/tides/latest` for
every station with `hasData: true`, parses the tide tables, and rewrites
`tides.<StationId>` plus `generatedAt` and `source`. To add a station, set its
`hasData: true` in `public/tidedata.json` and re-run — slugs are already in
`stations[].slug`.

`--dry` prints day counts, the covered date range, tides-per-day and the height
range next to the previous values, which is the quickest way to see whether a
scrape looks sane before it is written.

**When the window runs low the app says so.** If fewer than 7 days remain, a banner
appears above the tide card naming the last covered date. Before that existed the
forecast just got shorter each day and quietly emptied.

> **No API token is involved.** An earlier version of this doc routed the scrape
> through the Apify actor `lulzasaur/tideforecast-scraper`, which needed a token.
> The actor was only a wrapper around a public page that fetches fine with an
> ordinary user agent, so the script talks to the page directly. Nothing here
> reads an `APIFY_*` variable. If you ever pasted an Apify token somewhere public,
> rotate it in the Apify console anyway.

> ⚠️ Whatever you use to refresh, it must run **outside** the React app. Anything
> with a `VITE_` prefix is baked into the public JavaScript bundle and readable by
> any visitor, so a scraper that needed a credential could never live in `src/`.

<details>
<summary>Height scale correction (August 2026)</summary>

Data scraped before 2026-08-21 had every height **divided by 3.28** — the old
pipeline read the page's metre figure as if it were feet and converted it. Kannur
therefore showed a 0.04–0.48 m range where the real figure is 0.17–1.50 m. Times
were unaffected and matched exactly, which is how the factor was identified.

`scripts/refresh-tides.mjs` reads the metric value directly, so anything it writes
is correct. But **catch reports submitted before this date carry a
`tide_height_m` snapshot on the old, wrong scale** and are not comparable with
newer ones — multiply those by 3.2808 to line them up.
</details>

---

## Features

- **Date scroller** — pick any day in range; moon + tide dashboard update.
- **Location engine** — dropdown of the 8 Kannur spots + stations, free-text search, "Use my location" (GPS → nearest station), and ★ Save to set a default (stored in `localStorage`).
- **Moon card** — accurate phase visual, illumination, age, waxing/waning, zodiac, next full (white / വെളുത്ത വാവ്) and new (black / കറുത്ത വാവ്) moon.
- **Tide dashboard** — animated wave that fills to the current level, rising/falling status, and the next tide.
- **7-day forecast** — expandable per-day high/low tides with All / High-only / Low-only filters.
- **In-app alerts** — opt-in browser notifications for today's summary and the next low tide *while the app is open*.

### Note on notifications
Two delivery routes, and only one is armed at a time:

- **Web push** — the rule is registered with the server and a Netlify scheduled
  function sends the notification. This is the only route that works with the app
  **closed**, which on Android is the normal case: a backgrounded tab is frozen
  within minutes and then discarded, so an in-page timer never runs until the app
  is reopened. Needs a VAPID keypair and the Supabase table — see
  [SETUP-PUSH.md](SETUP-PUSH.md). On iPhone the app must be installed to the Home
  Screen first.
- **In-app** — a wall-clock timer, used when push is unavailable. Fires only
  while the app is open. It re-derives the countdown from `Date.now()` on every
  wake rather than trusting one long `setTimeout`, because a suspended page
  resumes a pending timer from where it stopped instead of catching up — which
  made a 6-hour warning arrive with 30 minutes left, or after the tide.

Lead times run from *at the tide* to **6 hours** before. Because the sender runs
every 5 minutes, a push lands between its lead time and 5 minutes earlier.

There is also a **daily summary** — today's moon phase and every tide, at a time
you choose, for an area you choose. It is **device-only by default**: the time
stays in `localStorage` and nothing is written to the server unless you turn on
"deliver even when the app is closed". See [SETUP-PUSH.md](SETUP-PUSH.md).

---

## Structure

```
index.html            Vite entry
public/tidedata.json  bundled tide data + station registry
netlify.toml          build config + /api/* routing (must precede the SPA catch-all)
.env.example          template for the optional secrets
src/
  App.jsx             state: data, location, date, language
  lib/moon.js         moon phase / zodiac math (no network)
  lib/tide.js         extremes, cosine interpolation, haversine
  lib/weather.js      Open-Meteo fetch + model choice, falls back if /api/weather is absent
  lib/i18n.js         all UI strings, English + Malayalam (94 keys each)
  lib/device.js       random per-device id for catch reports
  components/         LocationBar, TopNavigation, MoonPhaseCard, TideDashboardCard,
                      WeatherCard, ForecastList, CatchReportCard, NotificationManager
  lib/push.js         registers the browser for web push, keeps the rule in sync
  lib/daily.js        daily-summary settings + IST time math (localStorage)
  lib/summary.js      the "today" sentence, shared with the push sender
netlify/functions/
  weather.mjs         optional Google Weather provider  -> SETUP-GOOGLE-WEATHER.md
  catch-report.mjs    appends catch reports to a Sheet   -> SETUP-SHEETS.md
  catch-stats.mjs     aggregates for the analysis dashboard
  push-config.mjs     serves the VAPID public key        -> SETUP-PUSH.md
  push-subscribe.mjs  stores a subscription + its rule
  push-send.mjs       cron every 5 min, sends due alerts
  _supabase.mjs       shared REST helpers for the above
legacy/               the original single-file version (works with no build)
```

## Language

English / Malayalam toggle in the header (🌐), persisted in `localStorage`. It
switches all UI text *and* the date locale (`en-IN` / `ml-IN`), and drops
`letter-spacing` under `html[lang="ml"]` because it breaks Malayalam conjuncts.
The Malayalam beyond place names, zodiac and the original tide terms was written
during development and has **not been reviewed by a native speaker** — worth
checking before this reaches real users.

## Known issues

- **Moon phase name vs "Next full" can contradict.** The name comes from hardcoded
  age bands (`Full Moon` = age 13.0–16.5 d) while the date comes from an actual
  phase search, so the card can read "Full Moon" while saying the next full moon is
  two days away. Fix is to derive the name from phase proximity.
- **Low-tide alerts fire *at* the low tide, not before**, despite the UI text saying
  "before" — `delay = nextLow.ts - now` in `NotificationManager.jsx` has no lead time.
- **`public/tidedata.json` expires.** Current file covers 2026-07-24 → 2026-08-22;
  re-run the scrape before it lapses.

Accuracy: harmonic predictions are good for timing and near-shore heights but are **not for navigation**. For official Indian data see INCOIS (incois.gov.in).

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

- Tide predictions come from **Tide-Forecast.com** (harmonic model, heights above **local chart datum**) via an Apify scraper.
- The scraped results are saved to **`public/tidedata.json`**. The app reads only this file — **there is no API token in the app**, so nothing sensitive ships to the browser.
- Two stations are pre-loaded with data (**Kannur**, **Cochin**). Five more (Mangalore, Mumbai, Chennai, Kolkata, Bhavnagar, Vishakhapatnam) are **registered** with coordinates so "nearest station" / GPS works; their tide tables load once you add them in a refresh.
- The moon phase, illumination, age and zodiac are **computed on-device** — no data source needed.
- The "Now" tide level is **not** a data point — it is cosine-interpolated between the two scraped extremes that bracket the current time (`levelAt()` in `src/lib/tide.js`).
- **Weather** (wind, humidity, altitude, waves) is fetched live from **Open-Meteo** — no key, no proxy. These are *forecast model* values, not observations: the request snaps to a model grid point 5–8 km away, so spots closer together than that read identically. Scored against real airport instruments, this repo uses ICON for moisture and GFS for wind because Open-Meteo's `best_match` default pins Kerala humidity near 99% when instruments read ~89%. Altitude is the exception — a real ~90 m DEM lookup at the exact coordinate.
- **Catch reports** are user input, stored to Google Sheets with a snapshot of the tide, moon and weather at submission time. Optional — see [SETUP-SHEETS.md](SETUP-SHEETS.md).

### Refreshing / adding station data

Each Tide-Forecast scrape covers ~30 days, so refresh roughly monthly (or to add a station). Ask your assistant to "refresh the Kannur tide data" (it re-runs the Apify actor and rewrites `public/tidedata.json`), or do it manually:

1. Run the Apify actor `lulzasaur/tideforecast-scraper` with:
   `{"mode":"location","startUrls":[{"url":"https://www.tide-forecast.com/locations/Kannur/tides/latest"}]}`
   (add more `startUrls` for other stations; slugs are in `public/tidedata.json` → `stations[].slug`).
2. Map each scraped tide to `{ t: time, m: parseFloat(heightMeters), type, ts: timestamp }`, grouped by `date`.
3. Write the result into `public/tidedata.json` under `tides.<StationId>` and set that station's `hasData: true`.
4. Rebuild / redeploy.

> ⚠️ **Security:** never put your Apify API token in this React app — anything with a `VITE_` prefix is baked into the public JavaScript bundle and readable by any visitor. The scrape/refresh runs outside the app (your assistant, a script, or a serverless function), and only the resulting JSON is shipped. If you pasted your token anywhere public, rotate it in the Apify console.

---

## Features

- **Date scroller** — pick any day in range; moon + tide dashboard update.
- **Location engine** — dropdown of the 8 Kannur spots + stations, free-text search, "Use my location" (GPS → nearest station), and ★ Save to set a default (stored in `localStorage`).
- **Moon card** — accurate phase visual, illumination, age, waxing/waning, zodiac, next full (white / വെളുത്ത വാവ്) and new (black / കറുത്ത വാവ്) moon.
- **Tide dashboard** — animated wave that fills to the current level, rising/falling status, and the next tide.
- **7-day forecast** — expandable per-day high/low tides with All / High-only / Low-only filters.
- **In-app alerts** — opt-in browser notifications for today's summary and the next low tide *while the app is open*.

### Note on notifications
Web pages can't reliably fire notifications when the browser is **closed** without a push server. This app therefore alerts you while it's open. For true scheduled push when closed, a small backend/push service would be required (out of scope here).

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
netlify/functions/
  weather.mjs         optional Google Weather provider  -> SETUP-GOOGLE-WEATHER.md
  catch-report.mjs    appends catch reports to a Sheet   -> SETUP-SHEETS.md
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

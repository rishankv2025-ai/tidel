# Catch report → Google Sheets

Reports from the dashboard are appended as rows to a Google Sheet by the
Netlify function at `netlify/functions/catch-report.mjs`.

It authenticates with a **service account** (a robot Google account) using a
JWT signed with Node's built-in `crypto`, so there are **no npm dependencies**
to install or keep patched.

## 1. Create the sheet

1. Make a new Google Sheet.
2. Rename the first tab to `reports` (or pick your own and set `SHEET_TAB`).
3. Leave it completely empty — the function writes the header row itself on the
   first report.
4. Copy the **sheet ID** from the URL — the long string between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...xyz`**`/edit`

## 2. Create the service account

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → Library** → search *Google Sheets API* → **Enable**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   Give it any name; no roles are needed.
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` file downloads. From it you need two fields:
   - `client_email` → looks like `something@project.iam.gserviceaccount.com`
   - `private_key`  → the long `-----BEGIN PRIVATE KEY-----…` block

## 3. Share the sheet with the robot

This is the step people miss: **the service account is a separate user and
cannot see your sheet until you share it.**

In the Sheet press **Share**, paste the `client_email` address, give it
**Editor**, and untick "Notify people".

## 4. Set the environment variables

In Netlify: **Site configuration → Environment variables**.

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` |
| `GOOGLE_PRIVATE_KEY` | the whole `private_key`, `-----BEGIN` to `END-----` |
| `SHEET_ID` | the id from step 1 |
| `SHEET_TAB` | optional, defaults to `reports` |

The private key contains newlines. Pasting it into Netlify's UI as-is works.
If your tooling escapes them as literal `\n`, that is also handled — the
function calls `.replace(/\\n/g, '\n')` before signing.

**Never commit these to git.** They grant write access to the sheet.

## 5. Local testing

The function does not run under `npm run dev` (that's Vite alone), so the
submit button will fail locally with a 404. To run functions locally:

```bash
npm i -g netlify-cli
netlify dev            # serves the site AND /api/catch-report
```

Put the same four variables in a `.env` file at the repo root for `netlify dev`.

## Columns written

One row per report. Written in this fixed order:

```
timestamp_utc, timestamp_local, device_id, ip,
location_label, lat, lon,
catch_type, catch_other, quantity_kg,
tide_state, tide_height_m, next_extreme_type, next_extreme_time,
moon_phase, moon_illum_pct,
wind_kmh, wind_dir_deg, wind_gust_kmh, humidity_pct,
elevation_m, wave_height_m,
notes, lang
```

The tide, moon and weather values are a **snapshot taken at the moment of
submission** and travel with the report. They are stored in English/canonical
form (`rising`/`falling`, `high`/`low`, English moon phase) regardless of the
UI language, so the sheet stays analysable when reports arrive in both
languages.

That is what makes the data worth collecting: you can group catch weight by
tide state, moon phase, or wind and see what actually correlates.

## About the two identifiers

`device_id` is a random UUID generated once per device and kept in
`localStorage`. `ip` is read server-side from the Netlify edge.

Both are stored because neither alone is sufficient. An IP cannot identify a
device reliably — mobile carriers put many users behind one shared address
(CGNAT) and rotate them, so reports from different fishermen merge and reports
from one fisherman split over time. The device ID is stable per phone, but
resets if the user clears site data. Group by `device_id` for per-user
analysis; the IP is there as a coarse cross-check.

Note that an IP address is personal data under India's DPDP Act 2023 and the
GDPR. If this moves beyond personal use, add a short notice telling users what
is collected.

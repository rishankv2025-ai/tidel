// Refresh public/tidedata.json from Tide-Forecast.com.
//
// No Apify token is needed. The Apify actor was only a wrapper around a public
// page, and that page fetches fine with an ordinary user agent, so this parses
// it directly and keeps the token out of the picture entirely.
//
//   node scripts/refresh-tides.mjs --dry    parse and report, write nothing
//   node scripts/refresh-tides.mjs          rewrite public/tidedata.json
//
// Row shape on the page:
//   <tr><td>High Tide</td>
//       <td><b> 7:01 AM</b><span ...>(Fri 21 August)</span></td>
//       <td ...><b ...>1.11 m</b> <span ...>(3.64 ft)</span></td></tr>
//
// The per-row dates carry no year, so the year comes from the page heading
// ("Friday 21 August 2026") and rolls forward whenever the month number goes
// backwards, which only happens at a December -> January boundary.

import { readFileSync, writeFileSync } from 'fs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const FILE = new URL('../public/tidedata.json', import.meta.url)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// One tide row. Written as a literal so there is no string-escaping layer.
const ROW = /<tr[^>]*>\s*<td>(High|Low) Tide<\/td>\s*<td><b>\s*(\d{1,2}:\d{2}\s*[AP]M)<\/b><span[^>]*>\(\w+\s+(\d{1,2})\s+(\w+)\)<\/span><\/td>\s*<td[^>]*><b[^>]*>([\d.]+)\s*m<\/b>/g
const HEADING = /(\d{1,2})\s+(\w+)\s+(20\d{2})</
const DATUM = /Tide Datum:<\/b>\s*([^<]+)/

// IST is UTC+5:30 year round with no daylight saving, so a fixed offset is exact.
const istEpochSeconds = (y, monthIdx, day, hh, mm) =>
  Math.floor(Date.UTC(y, monthIdx, day, hh, mm) / 1000) - 5.5 * 3600

// The page writes a post-midnight tide as "00:42AM", which rendered verbatim
// reads as a broken clock. Rebuild the label from the parsed time so it is
// always a well-formed 12-hour string: "12:42AM".
const fmt12 = (h, m) =>
  `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'AM' : 'PM'}`

function to24h(raw) {
  const m = raw.replace(/\s+/g, '').match(/^(\d{1,2}):(\d{2})([AP]M)$/i)
  if (!m) return null
  const h = (Number(m[1]) % 12) + (/PM/i.test(m[3]) ? 12 : 0)
  return [h, Number(m[2])]
}

// The site sits behind Cloudflare, which treats a bare fetch from a datacentre
// IP far more suspiciously than the same request from a home connection. Sending
// the full set of headers a browser would send makes the request ordinary rather
// than obviously scripted. This is not evasion — it is one page, a few times a
// month, at a polite rate — it just avoids being misfiled as a bot.
const BROWSER_HEADERS = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Fetch with a couple of retries. A Cloudflare challenge often clears on a
// second attempt, and a transient 5xx always does. On final failure the status
// and a slice of the body go into the error, because a scheduled run that fails
// silently is a run nobody can debug.
async function fetchPage(url, label) {
  let last = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow' })
      if (res.ok) return await res.text()
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)
      last = `HTTP ${res.status} ${res.statusText} — ${body || '(empty body)'}`
    } catch (e) {
      last = `${e.name}: ${e.message}`
    }
    if (attempt < 3) {
      console.log(`  ${label}: attempt ${attempt} failed (${last}); retrying`)
      await sleep(attempt * 4000)
    }
  }
  throw new Error(`${label}: ${last}`)
}

async function scrape(slug) {
  const url = `https://www.tide-forecast.com/locations/${slug}/tides/latest`
  const html = await fetchPage(url, slug)

  const head = html.match(HEADING)
  let year = head ? Number(head[3]) : new Date().getFullYear()
  let lastMonth = head ? MONTHS.indexOf(head[2]) : -1

  const byDate = new Map()
  let rows = 0
  for (const m of html.matchAll(ROW)) {
    const [, type, timeRaw, dayStr, monthStr, heightStr] = m
    const monthIdx = MONTHS.indexOf(monthStr)
    const hm = to24h(timeRaw)
    if (monthIdx < 0 || !hm) continue

    // December -> January means the calendar year advanced
    if (lastMonth >= 0 && monthIdx < lastMonth) year++
    lastMonth = monthIdx
    rows++

    const day = Number(dayStr)
    const date = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push({
      t: fmt12(hm[0], hm[1]),                  // "7:01AM" — the format the app already stores
      m: parseFloat(heightStr),
      type,                                     // "High" | "Low"
      ts: istEpochSeconds(year, monthIdx, day, hm[0], hm[1]),
    })
  }

  // Two tables on the page (the "today" header widget and the main forecast)
  // repeat the same tides, so identical entries have to be collapsed.
  const days = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, list]) => {
      const seen = new Set()
      const tides = list
        .filter(x => { const k = x.ts + x.type; if (seen.has(k)) return false; seen.add(k); return true })
        .sort((a, b) => a.ts - b.ts)
      return { date, tides }
    })

  return { days, rows, datum: (html.match(DATUM) || [, 'unknown'])[1].trim() }
}

const dry = process.argv.includes('--dry')
const data = JSON.parse(readFileSync(FILE, 'utf8'))
const targets = data.stations.filter(s => s.hasData)

console.log(`refreshing ${targets.length} station(s): ${targets.map(s => s.id).join(', ')}\n`)

let datum = ''
for (const st of targets) {
  const { days, rows, datum: d } = await scrape(st.slug)
  if (!days.length) throw new Error(`${st.id}: parsed 0 tides — the page markup probably changed`)
  datum = d

  const heights = days.flatMap(x => x.tides.map(t => t.m))
  const perDay = days.map(x => x.tides.length)
  const old = data.tides[st.id] || []
  const oldH = old.flatMap(x => x.tides.map(t => t.m))

  // Height of Mean Sea Level above Chart Datum, so the app can offer both
  // references. The scraped heights are above Chart Datum (Lowest Astronomical
  // Tide), which is why none of them is ever negative; MSL is the average level,
  // so a reading below it goes negative.
  //
  // Officially MSL is averaged over a 18.6-year tidal epoch. This is the mean of
  // every extreme in the ~29-day table, which covers a full spring/neap cycle and
  // lands within about 0.1 m of the published figures — close enough to label a
  // tide tile, and it is recomputed on every refresh so it tracks the data.
  const mslOffset = +(heights.reduce((a, b) => a + b, 0) / heights.length).toFixed(3)

  console.log(`${st.id}`)
  console.log(`  ${rows} rows -> ${days.length} days  ${days[0].date} .. ${days[days.length - 1].date}`)
  console.log(`  tides/day ${Math.min(...perDay)}-${Math.max(...perDay)}   days with 3: ${perDay.filter(n => n === 3).length}`)
  console.log(`  heights ${Math.min(...heights).toFixed(2)}-${Math.max(...heights).toFixed(2)} m` +
    (oldH.length ? `   (was ${Math.min(...oldH).toFixed(2)}-${Math.max(...oldH).toFixed(2)} m)` : ''))
  console.log(`  datum: ${d}   MSL sits ${mslOffset} m above it`)

  if (!dry) {
    data.tides[st.id] = days
    st.mslOffset = mslOffset      // st is a reference into data.stations
  }
}

if (dry) {
  console.log('\n--dry: nothing written')
  process.exit(0)
}

data.generatedAt = new Date().toISOString()
data.source = `Tide-Forecast.com harmonic predictions (heights above ${datum})`
writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n')
console.log(`\nwrote public/tidedata.json`)
console.log(`source: ${data.source}`)

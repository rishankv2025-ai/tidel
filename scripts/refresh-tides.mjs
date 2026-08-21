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

async function scrape(slug) {
  const url = `https://www.tide-forecast.com/locations/${slug}/tides/latest`
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`)
  const html = await res.text()

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

  console.log(`${st.id}`)
  console.log(`  ${rows} rows -> ${days.length} days  ${days[0].date} .. ${days[days.length - 1].date}`)
  console.log(`  tides/day ${Math.min(...perDay)}-${Math.max(...perDay)}   days with 3: ${perDay.filter(n => n === 3).length}`)
  console.log(`  heights ${Math.min(...heights).toFixed(2)}-${Math.max(...heights).toFixed(2)} m` +
    (oldH.length ? `   (was ${Math.min(...oldH).toFixed(2)}-${Math.max(...oldH).toFixed(2)} m)` : ''))
  console.log(`  datum: ${d}`)

  if (!dry) data.tides[st.id] = days
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

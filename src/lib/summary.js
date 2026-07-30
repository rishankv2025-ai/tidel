// The one-line "today" summary: moon phase, then every tide of the day.
//
// Lives here rather than in App.jsx because THREE places must produce the same
// sentence — the "Show today's summary" button, the daily alert fired in-app,
// and the daily push sent by netlify/functions/push-send.mjs. When the server
// built its own version they drifted, and a user comparing the two had no way to
// know which was right.
//
// Pure, and no browser APIs, so the Netlify function can import it directly.

import { moonInfo } from './moon.js'
import { dayKey, extremesForDay } from './tide.js'
import { t, phaseName } from './i18n.js'

/**
 * @param {Array} ex      station extremes, from stationExtremes()
 * @param {'en'|'ml'} lang
 * @param {number} nowMs  the moment "today" is measured from
 */
export function todaySummary(ex, lang, nowMs = Date.now()) {
  const L = t(lang)
  const tides = extremesForDay(ex || [], dayKey(nowMs))
  const moon = phaseName(lang, moonInfo(new Date(nowMs)).name)
  if (!tides.length) return `${moon}. ${L.noTideToday}`
  const line = tides
    .map(x => `${x.type === 'high' ? L.high : L.low} ${x.disp}`)
    .join('  ·  ')
  return `${moon}. ${line}`
}

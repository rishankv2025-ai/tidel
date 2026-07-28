// Sun and moon rise/set plus current moon visibility, via suncalc.
//
// UNITS: suncalc 2.0.1 returns azimuth and altitude in DEGREES, not radians.
// Verified against known values — altitude at sunrise is -0.349 (atmospheric
// refraction) and 82.99 at solar noon for 11.9N in late July. Do NOT multiply
// by 180/PI; doing so yields impossible altitudes like 2782 degrees.
// suncalc 2.0.1's ESM entry exports named functions only — there is no default
// export, so `import SunCalc from 'suncalc'` fails the production build.
import { getTimes, getMoonTimes, getMoonPosition, getPosition } from 'suncalc'
import { TZ } from './tide.js'

// A day in this app is an IST day, but SunCalc.getMoonTimes works on UTC days,
// and the moon can rise on one UTC day and set on the next. So collect events
// from a window of UTC days and keep the ones inside the IST day.
function istDayWindow(dayKey) {
  const start = new Date(`${dayKey}T00:00:00+05:30`).getTime()
  return [start, start + 86400000]
}

function moonEventsIn(dayKey, lat, lon) {
  const [start, end] = istDayWindow(dayKey)
  let rise = null, set = null, alwaysUp = false, alwaysDown = false
  // getMoonTimes always scans the UTC calendar day of the date given (it calls
  // setUTCHours(0,0,0,0) internally and takes no timezone flag), so probe the
  // three UTC days that can overlap this IST day and keep what lands inside.
  for (let d = -1; d <= 1; d++) {
    const probe = new Date(start + d * 86400000)
    const m = getMoonTimes(probe, lat, lon)
    if (m.alwaysUp) alwaysUp = true
    if (m.alwaysDown) alwaysDown = true
    const inDay = t => t instanceof Date && !Number.isNaN(t.getTime()) &&
      t.getTime() >= start && t.getTime() < end
    if (!rise && inDay(m.rise)) rise = m.rise
    if (!set && inDay(m.set)) set = m.set
  }
  return { rise, set, alwaysUp, alwaysDown }
}

const fmt = d => (d instanceof Date && !Number.isNaN(d.getTime())
  ? d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
  : null)

export function sunMoon(dayKey, lat, lon, nowMs = Date.now()) {
  if (lat == null || lon == null) return null
  // midday anchor keeps getTimes on the intended local date
  const anchor = new Date(`${dayKey}T12:00:00+05:30`)
  const t = getTimes(anchor, lat, lon)
  const mt = moonEventsIn(dayKey, lat, lon)

  const [start, end] = istDayWindow(dayKey)
  const isToday = nowMs >= start && nowMs < end
  // Only meaningful for today — moon position for a past/future day would be
  // read as "right now", which it isn't.
  const pos = isToday ? getMoonPosition(new Date(nowMs), lat, lon) : null
  const sun = isToday ? getPosition(new Date(nowMs), lat, lon) : null

  const dayLenMs = (t.sunset instanceof Date && t.sunrise instanceof Date)
    ? t.sunset.getTime() - t.sunrise.getTime() : null

  return {
    isToday,
    sunrise: fmt(t.sunrise),
    sunset: fmt(t.sunset),
    dawn: fmt(t.dawn),
    dusk: fmt(t.dusk),
    goldenHour: fmt(t.goldenHour),          // evening golden hour start
    dayLength: dayLenMs == null ? null
      : `${Math.floor(dayLenMs / 3600000)}h ${Math.round(dayLenMs % 3600000 / 60000)}m`,
    moonrise: fmt(mt.rise),
    moonset: fmt(mt.set),
    moonAlwaysUp: mt.alwaysUp && !mt.rise && !mt.set,
    moonAlwaysDown: mt.alwaysDown && !mt.rise && !mt.set,
    // degrees, already — see the UNITS note above
    moonAltitude: pos ? pos.altitude : null,
    moonAzimuth: pos ? pos.azimuth : null,
    moonUp: pos ? pos.altitude > 0 : null,
    sunUp: sun ? sun.altitude > 0 : null,
  }
}

// Local moon-phase + position math. No API needed.
const SYNODIC = 29.530588853
const RAD = Math.PI / 180

function toJD(d) { return d.getTime() / 86400000 + 2440587.5 }

export function moonInfo(date) {
  let ph = (toJD(date) - 2451550.1) / SYNODIC
  ph = ph - Math.floor(ph)                 // 0=new, .5=full
  const age = ph * SYNODIC
  const illum = (1 - Math.cos(2 * Math.PI * ph)) / 2
  const waxing = ph < 0.5
  let name
  if (age < 1.5 || age > 28.0) name = 'New Moon'
  else if (age < 6.0)  name = 'Waxing Crescent'
  else if (age < 9.0)  name = 'First Quarter'
  else if (age < 13.0) name = 'Waxing Gibbous'
  else if (age < 16.5) name = 'Full Moon'
  else if (age < 20.5) name = 'Waning Gibbous'
  else if (age < 24.0) name = 'Last Quarter'
  else name = 'Waning Crescent'
  return { phase: ph, age, illum, name, waxing, isWhite: illum > 0.5 }
}

// nearest upcoming date whose phase matches target (0=new, .5=full)
export function nextPhaseDate(target, from = new Date()) {
  let bd = 9, bt = null
  for (let h = 1; h <= 40 * 24; h++) {
    const t = new Date(from.getTime() + h * 3600000)
    let ph = (toJD(t) - 2451550.1) / SYNODIC; ph = ph - Math.floor(ph)
    let d = Math.abs(ph - target); d = Math.min(d, 1 - d)
    if (d < bd) { bd = d; bt = t } else if (bd < 0.02 && d > bd) break
  }
  return bt
}

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]
const SIGN_ML = ['മേടം','ഇടവം','മിഥുനം','കർക്കടകം','ചിങ്ങം','കന്നി','തുലാം','വൃശ്ചികം','ധനു','മകരം','കുംഭം','മീനം']

// Low-precision lunar ecliptic longitude -> zodiac sign (approximate)
export function moonZodiac(date) {
  const d = toJD(date) - 2451545.0
  const L = 218.316 + 13.176396 * d          // mean longitude
  const M = 134.963 + 13.064993 * d          // mean anomaly
  let lon = L + 6.289 * Math.sin(M * RAD)     // + largest correction term
  lon = ((lon % 360) + 360) % 360
  const i = Math.floor(lon / 30) % 12
  return { sign: SIGNS[i], ml: SIGN_ML[i], lon }
}

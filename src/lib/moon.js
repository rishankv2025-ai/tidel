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
  // The four principal phases fall a quarter-month apart — at 0, 7.38, 14.77 and
  // 22.15 days — and each gets a window centred on that instant. The four
  // intermediate names fill the gaps. Deriving the boundaries from SYNODIC keeps
  // them symmetric; the previous hardcoded bands drifted, giving the waxing
  // crescent 4.5 days against the waning crescent's 4.0 and the first quarter
  // 3.0 against the last quarter's 3.5, so every name in the waxing half arrived
  // up to half a day early.
  const Q = SYNODIC / 4        // 7.3826 d between principal phases
  const W = 1.75               // half-width of a principal-phase window
  let name
  if (age < W || age > SYNODIC - W) name = 'New Moon'
  else if (age < Q - W)             name = 'Waxing Crescent'
  else if (age < Q + W)             name = 'First Quarter'
  else if (age < 2 * Q - W)         name = 'Waxing Gibbous'
  else if (age < 2 * Q + W)         name = 'Full Moon'
  else if (age < 3 * Q - W)         name = 'Waning Gibbous'
  else if (age < 3 * Q + W)         name = 'Last Quarter'
  else                              name = 'Waning Crescent'
  // The white/black vaavu tag follows the Malayalam fortnights, which are defined
  // by direction of travel, not by brightness: Shukla Paksha (വെളുത്ത വാവ്) is the
  // waxing half, new -> full; Krishna Paksha (കറുത്ത വാവ്) is the waning half,
  // full -> new. Keying it on illumination instead put the boundary at the
  // quarters, so a fat waning gibbous read as "white" and a thin waxing crescent
  // as "black" — half of each fortnight was labelled with the wrong one.
  return { phase: ph, age, illum, name, waxing, isWhite: waxing }
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

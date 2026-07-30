// User-defined alert rules for tide notifications.
//
// A rule is: notify me `leadMinutes` before the next {low|high|any} tide, but
// only if every condition holds AT THAT TIDE — not now. Conditions are checked
// against the hourly forecast for the tide's timestamp (see conditionsAt in
// weather.js), because "wind under 15 km/h" said at 9pm about a 4am low tide is
// a question about 4am.

const KEY = 'tide_alert_rule'

export const FIELDS = ['tideHeight', 'windSpeed', 'windGust', 'waveHeight', 'humidity']
export const OPS = ['lt', 'gt']
// Minutes of warning. The hour-scale options only mean anything because the
// scheduler checks the wall clock rather than trusting one long setTimeout —
// see NotificationManager. Existing saved rules keep working, since loadRule
// only validates membership in this list.
export const LEAD_CHOICES = [0, 15, 30, 45, 60, 90, 120, 180, 240, 300, 360]

export const UNITS = {
  tideHeight: 'm', windSpeed: 'km/h', windGust: 'km/h', waveHeight: 'm', humidity: '%',
}

export const DEFAULT_RULE = {
  enabled: true,
  leadMinutes: 30,
  tideType: 'low',            // 'low' | 'high' | 'any'
  conditions: [],             // [{ field, op, value }]
}

export function loadRule() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_RULE }
    const r = JSON.parse(raw)
    return {
      enabled: r.enabled !== false,
      leadMinutes: LEAD_CHOICES.includes(+r.leadMinutes) ? +r.leadMinutes : DEFAULT_RULE.leadMinutes,
      tideType: ['low', 'high', 'any'].includes(r.tideType) ? r.tideType : 'low',
      conditions: Array.isArray(r.conditions)
        ? r.conditions.filter(c => FIELDS.includes(c.field) && OPS.includes(c.op) && Number.isFinite(+c.value))
            .map(c => ({ field: c.field, op: c.op, value: +c.value }))
        : [],
    }
  } catch { return { ...DEFAULT_RULE } }
}

export function saveRule(rule) {
  try { localStorage.setItem(KEY, JSON.stringify(rule)) } catch { /* private mode */ }
}

// Pick the next extreme this rule cares about, whose lead-time moment is still
// in the future — an alert for a tide 5 minutes away with a 30 min lead has
// already missed its window.
export function nextTarget(extremes, rule, nowMs) {
  if (!rule.enabled) return null
  const lead = rule.leadMinutes * 60000
  return extremes.find(e =>
    (rule.tideType === 'any' || e.type === rule.tideType) && e.ts - lead > nowMs
  ) || null
}

// Evaluate the rule against the conditions expected at the tide.
// Returns { pass, checks: [{field, op, value, actual, ok}], unknown }
export function evaluate(rule, actuals) {
  const checks = rule.conditions.map(c => {
    const actual = actuals ? actuals[c.field] : null
    // An unmeasurable condition must not silently pass — that would fire alerts
    // the user explicitly gated. Treat unknown as a failure and say so.
    const ok = actual == null ? false : (c.op === 'lt' ? actual < c.value : actual > c.value)
    return { ...c, actual, ok, unknown: actual == null }
  })
  return {
    pass: checks.every(c => c.ok),
    checks,
    unknown: checks.some(c => c.unknown),
  }
}

export function describe(rule, L) {
  if (!rule.enabled) return L.alertsOff
  const when = rule.leadMinutes === 0 ? L.atTheTide : L.minsBefore(rule.leadMinutes)
  const kind = rule.tideType === 'low' ? L.low : rule.tideType === 'high' ? L.high : L.anyTide
  return L.ruleSummary(when, kind, rule.conditions.length)
}

// ── Which alerts have already gone out ──────────────────────────────────────
//
// This has to survive a reload, not just a re-render. The scheduler catches up
// on alerts whose moment passed while the page was frozen, so without a record
// a refresh would re-arm the same tide, see that its fire time is behind us,
// and immediately show the notification again — every reload, until the tide.
//
// Keyed by tide timestamp + lead + tide type, so changing the rule legitimately
// produces a new alert for the same tide.

const FIRED_KEY = 'tide_alert_fired'
const FIRED_MAX = 20        // a month of tides is ~120; 20 covers any live window

export const firedId = (tide, rule) => `${tide.ts}|${rule.leadMinutes}|${rule.tideType}`

function firedList() {
  try {
    const l = JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')
    return Array.isArray(l) ? l : []
  } catch { return [] }
}

export function wasFired(id) { return firedList().includes(id) }

export function markFired(id) {
  const l = firedList().filter(x => x !== id)
  l.push(id)
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(l.slice(-FIRED_MAX))) } catch { /* private mode */ }
}

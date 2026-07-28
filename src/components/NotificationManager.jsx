import { useEffect, useRef, useState } from 'react'
import { fmtHt } from '../lib/tide.js'
import { t } from '../lib/i18n.js'
import { fetchHourly, conditionsAt } from '../lib/weather.js'
import {
  FIELDS, OPS, LEAD_CHOICES, UNITS, loadRule, saveRule, nextTarget, evaluate, describe,
} from '../lib/alerts.js'

// In-app / on-open notifications. Web pages cannot reliably fire alerts while
// closed without a push server, so this notifies when the app is open and
// schedules the next matching tide alert for the current session.
export default function NotificationManager({ ex, todaySummary, lang, lat, lon }) {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [rule, setRule] = useState(loadRule)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)   // null | 'checking' | {fire,tide} | {blocked:[...]}
  const timer = useRef(null)
  const L = t(lang)

  const update = patch => {
    const next = { ...rule, ...patch }
    setRule(next); saveRule(next)
  }
  const setCond = (i, patch) => {
    const conditions = rule.conditions.map((c, j) => j === i ? { ...c, ...patch } : c)
    update({ conditions })
  }
  const addCond = () => update({ conditions: [...rule.conditions, { field: 'windSpeed', op: 'lt', value: 15 }] })
  const delCond = i => update({ conditions: rule.conditions.filter((_, j) => j !== i) })

  const fieldLabel = f => ({
    tideHeight: L.fTideHeight, windSpeed: L.fWindSpeed, windGust: L.fWindGust,
    waveHeight: L.fWaveHeight, humidity: L.fHumidity,
  })[f] || f

  // Schedule the next matching tide. Conditions are evaluated against the
  // forecast AT THE TIDE, so a rule can legitimately decide not to schedule —
  // in which case we show why rather than leaving the user wondering.
  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setStatus(null)
    if (perm !== 'granted' || !ex.length || !rule.enabled) return

    let live = true
    const now = Date.now()
    const target = nextTarget(ex, rule, now)
    if (!target) return

    const arm = (actuals) => {
      if (!live) return
      // tide height comes from the extreme itself; the weather series has no such field
      const verdict = evaluate(rule, { ...(actuals || {}), tideHeight: target.m })
      if (!verdict.pass) { setStatus({ blocked: verdict.checks.filter(c => !c.ok) }); return }
      const fireAt = target.ts - rule.leadMinutes * 60000
      const delay = Math.min(Math.max(fireAt - Date.now(), 0), 2 ** 31 - 1)
      setStatus({ fire: fireAt, tide: target })
      timer.current = setTimeout(() => {
        const kind = target.type === 'high' ? L.high : L.low
        new Notification(`${kind} — ${L.lowTideSoon}`, {
          body: L.lowTideAt(target.disp, fmtHt(target.m)),
        })
      }, delay)
    }

    if (!rule.conditions.length || lat == null) { arm(null); return }
    setStatus('checking')
    fetchHourly(lat, lon)
      .then(h => arm(conditionsAt(h, target.ts)))
      .catch(() => { if (live) arm(null) })   // forecast down: don't suppress the alert

    return () => { live = false; if (timer.current) clearTimeout(timer.current) }
  }, [ex, perm, rule, lang, lat, lon])

  const request = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') new Notification(L.appTitle, { body: todaySummary })
  }
  const showToday = () => { if (perm === 'granted') new Notification(L.todaysTides, { body: todaySummary }) }

  const fmtClock = ms => new Date(ms).toLocaleTimeString('en-IN',
    { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })

  return (
    <div className="glass pad section">
      <div className="notif">
        <div className="msg">
          🔔 {perm === 'granted' ? describe(rule, L) : L.alertsOff}
        </div>
        {perm === 'granted'
          ? <>
              <button className="btn" onClick={() => setOpen(o => !o)}>⚙ {L.alertSettings}</button>
              <button className="btn acc" onClick={showToday}>{L.showSummary}</button>
            </>
          : perm === 'unsupported'
            ? <span className="hint">{L.notifUnsupported}</span>
            : <button className="btn acc" onClick={request}>{L.enableAlerts}</button>}
      </div>

      {perm === 'granted' && (
        <div className="alertstatus">
          {status === 'checking' && <span className="hint">{L.checkingConditions}</span>}
          {status && status.fire && (
            <span className="hint" style={{ color: 'var(--high)' }}>
              ✓ {L.nextAlertAt((status.tide.type === 'high' ? L.high : L.low) + ' ' + status.tide.disp, fmtClock(status.fire))}
            </span>
          )}
          {status && status.blocked && (
            <span className="hint" style={{ color: 'var(--low)' }}>
              ⚠ {L.alertBlocked}{' '}
              {status.blocked.map((c, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {fieldLabel(c.field)} {c.unknown
                    ? `(${L.alertUnknownCond})`
                    : `${c.actual}${UNITS[c.field]} ${c.op === 'lt' ? '≥' : '≤'} ${c.value}${UNITS[c.field]}`}
                </span>
              ))}
            </span>
          )}
          {!rule.enabled && <span className="hint" style={{ color: 'var(--low)' }}>{L.ruleDisabled}</span>}
        </div>
      )}

      {open && perm === 'granted' && (
        <div className="rulebox">
          <div className="fieldrow">
            <label className="k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={rule.enabled} onChange={e => update({ enabled: e.target.checked })} />
              {rule.enabled ? L.toggleRuleOff : L.toggleRuleOn}
            </label>
          </div>

          <div className="fieldrow">
            <div className="k">{L.leadTime}</div>
            <select className="txt" value={rule.leadMinutes} onChange={e => update({ leadMinutes: +e.target.value })}>
              {LEAD_CHOICES.map(m => (
                <option key={m} value={m}>{m === 0 ? L.atTheTide : L.minsBefore(m)}</option>
              ))}
            </select>
          </div>

          <div className="fieldrow">
            <div className="k">{L.whichTide}</div>
            <div className="filters">
              {['low', 'high', 'any'].map(k => (
                <button key={k} className={'btn' + (rule.tideType === k ? ' on' : '')} onClick={() => update({ tideType: k })}>
                  {k === 'low' ? L.low : k === 'high' ? L.high : L.anyTide}
                </button>
              ))}
            </div>
          </div>

          <div className="fieldrow">
            <div className="k">{L.onlyIf}</div>
            {rule.conditions.map((c, i) => (
              <div className="condrow" key={i}>
                <select className="txt" value={c.field} onChange={e => setCond(i, { field: e.target.value })}>
                  {FIELDS.map(f => <option key={f} value={f}>{fieldLabel(f)}</option>)}
                </select>
                <select className="txt" value={c.op} onChange={e => setCond(i, { op: e.target.value })}>
                  {OPS.map(o => <option key={o} value={o}>{o === 'lt' ? L.opLt : L.opGt}</option>)}
                </select>
                <input
                  className="txt" type="number" step="0.1" inputMode="decimal"
                  value={c.value}
                  onChange={e => setCond(i, { value: e.target.value === '' ? 0 : +e.target.value })}
                />
                <span className="cunit">{UNITS[c.field]}</span>
                <button className="btn" onClick={() => delCond(i)} title={L.removeCondition} aria-label={L.removeCondition}>✕</button>
              </div>
            ))}
            <button className="btn" onClick={addCond} style={{ marginTop: 8 }}>{L.addCondition}</button>
          </div>

          {/* fires the real notification immediately, so you can confirm alerts
              actually reach you on this device without waiting for a tide */}
          <div className="fieldrow" style={{ marginBottom: 0 }}>
            <button
              className="btn acc"
              onClick={() => {
                const target = nextTarget(ex, { ...rule, enabled: true }, Date.now()) || ex[0]
                if (!target) return
                const kind = target.type === 'high' ? L.high : L.low
                new Notification(`${kind} — ${L.lowTideSoon}`, { body: L.lowTideAt(target.disp, fmtHt(target.m)) })
              }}
            >{L.testAlert}</button>
          </div>
        </div>
      )}
    </div>
  )
}

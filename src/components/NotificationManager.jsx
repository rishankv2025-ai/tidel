import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmtHt, dayKey } from '../lib/tide.js'
import { t, localeFor, placeName } from '../lib/i18n.js'
import { fetchHourly, conditionsAt } from '../lib/weather.js'
import { notify, canNotify } from '../lib/notify.js'
import {
  FIELDS, OPS, LEAD_CHOICES, UNITS, loadRule, saveRule, nextTarget, evaluate, describe,
  firedId, wasFired, markFired,
} from '../lib/alerts.js'
import { syncPush, pushSupported, isIosBrowser } from '../lib/push.js'
import {
  loadDaily, saveDaily, nextDailyAt, dueDaily, dailyFired, markDailyFired,
  fmtDailyTime, TIME_RE,
} from '../lib/daily.js'
import { todaySummary as summaryText } from '../lib/summary.js'
import { stationExtremes } from '../lib/tide.js'

// Longest gap between wall-clock checks while waiting. Short enough that a
// throttled background tab (one wake per minute) still fires within a minute.
const CHECK_MS = 15000
// The daily summary is not time-critical to the second, and it waits up to 24h,
// so it polls a quarter as often.
const DAILY_CHECK_MS = 60000
// How long after the tide a delayed alert is still worth showing.
const GRACE_MS = 10 * 60000

// Tide alerts, by two routes.
//
//  * PUSH (preferred) — the rule is registered with the server, and a scheduled
//    function sends the notification. This is the only route that works with the
//    app closed, which on a phone is the normal case: Android freezes a
//    backgrounded tab within minutes and then discards it.
//  * IN-APP (fallback) — a wall-clock timer in this component. Used when push is
//    unavailable: no server keys, an iPhone still in Safari rather than
//    installed, or a browser without PushManager. Only fires while open.
//
// Exactly one is armed at a time, so a device that is awake when a push lands
// cannot also raise its own copy.
export default function NotificationManager({
  ex, todaySummary, lang, lat, lon, stationId, spots = [], stations = [], tides = null,
}) {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  const [rule, setRule] = useState(loadRule)
  const [daily, setDaily] = useState(loadDaily)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(null)   // null | 'checking' | {fire,tide} | {blocked:[...]}
  const [testMsg, setTestMsg] = useState(null) // outcome of the "Test now" button
  const [push, setPush] = useState(null)       // null | 'syncing' | {ok} | {reason,detail}
  const timer = useRef(null)
  const dailyTimer = useRef(null)
  const L = t(lang)

  const pushOn = !!(push && push.ok)
  // The server only delivers the daily summary if the user asked it to. With the
  // toggle off, the time is never sent anywhere.
  const dailyByServer = pushOn && daily.enabled && daily.push

  const updateDaily = patch => {
    const next = { ...daily, ...patch }
    // Turning this on at 06:10 with the time set to 06:00 must NOT fire straight
    // away — the catch-up window is hours wide, so without this, enabling the
    // switch would itself look like an alert. Mark today as already delivered so
    // a schedule whose moment has passed starts tomorrow. Setting 05:30 at 05:00
    // is unaffected and still arrives today.
    if (next.enabled) {
      const already = dueDaily(next, Date.now(), null)
      if (already) markDailyFired(already)
    }
    setDaily(next); saveDaily(next)
  }

  // Places available for the daily alert's area, in the same order the location
  // bar uses. '' is the sentinel for "follow the current selection".
  const places = [
    ...spots.map(p => ({ value: p.station + '|' + p.name, stationId: p.station, label: p.name, ml: p.ml, lat: p.lat, lon: p.lon })),
    ...stations.map(s => ({ value: s.id + '|' + s.name, stationId: s.id, label: s.name, ml: '', lat: s.lat, lon: s.lon })),
  ]
  // Resolved area: an explicit pick, else whatever the app is currently showing.
  const dailyArea = daily.stationId
    ? { stationId: daily.stationId, label: daily.label, ml: daily.ml, lat: daily.lat, lon: daily.lon }
    : { stationId, label: '', ml: '', lat, lon }

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
  //
  // WHY THIS IS NOT ONE setTimeout(fn, fireAt - now):
  //
  // That was the original approach and it is why alerts never arrived at the
  // time they were set for, even though "Test now" always worked. A single long
  // timeout is not a promise about the wall clock:
  //
  //   * A hidden tab is throttled to roughly one timer wake per minute, and
  //     after ~5 minutes Chrome applies intensive throttling on top.
  //   * A sleeping phone freezes the page outright. The timer does not catch up
  //     on wake — it resumes counting down from wherever it stopped, so a
  //     30-minute alert can land an hour late, and a 6-hour one effectively
  //     never lands at all.
  //
  // So the countdown is re-derived from Date.now() on every wake instead of
  // trusted once. Ticks are capped at CHECK_MS, which keeps the alert accurate
  // to the second in the foreground while making throttling cost lateness
  // rather than the notification itself. Coming back to a frozen page also
  // triggers an immediate check, so the alert is delivered on resume if its
  // moment slipped by — up to GRACE_MS past the tide, after which a "tide soon"
  // notice would be a lie and is dropped.
  useEffect(() => {
    let live = true
    const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
    let onWake = null
    const teardown = () => {
      live = false
      clear()
      if (onWake) {
        document.removeEventListener('visibilitychange', onWake)
        window.removeEventListener('focus', onWake)
        onWake = null
      }
    }

    clear()
    setStatus(null)
    if (perm !== 'granted' || !ex.length || !rule.enabled) return teardown

    const target = nextTarget(ex, rule, Date.now())
    if (!target) return teardown

    const arm = (actuals) => {
      if (!live) return
      // tide height comes from the extreme itself; the weather series has no such field
      const verdict = evaluate(rule, { ...(actuals || {}), tideHeight: target.m })
      if (!verdict.pass) { setStatus({ blocked: verdict.checks.filter(c => !c.ok) }); return }

      const fireAt = target.ts - rule.leadMinutes * 60000
      const id = firedId(target, rule)
      // Report the schedule either way — knowing which tide is next and when the
      // warning is due is useful regardless of which route delivers it.
      setStatus({ fire: fireAt, tide: target })
      // But only ONE route may actually arm. Once push is registered the server
      // owns delivery, and a local timer would duplicate every alert on a device
      // that happened to be open.
      if (pushOn) return
      if (wasFired(id)) return

      const fire = () => {
        // Re-read the marker: another tab may have shown this one already.
        if (wasFired(id)) return
        // Woke up far too late — the tide itself is gone.
        if (Date.now() > target.ts + GRACE_MS) return
        markFired(id)
        const kind = target.type === 'high' ? L.high : L.low
        notify(`${kind} — ${L.lowTideSoon}`, {
          body: L.lowTideAt(target.disp, fmtHt(target.m)),
          tag: 'tide-alert',
        }).catch(e => console.warn('tide alert failed:', e))
      }

      const tick = () => {
        if (!live) return
        clear()
        const remaining = fireAt - Date.now()
        if (remaining <= 0) { fire(); return }
        timer.current = setTimeout(tick, Math.min(remaining, CHECK_MS))
      }

      onWake = () => { if (live && document.visibilityState === 'visible') tick() }
      document.addEventListener('visibilitychange', onWake)
      window.addEventListener('focus', onWake)
      tick()
    }

    if (!rule.conditions.length || lat == null) { arm(null); return teardown }
    setStatus('checking')
    fetchHourly(lat, lon)
      .then(h => arm(conditionsAt(h, target.ts)))
      .catch(() => arm(null))   // forecast down: don't suppress the alert

    return teardown
  }, [ex, perm, rule, lang, lat, lon, pushOn])

  // Register the rule with the server. Re-runs on every rule, place or language
  // change, because the server is what decides when and in which language to
  // notify — a rule that only ever reached localStorage is precisely why alerts
  // did not arrive with the app shut.
  const registerPush = useCallback(async () => {
    if (perm !== 'granted') { setPush(null); return }
    if (!pushSupported()) {
      setPush({ reason: isIosBrowser() ? 'ios-install' : 'unsupported' })
      return
    }
    setPush('syncing')
    // The daily block is sent ONLY when its closed-app switch is on. With it off
    // the payload carries push:false and the server stores no time at all, which
    // is what keeps "local only" literally true rather than merely a UI state.
    const r = await syncPush({
      stationId, lat, lon, lang, rule,
      daily: {
        enabled: daily.enabled && daily.push,
        push: daily.push,
        time: daily.time,
        stationId: dailyArea.stationId,
        lat: dailyArea.lat,
        lon: dailyArea.lon,
      },
    })
    setPush(r)
  }, [perm, stationId, lat, lon, lang, rule, daily, dailyArea.stationId, dailyArea.lat, dailyArea.lon])

  useEffect(() => { registerPush() }, [registerPush])

  // Tides for the daily alert's area, which may differ from the place on screen.
  // Memoised because stationExtremes sorts a month of data and a fresh array
  // identity would re-arm the effect below on every unrelated render.
  const dailyEx = useMemo(
    () => (daily.stationId && tides ? stationExtremes(tides[daily.stationId]) : ex),
    [daily.stationId, tides, ex],
  )

  // Local daily summary, same wall-clock discipline as the tide alert: the due
  // moment is recomputed on every wake, so a page that was frozen at 05:30
  // delivers on resume rather than losing the day. Skipped entirely when the
  // server is doing it.
  useEffect(() => {
    let live = true
    const clear = () => {
      if (dailyTimer.current) { clearTimeout(dailyTimer.current); dailyTimer.current = null }
    }
    let onWake = null
    const teardown = () => {
      live = false
      clear()
      if (onWake) {
        document.removeEventListener('visibilitychange', onWake)
        window.removeEventListener('focus', onWake)
        onWake = null
      }
    }

    clear()
    if (perm !== 'granted' || !daily.enabled || !TIME_RE.test(daily.time)) return teardown
    if (dailyByServer) return teardown

    const tick = () => {
      if (!live) return
      clear()
      const due = dueDaily(daily, Date.now(), dailyFired())
      if (due) {
        // Mark before showing: a notify() that fails must not leave the day
        // eligible, or every wake would retry and eventually spam.
        markDailyFired(due)
        notify(L.todaysTides, { body: summaryText(dailyEx, lang), tag: 'tide-daily' })
          .catch(e => console.warn('daily summary failed:', e))
      }
      const next = nextDailyAt(daily.time, Date.now())
      dailyTimer.current = setTimeout(tick, Math.max(0, Math.min(next - Date.now(), DAILY_CHECK_MS)))
    }

    onWake = () => { if (live && document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    tick()
    return teardown
  }, [perm, daily, dailyByServer, lang, dailyEx, L])

  const dailyNextLine = () => {
    if (!TIME_RE.test(daily.time)) return null
    const next = nextDailyAt(daily.time, Date.now())
    const at = fmtDailyTime(daily.time, localeFor(lang))
    const when = dayKey(next) === dayKey(Date.now()) ? L.dailyToday(at) : L.dailyTomorrow(at)
    return L.dailyNext(when)
  }

  const pushLine = () => {
    if (perm !== 'granted') return null
    if (push === 'syncing') return { text: L.pushSyncing, tone: 'mut' }
    if (pushOn) return { text: L.pushOn, tone: 'good' }
    if (!push) return null
    // The server not having push configured is a deployment fact, not something
    // an end user can act on — and "see SETUP-PUSH.md" is a message for whoever
    // runs the site, not for someone standing on a beach. Say nothing in that
    // case; the alert rule below still describes what will happen. The strings
    // stay in i18n so restoring the line is a one-line change.
    if (['not-configured', 'no-store', 'no-function'].includes(push.reason)) return null

    const map = {
      'ios-install': L.pushIosInstall,   // actionable: add to Home Screen
      unsupported: L.pushUnsupported,    // actionable: this browser cannot
    }
    // A limitation the user can act on is stated plainly; an actual failure
    // names itself and offers a retry, because staying silent there would hide
    // a broken key.
    if (map[push.reason]) return { text: `${map[push.reason]} ${L.pushInApp}`, tone: 'mut' }
    return { text: L.pushFail(push.detail || push.reason), tone: 'bad', retry: true }
  }

  const request = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') notify(L.appTitle, { body: todaySummary }).catch(() => {})
  }
  const showToday = () => {
    notify(L.todaysTides, { body: todaySummary, tag: 'tide-summary' })
      .catch(e => setTestMsg({ ok: false, text: L.testErr(e.message || String(e)) }))
  }

  const fmtClock = ms => new Date(ms).toLocaleTimeString('en-IN',
    { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })

  // notify() resolves only once the notification has actually been shown, so
  // success here is observed rather than assumed — no more guessing from onshow
  // and a timeout. It also reports which path worked, which is the difference
  // that mattered: Android only permits the service-worker path.
  const runTest = async () => {
    setTestMsg(null)
    if (!canNotify()) { setTestMsg({ ok: false, text: L.testNoPerm }); return }
    const target = nextTarget(ex, { ...rule, enabled: true }, Date.now()) || ex[0]
    if (!target) { setTestMsg({ ok: false, text: L.testNoTide }); return }

    const kind = target.type === 'high' ? L.high : L.low
    try {
      const via = await notify(`${kind} — ${L.lowTideSoon}`, {
        body: L.lowTideAt(target.disp, fmtHt(target.m)),
        tag: 'tide-test',            // replaces rather than stacks on repeat presses
      })
      setTestMsg({ ok: true, text: via === 'serviceworker' ? L.testShown : L.testShownDesktop })
    } catch (e) {
      setTestMsg({ ok: false, text: L.testErr(e.message || String(e)) })
    }
  }

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
          {/* Whether alerts survive the app being closed is the single most
              important thing on this card, so it leads. */}
          {(() => {
            const p = pushLine()
            if (!p) return null
            const color = p.tone === 'good' ? 'var(--high)' : p.tone === 'bad' ? 'var(--low)' : undefined
            return (
              <div className="hint" style={{ color, marginBottom: 6 }}>
                {p.tone === 'good' ? '✓ ' : p.tone === 'bad' ? '⚠ ' : ''}{p.text}
                {p.retry && (
                  <button className="btn" style={{ marginLeft: 8, padding: '4px 10px', minHeight: 0, fontSize: '.76rem' }}
                    onClick={registerPush}>{L.pushRetry}</button>
                )}
              </div>
            )
          })()}
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
            {/* Say the limit out loud at the hour scale. A 6-hour warning still
                depends on the app being open when it comes due, and pretending
                otherwise is what makes a missed alert feel like a bug. */}
            {rule.leadMinutes >= 120 && (
              <div className="hint" style={{ marginTop: 8 }}>{L.leadLongNote}</div>
            )}
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

          {/* ── Daily summary ──────────────────────────────────────────────
              A separate schedule from the tide alert above: a fixed time of day
              rather than an offset from a tide. Default is device-only, and the
              chosen time is sent to the server only if the closed-app switch is
              turned on. */}
          <div className="dailybox">
            <div className="k">{L.dailyHead}</div>
            <label className="chk">
              <input
                type="checkbox"
                checked={daily.enabled}
                onChange={e => updateDaily({ enabled: e.target.checked })}
              />
              {L.dailyOn}
            </label>

            {daily.enabled && (
              <>
                <div className="condrow" style={{ marginTop: 10 }}>
                  <span className="cunit">{L.dailyAt}</span>
                  <input
                    className="txt dtime"
                    type="time"
                    value={daily.time}
                    onChange={e => updateDaily({ time: e.target.value })}
                  />
                </div>
                {!TIME_RE.test(daily.time) && (
                  <div className="hint" style={{ color: 'var(--low)' }}>{L.dailyBadTime}</div>
                )}

                <div className="condrow">
                  <span className="cunit">{L.dailyFor}</span>
                  <select
                    className="txt"
                    value={daily.stationId ? `${daily.stationId}|${daily.label}` : ''}
                    onChange={e => {
                      const p = places.find(x => x.value === e.target.value)
                      updateDaily(p
                        ? { stationId: p.stationId, label: p.label, ml: p.ml, lat: p.lat, lon: p.lon }
                        : { stationId: '', label: '', ml: '', lat: null, lon: null })
                    }}
                  >
                    {/* '' follows the location bar, which is what most people want
                        and what the tide alert already does. */}
                    <option value="">{L.dailyUseSelected}</option>
                    {places.map(p => (
                      <option key={p.value} value={p.value}>{placeName(lang, p.label, p.ml)}</option>
                    ))}
                  </select>
                </div>

                <label className="chk">
                  <input
                    type="checkbox"
                    checked={daily.push && pushSupported()}
                    disabled={!pushSupported()}
                    onChange={e => updateDaily({ push: e.target.checked })}
                  />
                  {L.dailyClosed}
                </label>

                <div className="hint" style={{ marginTop: 6 }}>
                  {!pushSupported()
                    ? L.dailyPushUnavailable
                    : daily.push
                      ? (pushOn ? L.pushOn : L.pushSyncing)
                      : L.dailyLocalOnly}
                </div>
                {dailyNextLine() && <div className="hint">{dailyNextLine()}</div>}
              </>
            )}
          </div>

          {/* Fires the real notification immediately so you can confirm alerts
              reach this device without waiting for a tide.
              It reports the outcome, because "nothing happened" has three very
              different causes: the constructor threw, the browser accepted it
              but the OS suppressed it, or there was no tide to build it from.
              Without feedback those are indistinguishable. */}
          <div className="fieldrow" style={{ marginBottom: 0 }}>
            <button className="btn acc" onClick={runTest}>{L.testAlert}</button>
            {testMsg && (
              <div className="hint" style={{ marginTop: 8, color: testMsg.ok ? 'var(--high)' : 'var(--low)' }}>
                {testMsg.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { deviceId } from '../lib/device.js'

const TYPES = ['fish', 'crab', 'other']
const MAX_KG = 50

export default function CatchReportCard({ lang, locationLabel, lat, lon, tide, moon, weather, dashOpen, onToggleDash }) {
  const L = t(lang)
  const [type, setType] = useState('fish')
  const [other, setOther] = useState('')
  const [qty, setQty] = useState(0)
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState(null)   // null | 'sending' | 'ok' | {err}

  const label = k => (k === 'fish' ? L.fish : k === 'crab' ? L.crab : L.other)

  const submit = async () => {
    setStatus('sending')
    try {
      const res = await fetch('/api/catch-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // the tide/moon/weather snapshot travels with the report so each row is
        // self-contained — the conditions can't be reconstructed after the fact
        body: JSON.stringify({
          deviceId: deviceId(),
          locationLabel, lat, lon, lang,
          catchType: type,
          catchOther: type === 'other' ? other : '',
          quantity: qty,
          notes,
          tide, moon, weather,
        }),
      })
      // 404 (or a non-JSON body) means the function isn't running at all, which
      // is a different problem from a rejected report — say which.
      if (res.status === 404 || !(res.headers.get('content-type') || '').includes('application/json')) {
        setStatus({ err: L.submitNoServer, noServer: true })
        return
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        // `detail` carries the provider's own message ("supabase 401: Invalid API
        // key"), which is the only part that says what to fix. Showing just
        // `error` left the real cause invisible.
        throw new Error([b.error, b.detail].filter(Boolean).join(' · ') || `HTTP ${res.status}`)
      }
      setStatus('ok')
      setQty(0); setOther(''); setNotes('')
    } catch (e) {
      setStatus({ err: e.message })
    }
  }

  return (
    <div className="glass pad section">
      <h2 className="title">{L.reportTitle}</h2>

      <div className="fieldrow">
        <div className="k">{L.catchTypeQ}</div>
        <div className="filters">
          {TYPES.map(k => (
            <button key={k} className={'btn' + (type === k ? ' on' : '')} onClick={() => setType(k)}>
              {label(k)}
            </button>
          ))}
        </div>
      </div>

      {type === 'other' && (
        <div className="fieldrow">
          <input
            className="txt"
            placeholder={L.otherPlaceholder}
            value={other}
            onChange={e => setOther(e.target.value)}
          />
        </div>
      )}

      <div className="fieldrow">
        <div className="k">{L.quantityQ}</div>
        <div className="sliderrow">
          <input
            type="range" min="0" max={MAX_KG} step="0.5"
            value={qty}
            onChange={e => setQty(Number(e.target.value))}
          />
          <span className="qty">{qty} <small>{L.kg}</small></span>
        </div>
      </div>

      <div className="fieldrow">
        <div className="k">{L.notesLabel}</div>
        <input
          className="txt"
          placeholder={L.notesPlaceholder}
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div className="notif" style={{ marginTop: 4 }}>
        <div className="msg">
          {status === 'ok' && <span style={{ color: 'var(--high)' }}>{L.submitOk}</span>}
          {status && status.err && (
            <span style={{ color: 'var(--low)' }}>
              {status.noServer ? status.err : L.submitFail(status.err)}
            </span>
          )}
          {(status === null || status === 'sending') && L.reportHint}
        </div>
        <button className="btn acc" onClick={submit} disabled={status === 'sending'}>
          {status === 'sending' ? L.submitting : L.submit}
        </button>
      </div>

      {/* only shown while closed — the dashboard carries its own close button,
          and having both visible read as two ways to do the same thing */}
      {!dashOpen && (
        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={onToggleDash}>{L.openDash}</button>
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { t, localeFor } from '../lib/i18n.js'
import CatchLineChart from './CatchLineChart.jsx'

// Admin panel at /admin: view, create, edit and delete catch reports.
//
// The login form here is a convenience, NOT the security boundary. Every request
// carries HTTP Basic credentials and netlify/functions/admin.mjs verifies them
// server-side on each call, so hiding this screen would protect nothing and
// showing it grants nothing. That is deliberate: a password checked in React is
// readable in the bundle and bypassable with curl.
//
// Credentials are held in sessionStorage, so they survive a reload but not
// closing the tab. localStorage would leave them sitting on a shared phone.

const AUTH_KEY = 'tide_admin_auth'

const FIELDS = [
  { k: 'location_label', t: 'text' },
  { k: 'catch_type', t: 'select', opts: ['fish', 'crab', 'other'] },
  { k: 'catch_other', t: 'text' },
  { k: 'quantity_kg', t: 'number', step: '0.1' },
  { k: 'tide_state', t: 'select', opts: ['', 'rising', 'falling'] },
  { k: 'tide_height_m', t: 'number', step: '0.01' },
  { k: 'moon_phase', t: 'text' },
  { k: 'moon_illum_pct', t: 'number', step: '1' },
  { k: 'wind_kmh', t: 'number', step: '0.1' },
  { k: 'wave_height_m', t: 'number', step: '0.01' },
  { k: 'humidity_pct', t: 'number', step: '1' },
  { k: 'device_id', t: 'text' },
  { k: 'notes', t: 'text' },
]

export default function AdminPanel({ lang }) {
  const L = t(lang)
  const loc = localeFor(lang)
  const [auth, setAuth] = useState(() => { try { return sessionStorage.getItem(AUTH_KEY) || '' } catch { return '' } })
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState(null)          // {ok, text}
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [editing, setEditing] = useState(null)  // row object, or {} for a new one
  const [view, setView] = useState('table')

  const api = useCallback(async (body, authHeader) => {
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader || auth },
      body: JSON.stringify(body),
    })
    // Under plain `vite dev` there is no function and the SPA fallback returns
    // index.html with a 200, which would otherwise surface as a JSON parse error.
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error('NO_SERVER')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  }, [auth])

  const load = useCallback(async (authHeader) => {
    setBusy(true)
    try {
      const d = await api({ action: 'list' }, authHeader)
      setRows(d.rows); setMsg(null); setSel(new Set())
    } catch (e) {
      if (e.message === 'NO_SERVER') setMsg({ ok: false, text: L.admNoServer })
      else if (e.message === 'admin_not_configured') setMsg({ ok: false, text: L.admNotConfigured })
      else if (e.message === 'bad_credentials' || e.message === 'auth_required') {
        setAuth(''); try { sessionStorage.removeItem(AUTH_KEY) } catch {}
        setMsg({ ok: false, text: L.admBadLogin })
      } else setMsg({ ok: false, text: L.admErr(e.message) })
    } finally { setBusy(false) }
  }, [api, L])

  useEffect(() => { if (auth) load() }, [auth, load])

  const signIn = async e => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      // btoa() is Latin-1 only. A password containing any character above
      // U+00FF (an en-dash from a password manager, Malayalam text) makes it
      // throw InvalidCharacterError, and a Latin-1 one like "pässwörd" encodes
      // to bytes the server then reads as mojibake and rejects forever.
      // UTF-8 encode first, which is what RFC 7617 specifies and what
      // admin.mjs already decodes.
      //
      // This must stay INSIDE the try: when it sat outside, a throw skipped the
      // finally that clears `busy`, leaving the submit button permanently
      // disabled with no error on screen until a manual reload.
      const bytes = new TextEncoder().encode(`${user}:${pass}`)
      // Array.from().join() rather than spread — a long credential would blow
      // the argument limit of String.fromCharCode(...bytes).
      const header = 'Basic ' + btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
      await api({ action: 'login' }, header)
      try { sessionStorage.setItem(AUTH_KEY, header) } catch {}
      setAuth(header); setPass('')
    } catch (e) {
      setMsg({
        ok: false,
        text: e.message === 'NO_SERVER' ? L.admNoServer
          : e.message === 'admin_not_configured' ? L.admNotConfigured
          : L.admBadLogin,
      })
    } finally { setBusy(false) }
  }

  const signOut = () => {
    try { sessionStorage.removeItem(AUTH_KEY) } catch {}
    setAuth(''); setRows(null); setSel(new Set()); setMsg(null)
  }

  const run = async (body, okText) => {
    setBusy(true)
    try {
      const d = await api(body)
      setMsg({ ok: true, text: typeof okText === 'function' ? okText(d) : okText })
      setEditing(null)
      await load()
    } catch (e) {
      setMsg({ ok: false, text: L.admErr(e.message) })
    } finally { setBusy(false) }
  }

  const removeIds = ids => {
    if (!ids.length) return
    // eslint-disable-next-line no-alert -- deletion is irreversible; a confirm is the point
    if (!window.confirm(L.admConfirmDelete(ids.length))) return
    run({ action: 'delete', ids }, d => L.admDeleted(d.deleted))
  }

  const save = () => {
    const patch = {}
    FIELDS.forEach(f => { patch[f.k] = editing[f.k] ?? '' })
    if (editing.id) run({ action: 'update', id: editing.id, patch }, L.admSaved)
    else run({ action: 'create', row: patch }, L.admCreated)
  }

  const allSelected = rows && rows.length > 0 && sel.size === rows.length
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map(r => r.id)))
  const toggleOne = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // the chart takes the shape catch-stats returns, so map the raw rows to it
  const chartRows = useMemo(() => (rows || []).map(r => ({
    id: r.id, at: r.created_at, kg: Number(r.quantity_kg) || 0,
  })).reverse(), [rows])

  const fmtWhen = iso => (iso ? new Date(iso).toLocaleString(loc,
    { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—')

  // ── login ────────────────────────────────────────────────────────────────
  if (!auth) {
    return (
      // Centred in the viewport rather than pinned to the top-left of the
      // 1040px content column, where it left ~900px of empty space beside it
      // and ~600px below on a desktop screen.
      <div className="app adminlogin">
        <div className="brand" style={{ textAlign: 'center', marginBottom: 18 }}><h1>{L.admTitle}</h1></div>
        <div className="glass pad" style={{ width: '100%', maxWidth: 380 }}>
          <form onSubmit={signIn}>
            <div className="fieldrow">
              <div className="k">{L.admUser}</div>
              <input className="txt" value={user} autoComplete="username"
                onChange={e => setUser(e.target.value)} autoFocus />
            </div>
            <div className="fieldrow">
              <div className="k">{L.admPass}</div>
              <input className="txt" type="password" value={pass} autoComplete="current-password"
                onChange={e => setPass(e.target.value)} />
            </div>
            <button className="btn acc" type="submit" disabled={busy}>{L.admSignIn}</button>
          </form>
          {msg && <div className="warn" style={{ marginTop: 12 }}>{msg.text}</div>}
        </div>
      </div>
    )
  }

  // ── panel ────────────────────────────────────────────────────────────────
  return (
    // wider than the public app: the report table has 13 columns and was
    // needlessly cramped inside the 1040px reading column
    <div className="app adminwide">
      <div className="top">
        <div className="brand"><h1>{L.admTitle}</h1></div>
        <div className="src"><button className="btn" onClick={signOut}>{L.admSignOut}</button></div>
      </div>

      <div className="glass pad section">
        <div className="notif" style={{ marginBottom: 10 }}>
          <div className="filters" style={{ marginBottom: 0 }}>
            {['table', 'chart'].map(v => (
              <button key={v} className={'btn' + (view === v ? ' on' : '')} onClick={() => setView(v)}>
                {v === 'table' ? L.dashTable : L.dashChart}
              </button>
            ))}
            <button className="btn" onClick={() => load()} disabled={busy}>{L.admRefresh}</button>
            {/* seed the required fields so the form's shown value matches its
                state — an empty catch_type renders as "fish" in the select while
                actually being '', which is how new rows used to fail validation */}
            <button className="btn acc" onClick={() => setEditing({ catch_type: 'fish', quantity_kg: 0 })}>{L.admNew}</button>
          </div>
          {sel.size > 0 && (
            <button className="btn danger" onClick={() => removeIds([...sel])} disabled={busy}>
              🗑 {L.admDeleteSel(sel.size)}
            </button>
          )}
        </div>

        {msg && <div className={msg.ok ? 'hint' : 'warn'} style={msg.ok ? { color: 'var(--high)' } : undefined}>{msg.text}</div>}
        {busy && !rows && <p className="hint">{L.admLoading}</p>}
        {rows && rows.length === 0 && <div className="warn">{L.admNoRows}</div>}

        {rows && rows.length > 0 && view === 'chart' && (
          <CatchLineChart rows={chartRows} selectedId={null} onPick={() => {}} lang={lang} L={L} />
        )}

        {rows && rows.length > 0 && view === 'table' && (
          <div className="tablewrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={!!allSelected} onChange={toggleAll} aria-label={L.admSelectAll} /></th>
                  <th>#</th><th>{L.dashWhen}</th><th>{L.dashPlace}</th><th>{L.dashCaught}</th><th>kg</th>
                  <th>{L.fTideState}</th><th>{L.fMoonPhase}</th><th>km/h</th>
                  <th>{L.dashDevice}</th><th>{L.admIp}</th><th>{L.dashNotes}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={sel.has(r.id) ? 'selrow' : ''}>
                    <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleOne(r.id)}
                      aria-label={`select ${r.id}`} /></td>
                    <td>{r.id}</td>
                    <td className="nowrap">{fmtWhen(r.created_at)}</td>
                    <td>{r.location_label || '—'}</td>
                    <td>{r.catch_type}{r.catch_other ? ` (${r.catch_other})` : ''}</td>
                    <td>{r.quantity_kg}</td>
                    <td>{r.tide_state || '—'}</td>
                    <td>{r.moon_phase || '—'}</td>
                    <td>{r.wind_kmh ?? '—'}</td>
                    <td className="mono">{r.device_id ? String(r.device_id).slice(0, 8) : '—'}</td>
                    <td className="mono">{r.ip || '—'}</td>
                    <td>{r.notes || '—'}</td>
                    <td className="nowrap">
                      <button className="btn tiny" onClick={() => setEditing({ ...r })}>{L.admEdit}</button>
                      <button className="btn tiny danger" onClick={() => removeIds([r.id])}>{L.admDelete}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="glass pad section">
          <div className="notif" style={{ marginBottom: 10 }}>
            <b>{editing.id ? L.admEditing(editing.id) : L.admCreating}</b>
            <button className="btn" onClick={() => setEditing(null)}>{L.admCancel}</button>
          </div>
          <div className="editgrid">
            {FIELDS.map(f => (
              <label className="fieldrow" key={f.k}>
                <div className="k">{f.k}</div>
                {f.t === 'select' ? (
                  <select className="txt" value={editing[f.k] ?? ''}
                    onChange={e => setEditing(v => ({ ...v, [f.k]: e.target.value }))}>
                    {f.opts.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                ) : (
                  <input className="txt" type={f.t} step={f.step}
                    value={editing[f.k] ?? ''}
                    onChange={e => setEditing(v => ({ ...v, [f.k]: e.target.value }))} />
                )}
              </label>
            ))}
          </div>
          <button className="btn acc" onClick={save} disabled={busy} style={{ marginTop: 12 }}>{L.admSave}</button>
        </div>
      )}
    </div>
  )
}

import { useMemo } from 'react'
import { sunMoon } from '../lib/sunmoon.js'
import { t } from '../lib/i18n.js'

export default function SunMoonCard({ dayKey, lat, lon, lang, nowMs }) {
  const L = t(lang)
  // recompute only when the day or place changes; nowMs only affects "moon now"
  const s = useMemo(() => sunMoon(dayKey, lat, lon, nowMs), [dayKey, lat, lon, nowMs])

  if (!s) return null

  const moonState = s.moonAlwaysUp ? L.moonAllDay
    : s.moonUp === null ? null
    : s.moonUp ? L.moonUp : L.moonDown

  return (
    <div className="glass pad section">
      <h2 className="title">{L.sunMoonTitle}</h2>

      <div className="smrow">
        <div className="smbig">
          <span className="smicon">🌅</span>
          <div>
            <div className="k">{L.sunrise}</div>
            <div className="v">{s.sunrise || '—'}</div>
          </div>
        </div>
        <div className="smbig">
          <span className="smicon">🌇</span>
          <div>
            <div className="k">{L.sunset}</div>
            <div className="v">{s.sunset || '—'}</div>
          </div>
        </div>
      </div>

      <div className="mmeta">
        <div><div className="k">{L.dayLength}</div><div className="v">{s.dayLength || '—'}</div></div>
        <div><div className="k">{L.dawn} · {L.dusk}</div><div className="v" style={{ fontSize: '.92rem' }}>{s.dawn || '—'} · {s.dusk || '—'}</div></div>
        {/* moonrise/moonset are genuinely absent on ~1 day in 30, because the moon
            rises about 50 min later each day and some IST days contain neither */}
        <div><div className="k">🌘 {L.moonrise}</div><div className="v">{s.moonrise || <small>{L.moonNoEvent}</small>}</div></div>
        <div><div className="k">🌒 {L.moonset}</div><div className="v">{s.moonset || <small>{L.moonNoEvent}</small>}</div></div>
      </div>

      {/* only meaningful for today — a past or future day has no "now" */}
      {s.isToday && moonState && (
        <div className="tidehead" style={{ marginTop: 14, marginBottom: 0 }}>
          <div>
            <div className="k">{L.moonNow}</div>
            <div className="v" style={{ fontSize: '1.02rem' }}>
              {moonState}
              {s.moonAltitude != null && <small> · {s.moonAltitude.toFixed(0)}°</small>}
            </div>
          </div>
          <span className={'chip ' + (s.moonUp ? 'rise' : 'fall')}>
            {s.moonUp ? '🌕' : '🌑'} {s.moonUp ? L.moonUp : L.moonDown}
          </span>
        </div>
      )}

      <div className="hint" style={{ marginTop: 12 }}>{L.sunMoonSrc}</div>
    </div>
  )
}

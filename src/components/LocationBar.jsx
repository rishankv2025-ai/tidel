import { useMemo, useState } from 'react'
import { nearestStation } from '../lib/tide.js'
import { t, placeName } from '../lib/i18n.js'

const keyOf = it => `${it.stationId}|${it.label}`

export default function LocationBar({ spots, stations, selection, onPick, favs, onToggleFav, lang }) {
  const [q, setQ] = useState('')
  const [gpsMsg, setGpsMsg] = useState('')
  const L = t(lang)

  const items = useMemo(() => {
    // lat/lon travel with the selection — the weather and sun/moon cards need real coordinates
    const s = spots.map(p => ({ key: 'spot:' + p.name, label: p.name, ml: p.ml, stationId: p.station, kind: 'spot', lat: p.lat, lon: p.lon }))
    const st = stations.map(x => ({ key: 'stn:' + x.id, label: x.name, ml: '', stationId: x.id, kind: 'station', hasData: x.hasData, lat: x.lat, lon: x.lon }))
    return [...s, ...st]
  }, [spots, stations])

  const favSet = useMemo(() => new Set((favs || []).map(keyOf)), [favs])
  const isFav = it => favSet.has(keyOf(it))
  const selectionIsFav = isFav(selection)

  // search both scripts regardless of display language
  const matches = q.trim()
    ? items.filter(i => (i.label + ' ' + i.ml).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : []

  const useGps = () => {
    if (!navigator.geolocation) { setGpsMsg(L.geoUnsupported); return }
    setGpsMsg(L.locating)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const n = nearestStation(pos.coords.latitude, pos.coords.longitude, stations)
        setGpsMsg('')
        // tides come from the nearest station, but weather uses where you actually are
        onPick({
          label: `${n.name} (${L.nearest})`, ml: '', stationId: n.id, kind: 'station',
          distKm: n.distKm, lat: pos.coords.latitude, lon: pos.coords.longitude,
        })
      },
      () => setGpsMsg(L.geoDenied),
      { timeout: 10000 }
    )
  }

  return (
    <>
      <div className="locbar">
        <div className="field">
          <input
            placeholder={L.searchPlaceholder}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {matches.length > 0 && (
            <div className="suggest">
              {matches.map(i => (
                <div key={i.key} onClick={() => { onPick(i); setQ('') }}>
                  <span className="sgname">
                    {placeName(lang, i.label, i.ml)}
                    {lang === 'en' && i.ml && <span className="ml">{i.ml}</span>}
                    {i.kind === 'station' && !i.hasData && <span className="ml">· {L.dataOnRefresh}</span>}
                  </span>
                  {/* star must not also select the row */}
                  <button
                    className={'sgstar' + (isFav(i) ? ' on' : '')}
                    onClick={e => { e.stopPropagation(); onToggleFav(i) }}
                    title={isFav(i) ? L.removeFav : L.addFav}
                    aria-label={isFav(i) ? L.removeFav : L.addFav}
                    aria-pressed={isFav(i)}
                  >{isFav(i) ? '★' : '☆'}</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* width lives in CSS (.selfield) — an inline flex here would outrank the
            phone media query and force the control bar onto a third row */}
        <div className="field selfield">
          <select
            value={selection.stationId + '|' + selection.label}
            onChange={e => {
              const it = items.find(i => i.stationId + '|' + i.label === e.target.value)
              if (it) onPick(it)
            }}
          >
            {/* saved places first — that is the point of saving them */}
            {favs && favs.length > 0 && (
              <optgroup label={L.groupFavs}>
                {favs.map(f => (
                  <option key={'fav:' + keyOf(f)} value={f.stationId + '|' + f.label}>
                    {placeName(lang, f.label, f.ml)}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={L.groupLocal}>
              {spots.map(p => (
                <option key={p.name} value={p.station + '|' + p.name}>
                  {lang === 'ml' ? (p.ml || p.name) : `${p.name} — ${p.ml}`}
                </option>
              ))}
            </optgroup>
            <optgroup label={L.groupOther}>
              {stations.map(s => (
                <option key={s.id} value={s.id + '|' + s.name}>
                  {s.name}{s.hasData ? '' : ` (${L.dataOnRefresh})`}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* title + aria-label carry the full wording, so the icon-only phone
            variant still has an accessible name */}
        <button className="btn gps" onClick={useGps} title={L.useMyLocation} aria-label={L.useMyLocation}>
          <span className="lbl-full">{L.useMyLocation}</span>
          <span className="lbl-short" aria-hidden="true">{L.useMyLocationShort}</span>
        </button>
        <button
          className={'btn fav' + (selectionIsFav ? ' on' : '')}
          onClick={() => onToggleFav(null)}
          title={selectionIsFav ? L.removeFav : L.addFav}
          aria-label={selectionIsFav ? L.removeFav : L.addFav}
          aria-pressed={selectionIsFav}
        >
          <span className="lbl-full">{selectionIsFav ? L.saved : L.save}</span>
          <span className="lbl-short" aria-hidden="true">{selectionIsFav ? L.savedShort : L.saveShort}</span>
        </button>
      </div>
      <div className="hint">
        {L.showing} <b>{placeName(lang, selection.label, selection.ml)}</b>
        {lang === 'en' && selection.ml ? ` · ${selection.ml}` : ''}
        {selection.distKm != null ? ` · ${L.kmAway(selection.distKm.toFixed(0))}` : ''}
        {gpsMsg && ` · ${gpsMsg}`}
      </div>
    </>
  )
}

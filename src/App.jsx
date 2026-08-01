import { useEffect, useMemo, useState } from 'react'
import { moonInfo } from './lib/moon.js'
import {
  stationExtremes, heightRange, availableDays, dayKey, levelAt,
} from './lib/tide.js'
import { t, otherLang, otherLangLabel, placeName } from './lib/i18n.js'
import { todaySummary as summaryText } from './lib/summary.js'
import LocationBar from './components/LocationBar.jsx'
import TopNavigation from './components/TopNavigation.jsx'
import MoonPhaseCard from './components/MoonPhaseCard.jsx'
import TideDashboardCard from './components/TideDashboardCard.jsx'
import WeatherCard from './components/WeatherCard.jsx'
import SunMoonCard from './components/SunMoonCard.jsx'
import ForecastList from './components/ForecastList.jsx'
import CatchReportCard from './components/CatchReportCard.jsx'
import CatchDashboard from './components/CatchDashboard.jsx'
import NotificationManager from './components/NotificationManager.jsx'

const FAVS_KEY = 'tide_favs'
// Superseded by FAVS_KEY. Read once and migrated, so an existing user's saved
// default becomes their first favourite instead of silently disappearing.
const LEGACY_FAV_KEY = 'tide_fav_selection'
const LANG_KEY = 'tide_lang'
// Last place the user picked. Without this, every reload snapped back to the
// first favourite (or Kannur), silently discarding the choice — favourites were
// remembered but the current selection never was.
const SEL_KEY = 'tide_selection'

// identity of a place for favourite comparison — same shape the <select> uses
export const favKeyOf = it => `${it.stationId}|${it.label}`

function loadFavs() {
  try {
    const raw = localStorage.getItem(FAVS_KEY)
    if (raw) { const l = JSON.parse(raw); if (Array.isArray(l)) return l }
    const old = JSON.parse(localStorage.getItem(LEGACY_FAV_KEY) || 'null')
    if (old && old.stationId) {
      const list = [old]
      localStorage.setItem(FAVS_KEY, JSON.stringify(list))
      localStorage.removeItem(LEGACY_FAV_KEY)
      return list
    }
  } catch { /* corrupt storage — start empty rather than crash the app */ }
  return []
}

export default function App() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [selection, setSelection] = useState(null)
  const [selectedKey, setSelectedKey] = useState(null)
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem(LANG_KEY)
    return saved === 'ml' || saved === 'en' ? saved : 'en'
  })
  const [favs, setFavs] = useState(loadFavs)
  const [wx, setWx] = useState(null)   // latest weather, snapshotted into catch reports
  const [dashOpen, setDashOpen] = useState(false)

  // persist the choice and keep <html lang> honest for screen readers
  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  // Remember the chosen place across reloads.
  useEffect(() => {
    if (!selection) return
    try { localStorage.setItem(SEL_KEY, JSON.stringify(selection)) } catch { /* private mode */ }
  }, [selection])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}tidedata.json`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then(d => {
        setData(d)
        const s0 = d.spots[0]
        // Restore the last picked place, then fall back to the first favourite,
        // then the first spot. The saved value is re-checked against the dataset
        // rather than trusted: a spot renamed or dropped by a data refresh would
        // otherwise leave the app pointing at a station that no longer exists.
        let saved = null
        try {
          const raw = JSON.parse(localStorage.getItem(SEL_KEY) || 'null')
          if (raw && raw.stationId && raw.label) {
            const known = d.spots.some(p => p.name === raw.label && p.station === raw.stationId) ||
              d.stations.some(s => s.id === raw.stationId && s.name === raw.label) ||
              // a GPS pick is labelled "<station> (nearest)" and is not in the lists
              (raw.kind === 'station' && d.stations.some(s => s.id === raw.stationId))
            if (known) saved = raw
          }
        } catch { /* corrupt storage — fall through to the defaults */ }

        const first = saved || favs[0] ||
          { stationId: s0.station, label: s0.name, ml: s0.ml, lat: s0.lat, lon: s0.lon }
        setSelection(first)
      })
      .catch(e => setErr(e.message))
  }, [])

  const ex = useMemo(
    () => (data && selection ? stationExtremes(data.tides[selection.stationId]) : []),
    [data, selection]
  )
  const range = useMemo(() => heightRange(ex), [ex])
  const avail = useMemo(() => availableDays(ex), [ex])

  // A saved favourite from before coordinates were tracked won't carry lat/lon,
  // so fall back to looking the place up in the dataset.
  const coords = useMemo(() => {
    if (!data || !selection) return {}
    if (selection.lat != null && selection.lon != null) return { lat: selection.lat, lon: selection.lon }
    const sp = data.spots.find(p => p.name === selection.label)
    if (sp) return { lat: sp.lat, lon: sp.lon }
    const st = data.stations.find(s => s.id === selection.stationId)
    return st ? { lat: st.lat, lon: st.lon } : {}
  }, [data, selection])

  // keep selectedKey valid for the current station
  useEffect(() => {
    if (!avail.length) { setSelectedKey(null); return }
    const today = dayKey(Date.now())
    setSelectedKey(prev => (prev && avail.includes(prev)) ? prev : (avail.includes(today) ? today : avail[0]))
  }, [avail])

  const L = t(lang)

  if (err) return <div className="app"><div className="warn">{L.loadFail(err)}</div></div>
  if (!data || !selection) return <div className="app"><p className="hint">{L.loading}</p></div>

  const hasData = !!data.tides[selection.stationId]
  const effKey = selectedKey || (avail[0] || dayKey(Date.now()))
  const isToday = effKey === dayKey(Date.now())
  const refTs = isToday ? Date.now() : new Date(effKey + 'T12:00:00').getTime()
  const moonDate = new Date(effKey + 'T12:00:00')

  // Shared with the daily alert and with the server-sent push, so all three
  // read identically — see src/lib/summary.js.
  const todaySummary = summaryText(ex, lang)

  // Toggle any place in or out of favourites. Called both by the ☆ button (for
  // the current selection) and by the star on each search result.
  const toggleFav = (item) => {
    const target = item || { ...selection, lat: coords.lat, lon: coords.lon }
    const k = favKeyOf(target)
    setFavs(prev => {
      const next = prev.some(f => favKeyOf(f) === k)
        ? prev.filter(f => favKeyOf(f) !== k)
        : [...prev, {
            stationId: target.stationId, label: target.label, ml: target.ml || '',
            lat: target.lat ?? null, lon: target.lon ?? null,
          }]
      try { localStorage.setItem(FAVS_KEY, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }

  const stationLabel = placeName(lang, selection.label, selection.ml)

  // Conditions snapshot attached to a catch report. Deliberately English/canonical
  // regardless of UI language — the sheet has to stay analysable across languages.
  const nowMs = Date.now()
  const curLvl = levelAt(ex, nowMs)
  const nextEx = ex.find(e => e.ts > nowMs)
  const moonNow = moonInfo(new Date())
  const tideSnap = {
    state: curLvl ? (curLvl.rising ? 'rising' : 'falling') : '',
    height: curLvl ? +curLvl.m.toFixed(3) : null,
    nextType: nextEx ? nextEx.type : '',
    nextTime: nextEx ? nextEx.disp : '',
  }
  const moonSnap = { phase: moonNow.name, illum: Math.round(moonNow.illum * 100) }

  return (
    <div className="app">
      <div className="top">
        <div className="brand">
          <h1>{L.appTitle}</h1>
          <p>{L.tagline}</p>
        </div>
        {/* Only the language toggle lives up here now. The source attribution,
            the "harmonic prediction" badge and the navigation warning were
            removed from the header at the user's request — the attribution and
            the navigation warning both remain in the footer, so nothing about
            provenance or safety is actually lost. */}
        <div className="src">
          <button
            className="langbtn"
            onClick={() => setLang(otherLang(lang))}
            aria-label={`Switch to ${otherLangLabel(lang)}`}
            lang={otherLang(lang)}
          >
            🌐 {otherLangLabel(lang)}
          </button>
        </div>
      </div>

      <LocationBar
        spots={data.spots}
        stations={data.stations}
        selection={selection}
        onPick={setSelection}
        favs={favs}
        onToggleFav={toggleFav}
        lang={lang}
      />

      {hasData && <TopNavigation days={avail} selected={effKey} onSelect={setSelectedKey} lang={lang} />}

      <div className="grid">
        <MoonPhaseCard date={moonDate} lang={lang} />
        {hasData
          ? <TideDashboardCard ex={ex} range={range} isToday={isToday} refTs={refTs} stationLabel={stationLabel} lang={lang} />
          : <div className="glass pad tidecard">
              <h2 className="title">{L.tideTitle}</h2>
              <div className="warn"><b>{stationLabel}</b>{L.notLoadedRest}</div>
            </div>}
      </div>

      <SunMoonCard dayKey={effKey} lat={coords.lat} lon={coords.lon} lang={lang} nowMs={nowMs} />

      <WeatherCard lat={coords.lat} lon={coords.lon} lang={lang} onLoad={setWx} ex={ex} place={selection.label} />

      {hasData && <ForecastList ex={ex} startKey={effKey} lang={lang} />}

      <CatchReportCard
        lang={lang}
        locationLabel={selection.label}
        lat={coords.lat}
        lon={coords.lon}
        tide={tideSnap}
        moon={moonSnap}
        weather={wx}
        dashOpen={dashOpen}
        onToggleDash={() => setDashOpen(o => !o)}
      />

      {dashOpen && <CatchDashboard lang={lang} onClose={() => setDashOpen(false)} />}

      {/* stationId travels too: push alerts are sent by the server, which needs
          to know which station's tide table to read for this device. spots,
          stations and tides are for the daily summary's own area picker, which
          can point somewhere other than the place on screen. */}
      <NotificationManager
        ex={ex}
        todaySummary={todaySummary}
        lang={lang}
        lat={coords.lat}
        lon={coords.lon}
        stationId={selection.stationId}
        spots={data.spots}
        stations={data.stations}
        tides={data.tides}
      />

      {/* The source attribution and the "not for navigation" line were removed
          from the footer at the user's request; the credit is all that remains.
          The footLine* strings are kept in i18n so restoring them needs no
          rewrite, same as the conditions-card footnote. */}
      <div className="foot">
        <div className="credit nodivider">
          <div className="madeby">{L.createdBy}</div>
          <div className="copy">{L.copyright}</div>
        </div>
      </div>
    </div>
  )
}

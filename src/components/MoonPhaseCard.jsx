import { moonInfo, nextPhaseDate, moonZodiac } from '../lib/moon.js'
import { TZ } from '../lib/tide.js'
import { t, localeFor, phaseName } from '../lib/i18n.js'

export default function MoonPhaseCard({ date, lang }) {
  const L = t(lang)
  const m = moonInfo(date)
  const z = moonZodiac(date)
  const nf = nextPhaseDate(0.5, date)
  const nn = nextPhaseDate(0.0, date)
  const off = (m.waxing ? 1 : -1) * (1 - m.illum) * 100
  const fmt = d => d.toLocaleDateString(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })

  return (
    <div className="glass pad">
      <h2 className="title">{L.moonTitle}</h2>
      <div className="moonwrap">
        <div className="moon">
          <div className="lit" />
          <div className="sh" style={{ transform: `translateX(${off}%)`, opacity: m.illum > 0.985 ? 0 : 1 }} />
        </div>
        <div>
          <div className="phase">{phaseName(lang, m.name)}</div>
          <span className={'tag ' + (m.isWhite ? 'w' : 'b')}>
            {m.isWhite ? L.whiteMoon : L.blackMoon}
          </span>
        </div>
      </div>
      <div className="mmeta">
        <div><div className="k">{L.illumination}</div><div className="v">{Math.round(m.illum * 100)}%</div></div>
        <div><div className="k">{L.moonAge}</div><div className="v">{m.age.toFixed(1)} <small>{L.days}</small></div></div>
        <div><div className="k">{L.zodiac}</div><div className="v">{lang === 'ml' ? z.ml : z.sign}</div></div>
        <div><div className="k">{L.trend}</div><div className="v">{m.waxing ? L.waxing : L.waning}</div></div>
        <div><div className="k">{L.nextFull}</div><div className="v" style={{ fontSize: '.92rem' }}>{fmt(nf)}</div></div>
        <div><div className="k">{L.nextNew}</div><div className="v" style={{ fontSize: '.92rem' }}>{fmt(nn)}</div></div>
      </div>
    </div>
  )
}

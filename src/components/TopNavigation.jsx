import { useEffect, useRef } from 'react'
import { dayKey } from '../lib/tide.js'
import { localeFor } from '../lib/i18n.js'

export default function TopNavigation({ days, selected, onSelect, lang }) {
  const ref = useRef(null)
  const today = dayKey(Date.now())
  const loc = localeFor(lang)

  useEffect(() => {
    const el = ref.current?.querySelector('.date.active')
    if (el) el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [selected])

  return (
    <div className="dates" ref={ref}>
      {days.map(k => {
        const d = new Date(k + 'T00:00:00')
        const cls = 'date' + (k === selected ? ' active' : '') + (k === today ? ' today' : '')
        return (
          <div key={k} className={cls} onClick={() => onSelect(k)}>
            <div className="dow">{d.toLocaleDateString(loc, { weekday: 'short' })}</div>
            <div className="num">{d.getDate()}</div>
            <div className="mon">{d.toLocaleDateString(loc, { month: 'short' })}</div>
          </div>
        )
      })}
    </div>
  )
}

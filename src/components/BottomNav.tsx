import { NavLink } from 'react-router-dom'
import { IconCalendar, IconGear, IconList, IconPerson, IconPlus } from './icons'
import { LiquidSurface } from './LiquidSurface'

const TABS = [
  { to: '/', label: 'LIST', Icon: IconList, end: true, mid: false },
  { to: '/calendar', label: 'CAL', Icon: IconCalendar, end: false, mid: false },
  { to: '/new', label: 'NEW', Icon: IconPlus, end: false, mid: true },
  { to: '/settings', label: 'SET', Icon: IconGear, end: false, mid: false },
  { to: '/profile', label: 'ME', Icon: IconPerson, end: false, mid: false },
]

export function BottomNav() {
  return (
    <nav className="nav">
      <LiquidSurface />
      {TABS.map(({ to, label, Icon, end, mid }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => [isActive && 'on', mid && 'mid'].filter(Boolean).join(' ')}
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

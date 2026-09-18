import { NavLink } from 'react-router-dom'
import { IconCalendar, IconGear, IconList, IconPerson, IconPlus } from './icons'
import { LiquidSurface } from './LiquidSurface'
import { useT } from '../lib/i18n'
import '../styles/onboarding.css'

const TABS = [
  { to: '/', ko: '할 일', en: 'Tasks', Icon: IconList, end: true, mid: false },
  { to: '/calendar', ko: '달력', en: 'Calendar', Icon: IconCalendar, end: false, mid: false },
  { to: '/new', ko: '추가', en: 'Add', Icon: IconPlus, end: false, mid: true },
  { to: '/settings', ko: '설정', en: 'Settings', Icon: IconGear, end: false, mid: false },
  { to: '/profile', ko: '내 정보', en: 'Profile', Icon: IconPerson, end: false, mid: false },
]

export function BottomNav() {
  const t = useT()
  return (
    <nav className="nav" aria-label={t('주 메뉴', 'Main navigation')}>
      <LiquidSurface />
      {TABS.map(({ to, ko, en, Icon, end, mid }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => [isActive && 'on', mid && 'mid'].filter(Boolean).join(' ')}
        >
          <Icon />
          <span>{t(ko, en)}</span>
        </NavLink>
      ))}
    </nav>
  )
}

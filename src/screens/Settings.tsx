import { Screen } from '../components/Screen'
import { SubjectIcon } from '../components/subject-icons'
import { IconArrow } from '../components/icons'
import { useT } from '../lib/i18n'
import { saveSettings, useAppSettings } from '../lib/settings'
import { APP_VERSION } from '../lib/version'

const GITHUB = 'https://github.com/AcE3742-SASA'

function Seg<T extends string | number>({
  value,
  options,
  onPick,
}: {
  value: T
  options: { v: T; label: string }[]
  onPick: (v: T) => void
}) {
  return (
    <span className="seg">
      {options.map((o) => (
        <button
          key={String(o.v)}
          className={o.v === value ? 'on' : ''}
          aria-pressed={o.v === value}
          onClick={() => onPick(o.v)}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

export function Settings({ uid }: { uid: string }) {
  const t = useT()
  const { weekStartsOn, lang } = useAppSettings()

  return (
    <Screen title={t('설정', 'Settings')} aside={`v${APP_VERSION}`}>
      <div className="rows">
        <div className="row off">
          <SubjectIcon id="bell" />
          <span className="rl">
            <b>{t('매일 알림', 'Daily reminder')}</b>
            <em>{t('할 일 정리 · 요약 리뷰', 'Plan and review')}</em>
          </span>
          <span className="tag">REL 2</span>
        </div>

        <div className="row off">
          <SubjectIcon id="hourglass" />
          <span className="rl">
            <b>{t('마감 임박 알림', 'Due soon')}</b>
            <em>{t('기한 전에 알려주기', 'Nudge before the deadline')}</em>
          </span>
          <span className="tag">REL 2</span>
        </div>

        <div className="row">
          <SubjectIcon id="calendar" />
          <span className="rl">
            <b>{t('주 시작 요일', 'Week starts on')}</b>
            <em>{t('“이번 주”와 기한 계산의 기준', 'Sets “this week” and due dates')}</em>
          </span>
          <Seg
            value={weekStartsOn}
            options={[
              { v: 1 as const, label: t('월', 'Mon') },
              { v: 0 as const, label: t('일', 'Sun') },
            ]}
            onPick={(v) => saveSettings(uid, { weekStartsOn: v })}
          />
        </div>

        <div className="row">
          <SubjectIcon id="globe" />
          <span className="rl">
            <b>{t('언어', 'Language')}</b>
            <em>Language</em>
          </span>
          <Seg
            value={lang}
            options={[
              { v: 'ko' as const, label: '한국어' },
              { v: 'en' as const, label: 'EN' },
            ]}
            onPick={(v) => saveSettings(uid, { lang: v })}
          />
        </div>

        <div className="row">
          <SubjectIcon id="report" />
          <span className="rl">
            <b>{t('버전 정보', 'Version')}</b>
            <em>{APP_VERSION}</em>
          </span>
        </div>

        <a className="row" href={GITHUB} target="_blank" rel="noreferrer">
          <SubjectIcon id="code" />
          <span className="rl">
            <b>{t('개발자 · GitHub', 'Developer · GitHub')}</b>
            <em>AcE3742-SASA</em>
          </span>
          <IconArrow />
        </a>
      </div>
    </Screen>
  )
}

import { useEffect, useState } from 'react'
import { Screen } from '../components/Screen'
import { SubjectIcon } from '../components/subject-icons'
import { IconArrow } from '../components/icons'
import { useT } from '../lib/i18n'
import { saveNotify, saveSettings, useAppSettings } from '../lib/settings'
import {
  isSubscribedHere,
  permission,
  pushSupported,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '../lib/push'
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

const HOURS = Array.from({ length: 24 }, (_, h) => h)

function HourPick({
  value,
  label,
  onPick,
}: {
  value: number | null
  label: string
  onPick: (v: number | null) => void
}) {
  const t = useT()
  return (
    <select
      className="hourpick"
      value={value === null ? 'off' : String(value)}
      aria-label={label}
      onChange={(e) => onPick(e.target.value === 'off' ? null : Number(e.target.value))}
    >
      <option value="off">{t('끔', 'Off')}</option>
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  )
}

/**
 * 구독 여부는 Firestore 가 아니라 이 브라우저의 PushManager 가 진실이다.
 * 기기마다 다르므로 설정 문서에 담지 않는다.
 */
function useThisDevice(uid: string) {
  const [on, setOn] = useState(false)
  const [perm, setPerm] = useState(permission())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // serviceWorker.ready / getSubscription 은 reject 할 수 있다 — 구독 여부를
    // 못 읽었으면 켜져 있다고 우길 근거가 없으니 꺼짐으로 본다.
    void isSubscribedHere().then(setOn).catch(() => setOn(false))
  }, [])

  async function toggle() {
    setBusy(true)
    setErr(null)
    try {
      if (on) {
        await unsubscribeThisDevice(uid)
        setOn(false)
      } else {
        await subscribeThisDevice(uid)
        setOn(true)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
    } finally {
      setPerm(permission())
      setBusy(false)
    }
  }

  return { on, perm, busy, err, toggle }
}

export function Settings({ uid }: { uid: string }) {
  const t = useT()
  const { weekStartsOn, lang, notify } = useAppSettings()
  const dev = useThisDevice(uid)

  return (
    <Screen title={t('설정', 'Settings')} aside={`v${APP_VERSION}`}>
      <div className="rows">
        <div className="row">
          <SubjectIcon id="bell" />
          <span className="rl">
            <b>{t('이 기기로 알림 받기', 'Notify this device')}</b>
            <em>
              {dev.err === 'unsupported' || dev.perm === 'unsupported'
                ? t('홈 화면에 추가한 뒤 다시 시도', 'Add to Home Screen, then retry')
                : dev.err === 'denied' || dev.perm === 'denied'
                  ? t('브라우저 설정에서 허용해야 한다', 'Allow it in browser settings')
                  : dev.err === 'nokey'
                    ? t('VAPID 키가 설정되지 않았다', 'VAPID key is missing')
                    : dev.err
                      ? t('실패했다. 다시 시도해 보자', 'Failed. Try again')
                      : dev.on
                        ? t('켜짐', 'On')
                        : t('꺼짐', 'Off')}
            </em>
          </span>
          <span className="seg">
            <button
              className={dev.on ? 'on' : ''}
              aria-pressed={dev.on}
              disabled={dev.busy || !pushSupported()}
              onClick={() => void dev.toggle()}
            >
              {dev.on ? t('끄기', 'OFF') : t('켜기', 'ON')}
            </button>
          </span>
        </div>

        <div className="row">
          <SubjectIcon id="coffee" />
          <span className="rl">
            <b>{t('아침 요약', 'Morning summary')}</b>
            <em>{t('오늘·내일 마감 건수', "Today's and tomorrow's count")}</em>
          </span>
          <HourPick
            value={notify.morningHour}
            label={t('아침 알림 시각', 'Morning notification time')}
            onPick={(v) => void saveNotify(uid, { morningHour: v })}
          />
        </div>

        <div className="row">
          <SubjectIcon id="hourglass" />
          <span className="rl">
            <b>{t('할일 정리', 'Wrap up')}</b>
            <em>{t('오늘 받은 과제 넣기', "Add today's assignments")}</em>
          </span>
          <HourPick
            value={notify.eveningHour}
            label={t('저녁 알림 시각', 'Evening notification time')}
            onPick={(v) => void saveNotify(uid, { eveningHour: v })}
          />
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

import { useEffect, useRef, useState } from 'react'
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
          // 특정 칸을 직접 누르면 그 값으로. 바깥 행의 토글까지 겹쳐 실행되지 않게 막는다.
          onClick={(e) => {
            e.stopPropagation()
            onPick(o.v)
          }}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

/**
 * 아이콘·설명·세그를 담은 설정 행 전체를 눌림 대상으로 만든다.
 * 행 어디를 눌러도 다음 값으로 넘어가고(2갈래면 반대쪽, 3갈래면 순환),
 * 세그 칸을 콕 집으면 그 값이 그대로 선택된다.
 */
function ToggleRow<T extends string | number>({
  icon,
  title,
  desc,
  value,
  options,
  onPick,
}: {
  icon: string
  title: string
  desc: string
  value: T
  options: { v: T; label: string }[]
  onPick: (v: T) => void
}) {
  const flip = () => {
    const i = options.findIndex((o) => o.v === value)
    onPick(options[(i + 1) % options.length].v)
  }
  return (
    <div
      className="row"
      role="button"
      tabIndex={0}
      onClick={flip}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          flip()
        }
      }}
    >
      <SubjectIcon id={icon} />
      <span className="rl">
        <b>{title}</b>
        <em>{desc}</em>
      </span>
      <Seg value={value} options={options} onPick={onPick} />
    </div>
  )
}

/** 끔 + 00:00~23:00. 아침·저녁 알림 시각 선택지. */
const hourOpts = (offLabel: string): { v: number | null; label: string }[] => [
  { v: null, label: offLabel },
  ...Array.from({ length: 24 }, (_, h) => ({ v: h, label: `${String(h).padStart(2, '0')}:00` })),
]

/**
 * null 을 포함한 숫자 드롭다운을 담은 설정 행. 행 어디를 눌러도 드롭다운이 열린다.
 * 시각(아침·저녁)과 여유 시간("곧 마감")이 같은 모양을 쓰므로 선택지를 밖에서 받는다.
 */
function SelectRow({
  icon,
  title,
  desc,
  value,
  label,
  options,
  onPick,
}: {
  icon: string
  title: string
  desc: string
  value: number | null
  label: string
  options: { v: number | null; label: string }[]
  onPick: (v: number | null) => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  // 바를 누르면 네이티브 드롭다운을 연다. showPicker 를 못 쓰면 최소한 포커스라도 준다.
  const open = () => {
    const el = ref.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }
  return (
    <div
      className="row"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <SubjectIcon id={icon} />
      <span className="rl">
        <b>{title}</b>
        <em>{desc}</em>
      </span>
      <select
        ref={ref}
        className="hourpick"
        value={value === null ? 'off' : String(value)}
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onPick(e.target.value === 'off' ? null : Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o.v === null ? 'off' : o.v} value={o.v === null ? 'off' : String(o.v)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
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
  const { weekStartsOn, lang, notify, theme } = useAppSettings()
  const dev = useThisDevice(uid)

  return (
    <Screen title={t('설정', 'Settings')} aside={`v${APP_VERSION}`}>
      <div className="rows">
        <div
          className="row"
          role="button"
          tabIndex={0}
          aria-disabled={dev.busy || !pushSupported()}
          onClick={() => {
            if (!dev.busy && pushSupported()) void dev.toggle()
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !dev.busy && pushSupported()) {
              e.preventDefault()
              void dev.toggle()
            }
          }}
        >
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
              onClick={(e) => {
                e.stopPropagation()
                void dev.toggle()
              }}
            >
              {dev.on ? t('끄기', 'OFF') : t('켜기', 'ON')}
            </button>
          </span>
        </div>

        <SelectRow
          icon="coffee"
          title={t('아침 요약', 'Morning summary')}
          desc={t('오늘·내일 마감 건수', "Today's and tomorrow's count")}
          value={notify.morningHour}
          label={t('아침 알림 시각', 'Morning notification time')}
          options={hourOpts(t('끔', 'Off'))}
          onPick={(v) => void saveNotify(uid, { morningHour: v })}
        />

        <SelectRow
          icon="hourglass"
          title={t('할일 정리', 'Wrap up')}
          desc={t('오늘 받은 과제 넣기', "Add today's assignments")}
          value={notify.eveningHour}
          label={t('저녁 알림 시각', 'Evening notification time')}
          options={hourOpts(t('끔', 'Off'))}
          onPick={(v) => void saveNotify(uid, { eveningHour: v })}
        />

        <SelectRow
          icon="bell"
          title={t('곧 마감 알림', 'Due soon alert')}
          desc={t('마감 전 미리 알림', 'A heads-up before a deadline')}
          value={notify.soonBefore}
          label={t('마감 몇 시간 전', 'How long before the deadline')}
          options={[
            { v: null, label: t('끔', 'Off') },
            { v: 1, label: t('1시간 전', '1h before') },
            { v: 2, label: t('2시간 전', '2h before') },
            { v: 3, label: t('3시간 전', '3h before') },
            { v: 6, label: t('6시간 전', '6h before') },
            { v: 12, label: t('12시간 전', '12h before') },
          ]}
          onPick={(v) => void saveNotify(uid, { soonBefore: v })}
        />

        {/* 알림은 매시 정각의 서버 크론으로 나간다. 그 크론(GitHub Actions)이
            밀리는 일이 잦아, 도착이 20분쯤 늦을 수 있음을 미리 알린다. */}
        <p className="rows-note">
          {t(
            '알림은 서버 일정에 따라 정시보다 20분 정도 늦게 도착할 수 있다.',
            'Notifications may arrive up to about 20 minutes late, depending on server scheduling.',
          )}
        </p>

        <ToggleRow
          icon="calendar"
          title={t('주 시작 요일', 'Week starts on')}
          desc={t('달력 주 시작과 기한 계산의 기준', 'Sets calendar week start and due dates')}
          value={weekStartsOn}
          options={[
            { v: 1 as const, label: t('월', 'Mon') },
            { v: 0 as const, label: t('일', 'Sun') },
          ]}
          onPick={(v) => saveSettings(uid, { weekStartsOn: v })}
        />

        <ToggleRow
          icon="globe"
          title={t('언어', 'Language')}
          desc="Language"
          value={lang}
          options={[
            { v: 'ko' as const, label: '한국어' },
            { v: 'en' as const, label: 'EN' },
          ]}
          onPick={(v) => saveSettings(uid, { lang: v })}
        />

        <ToggleRow
          icon="palette"
          title={t('화면 모드', 'Appearance')}
          desc={t('밝게·어둡게·기기 설정', 'Light, dark, or your device')}
          value={theme}
          options={[
            { v: 'system' as const, label: t('자동', 'Auto') },
            { v: 'light' as const, label: t('밝게', 'Light') },
            { v: 'dark' as const, label: t('어둡게', 'Dark') },
          ]}
          onPick={(v) => saveSettings(uid, { theme: v })}
        />

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

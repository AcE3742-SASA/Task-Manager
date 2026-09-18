import { useEffect, useRef, useState } from 'react'
import { Screen } from '../components/Screen'
import { SubjectIcon } from '../components/subject-icons'
import { IconArrow } from '../components/icons'
import { useT } from '../lib/i18n'
import { useSettingsMutation, useAppSettings } from '../lib/settings'
import {
  getPushStatus,
  sendTestPush,
  permission,
  pushSupported,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from '../lib/push'
import type { PushStatus } from '../lib/push'
import { APP_VERSION } from '../lib/version'
import { AppearanceSettings } from '../components/AppearanceSettings'
import { LiquidSurface } from '../components/LiquidSurface'

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
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          flip()
        }
      }}
    >
      <LiquidSurface />
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
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <LiquidSurface />
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

/** 로컬 권한과 현재 계정의 서버 등록을 함께 확인한다. */
function useThisDevice(uid: string) {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [perm, setPerm] = useState(permission())
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setStatus(null)
    setBusy(true)
    setErr(null)
    void getPushStatus(uid).then((next) => { if (active) setStatus(next) })
      .catch(() => { if (active) setErr('status-failed') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [uid])

  async function refresh() {
    setBusy(true)
    setErr(null)
    try { setStatus(await getPushStatus(uid)) }
    catch { setErr('status-failed') }
    finally { setPerm(permission()); setBusy(false) }
  }

  async function toggle() {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      if (status === 'on') {
        await unsubscribeThisDevice(uid)
        setStatus('off')
      } else {
        await subscribeThisDevice(uid)
        setStatus(await getPushStatus(uid))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed')
      // 해제는 로컬부터 진행하므로 실패 뒤에 예전 '켜짐'을 유지하지 않는다.
      setStatus(null)
    } finally {
      setPerm(permission())
      setBusy(false)
    }
  }
  return { status, perm, busy, err, toggle, refresh }
}

export function Settings({ uid }: { uid: string }) {
  const t = useT()
  const { weekStartsOn, lang, notify, settingsStatus } = useAppSettings()
  const changes = useSettingsMutation(uid)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [testFailed, setTestFailed] = useState(false)
  const dev = useThisDevice(uid)

  async function testNotification() {
    if (testing) return
    setTesting(true)
    setTestMessage(null)
    setTestFailed(false)
    try {
      await sendTestPush(uid)
      setTestMessage(t('발송 요청이 접수됐어요. 이 기기에 알림이 도착했는지 확인해 주세요.', 'Push service accepted the request. Check that the notification arrives on this device.'))
    } catch (error) {
      setTestFailed(true)
      const code = error instanceof Error ? error.message : ''
      setTestMessage(code === 'rate-limited'
        ? t('잠시 후 다시 시도해 주세요. 테스트 알림은 1분에 한 번, 하루 10번까지 보낼 수 있어요.', 'Try later. Test notifications are limited to once per minute and ten per day.')
        : t('테스트 알림을 보내지 못했어요. 기기 알림 연결을 확인한 뒤 다시 시도해 주세요.', 'Could not send a test notification. Check the device connection and try again.'))
    } finally { setTesting(false) }
  }

  return (
    <Screen title={t('설정', 'Settings')} aside={`v${APP_VERSION}`}>
      <div className="rows" aria-busy={changes.saving}>
        {settingsStatus.readError && <p className="rows-note" role="alert">{t('설정을 불러오지 못했어요. 화면의 설정이 최신 상태가 아닐 수 있어요. 연결을 확인한 뒤 앱을 다시 열어 주세요.', 'Could not load settings. These values may be out of date. Check your connection and reopen the app.')}</p>}
        {(changes.saving || changes.failed) && <div className="rows-note" role={changes.failed ? 'alert' : 'status'}>
          {changes.failed
            ? t('설정을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.', 'Could not save settings. Check your connection and try again.')
            : t('설정을 서버에 저장하는 중이에요. 연결이 끊겼다면 다시 연결되면 저장돼요.', 'Waiting to sync settings. If disconnected, they will sync when the connection returns.')}
          {changes.failed && <button className="act" onClick={() => void changes.retry()}>{t('다시 시도', 'Retry')}</button>}
        </div>}
        <div
          className="row"
          role="button"
          tabIndex={0}
          aria-disabled={dev.busy || !pushSupported()}
          onClick={() => {
            if (!dev.busy && pushSupported()) void dev.toggle()
          }}
          onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
            if ((e.key === 'Enter' || e.key === ' ') && !dev.busy && pushSupported()) {
              e.preventDefault()
              void dev.toggle()
            }
          }}
        >
          <LiquidSurface />
          <SubjectIcon id="bell" />
          <span className="rl">
            <b>{t('이 기기로 알림 받기', 'Notify this device')}</b>
            <em>
              {dev.busy
                ? t('알림 연결 확인 중…', 'Checking notification connection…')
                : dev.err === 'unsupported' || dev.perm === 'unsupported'
                  ? t('iPhone은 홈 화면에 추가한 뒤 다시 시도해 주세요.', 'On iPhone, add to Home Screen and retry.')
                  : dev.err === 'denied' || dev.perm === 'denied'
                    ? t('브라우저 설정에서 알림을 허용해 주세요.', 'Allow notifications in browser settings.')
                    : dev.err
                      ? t('연결을 확인하지 못했어요. 다시 확인해 주세요.', 'Could not verify the connection. Check again.')
                      : dev.status === 'on'
                        ? t('이 계정과 기기의 연결을 확인했어요.', 'This device is connected to your account.')
                        : dev.status === 'reconnect'
                          ? t('이 계정으로 알림을 다시 연결해 주세요.', 'Reconnect notifications for this account.')
                          : t('알림이 꺼져 있어요.', 'Notifications are off.')}

            </em>
          </span>
          <span className="seg">
            <button
              className={dev.status === 'on' ? 'on' : ''}
              aria-pressed={dev.status === 'on'}
              disabled={dev.busy || !pushSupported()}
              onClick={(e) => {
                e.stopPropagation()
                void dev.toggle()
              }}
            >
              {dev.status === 'on' ? t('끄기', 'OFF') : t('켜기', 'ON')}
            </button>
          </span>
        </div>

        {dev.err && <button className="act" disabled={dev.busy} onClick={() => void dev.refresh()}>{t('연결 다시 확인', 'Check connection again')}</button>}
        <button className="row" disabled={dev.busy || testing || dev.status !== 'on'} onClick={() => void testNotification()}>
          <SubjectIcon id="bell" />
          <span className="rl"><b>{testing ? t('테스트 알림 보내는 중…', 'Sending test notification…') : t('테스트 알림 보내기', 'Send a test notification')}</b>
            <em>{t('이 기기에 실제로 도착하는지 확인해 보세요.', 'Check that this device receives the notification.')}</em></span>
        </button>
        {testMessage && <p className="rows-note" role={testFailed ? 'alert' : 'status'}>{testMessage}</p>}

        <SelectRow
          icon="coffee"
          title={t('아침 요약', 'Morning summary')}
          desc={t('오늘·내일 마감 건수', "Today's and tomorrow's count")}
          value={notify.morningHour}
          label={t('아침 알림 시각', 'Morning notification time')}
          options={hourOpts(t('끔', 'Off'))}
          onPick={(v) => void changes.save({ notify: { morningHour: v } })}
        />

        <SelectRow
          icon="hourglass"
          title={t('할일 정리', 'Wrap up')}
          desc={t('오늘 받은 과제 넣기', "Add today's assignments")}
          value={notify.eveningHour}
          label={t('저녁 알림 시각', 'Evening notification time')}
          options={hourOpts(t('끔', 'Off'))}
          onPick={(v) => void changes.save({ notify: { eveningHour: v } })}
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
          onPick={(v) => void changes.save({ notify: { soonBefore: v } })}
        />

        {/* 예약 발송과 기기 수신 시각은 다르며, 지연 상한을 보장하지 않는다. */}
        <p className="rows-note">
          {t(
            '예약 알림은 서버와 기기 연결 상태에 따라 늦어지거나 누락될 수 있어요. 테스트 알림으로 이 기기의 연결을 확인해 보세요.',
            'Scheduled notifications can be delayed or missed depending on the server and device connection. Use a test notification to check this device.',
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
          onPick={(v) => void changes.save({ weekStartsOn: v })}
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
          onPick={(v) => void changes.save({ lang: v })}
        />

        <AppearanceSettings uid={uid} />

        <div className="row">
          <LiquidSurface />
          <SubjectIcon id="report" />
          <span className="rl">
            <b>{t('버전 정보', 'Version')}</b>
            <em>{APP_VERSION}</em>
          </span>
        </div>

        <a className="row" href={GITHUB} target="_blank" rel="noreferrer">
          <LiquidSurface />
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

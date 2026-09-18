import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Lang } from './i18n'
import { DEFAULT_NOTIFY } from './notify'
import type { Notify } from './notify'
import { applyAppearance, cacheAppearance, DEFAULT_APPEARANCE, normalizeAppearance, readAppearance } from './appearance'
import type { Appearance } from './appearance'

export type { Theme, ThemeStyle } from './appearance'

/** 0 = 일요일, 1 = 월요일. "이번 주"의 경계와 자동 기한 계산이 함께 읽는다. */
export type Settings = { weekStartsOn: 0 | 1; lang: Lang; notify: Notify } & Appearance

export const DEFAULT_SETTINGS: Settings = {
  weekStartsOn: 1,
  lang: 'ko',
  notify: DEFAULT_NOTIFY,
  ...DEFAULT_APPEARANCE,
}

/**
 * notify 는 한 겹 더 들어가 있어 얕은 스프레드로는 기본값이 안 채워진다.
 * 08-21 이전에 만들어진 설정 문서에는 이 필드가 아예 없다.
 * 순수 함수로 둬서 테스트가 사본이 아니라 이 코드를 검증하게 한다.
 */
export function mergeSettings(d: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...d, ...normalizeAppearance(d), notify: { ...DEFAULT_NOTIFY, ...d.notify } }
}

const ref = (uid: string) => {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return doc(db, 'users', uid, 'settings', 'app')
}

export type SettingsPatch = Partial<Omit<Settings, 'notify'>> & { notify?: Partial<Notify> }

export function saveSettings(uid: string, patch: SettingsPatch) {
  return setDoc(ref(uid), patch, { merge: true })
}

export type SettingsState = Settings & {
  settingsStatus: { readError: boolean; fromCache: boolean; hasPendingWrites: boolean }
}
const INITIAL_STATUS = { readError: false, fromCache: true, hasPendingWrites: false }
export const SettingsContext = createContext<SettingsState>({ ...DEFAULT_SETTINGS, settingsStatus: INITIAL_STATUS })

/** 실패한 최신 필드만 다시 시도한다. 대기 중인 쓰기는 중복 제출하지 않는다. */
export function useSettingsMutation(uid: string) {
  const [status, setStatus] = useState({ saving: false, failed: false })
  const fresh = () => ({ next: 0, pending: 0, latest: new Map<string, number>(), failures: new Map<string, SettingsPatch>() })
  const current = useRef(fresh())
  useEffect(() => {
    current.current = fresh()
    setStatus({ saving: false, failed: false })
  }, [uid])

  async function save(patch: SettingsPatch) {
    // 알림의 세 필드도 독립적으로 다룬다. 아침 저장 실패가 언어 변경 뒤에 숨지 않는다.
    const parts = Object.entries(patch).flatMap<[string, SettingsPatch]>(([key, value]) =>
      key === 'notify'
        ? Object.entries(value ?? {}).map<[string, SettingsPatch]>(([field, setting]) => [`notify.${field}`, { notify: { [field]: setting } }])
        : [[key, { [key]: value }]],
    )
    if (!parts.length) return
    const state = current.current
    const request = ++state.next
    state.pending++
    for (const [key] of parts) {
      state.latest.set(key, request)
      state.failures.delete(key)
    }
    setStatus({ saving: true, failed: state.failures.size > 0 })
    try {
      await saveSettings(uid, patch)
    } catch {
      for (const [key, value] of parts) {
        if (state.latest.get(key) === request) state.failures.set(key, value)
      }
    } finally {
      state.pending--
      if (current.current === state) setStatus({ saving: state.pending > 0, failed: state.failures.size > 0 })
    }
  }
  function retry() {
    const patch: SettingsPatch = {}
    for (const value of current.current.failures.values()) {
      const notify = value.notify ? { ...patch.notify, ...value.notify } : patch.notify
      Object.assign(patch, value)
      if (notify) patch.notify = notify
    }
    return save(patch)
  }
  return { save, ...status, retry }
}

/** 화면들은 이걸로 읽는다. props 로 내려보내지 않는다 — 거의 모든 화면이 필요로 한다. */
export const useAppSettings = () => useContext(SettingsContext)

export function useSettings(uid: string): SettingsState {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...readAppearance() }))
  const [settingsStatus, setStatus] = useState(INITIAL_STATUS)

  useEffect(() => {
    setStatus(INITIAL_STATUS)
    if (!db) {
      setStatus({ ...INITIAL_STATUS, readError: true })
      return
    }
    return onSnapshot(
      doc(db, 'users', uid, 'settings', 'app'),
      { includeMetadataChanges: true },
      (snap) => {
        setStatus({ readError: false, fromCache: snap.metadata.fromCache, hasPendingWrites: snap.metadata.hasPendingWrites })
        // 서버 응답 전의 빈 캐시로 마지막 테마를 덮어쓰지 않는다.
        if (!snap.exists() && snap.metadata.fromCache) return
        const next = mergeSettings((snap.data() ?? {}) as Partial<Settings>)
        setSettings(next)
        // 낙관적 로컬 변경은 즉시 표시하지만, 거절될 수 있으므로 캐시하지 않는다.
        if (!snap.metadata.hasPendingWrites) cacheAppearance(next)
      },
      // 읽기 실패 때는 복원된 화면 설정을 유지한다.
      () => setStatus((value) => ({ ...value, readError: true })),
    )
  }, [uid])

  // index.html 의 lang="ko" 는 고정값이다. 설정을 영어로 바꿔도 그대로라
  // 스크린리더가 영어 문장을 한국어 음성으로 읽었다. 여기서 한 번만 맞춰 준다.
  useEffect(() => {
    document.documentElement.lang = settings.lang
  }, [settings.lang])

  useEffect(() => applyAppearance(settings), [settings.theme, settings.themeStyle])

  return { ...settings, settingsStatus }
}

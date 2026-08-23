import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Lang } from './i18n'
import type { Notify } from './notify'

/** 0 = 일요일, 1 = 월요일. "이번 주"의 경계와 자동 기한 계산이 함께 읽는다. */
export type Settings = { weekStartsOn: 0 | 1; lang: Lang; notify: Notify }

export const DEFAULT_NOTIFY: Notify = { morningHour: 7, eveningHour: 21 }
export const DEFAULT_SETTINGS: Settings = {
  weekStartsOn: 1,
  lang: 'ko',
  notify: DEFAULT_NOTIFY,
}

/**
 * notify 는 한 겹 더 들어가 있어 얕은 스프레드로는 기본값이 안 채워진다.
 * 08-21 이전에 만들어진 설정 문서에는 이 필드가 아예 없다.
 * 순수 함수로 둬서 테스트가 사본이 아니라 이 코드를 검증하게 한다.
 */
export function mergeSettings(d: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...d, notify: { ...DEFAULT_NOTIFY, ...d.notify } }
}

const ref = (uid: string) => {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return doc(db, 'users', uid, 'settings', 'app')
}

export function saveSettings(uid: string, patch: Partial<Settings>) {
  return setDoc(ref(uid), patch, { merge: true })
}

/**
 * merge:true 는 중첩 맵도 granular 하게 병합한다 — 아침만 넘겨도 저녁 값은
 * 손대지 않는다 (빈 맵을 넘길 때만 통째로 갈린다).
 * updateDoc 의 dot-path 도 같은 일을 하지만 문서가 없으면 던진다.
 * 설정을 한 번도 안 건드린 계정에는 이 문서가 아직 없다.
 */
export const saveNotify = (uid: string, patch: Partial<Notify>) =>
  setDoc(ref(uid), { notify: patch }, { merge: true })

export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS)

/** 화면들은 이걸로 읽는다. props 로 내려보내지 않는다 — 거의 모든 화면이 필요로 한다. */
export const useAppSettings = () => useContext(SettingsContext)

export function useSettings(uid: string): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    if (!db) return
    return onSnapshot(
      doc(db, 'users', uid, 'settings', 'app'),
      (snap) => setSettings(mergeSettings((snap.data() ?? {}) as Partial<Settings>)),
      // 설정을 못 읽어도 앱은 기본값으로 돌아야 한다. 화면을 막지 않는다.
      () => setSettings(DEFAULT_SETTINGS),
    )
  }, [uid])

  // index.html 의 lang="ko" 는 고정값이다. 설정을 영어로 바꿔도 그대로라
  // 스크린리더가 영어 문장을 한국어 음성으로 읽었다. 여기서 한 번만 맞춰 준다.
  useEffect(() => {
    document.documentElement.lang = settings.lang
  }, [settings.lang])

  return settings
}

import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Lang } from './i18n'

/** 0 = 일요일, 1 = 월요일. "이번 주"의 경계와 자동 기한 계산이 함께 읽는다. */
export type Settings = { weekStartsOn: 0 | 1; lang: Lang }

export const DEFAULT_SETTINGS: Settings = { weekStartsOn: 1, lang: 'ko' }

const ref = (uid: string) => {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return doc(db, 'users', uid, 'settings', 'app')
}

export function saveSettings(uid: string, patch: Partial<Settings>) {
  return setDoc(ref(uid), patch, { merge: true })
}

export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS)

/** 화면들은 이걸로 읽는다. props 로 내려보내지 않는다 — 거의 모든 화면이 필요로 한다. */
export const useAppSettings = () => useContext(SettingsContext)

export function useSettings(uid: string): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    if (!db) return
    return onSnapshot(
      doc(db, 'users', uid, 'settings', 'app'),
      (snap) => setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings>) }),
      // 설정을 못 읽어도 앱은 기본값으로 돌아야 한다. 화면을 막지 않는다.
      () => setSettings(DEFAULT_SETTINGS),
    )
  }, [uid])

  return settings
}

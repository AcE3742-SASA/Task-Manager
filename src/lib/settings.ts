import { createContext, useContext, useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { Lang } from './i18n'
import { DEFAULT_NOTIFY } from './notify'
import type { Notify } from './notify'

/** 'system' 은 OS 설정을 따른다. light·dark 는 그걸 무시하고 못박는다. */
export type Theme = 'system' | 'light' | 'dark'

/** 0 = 일요일, 1 = 월요일. "이번 주"의 경계와 자동 기한 계산이 함께 읽는다. */
export type Settings = { weekStartsOn: 0 | 1; lang: Lang; notify: Notify; theme: Theme }

export const DEFAULT_SETTINGS: Settings = {
  weekStartsOn: 1,
  lang: 'ko',
  notify: DEFAULT_NOTIFY,
  theme: 'system',
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

  // 다크 모드는 CSS 가 <html data-theme> 만 본다. 'system' 도 여기서 OS 값을
  // 읽어 light/dark 중 하나로 못박는다 — CSS 에 미디어쿼리를 두지 않으므로
  // (토큰 블록 중복을 피한다), OS 테마가 바뀌면 리스너로 다시 칠한다.
  useEffect(() => applyTheme(settings.theme), [settings.theme])

  return settings
}

/** data-theme 을 확정하고, 테마 색과 맞는 상태바 색(theme-color)까지 맞춘다. */
function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme: Theme): void | (() => void) {
  const paint = () => {
    const resolved = resolveTheme(theme)
    document.documentElement.dataset.theme = resolved
    // iOS standalone 은 문서 배경색(= --paper)으로 상태바 띠를 칠하므로 이건
    // 저절로 맞는다. theme-color 는 안드로이드·데스크탑 PWA 용이라 손으로 맞춘다.
    // 값은 tokens.css 의 --paper 와 동일하게 유지한다.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#292a2e' : '#fffdf8')
  }
  paint()
  // 'system' 일 때만 OS 변경을 따라간다. 못박은 테마는 리스너가 필요 없다.
  if (theme !== 'system' || typeof matchMedia !== 'function') return
  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', paint)
  return () => mq.removeEventListener('change', paint)
}

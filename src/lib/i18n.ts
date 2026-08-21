import { useAppSettings } from './settings'

export type Lang = 'ko' | 'en'

/**
 * 키 사전을 두지 않고 호출 지점에 두 언어를 나란히 둔다.
 * 언어가 둘이고 문자열이 화면에만 있는 앱에서 키 등록부는 관리비만 늘린다.
 */
export type T = (ko: string, en: string) => string

export const makeT =
  (lang: Lang): T =>
  (ko, en) =>
    lang === 'en' ? en : ko

export function useT(): T {
  return makeT(useAppSettings().lang)
}

/**
 * 언어 설정은 계정별로 Firestore 에 있다. 로그인 전에는 읽을 수가 없으니
 * 로그인 화면과 부팅 문구만 브라우저 언어로 추측한다.
 */
export function browserLang(): Lang {
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

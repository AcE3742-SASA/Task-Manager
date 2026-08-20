import { useAppSettings } from './settings'

export type Lang = 'ko' | 'en'

/**
 * 키 사전을 두지 않고 호출 지점에 두 언어를 나란히 둔다.
 * 언어가 둘이고 문자열이 화면에만 있는 앱에서 키 등록부는 관리비만 늘린다.
 */
export function useT() {
  const { lang } = useAppSettings()
  return (ko: string, en: string) => (lang === 'en' ? en : ko)
}

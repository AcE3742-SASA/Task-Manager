export const THEME_STYLES = ['classic', 'neumorphism', 'neo-brutalism', 'glassmorphism'] as const
export type ThemeStyle = (typeof THEME_STYLES)[number]
export type Theme = 'system' | 'light' | 'dark'
export type Appearance = { theme: Theme; themeStyle: ThemeStyle }

export const APPEARANCE_KEY = 'sasa-appearance'
export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', themeStyle: 'classic' }

/** Firestore와 로컬 캐시는 이전 버전·잘못된 값을 포함할 수 있다. */
export function normalizeAppearance(value: unknown): Appearance {
  const d = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    theme: d.theme === 'light' || d.theme === 'dark' ? d.theme : 'system',
    themeStyle: THEME_STYLES.includes(d.themeStyle as ThemeStyle) ? d.themeStyle as ThemeStyle : 'classic',
  }
}

export function readAppearance(): Appearance {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

/** 계정 설정이 진실이며, 이 캐시는 다음 실행의 첫 화면에만 쓰인다. */
export function cacheAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(normalizeAppearance(appearance)))
  } catch {
    // 저장 공간이 막혀 있어도 Firestore 동기화와 화면 변경은 계속 동작한다.
  }
}

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark' : 'light'
}

export function applyAppearance(appearance: Appearance): () => void {
  const { theme, themeStyle } = normalizeAppearance(appearance)
  const paint = () => {
    const root = document.documentElement
    root.dataset.theme = resolveTheme(theme)
    root.dataset.themeStyle = themeStyle
    // 유리 표면의 반투명 색이 아니라, iOS 문서 배경과 같은 불투명 색을 쓴다.
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim()
    if (paper) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper)
  }
  paint()
  if (theme !== 'system' || typeof matchMedia !== 'function') return () => {}
  const mq = matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', paint)
  return () => mq.removeEventListener('change', paint)
}

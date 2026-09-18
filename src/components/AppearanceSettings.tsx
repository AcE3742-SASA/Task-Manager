import { THEME_STYLES } from '../lib/appearance'
import type { Theme } from '../lib/appearance'
import { useSettingsMutation, useAppSettings } from '../lib/settings'
import { useT } from '../lib/i18n'

const NAMES = {
  classic: ['클래식', 'Classic'],
  neumorphism: ['뉴모피즘', 'Neumorphism'],
  'neo-brutalism': ['네오 브루탈리즘', 'Neo-brutalism'],
  glassmorphism: ['리퀴드 글래스', 'Glassmorphism'],
} as const

export function AppearanceSettings({ uid }: { uid: string }) {
  const { theme, themeStyle } = useAppSettings()
  const t = useT()
  const { save: pick, saving, failed, retry } = useSettingsMutation(uid)

  return (
    <section className="appearance-settings" aria-label={t('화면 꾸미기', 'Appearance')} aria-busy={saving}>
      {/* 오프라인 쓰기는 서버 확인을 기다린다. 그동안에도 다른 테마를 고를 수 있다. */}
      <fieldset className="appearance-mode">
        <legend>{t('화면 모드', 'Color mode')}</legend>
        <div className="mode-options">
          {(['system', 'light', 'dark'] as const).map((mode: Theme) => (
            <label key={mode}>
              <input type="radio" name="color-mode" value={mode} checked={theme === mode}
                onChange={() => void pick({ theme: mode })} />
              <span>{mode === 'system' ? t('자동', 'Auto') : mode === 'light' ? t('밝게', 'Light') : t('어둡게', 'Dark')}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="theme-picker">
        <legend>{t('테마', 'Theme')}</legend>
        <div className="theme-options">
          {THEME_STYLES.map((style) => (
            <label className="theme-option" key={style}>
              <input type="radio" name="theme-style" value={style} checked={themeStyle === style}
                onChange={() => void pick({ themeStyle: style })} />
              <span className="theme-option-content">
                <span className="theme-sample" data-theme-preview="" data-theme-style={style} aria-hidden="true">
                  <span className="sample-heading">{t('할 일', 'To-do')}<span>09.18</span></span>
                  <span className="sample-task"><span>{t('탐색 과제', 'Search task')}</span><i /></span>
                  <span className="sample-task sample-urgent"><span>{t('오늘 마감', 'Due today')}</span><i /></span>
                  <span className="sample-nav"><i /><i /><i /></span>
                </span>
                <span className="theme-name">{t(NAMES[style][0], NAMES[style][1])}<span className="theme-check" aria-hidden="true">✓</span></span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={`appearance-status${failed ? ' error' : ''}`} role={failed ? 'alert' : 'status'}>
        {failed
          ? t('테마를 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.', 'Could not save the theme. Check your connection and try again.')
          : saving ? t('기기에 적용했어요. 서버에 저장하는 중이에요…', 'Applied on this device. Waiting to sync…') : t('테마는 같은 계정의 다른 기기에도 적용돼요.', 'Your theme syncs across devices on this account.')}
      </p>
      {failed && <button className="act" onClick={() => void retry()}>{t('다시 시도', 'Retry')}</button>}
    </section>
  )
}

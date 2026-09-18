import { useRef, useState } from 'react'
import { THEME_STYLES } from '../lib/appearance'
import type { Appearance, Theme } from '../lib/appearance'
import { saveSettings, useAppSettings } from '../lib/settings'
import { useT } from '../lib/i18n'

const NAMES = {
  classic: 'Classic',
  neumorphism: 'Neumorphism',
  'neo-brutalism': 'Neo-brutalism',
  glassmorphism: 'Glassmorphism',
}

export function AppearanceSettings({ uid }: { uid: string }) {
  const { theme, themeStyle } = useAppSettings()
  const t = useT()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const latestRequest = useRef(0)

  async function pick(patch: Partial<Appearance>) {
    const request = ++latestRequest.current
    setSaving(true)
    setFailed(false)
    try {
      // Firestore의 로컬 스냅샷이 화면에 즉시 반영되고, 거절되면 원래 값으로 복원된다.
      await saveSettings(uid, patch)
    } catch {
      if (request === latestRequest.current) setFailed(true)
    } finally {
      if (request === latestRequest.current) setSaving(false)
    }
  }

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
                <span className="theme-name">{NAMES[style]}<span className="theme-check" aria-hidden="true">✓</span></span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={`appearance-status${failed ? ' error' : ''}`} role={failed ? 'alert' : 'status'}>
        {failed
          ? t('저장하지 못했다. 연결을 확인하고 다시 선택해 주세요.', 'Could not save. Check your connection and select again.')
          : saving ? t('저장 중…', 'Saving…') : t('테마는 같은 계정의 기기에 동기화된다.', 'Your theme syncs across devices on this account.')}
      </p>
    </section>
  )
}

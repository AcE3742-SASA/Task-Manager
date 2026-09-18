import { Component } from 'react'
import type { ReactNode } from 'react'
import { Screen } from './Screen'
import { useT } from '../lib/i18n'

export function RouteFallback({ failed = false }: { failed?: boolean }) {
  const t = useT()
  return <Screen title={t('할 일', 'Tasks')}>
    <div className="form" role={failed ? 'alert' : 'status'}>
      <p>{failed ? t('화면을 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.', 'Could not load this screen. Check your connection and reload.') : t('화면을 불러오는 중이에요…', 'Loading screen…')}</p>
      {failed && <button className="bigbtn" onClick={() => location.reload()}>{t('다시 불러오기', 'Reload')}</button>}
    </div>
  </Screen>
}

export class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <RouteFallback failed /> : this.props.children }
}

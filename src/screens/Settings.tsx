import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { IconGear } from '../components/icons'
import { APP_VERSION } from '../lib/version'

export function Settings() {
  return (
    <Screen title="설정" aside={`v${APP_VERSION}`}>
      <EmptyState
        icon={<IconGear />}
        title="설정할 것이 아직 없다"
        body="주 시작 요일, 한/영, 학기 초기화, 계정 삭제가 여기 들어온다."
        stamp="마일스톤 5에서 열림"
      />
    </Screen>
  )
}

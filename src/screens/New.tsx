import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { IconPlus } from '../components/icons'

export function New() {
  return (
    <Screen title="새 할 일" aside={'등록 목표\n30초'}>
      <EmptyState
        icon={<IconPlus />}
        title="등록은 아직 열리지 않았다"
        body="과목을 고르면 다음 주 첫 수업 전날로 기한이 자동으로 채워진다. 먼저 시간표가 필요하다."
        stamp="마일스톤 3에서 열림"
      />
    </Screen>
  )
}

import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { IconCalendar } from '../components/icons'

export function Calendar() {
  return (
    <Screen title="달력" aside={'월간 / 주간\n토글'}>
      <EmptyState
        icon={<IconCalendar />}
        title="볼 마감이 없다"
        body="월간은 날짜별 과목 색, 주간은 날짜 스트립과 그날의 마감 목록을 보여준다."
        stamp="마일스톤 4에서 열림"
      />
    </Screen>
  )
}

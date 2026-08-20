import { Screen } from '../components/Screen'
import { EmptyState } from '../components/EmptyState'
import { IconList } from '../components/icons'

const DATE = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const WEEKDAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' })

/** ko-KR 은 "2026. 08. 20." 로 준다. 시안의 "2026.08.20" 표기에 맞춘다. */
function stamp(now: Date): string {
  return DATE.format(now).replace(/\s/g, '').replace(/\.$/, '')
}

export function List() {
  const now = new Date()

  return (
    <Screen title="할 일" aside={`${stamp(now)}\n${WEEKDAY.format(now)}`}>
      <EmptyState
        icon={<IconList />}
        title="아직 등록된 할 일이 없다"
        body="과제를 등록하면 오늘 · 내일 · 이번 주 · 나중 순으로 여기 쌓인다."
        stamp="마일스톤 3에서 열림"
      />
    </Screen>
  )
}

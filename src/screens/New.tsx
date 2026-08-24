import { TaskForm } from '../components/TaskForm'
import { useSubjects } from '../lib/subjects'

export function New({ uid }: { uid: string }) {
  const { subjects } = useSubjects(uid)
  // key 로 화면을 새로 만든다 — 저장 후 돌아왔을 때 이전 입력이 남지 않게.
  // 반복 여부는 폼 안의 "반복" 칩에서 고른다.
  return <TaskForm uid={uid} subjects={subjects} key="new" />
}

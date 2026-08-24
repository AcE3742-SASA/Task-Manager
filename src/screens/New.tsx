import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TaskForm } from '../components/TaskForm'
import { NewTypeModal } from '../components/NewTypeModal'
import type { NewType } from '../components/NewTypeModal'
import { useSubjects } from '../lib/subjects'

export function New({ uid }: { uid: string }) {
  const { subjects } = useSubjects(uid)
  const navigate = useNavigate()
  // 먼저 종류를 고른다. 고르기 전에는 폼 대신 모달만 띄운다.
  const [type, setType] = useState<NewType | null>(null)

  if (!type) return <NewTypeModal onPick={setType} onCancel={() => navigate('/')} />

  // key 로 화면을 새로 만든다 — 저장 후 돌아왔을 때 이전 입력이 남지 않게.
  // 반복은 매주를 기본 주기로 시작한다 — 학교 일정에서 가장 흔한 주기다.
  return (
    <TaskForm
      uid={uid}
      subjects={subjects}
      initialRepeat={type === 'repeat' ? 'weekly' : 'none'}
      key={type}
    />
  )
}

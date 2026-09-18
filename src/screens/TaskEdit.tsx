import { useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { TaskForm } from '../components/TaskForm'
import { useT } from '../lib/i18n'
import { useSubjects } from '../lib/subjects'
import { useTasks } from '../lib/tasks'

export function TaskEdit({ uid }: { uid: string }) {
  const { id } = useParams()
  const { subjects } = useSubjects(uid)
  const { tasks, loading, error } = useTasks(uid)
  const t = useT()

  if (error || loading) {
    return (
      <Screen title={t('할 일', 'Task')}>
        <div className="form">
          <div className="hint" role={error ? 'alert' : 'status'}>{error ? t('할 일을 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.', 'Could not load this task. Check your connection and reopen it.') : t('불러오고 있어요…', 'Loading…')}</div>
        </div>
      </Screen>
    )
  }

  // 원래 이 find 의 인자 이름이 t 라 번역 함수를 가렸다.
  const task = tasks.find((x) => x.id === id)
  if (!task) {
    return (
      <Screen title={t('할 일', 'Task')}>
        <div className="form">
          <div className="hint">
            {t('이 할 일을 찾을 수 없어요. 이미 삭제됐을 수 있어요.', 'No such task. It may already be deleted.')}
          </div>
        </div>
      </Screen>
    )
  }

  return <TaskForm uid={uid} subjects={subjects} task={task} key={task.id} />
}

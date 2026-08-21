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
          <div className="hint">{error ?? t('불러오는 중…', 'Loading…')}</div>
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
            {t('없는 할 일이다. 이미 지웠을 수 있다.', 'No such task. It may already be deleted.')}
          </div>
        </div>
      </Screen>
    )
  }

  return <TaskForm uid={uid} subjects={subjects} task={task} key={task.id} />
}

import { useParams } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { TaskForm } from '../components/TaskForm'
import { useSubjects } from '../lib/subjects'
import { useTasks } from '../lib/tasks'

export function TaskEdit({ uid }: { uid: string }) {
  const { id } = useParams()
  const { subjects } = useSubjects(uid)
  const { tasks, loading, error } = useTasks(uid)

  if (error || loading) {
    return (
      <Screen title="할 일">
        <div className="form">
          <div className="hint">{error ?? '불러오는 중…'}</div>
        </div>
      </Screen>
    )
  }

  const task = tasks.find((t) => t.id === id)
  if (!task) {
    return (
      <Screen title="할 일">
        <div className="form">
          <div className="hint">없는 할 일이다. 이미 지웠을 수 있다.</div>
        </div>
      </Screen>
    )
  }

  return <TaskForm uid={uid} subjects={subjects} task={task} key={task.id} />
}

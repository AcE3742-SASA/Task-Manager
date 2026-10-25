import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { TaskConflictError } from '../lib/tasks'

type Undo = () => Promise<void>
type Action = () => Promise<void | Undo>
type Notice = { message: string; failed?: boolean; slow?: boolean; undo?: Undo; retry?: Action; success?: string }
type Feedback = { busy: (taskId: string) => boolean; run: (taskId: string, action: Action, success?: string) => Promise<void> }
const Context = createContext<Feedback | null>(null)

/** 항목이 다른 그룹으로 이동해도 결과와 되돌리기를 화면에 남긴다. */
export function TaskFeedback({ children }: { children: ReactNode }) {
  const t = useT()
  const locks = useRef(new Set<string>())
  const mounted = useRef(true)
  const slowTimers = useRef(new Map<string, number>())
  useEffect(() => {
    mounted.current = true
    const timers = slowTimers.current
    return () => { mounted.current = false; timers.forEach(timer => window.clearTimeout(timer)); timers.clear() }
  }, [])
  const [notices, setNotices] = useState(new Map<string, Notice>())

  async function run(taskId: string, action: Action, success?: string) {
    if (locks.current.has(taskId)) return
    locks.current.add(taskId)
    setNotices(current => new Map(current).set(taskId, { message: '' }))
    slowTimers.current.set(taskId, window.setTimeout(() => {
      if (mounted.current) setNotices(current => new Map(current).set(taskId, { message: '', slow: true }))
    }, 1500))
    let notice: Notice | undefined
    try {
      const reverse = await action()
      const message = success ?? (reverse ? t('기한을 변경했어요.', 'Due date changed.') : '')
      if (message || reverse) notice = { message, undo: reverse || undefined }
    } catch (error) {
      if (error instanceof TaskConflictError) {
        notice = { failed: true, message: error.code === 'task/not-found'
          ? t('이 할 일이 이미 삭제됐어요. 목록에서 현재 할 일을 확인해 주세요.', 'This task was deleted. Check the current task list.')
          : t('다른 곳에서 이 할 일을 변경했어요. 최신 기한과 완료 상태를 확인해 주세요.', 'This task changed elsewhere. Check its latest due date and completion state.') }
      } else {
        notice = { failed: true, message: t('변경을 저장하지 못했어요. 연결과 현재 할 일을 확인한 뒤 다시 시도해 주세요.', 'Could not save. Check your connection and the current task, then try again.'), retry: action, success }
      }
    } finally {
      window.clearTimeout(slowTimers.current.get(taskId))
      slowTimers.current.delete(taskId)
      locks.current.delete(taskId)
      if (mounted.current) setNotices(current => {
        const next = new Map(current)
        if (notice) next.set(taskId, notice)
        else next.delete(taskId)
        return next
      })
    }
  }

  // 다른 항목의 저장이 끝나도 오류와 되돌리기는 닫을 때까지 남긴다.
  const entries = [...notices].filter(([, notice]) => notice.message || notice.slow)
  const visible = entries.find(([, notice]) => notice.failed) ?? entries[0]
  const [taskId, notice] = visible ?? []
  const saving = taskId !== undefined && locks.current.has(taskId)

  return <Context.Provider value={{ busy: taskId => locks.current.has(taskId), run }}>
    {children}
    {taskId !== undefined && notice && <div key={taskId} className="action-notice" role={notice.failed ? 'alert' : 'status'}>
      <span>{notice.slow ? t('서버의 응답을 기다리고 있어요. 저장 결과를 확인해 주세요.', 'Waiting for the server. Please check the save result.') : notice.message}</span>
      {!saving && notice.undo && <button onClick={() => void run(taskId, notice.undo!, t('기한을 원래대로 돌렸어요.', 'Due date restored.'))}>{t('되돌리기', 'Undo')}</button>}
      {!saving && notice.retry && <button onClick={() => void run(taskId, notice.retry!, notice.success)}>{t('다시 시도', 'Retry')}</button>}
      {!saving && <button aria-label={t('알림 닫기', 'Dismiss message')} onClick={() => setNotices(current => { const next = new Map(current); next.delete(taskId); return next })}>×</button>}
    </div>}
  </Context.Provider>
}

export function useTaskFeedback() {
  const value = useContext(Context)
  if (!value) throw new Error('TaskFeedback is required')
  return value
}

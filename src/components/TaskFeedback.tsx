import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { TaskConflictError } from '../lib/tasks'

type Undo = () => Promise<void>
type Action = () => Promise<void | Undo>
type Feedback = { busy: boolean; run: (action: Action, success?: string) => Promise<void> }
const Context = createContext<Feedback | null>(null)

/** 항목이 다른 그룹으로 이동해도 결과와 되돌리기를 화면에 남긴다. */
export function TaskFeedback({ children }: { children: ReactNode }) {
  const t = useT()
  const lock = useRef(false)
  const mounted = useRef(true)
  const slowTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; window.clearTimeout(slowTimer.current) }
  }, [])
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [undo, setUndo] = useState<Undo | null>(null)
  const [retry, setRetry] = useState<Action | null>(null)

  async function run(action: Action, success?: string) {
    if (lock.current) return
    lock.current = true
    setBusy(true); setSlow(false); setFailed(false); setMessage(''); setUndo(null); setRetry(null)
    slowTimer.current = window.setTimeout(() => { if (mounted.current) setSlow(true) }, 1500)
    try {
      const reverse = await action()
      if (!mounted.current) return
      setMessage(success ?? (reverse ? t('기한을 변경했어요.', 'Due date changed.') : ''))
      if (reverse) setUndo(() => reverse)
    } catch (error) {
      if (!mounted.current) return
      setFailed(true)
      if (error instanceof TaskConflictError) {
        setMessage(error.code === 'task/not-found'
          ? t('이 할 일이 이미 삭제됐어요. 목록에서 현재 할 일을 확인해 주세요.', 'This task was deleted. Check the current task list.')
          : t('다른 곳에서 이 할 일을 변경했어요. 최신 기한과 완료 상태를 확인해 주세요.', 'This task changed elsewhere. Check its latest due date and completion state.'))
      } else {
        setMessage(t('변경을 저장하지 못했어요. 연결과 현재 할 일을 확인한 뒤 다시 시도해 주세요.', 'Could not save. Check your connection and the current task, then try again.'))
        setRetry(() => action)
      }
    } finally {
      window.clearTimeout(slowTimer.current)
      lock.current = false
      if (mounted.current) { setBusy(false); setSlow(false) }
    }
  }

  return <Context.Provider value={{ busy, run }}>
    {children}
    {(message || slow) && <div className="action-notice" role={failed ? 'alert' : 'status'}>
      <span>{slow ? t('서버의 응답을 기다리고 있어요. 저장 결과를 확인해 주세요.', 'Waiting for the server. Please check the save result.') : message}</span>
      {!busy && undo && <button onClick={() => void run(undo, t('기한을 원래대로 돌렸어요.', 'Due date restored.'))}>{t('되돌리기', 'Undo')}</button>}
      {!busy && retry && <button onClick={() => void run(retry)}>{t('다시 시도', 'Retry')}</button>}
      {!busy && <button aria-label={t('알림 닫기', 'Dismiss message')} onClick={() => { setMessage(''); setUndo(null); setRetry(null) }}>×</button>}
    </div>}
  </Context.Provider>
}

export function useTaskFeedback() {
  const value = useContext(Context)
  if (!value) throw new Error('TaskFeedback is required')
  return value
}

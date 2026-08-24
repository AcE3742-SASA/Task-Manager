import { useEffect, useRef } from 'react'
import { useT } from '../lib/i18n'

/** 한 번 하고 끝나는 할일 · 되풀이되는 할일. New 진입에서 먼저 고른다. */
export type NewType = 'once' | 'repeat'

const IconOnce = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 5h16v14H4z" />
    <path d="m8 12 3 3 5-6" />
  </svg>
)

const IconRepeat = () => (
  <svg viewBox="0 0 24 24">
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 3v5h-5" />
    <path d="M20 12a8 8 0 0 1-13.7 5.6L4 16M4 21v-5h5" />
  </svg>
)

type Props = { onPick: (type: NewType) => void; onCancel: () => void }

/** 시안의 종이 카드 언어를 그대로 쓴 얇은 시트형 모달. 배경을 누르면 닫힌다. */
export function NewTypeModal({ onPick, onCancel }: Props) {
  const t = useT()
  const first = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-back" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('할 일 종류 고르기', 'Choose task type')}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{t('무엇을 추가할까?', 'What are you adding?')}</h2>

        <button ref={first} className="typecard" onClick={() => onPick('once')}>
          <span className="tc-ic">
            <IconOnce />
          </span>
          <span className="tc-txt">
            <b>{t('일반 할 일', 'One-time task')}</b>
            <em>{t('한 번 하고 끝난다', 'Do it once and it’s done')}</em>
          </span>
        </button>

        <button className="typecard" onClick={() => onPick('repeat')}>
          <span className="tc-ic">
            <IconRepeat />
          </span>
          <span className="tc-txt">
            <b>{t('반복 할 일', 'Recurring task')}</b>
            <em>{t('매일 · 매주 · 매월 되풀이된다', 'Repeats daily, weekly, or monthly')}</em>
          </span>
        </button>

        <button className="modal-cancel" onClick={onCancel}>
          {t('취소', 'Cancel')}
        </button>
      </div>
    </div>
  )
}

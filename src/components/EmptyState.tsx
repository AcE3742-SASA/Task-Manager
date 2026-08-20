import type { ReactNode } from 'react'

type Props = {
  icon: ReactNode
  title: string
  body: string
  /** 이 화면이 실제로 채워지는 마일스톤. 껍데기 단계임을 숨기지 않는다. */
  stamp?: string
}

export function EmptyState({ icon, title, body, stamp }: Props) {
  return (
    <div className="empty">
      <div className="mark">{icon}</div>
      <b>{title}</b>
      <p>{body}</p>
      {stamp && <span className="stamp">{stamp}</span>}
    </div>
  )
}

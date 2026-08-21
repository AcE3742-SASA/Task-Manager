import type { ReactNode } from 'react'

type Props = {
  icon: ReactNode
  title: string
  body: string
}

export function EmptyState({ icon, title, body }: Props) {
  return (
    <div className="empty">
      <div className="mark">{icon}</div>
      <b>{title}</b>
      <p>{body}</p>
    </div>
  )
}

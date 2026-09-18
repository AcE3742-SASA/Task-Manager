import type { ReactNode } from 'react'
import { LiquidSurface } from './LiquidSurface'

type Props = {
  title: string
  /** appbar 우측 보조 텍스트. 줄바꿈(\n)은 그대로 렌더된다. */
  aside?: string
  /** appbar 우측 동작(취소·저장 등). aside 와 같은 자리라 둘 중 하나만 쓴다. */
  action?: ReactNode
  children: ReactNode
}

/** 시안 .phone 의 appbar + body 구조. 모든 화면이 공유한다. */
export function Screen({ title, aside, action, children }: Props) {
  return (
    <>
      <header className="appbar">
        <LiquidSurface />
        <h1>{title}</h1>
        {aside && <span className="aside">{aside}</span>}
        {action}
      </header>
      <main className="screenbody">{children}</main>
    </>
  )
}

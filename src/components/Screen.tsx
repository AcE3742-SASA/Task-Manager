import type { ReactNode } from 'react'

type Props = {
  title: string
  /** appbar 우측 보조 텍스트. 줄바꿈(\n)은 그대로 렌더된다. */
  aside?: string
  children: ReactNode
}

/** 시안 .phone 의 appbar + body 구조. 5개 화면이 공유한다. */
export function Screen({ title, aside, children }: Props) {
  return (
    <>
      <header className="appbar">
        <h1>{title}</h1>
        {aside && <span className="aside">{aside}</span>}
      </header>
      <main className="screenbody">{children}</main>
    </>
  )
}

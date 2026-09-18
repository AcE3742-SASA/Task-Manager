import { useEffect, useState } from 'react'

/** 열린 채 자정을 넘기거나 홈 화면에서 돌아와도 '오늘'을 갱신한다. */
export function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('pageshow', update)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('pageshow', update)
    }
  }, [])
  return now
}

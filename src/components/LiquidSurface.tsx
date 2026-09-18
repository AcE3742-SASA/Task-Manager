import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppSettings } from '../lib/settings'

const Glass = lazy(() => import('@samasante/liquid-glass').then((m) => ({ default: m.Glass })))
const OPTICS = { strength: 0.19, bend: 0.9, bendWidth: 0.26, depth: 0.75, curvature: 0.55, dispersion: 0.28, frost: 0, sheen: 0.55, sheenWidth: 1.5, glow: 0.015, brightness: 0 }

/** Safari도 굴절할 수 있도록 앱 배경만 복제한다. 글자·조작부는 복제하지 않는다. */
export function LiquidSurface() {
  const { themeStyle } = useAppSettings()
  const host = useRef<HTMLDivElement>(null)
  const align = useRef<(() => void) | undefined>()
  const [enabled, setEnabled] = useState(false)
  const [visible, setVisible] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0, radius: 18 })

  useEffect(() => {
    if (themeStyle !== 'glassmorphism') { setEnabled(false); return }
    const media = matchMedia('(prefers-reduced-transparency: reduce)')
    const update = () => setEnabled(!media.matches && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')))
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [themeStyle])

  useLayoutEffect(() => {
    const el = host.current
    const app = el?.closest('.app')
    if (!enabled || !el || !app) return
    let frame = 0
    let onscreen = false
    const update = () => {
      const box = el.getBoundingClientRect()
      const scene = app.getBoundingClientRect()
      el.style.setProperty('--glass-scene-size', `${app.clientWidth}px ${app.clientHeight}px`)
      el.style.setProperty('--glass-scene-position', `${scene.left + app.clientLeft - box.left}px ${scene.top + app.clientTop - box.top}px`)
      el.style.setProperty('--glass-scene-x', `${scene.left + app.clientLeft - box.left}px`)
      el.style.setProperty('--glass-scene-y', `${scene.top + app.clientTop - box.top}px`)
      const next = { width: box.width, height: box.height, radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 }
      setSize((old) => old.width === next.width && old.height === next.height && old.radius === next.radius ? old : next)
    }
    const schedule = () => { if (onscreen) { cancelAnimationFrame(frame); frame = requestAnimationFrame(update) } }
    align.current = schedule
    const resize = new ResizeObserver(schedule)
    resize.observe(el)
    resize.observe(app)
    // 긴 목록의 화면 밖 항목에는 SVG 렌즈를 만들지 않는다.
    const intersection = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting
      setVisible(onscreen)
      schedule()
    }, { rootMargin: '64px' })
    intersection.observe(el)
    app.addEventListener('scroll', schedule, true)
    update()
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      intersection.disconnect()
      app.removeEventListener('scroll', schedule, true)
      align.current = undefined
    }
  }, [enabled])

  // 완료·삭제 등으로 앞 카드가 사라져도 배경 좌표를 다시 맞춘다.
  useLayoutEffect(() => { align.current?.() })

  if (themeStyle !== 'glassmorphism' || !enabled) return null
  return (
    <div ref={host} className={`liquid-surface${visible ? ' is-visible' : ''}`} aria-hidden="true">
      {visible && size.width > 0 && <Suspense fallback={null}>
        <Glass width={size.width} height={size.height} radius={size.radius} optics={OPTICS} pixelUnits
          behind="var(--cream)" refract={<div className="liquid-wallpaper" />}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 'inherit' }} />
      </Suspense>}
    </div>
  )
}

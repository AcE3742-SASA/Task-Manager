import { onColor } from '../lib/subjects'
import { SubjectIcon } from './subject-icons'

/** 과목의 저장된 색은 테마·마감·완료 상태와 무관하게 유지한다. */
export function SubjectBadge({ icon, color, className = '' }: { icon: string; color?: string; className?: string }) {
  return (
    <span className={`subject-badge ${className}`} style={color ? { background: color, color: onColor(color) } : undefined} aria-hidden="true">
      <SubjectIcon id={icon} color={color ? onColor(color) : undefined} />
    </span>
  )
}

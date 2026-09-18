type GuideStatus = 'skipped' | 'completed'

const keyFor = (uid: string) => `sasa.guide.v1:${uid}`

export function readGuideStatus(uid: string): GuideStatus | null {
  try {
    const value = localStorage.getItem(keyFor(uid))
    return value === 'skipped' || value === 'completed' ? value : null
  } catch {
    return null
  }
}

export function saveGuideStatus(uid: string, status: GuideStatus): void {
  try {
    localStorage.setItem(keyFor(uid), status)
  } catch {
    // 안내를 기억하지 못해도 사용을 막지 않는다.
  }
}

// design/mockup-v1.html 의 .iconset 40종을 그대로 옮긴 것.
// viewBox 24, fill 없음, stroke 는 CSS 가 정한다 — icons.tsx 와 같은 규칙.
// id 는 Firestore 에 저장된다. 한 번 정하면 바꾸지 않는다.

import type { ReactNode } from 'react'

export type IconCategory = '수학 · 과학' | '컴퓨터' | '언어 · 인문' | '예체능' | '연구 · 프로젝트' | '일반'

export type SubjectIconDef = {
  id: string
  /** Firestore 에 저장되는 것은 id 뿐이다. name/en 은 순전히 표시용. */
  name: string
  en: string
  cat: IconCategory
  d: ReactNode
}

export const SUBJECT_ICONS: SubjectIconDef[] = [
  { id: 'atom', name: '원자', en: 'Atom', cat: '수학 · 과학', d: <><circle cx="12" cy="12" r="2.4" /><ellipse cx="12" cy="12" rx="10" ry="4.4" /><ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(120 12 12)" /></> },
  { id: 'flask', name: '플라스크', en: 'Flask', cat: '수학 · 과학', d: <path d="M10 3v6l-5 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3M8.5 3h7M7 15h10" /> },
  { id: 'beaker', name: '비커', en: 'Beaker', cat: '수학 · 과학', d: <path d="M6 3h12M8 3v15a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3V3M8 9h3M8 13h3" /> },
  { id: 'magnet', name: '자석', en: 'Magnet', cat: '수학 · 과학', d: <path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4zM6 8h4M14 8h4" /> },
  { id: 'graph', name: '그래프', en: 'Graph', cat: '수학 · 과학', d: <path d="M4 4v16h16M7 16l3-5 3 3 4-7" /> },
  { id: 'sigma', name: '시그마', en: 'Sigma', cat: '수학 · 과학', d: <path d="M17 4H7l6 8-6 8h10" /> },
  { id: 'angle', name: '각도', en: 'Angle', cat: '수학 · 과학', d: <path d="M4 20h16L4 4zM9 20a5 5 0 0 0-.8-2.7" /> },
  { id: 'dna', name: 'DNA', en: 'DNA', cat: '수학 · 과학', d: <path d="M8 3c0 4.5 8 4.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 4.5-8 9s8 4.5 8 9M9.5 7.5h5M9.5 16.5h5" /> },
  { id: 'microscope', name: '현미경', en: 'Microscope', cat: '수학 · 과학', d: <path d="M6 21h12M10 21v-5M8 16h6M14.5 16 10 6.5l3.6-1.7L18 14.3zM9.5 5 8.5 2.9" /> },
  { id: 'strata', name: '지층', en: 'Strata', cat: '수학 · 과학', d: <path d="m12 3 9 4.5-9 4.5L3 7.5zM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17" /> },

  { id: 'code', name: '코드', en: 'Code', cat: '컴퓨터', d: <path d="m9 6-5 6 5 6M15 6l5 6-5 6" /> },
  { id: 'terminal', name: '터미널', en: 'Terminal', cat: '컴퓨터', d: <path d="M3 4h18v16H3zM7 9l3 3-3 3M13 15h4" /> },
  { id: 'chip', name: '칩', en: 'Chip', cat: '컴퓨터', d: <path d="M7 7h10v10H7zM4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3" /> },
  { id: 'network', name: '네트워크', en: 'Network', cat: '컴퓨터', d: <><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M10.5 7 6.5 16.8M13.5 7l4 9.8M7.5 19h9" /></> },
  { id: 'database', name: '데이터', en: 'Database', cat: '컴퓨터', d: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></> },

  { id: 'speech', name: '말풍선', en: 'Speech', cat: '언어 · 인문', d: <path d="M4 5h16v11H8l-4 4z" /> },
  { id: 'book', name: '책', en: 'Book', cat: '언어 · 인문', d: <path d="M12 6c-2-2-5-2.5-8-2v13c3-.5 6 0 8 2 2-2 5-2.5 8-2V4c-3-.5-6 0-8 2zM12 6v14" /> },
  { id: 'pen', name: '펜', en: 'Pen', cat: '언어 · 인문', d: <path d="M4 20h4L20 8l-4-4L4 16zM14.5 5.5 18.5 9.5" /> },
  { id: 'globe', name: '지구본', en: 'Globe', cat: '언어 · 인문', d: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c4 4.7 4 13.3 0 18-4-4.7-4-13.3 0-18" /></> },
  { id: 'hourglass', name: '모래시계', en: 'Hourglass', cat: '언어 · 인문', d: <path d="M6 3h12M6 21h12M8 3v4l4 5 4-5V3M8 21v-4l4-5 4 5v4" /> },
  { id: 'scale', name: '저울', en: 'Scale', cat: '언어 · 인문', d: <path d="M12 3v18M6 21h12M4 8h16M4 8l-2 6h4zM20 8l2 6h-4z" /> },

  { id: 'note', name: '음표', en: 'Music note', cat: '예체능', d: <><path d="M9 18V5l10-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></> },
  { id: 'palette', name: '팔레트', en: 'Palette', cat: '예체능', d: <><path d="M12 3a9 9 0 0 0 0 18c1.5 0 2-1 1.4-2-.6-1.2.3-2 1.6-2H18a4 4 0 0 0 4-4c0-5-4.5-10-10-10z" /><circle cx="8" cy="9" r="1.1" /><circle cx="12.5" cy="7" r="1.1" /><circle cx="7" cy="14" r="1.1" /></> },
  { id: 'camera', name: '카메라', en: 'Camera', cat: '예체능', d: <><path d="M4 7h4l2-3h4l2 3h4v13H4z" /><circle cx="12" cy="13" r="4" /></> },
  // 시안의 스틱피겨 "달리기" 를 아령으로 교체 (2026-08-20, 사용자 요청).
  // 18px 로 줄면 팔다리 선이 서로 붙어 형체가 사라졌다. 좌우 대칭 직선 5개가 그 크기에서 버틴다.
  { id: 'dumbbell', name: '아령', en: 'Dumbbell', cat: '예체능', d: <><rect x="5" y="7" width="4" height="10" /><rect x="15" y="7" width="4" height="10" /><path d="M9 12h6M3 10v4M21 10v4" /></> },
  { id: 'ball', name: '공', en: 'Ball', cat: '예체능', d: <><circle cx="12" cy="12" r="9" /><path d="m12 7 4.5 3.2-1.7 5.3H9.2L7.5 10.2zM12 3v4M4.2 9.2l3.3 1M19.8 9.2l-3.3 1M8 20.5l1.2-5M16 20.5l-1.2-5" /></> },
  { id: 'mic', name: '마이크', en: 'Mic', cat: '예체능', d: <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" /> },

  { id: 'search', name: '돋보기', en: 'Search', cat: '연구 · 프로젝트', d: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></> },
  { id: 'robot', name: '로봇', en: 'Robot', cat: '연구 · 프로젝트', d: <><path d="M6 8h12v10H6zM12 8V4.5M4 11v4M20 11v4M9.5 12h.5M14 12h.5M9.5 15h5" /><circle cx="12" cy="3" r="1.6" /></> },
  { id: 'gear', name: '톱니', en: 'Gear', cat: '연구 · 프로젝트', d: <><circle cx="12" cy="12" r="3.3" /><circle cx="12" cy="12" r="7.4" /><path d="M12 2.1v2.5M12 19.4v2.5M21.9 12h-2.5M4.6 12H2.1M19 5l-1.8 1.8M6.8 17.2 5 19M19 19l-1.8-1.8M6.8 6.8 5 5" /></> },
  { id: 'rocket', name: '로켓', en: 'Rocket', cat: '연구 · 프로젝트', d: <><path d="M12 2c3 2.5 5 6.5 5 11l-2 3H9l-2-3c0-4.5 2-8.5 5-11zM9 16l-2 5 3-1.5M15 16l2 5-3-1.5" /><circle cx="12" cy="10" r="1.8" /></> },
  { id: 'report', name: '보고서', en: 'Report', cat: '연구 · 프로젝트', d: <path d="M8 4H6v17h12V4h-2M9 2h6v4H9zM9 11h6M9 15h4" /> },

  { id: 'star', name: '별', en: 'Star', cat: '일반', d: <path d="m12 3 2.8 6 6.2.6-4.7 4.2 1.4 6.2L12 17l-5.7 3 1.4-6.2L3 9.6 9.2 9z" /> },
  { id: 'heart', name: '하트', en: 'Heart', cat: '일반', d: <path d="M12 21S3 14.5 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8C21 14.5 12 21 12 21z" /> },
  { id: 'flag', name: '깃발', en: 'Flag', cat: '일반', d: <path d="M5 21V3M5 4h13l-2.5 4L18 12H5" /> },
  { id: 'bell', name: '종', en: 'Bell', cat: '일반', d: <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20h4" /> },
  { id: 'coffee', name: '커피', en: 'Coffee', cat: '일반', d: <path d="M4 7h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h2a2.5 2.5 0 0 1 0 5h-2M6 3v2M10 3v2M14 3v2" /> },
  { id: 'calendar', name: '캘린더', en: 'Calendar', cat: '일반', d: <path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" /> },
  { id: 'folder', name: '폴더', en: 'Folder', cat: '일반', d: <path d="M3 6h6l2 3h10v11H3z" /> },
  { id: 'dots', name: '기타', en: 'Other', cat: '일반', d: <><circle cx="5.5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.5" cy="12" r="1.7" /></> },
]

export const ICON_CATEGORIES: IconCategory[] = [
  '수학 · 과학',
  '컴퓨터',
  '언어 · 인문',
  '예체능',
  '연구 · 프로젝트',
  '일반',
]

/** cat 값 자체는 그룹 키라 한국어 그대로다. 화면에 찍을 영문만 옆에 둔다. */
export const CATEGORY_EN: Record<IconCategory, string> = {
  '수학 · 과학': 'Math · Science',
  '컴퓨터': 'Computing',
  '언어 · 인문': 'Language · Humanities',
  '예체능': 'Arts · PE',
  '연구 · 프로젝트': 'Research · Projects',
  '일반': 'General',
}

const BY_ID = new Map(SUBJECT_ICONS.map((i) => [i.id, i]))

/** 아이콘 이름을 언어에 맞게 돌려준다. 모르는 id 는 "기타"로 떨어진다. */
export function iconName(id: string, lang: 'ko' | 'en'): string {
  const i = BY_ID.get(id) ?? SUBJECT_ICONS[SUBJECT_ICONS.length - 1]
  return lang === 'en' ? i.en : i.name
}

/** 모르는 id 는 "기타" 로 떨어뜨린다 — 아이콘 하나 때문에 화면이 깨지지 않게. */
export function SubjectIcon({ id }: { id: string }) {
  const icon = BY_ID.get(id) ?? SUBJECT_ICONS[SUBJECT_ICONS.length - 1]
  return <svg viewBox="0 0 24 24">{icon.d}</svg>
}

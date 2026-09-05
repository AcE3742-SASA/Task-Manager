import { Timestamp, collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import type { DocumentData, DocumentReference } from 'firebase/firestore'
import { db } from './firebase'
import { wipeSemester } from './wipe'
import type { Settings } from './settings'

/**
 * 다른 구글 계정으로 옮기기. 서버도 공유 문서도 두지 않고 파일 하나로 끝낸다 —
 * 옮기다 실패해도 원래 계정의 데이터는 손대지 않은 채로 남는다.
 * pushSubs 는 기기에 매인 값이라 빼고, 새 계정에서 알림을 다시 켜면 된다.
 */
const APP = 'sasa-task-manager'

export type Bundle = {
  app: typeof APP
  version: 1
  exportedAt: string
  settings: Partial<Settings>
  /** 문서 id 를 그대로 들고 다닌다 — task.subjectId 가 저절로 맞는다. */
  subjects: ({ id: string } & DocumentData)[]
  tasks: ({ id: string } & DocumentData)[]
}

/** Timestamp 로 저장되는 필드. JSON 에는 ISO 문자열로 나가고 들어올 때 되돌린다. */
const DATE_FIELDS = ['due', 'doneAt', 'createdAt'] as const

function encode(data: DocumentData): DocumentData {
  const out = { ...data }
  for (const k of DATE_FIELDS) if (out[k] instanceof Timestamp) out[k] = out[k].toDate().toISOString()
  return out
}

function decode(data: DocumentData): DocumentData {
  const out = { ...data }
  for (const k of DATE_FIELDS) {
    const v = out[k]
    // 문자열일 때만 되돌린다. null(기한 없음)과 아예 없는 키는 그대로 둔다.
    if (typeof v === 'string') {
      const d = new Date(v)
      if (!Number.isNaN(d.getTime())) out[k] = Timestamp.fromDate(d)
    }
  }
  return out
}

function need() {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  return db
}

export async function exportAll(uid: string): Promise<Bundle> {
  const store = need()
  const grab = async (name: string) =>
    (await getDocs(collection(store, 'users', uid, name))).docs.map((d) => ({
      id: d.id,
      ...encode(d.data()),
    }))
  const settings = await getDoc(doc(store, 'users', uid, 'settings', 'app'))
  return {
    app: APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: (settings.data() ?? {}) as Partial<Settings>,
    subjects: await grab('subjects'),
    tasks: await grab('tasks'),
  }
}

/**
 * 파일이 이 앱 것인지 확인한다. 남의 JSON 을 그대로 Firestore 에 부으면
 * 어떤 모양이 들어올지 알 수 없으니 신뢰 경계에서 한 번 막는다.
 */
export function parseBundle(text: string): Bundle {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('JSON 파일이 아니다.')
  }
  const b = raw as Partial<Bundle> | null
  if (!b || typeof b !== 'object' || b.app !== APP || b.version !== 1)
    throw new Error('이 앱에서 내보낸 파일이 아니다.')
  if (!Array.isArray(b.subjects) || !Array.isArray(b.tasks))
    throw new Error('파일이 손상됐다 — 과목·할 일 목록이 없다.')
  if ([...b.subjects, ...b.tasks].some((d) => !d || typeof d.id !== 'string' || !d.id))
    throw new Error('파일이 손상됐다 — 문서 id 가 없는 항목이 있다.')
  return {
    app: APP,
    version: 1,
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : '',
    settings: (b.settings ?? {}) as Partial<Settings>,
    subjects: b.subjects,
    tasks: b.tasks,
  }
}

/** writeBatch 는 한 번에 500건이 상한이다. 여러 학기를 모아 옮기면 넘을 수 있어 끊는다. */
async function setChunked(entries: [DocumentReference, DocumentData][]) {
  const store = need()
  for (let i = 0; i < entries.length; i += 500) {
    const batch = writeBatch(store)
    for (const [ref, data] of entries.slice(i, i + 500)) batch.set(ref, data)
    await batch.commit()
  }
}

/**
 * 기존 과목·할 일을 지우고 파일 내용으로 바꾼다. 합치지 않는다 —
 * 두 번 가져와도 결과가 같아야 하고, 합치면 중복을 사람이 손으로 걷어내야 한다.
 * 문서 id 를 그대로 쓰므로 task.subjectId 를 다시 매핑할 일이 없다.
 */
export async function importAll(uid: string, bundle: Bundle) {
  const store = need()
  await wipeSemester(uid)
  const ref = (name: string, id: string) => doc(store, 'users', uid, name, id)
  await setChunked([
    ...bundle.subjects.map(
      ({ id, ...data }) => [ref('subjects', id), data] as [DocumentReference, DocumentData],
    ),
    ...bundle.tasks.map(
      ({ id, ...data }) => [ref('tasks', id), decode(data)] as [DocumentReference, DocumentData],
    ),
  ])
  // 설정은 merge 로 얹는다 — 파일에 없는 항목은 이 계정의 기본값이 살아 있어야 한다.
  await setDoc(doc(store, 'users', uid, 'settings', 'app'), bundle.settings, { merge: true })
  return { subjects: bundle.subjects.length, tasks: bundle.tasks.length }
}

export function downloadBundle(bundle: Bundle) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `${APP}-${(bundle.exportedAt || new Date().toISOString()).slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

import { Timestamp, collection, doc, getDocFromServer, getDocsFromServer, writeBatch } from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { auth, db } from './firebase'
import { THEME_STYLES } from './appearance'
import type { Settings } from './settings'

const APP = 'sasa-task-manager'
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_OPERATIONS = 500
const MAX_DOCUMENT_BYTES = 256 * 1024
const DATE_FIELDS = ['due', 'doneAt', 'createdAt'] as const

type Item = { id: string } & DocumentData
export type Bundle = {
  app: typeof APP
  version: 1
  exportedAt: string
  settings: Partial<Settings>
  subjects: Item[]
  tasks: Item[]
}
export type ImportPreview = { bundle: Bundle; backup: Bundle; operationCount: number; missingSubjectCount: number }
const bytes = (text: string) => new TextEncoder().encode(text).byteLength

function invalid(detail: string): never {
  throw new Error(`가져올 파일을 확인해 주세요. ${detail}`)
}
function object(value: unknown, label: string): DocumentData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} 형식이 올바르지 않아요.`)
  return value as DocumentData
}
function keys(value: DocumentData, allowed: readonly string[], label: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid(`${label}에 지원하지 않는 항목이 있어요.`)
}
function text(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) invalid(`${label} 내용을 확인해 주세요.`)
  return value as string
}
function id(value: unknown): string {
  const result = text(value, '문서 ID', 1500)
  if (bytes(result) > 1500 || result.includes('/') || result === '.' || result === '..' || /^__.*__$/.test(result)) invalid('문서 ID가 올바르지 않아요.')
  return result
}
function choice<T extends string | number>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) invalid(`${label} 값이 올바르지 않아요.`)
  return value as T
}
function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} 값이 올바르지 않아요.`)
  return value as boolean
}
function iso(value: unknown, label: string): string | null {
  if (value == null) return null
  const s = text(value, label, 30)
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(s)
  if (!parts) invalid(`${label} 날짜 형식이 올바르지 않아요.`)
  const date = new Date(s)
  if (!Number.isFinite(date.getTime()) || Number(parts[1]) < 1 ||
      date.toISOString().slice(0, 19) !== s.slice(0, 19)) invalid(`${label} 날짜가 올바르지 않아요.`)
  return date.toISOString()
}
function item(value: unknown, allowed: readonly string[], label: string): Item {
  const result = object(value, label)
  keys(result, ['id', ...allowed], label)
  id(result.id)
  if (bytes(JSON.stringify(result)) > MAX_DOCUMENT_BYTES) invalid(`${label} 한 항목의 내용이 너무 길어요.`)
  return result as Item
}

function parseSettings(value: unknown): Partial<Settings> {
  const s = object(value ?? {}, '설정')
  keys(s, ['weekStartsOn', 'lang', 'notify', 'theme', 'themeStyle'], '설정')
  const result: Partial<Settings> = {}
  if (s.weekStartsOn !== undefined) result.weekStartsOn = choice(s.weekStartsOn, [0, 1] as const, '주 시작 요일')
  if (s.lang !== undefined) result.lang = choice(s.lang, ['ko', 'en'] as const, '언어')
  if (s.theme !== undefined) result.theme = choice(s.theme, ['system', 'light', 'dark'] as const, '화면 모드')
  if (s.themeStyle !== undefined) result.themeStyle = choice(s.themeStyle, THEME_STYLES, '테마')
  if (s.notify !== undefined) {
    const notify = object(s.notify, '알림 설정')
    keys(notify, ['morningHour', 'eveningHour', 'soonBefore'], '알림 설정')
    // 이전 버전의 부분 설정도 읽되, 빠진 값은 그 버전의 기본값으로 채운다.
    const hour = (value: unknown, fallback: number) => value === null ? null
      : choice(value ?? fallback, Array.from({ length: 24 }, (_, i) => i), '알림 시각')
    result.notify = {
      morningHour: hour(notify.morningHour, 7),
      eveningHour: hour(notify.eveningHour, 21),
      soonBefore: notify.soonBefore == null ? null : choice(notify.soonBefore, [1, 2, 3, 6, 12], '마감 알림'),
    }
  }
  return result
}

/** 파일 전체를 검증한 후 새 객체를 만든다. 검증 도중에는 Firestore를 읽거나 쓰지 않는다. */
export function parseBundle(source: string): Bundle {
  if (bytes(source) > MAX_IMPORT_BYTES) invalid('가져올 수 있는 파일 크기는 최대 2 MB예요.')
  let raw: unknown
  try { raw = JSON.parse(source) } catch { invalid('JSON 파일이 아니에요.') }
  const b = object(raw, '파일')
  if (b.app !== APP || b.version !== 1) invalid('이 앱에서 내보낸 지원 가능한 파일이 아니에요.')
  keys(b, ['app', 'version', 'exportedAt', 'settings', 'subjects', 'tasks'], '파일')
  if (!Array.isArray(b.subjects) || !Array.isArray(b.tasks)) invalid('과목 또는 할 일 목록이 없어요.')
  if (b.subjects.length + b.tasks.length + 1 > MAX_IMPORT_OPERATIONS) invalid('한 번에 가져올 수 있는 과목과 할 일은 합쳐서 499개까지예요.')
  const subjectIds = new Set<string>()
  const cells = new Set<string>()
  const subjects: Item[] = b.subjects.map((value: unknown) => {
    const s = item(value, ['name', 'short', 'icon', 'color', 'slots'], '과목')
    if (subjectIds.has(s.id)) invalid('중복된 과목 ID가 있어요.')
    subjectIds.add(s.id)
    const name = text(s.name, '과목 이름', 200)
    const color = text(s.color ?? '#8FA28A', '과목 색', 7)
    if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) invalid('과목 색이 올바르지 않아요.')
    const slots = s.slots ?? []
    if (!Array.isArray(slots) || slots.length > 45) invalid('시간표 형식이 올바르지 않아요.')
    return { id: s.id, name, short: text(s.short ?? name.slice(0, 4), '과목 줄임말', 4),
      icon: text(s.icon ?? 'dots', '과목 아이콘', 64), color,
      slots: slots.map((value: unknown) => {
        const slot = object(value, '시간표')
        keys(slot, ['day', 'period', 'teacher', 'room'], '시간표')
        const day = choice(slot.day, [1, 2, 3, 4, 5], '수업 요일')
        const period = choice(slot.period, [1, 2, 3, 4, 5, 6, 7, 8, 9], '교시')
        const cell = `${day}-${period}`
        if (cells.has(cell)) invalid('같은 요일·교시에 수업이 두 개 이상 배치되어 있어요.')
        cells.add(cell)
        return { day, period,
          ...(slot.teacher === undefined ? {} : { teacher: text(slot.teacher, '교사 이름', 200, true) }),
          ...(slot.room === undefined ? {} : { room: text(slot.room, '강의실', 200, true) }) }
      }) }
  })
  const taskIds = new Set<string>()
  const tasks: Item[] = b.tasks.map((value: unknown) => {
    const t = item(value, ['title', 'subjectId', 'note', 'due', 'kind', 'repeat', 'done', 'doneAt', 'createdAt', 'focusDate', 'dueWasDefault', 'entryMs'], '할 일')
    if (taskIds.has(t.id)) invalid('중복된 할 일 ID가 있어요.')
    taskIds.add(t.id)
    const subjectId = t.subjectId == null ? null : id(t.subjectId)
    // 과목 삭제 후에도 할 일은 남는 기존 동작을 보존한다. 누락된 연결은 미리보기에 알린다.
    const due = iso(t.due, '마감')
    const repeat = choice(t.repeat ?? 'none', ['none', 'daily', 'weekly', 'monthly'], '반복')
    if (repeat !== 'none' && due === null) invalid('반복 할 일에 마감 날짜가 없어요.')
    const entryMs = t.entryMs ?? 0
    if (typeof entryMs !== 'number' || !Number.isFinite(entryMs) || entryMs < 0) invalid('등록 시간 값이 올바르지 않아요.')
    const focusDate = t.focusDate ?? null
    if (focusDate !== null && (typeof focusDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(focusDate))) invalid('오늘 할 일 날짜가 올바르지 않아요.')
    if (focusDate !== null) iso(`${focusDate}T00:00:00Z`, '오늘 할 일')
    return { id: t.id, title: text(t.title, '할 일 제목', 1000), subjectId,
      note: text(t.note ?? '', '할 일 내용', 100000, true), due,
      kind: choice(t.kind ?? '과제', ['과제', '수행평가', '시험', '개인'], '할 일 종류'), repeat,
      done: bool(t.done ?? false, '완료'), doneAt: iso(t.doneAt, '완료 시각'), createdAt: iso(t.createdAt, '등록 시각'),
      focusDate, dueWasDefault: bool(t.dueWasDefault ?? false, '기한 설정'), entryMs }
  })
  return { app: APP, version: 1, exportedAt: b.exportedAt == null || b.exportedAt === '' ? '' : iso(b.exportedAt, '내보낸 시각')!,
    settings: parseSettings(b.settings), subjects, tasks }
}

function need(uid: string) {
  if (!db || !auth || auth.currentUser?.uid !== uid) throw new Error('현재 계정을 확인하지 못했어요. 다시 로그인해 주세요.')
  return db
}
function encode(data: DocumentData): DocumentData {
  const out = { ...data }
  for (const key of DATE_FIELDS) if (out[key] instanceof Timestamp) out[key] = out[key].toDate().toISOString()
  return out
}
function decode(data: DocumentData): DocumentData {
  const out = { ...data }
  for (const key of DATE_FIELDS) if (typeof out[key] === 'string') out[key] = Timestamp.fromDate(new Date(out[key]))
  return out
}

/** 캐시에서 읽은 불완전한 목록으로 내보내거나 기존 데이터를 교체하지 않는다. */
export async function exportAll(uid: string): Promise<Bundle> {
  const store = need(uid)
  const [settings, subjects, tasks] = await Promise.all([
    getDocFromServer(doc(store, 'users', uid, 'settings', 'app')),
    getDocsFromServer(collection(store, 'users', uid, 'subjects')),
    getDocsFromServer(collection(store, 'users', uid, 'tasks')),
  ])
  if ([settings, subjects, tasks].some(s => s.metadata.fromCache || s.metadata.hasPendingWrites))
    throw new Error('아직 동기화하지 못한 변경이 있어요. 인터넷 연결과 저장 상태를 확인한 뒤 다시 시도해 주세요.')
  return { app: APP, version: 1, exportedAt: new Date().toISOString(),
    settings: settings.data() ?? {},
    subjects: subjects.docs.map(d => ({ ...encode(d.data()), id: d.id })),
    tasks: tasks.docs.map(d => ({ ...encode(d.data()), id: d.id })) }
}

function operations(bundle: Bundle, backup: Bundle): number {
  const subjects = new Set(bundle.subjects.map(s => s.id))
  const tasks = new Set(bundle.tasks.map(t => t.id))
  return bundle.subjects.length + bundle.tasks.length + 1 +
    backup.subjects.filter(s => !subjects.has(s.id)).length + backup.tasks.filter(t => !tasks.has(t.id)).length
}
function checkSize(bundle: Bundle, backup: Bundle): number {
  const count = operations(bundle, backup)
  if (count > MAX_IMPORT_OPERATIONS) throw new Error('안전하게 한 번에 교체할 수 있는 범위를 넘었어요. 기존 데이터는 변경하지 않았어요.')
  if (bytes(JSON.stringify(bundle)) + bytes(JSON.stringify(backup)) > MAX_IMPORT_BYTES * 2)
    throw new Error('교체할 데이터의 용량이 너무 커요. 기존 데이터는 변경하지 않았어요.')
  return count
}
export async function prepareImport(uid: string, input: Bundle): Promise<ImportPreview> {
  const bundle = parseBundle(JSON.stringify(input))
  const backup = await exportAll(uid)
  const subjectIds = new Set(bundle.subjects.map(s => s.id))
  return { bundle, backup, operationCount: checkSize(bundle, backup),
    missingSubjectCount: bundle.tasks.filter(t => t.subjectId !== null && !subjectIds.has(t.subjectId)).length }
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, stable(val)]))
  return value
}
const contents = (bundle: Bundle) => JSON.stringify(stable({ settings: bundle.settings,
  subjects: [...bundle.subjects].sort((a, b) => a.id.localeCompare(b.id)),
  tasks: [...bundle.tasks].sort((a, b) => a.id.localeCompare(b.id)) }))

/** 모든 검증·서버 확인을 끝낸 후 단 한 번의 batch로 교체한다. 분할 쓰기는 하지 않는다. */
export async function importAll(uid: string, input: Bundle, backup: Bundle) {
  const bundle = parseBundle(JSON.stringify(input))
  if (!backup) throw new Error('먼저 현재 데이터의 백업을 준비해 주세요.')
  const current = await exportAll(uid)
  if (contents(current) !== contents(backup)) throw new Error('미리보기 이후 데이터가 바뀌었어요. 파일을 다시 선택해 새 백업을 받아 주세요.')
  checkSize(bundle, current)
  const store = need(uid)
  const batch = writeBatch(store)
  for (const name of ['subjects', 'tasks'] as const) {
    const incomingIds = new Set(bundle[name].map(d => d.id))
    for (const old of current[name]) if (!incomingIds.has(old.id)) batch.delete(doc(store, 'users', uid, name, old.id))
    for (const { id, ...data } of bundle[name]) batch.set(doc(store, 'users', uid, name, id), name === 'tasks' ? decode(data) : data)
  }
  batch.set(doc(store, 'users', uid, 'settings', 'app'), bundle.settings, { merge: true })
  await batch.commit()
  return { subjects: bundle.subjects.length, tasks: bundle.tasks.length }
}

/** 다운로드 시작과 디스크 저장 완료는 다르다. 교체 전 사용자가 파일 저장을 확인한다. */
export function downloadBundle(bundle: Bundle, suffix = '') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${APP}-${(bundle.exportedAt || new Date().toISOString()).slice(0, 10)}${suffix}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** UI 테스트에 필요한 Firestore 연산만 구현한 로컬 저장소. demo 모드 외에는 번들에 포함하지 않는다. */
type Data = Record<string, unknown>
type Store = Record<string, Data>
type Ref = { path: string; id: string; firestore: object }
export const STORAGE_KEY = 'sasa-demo-data-v1'

export class Timestamp {
  constructor(readonly seconds: number, readonly nanoseconds = 0) {}
  static fromDate(date: Date) { return new Timestamp(date.getTime() / 1000) }
  static now() { return Timestamp.fromDate(new Date()) }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6 }
  toDate() { return new Date(this.toMillis()) }
  toJSON() { return { __demoTimestamp: this.toMillis() } }
}
export const serverTimestamp = () => Timestamp.now()
const revive = (_key: string, value: unknown) => value && typeof value === 'object' && '__demoTimestamp' in value
  ? Timestamp.fromDate(new Date(Number(value.__demoTimestamp))) : value
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value), revive)

function seed(): Store {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
  const due = (days: number) => Timestamp.fromDate(new Date(new Date(today + 'T23:59:00+09:00').getTime() + days * 86400000))
  const root = 'users/local-demo/'
  const data: Store = {
    [root + 'settings/app']: { theme: 'light', themeStyle: 'glassmorphism', lang: 'ko', weekStartsOn: 1 },
    [root + 'subjects/physics']: { name: '일반물리학 I', short: '일물', icon: 'atom', color: '#C7D3C0', slots: [{ day: 1, period: 1 }, { day: 3, period: 4 }] },
    [root + 'subjects/ai']: { name: '인공지능', short: 'AI', icon: 'code', color: '#D4A29A', slots: [{ day: 2, period: 2 }, { day: 4, period: 5 }] },
    [root + 'subjects/math']: { name: '미적분학 I', short: '미적분', icon: 'ruler', color: '#7FA9A4', slots: [{ day: 2, period: 3 }] },
  }
  const tasks = [
    ['구심력 실험 보고서', 'physics', 0], ['A* Search 탐색 과제 — 긴 제목 확인', 'ai', 0],
    ['미적분 연습문제', 'math', 1], ['발표 자료 정리', 'ai', 3], ['지난 과제 완료', 'physics', -1],
  ] as const
  tasks.forEach(([title, subjectId, days], i) => {
    data[root + 'tasks/demo-' + i] = { title, subjectId, due: due(days), kind: '과제', repeat: 'none',
      note: '테마와 조작을 확인하기 위한 예시 과제입니다.', done: i === 4, doneAt: i === 4 ? due(-1) : null,
      createdAt: due(-5), focusDate: i === 0 ? today : null, dueWasDefault: false, entryMs: 0 }
  })
  return data
}
function load(): Store {
  const saved = globalThis.localStorage?.getItem(STORAGE_KEY)
  if (saved) return JSON.parse(saved, revive)
  const initial = seed()
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(initial))
  return initial
}
let store = load()
const listeners = new Set<() => void>()
function commit(next: Store) {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
  store = next
  listeners.forEach(fn => fn())
}
function ref(base: { path?: string }, parts: string[]): Ref {
  const path = [base.path, ...parts].filter(Boolean).join('/')
  return { path, id: path.split('/').at(-1)!, firestore: {} }
}
export const collection = (base: { path?: string }, ...parts: string[]) => ref(base, parts)
export const doc = (base: { path?: string }, ...parts: string[]) => ref(base, parts.length ? parts : [crypto.randomUUID()])
function snapshot(target: Ref, data = store) {
  const value = data[target.path]
  return { id: target.id, ref: target, exists: () => value !== undefined, data: () => value && clone(value),
    metadata: { fromCache: false, hasPendingWrites: false } }
}
export const getDoc = async (target: Ref) => snapshot(target)
function collectionSnapshot(target: Ref) {
  const prefix = target.path + '/'
  const docs = Object.keys(store).filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    .map(path => snapshot(ref({}, [path])))
  return { docs, size: docs.length, empty: docs.length === 0, metadata: { fromCache: false, hasPendingWrites: false } }
}
export const getDocs = async (target: Ref) => collectionSnapshot(target)
type Snapshot = ReturnType<typeof snapshot> | ReturnType<typeof collectionSnapshot>
export function onSnapshot(target: Ref, ...args: unknown[]) {
  const callback = args.find(arg => typeof arg === 'function') as (value: Snapshot) => void
  const emit = () => callback(target.path.split('/').length % 2 ? collectionSnapshot(target) : snapshot(target))
  listeners.add(emit)
  queueMicrotask(() => { if (listeners.has(emit)) emit() })
  return () => { listeners.delete(emit) }
}
function merge(a: Data, b: Data): Data {
  const next = { ...a }
  for (const [key, value] of Object.entries(b)) {
    next[key] = value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length
      ? merge((next[key] as Data) ?? {}, value as Data) : value
  }
  return next
}
function batch() {
  const draft = clone(store)
  return {
    get: async (target: Ref) => snapshot(target, draft),
    set: (target: Ref, data: Data, options?: { merge?: boolean }) => { draft[target.path] = options?.merge ? merge(draft[target.path] ?? {}, data) : clone(data) },
    update: (target: Ref, data: Data) => {
      if (!draft[target.path]) throw new Error('로컬 테스트 데이터를 찾을 수 없다')
      draft[target.path] = { ...draft[target.path], ...clone(data) }
    },
    delete: (target: Ref) => { delete draft[target.path] },
    commit: async () => commit(draft),
  }
}
export const writeBatch = batch
export async function setDoc(target: Ref, data: Data, options?: { merge?: boolean }) { const tx = batch(); tx.set(target, data, options); await tx.commit() }
export async function updateDoc(target: Ref, data: Data) { const tx = batch(); tx.update(target, data); await tx.commit() }
export async function deleteDoc(target: Ref) { const tx = batch(); tx.delete(target); await tx.commit() }
export async function addDoc(target: Ref, data: Data) { const created = doc(target); await setDoc(created, data); return created }
// ponytail: 한 탭의 테스트 요청만 직렬화한다. 여러 기기 동시성 검증에는 Firebase Emulator를 쓴다.
let queue = Promise.resolve()
export function runTransaction<T>(_db: unknown, operation: (tx: ReturnType<typeof batch>) => Promise<T>) {
  const result = queue.then(async () => { const tx = batch(); const value = await operation(tx); await tx.commit(); return value })
  queue = result.then(() => {}, () => {})
  return result
}

// 데모 데이터만 반환한다. 실제 서버·오프라인 동작의 검증은 아니다.
export const getDocFromServer = getDoc
export const getDocsFromServer = getDocs

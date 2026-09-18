import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { exportAll, importAll, parseBundle, prepareImport } from './transfer'

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  reads: 0, commits: 0, batches: 0, offline: false, fromCache: false, pending: false, failCommit: false,
}))
vi.mock('./firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u' } } }))
vi.mock('firebase/firestore', async importOriginal => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  type Ref = { path: string; id: string }
  const ref = (_db: unknown, ...parts: string[]): Ref => ({ path: parts.join('/'), id: parts.at(-1)! })
  const metadata = () => ({ fromCache: store.fromCache, hasPendingWrites: store.pending })
  const snapshot = (r: Ref) => ({ id: r.id, ref: r, data: () => store.docs.get(r.path), metadata: metadata() })
  const read = () => { store.reads++; if (store.offline) throw new Error('offline') }
  return {
    ...actual, collection: ref, doc: ref,
    getDocFromServer: async (r: Ref) => { read(); return snapshot(r) },
    getDocsFromServer: async (r: Ref) => {
      read()
      const docs = [...store.docs.keys()].filter(path => path.startsWith(r.path + '/'))
        .map(path => snapshot({ path, id: path.split('/').at(-1)! }))
      return { docs, size: docs.length, metadata: metadata() }
    },
    writeBatch: () => {
      store.batches++
      const staged: (() => void)[] = []
      return {
        set: (r: Ref, value: Record<string, unknown>, options?: { merge: boolean }) => staged.push(() => {
          store.docs.set(r.path, options?.merge ? { ...store.docs.get(r.path), ...value } : value)
        }),
        delete: (r: Ref) => staged.push(() => { store.docs.delete(r.path) }),
        commit: async () => {
          if (store.failCommit) throw new Error('commit failed')
          store.commits++
          staged.forEach(write => write())
        },
      }
    },
  }
})

const good = () => ({
  app: 'sasa-task-manager', version: 1, exportedAt: '2026-09-05T06:00:00.000Z',
  settings: { lang: 'ko' },
  subjects: [{ id: 's1', name: '일반물리학I' }],
  tasks: [{ id: 't1', title: '3장 연습문제', subjectId: 's1', due: '2026-09-08T14:59:00.000Z' }],
})
const parsed = () => parseBundle(JSON.stringify(good()))

beforeEach(() => {
  store.docs.clear()
  store.reads = store.commits = store.batches = 0
  store.offline = store.fromCache = store.pending = store.failCommit = false
  store.docs.set('users/u/tasks/old', { title: '보존할 원래 할 일', due: null })
  store.docs.set('users/u/settings/app', { lang: 'en', theme: 'dark' })
})

describe('가져오기 파일 검증', () => {
  it('이전 버전의 누락된 선택 필드는 기본값으로 읽는다', () => {
    const bundle = parsed()
    expect(bundle.subjects[0]).toMatchObject({ id: 's1', name: '일반물리학I', slots: [] })
    expect(bundle.tasks[0]).toMatchObject({ id: 't1', repeat: 'none', done: false, focusDate: null })
  })

  it.each([
    ['JSON 아님', '시간표.pdf'],
    ['다른 앱', JSON.stringify({ ...good(), app: 'other-app' })],
    ['다른 버전', JSON.stringify({ ...good(), version: 2 })],
    ['배열 대신 객체', JSON.stringify({ ...good(), tasks: {} })],
    ['경로 ID', JSON.stringify({ ...good(), tasks: [{ id: 'bad/path', title: 'x' }] })],
    ['예약 ID', JSON.stringify({ ...good(), tasks: [{ id: '__invalid__', title: 'x' }] })],
    ['제목 객체', JSON.stringify({ ...good(), tasks: [{ id: 't', title: {} }] })],
    ['날짜 문자열 오류', JSON.stringify({ ...good(), tasks: [{ id: 't', title: 'x', due: 'not-a-date' }] })],
    ['달력에 없는 날짜', JSON.stringify({ ...good(), tasks: [{ id: 't', title: 'x', due: '2026-02-30T10:00:00Z' }] })],
    ['반복에 기한 없음', JSON.stringify({ ...good(), tasks: [{ id: 't', title: 'x', repeat: 'daily' }] })],
    ['완료 타입 오류', JSON.stringify({ ...good(), tasks: [{ id: 't', title: 'x', done: 'false' }] })],
    ['알림 시각 범위', JSON.stringify({ ...good(), settings: { notify: { morningHour: 24 } } })],
    ['알림 형식 오류', JSON.stringify({ ...good(), settings: { notify: [] } })],
    ['정의 안 된 필드', JSON.stringify({ ...good(), tasks: [{ id: 't', title: 'x', surprise: {} }] })],
    ['중복 할 일 ID', JSON.stringify({ ...good(), tasks: [{ id: 't', title: 'a' }, { id: 't', title: 'b' }] })],
    ['시작일 범위', JSON.stringify({ ...good(), settings: { weekStartsOn: 4 } })],
    ['시간표 중복', JSON.stringify({ ...good(), subjects: [{ id: 's', name: '과목', slots: [{ day: 1, period: 1 }, { day: 1, period: 1 }] }] })],
  ])('%s 파일은 읽기·쓰기 전에 거부한다', (_name, source) => {
    expect(() => parseBundle(source)).toThrow()
    expect(store.reads).toBe(0)
    expect(store.batches).toBe(0)
  })

  it('2 MB를 넘는 파일은 파싱 전에 거부한다', () => {
    expect(() => parseBundle(' '.repeat(2 * 1024 * 1024 + 1))).toThrow('최대 2 MB')
  })

  it('현재 글꼴 테마를 보존하고 잘못된 테마는 거부한다', () => {
    expect(parseBundle(JSON.stringify({ ...good(), settings: { themeStyle: 'glassmorphism' } })).settings.themeStyle).toBe('glassmorphism')
    expect(() => parseBundle(JSON.stringify({ ...good(), settings: { themeStyle: 'new-unknown-theme' } }))).toThrow()
  })

  it('과목 삭제 후 남은 할 일의 ID는 보존하고 미리보기에서 알린다', async () => {
    const bundle = parseBundle(JSON.stringify({ ...good(), subjects: [] }))
    const preview = await prepareImport('u', bundle)
    expect(preview.missingSubjectCount).toBe(1)
    expect(preview.bundle.tasks[0].subjectId).toBe('s1')
  })
})

describe('서버 확인과 원자 교체', () => {
  it('미리보기는 건수와 기존 백업만 만들며 데이터를 바꾸지 않는다', async () => {
    const result = await prepareImport('u', parsed())
    expect(result.operationCount).toBe(4) // 새 과목 + 새 할 일 + 기존 할 일 삭제 + 설정
    expect(result.backup.tasks[0].title).toBe('보존할 원래 할 일')
    expect(store.batches).toBe(0)
  })

  it('잘못된 파일을 importAll에 직접 넘겨도 쓰기 전에 검증한다', async () => {
    const invalid = { ...parsed(), tasks: [{ id: 'bad/path', title: {} }] }
    await expect(importAll('u', invalid, parsed())).rejects.toThrow()
    expect(store.reads).toBe(0)
    expect(store.batches).toBe(0)
  })

  it.each(['offline', 'fromCache', 'pending'] as const)('%s 상태는 기존 데이터 변경 없이 거부한다', async mode => {
    store[mode] = true
    await expect(prepareImport('u', parsed())).rejects.toThrow()
    expect(store.batches).toBe(0)
    expect(store.docs.has('users/u/tasks/old')).toBe(true)
  })

  it('미리보기 이후 다른 기기의 변경을 감지하면 교체하지 않는다', async () => {
    const preview = await prepareImport('u', parsed())
    store.docs.set('users/u/tasks/old', { title: '다른 기기에서 수정', due: null })
    await expect(importAll('u', preview.bundle, preview.backup)).rejects.toThrow('데이터가 바뀌었어요')
    expect(store.batches).toBe(0)
    expect(store.docs.get('users/u/tasks/old')?.title).toBe('다른 기기에서 수정')
  })

  it('서버 연결이 미리보기 뒤 끊겨도 삭제를 시작하지 않는다', async () => {
    const preview = await prepareImport('u', parsed())
    store.offline = true
    await expect(importAll('u', preview.bundle, preview.backup)).rejects.toThrow('offline')
    expect(store.batches).toBe(0)
  })

  it('새 문서만 세지 않고 기존 문서의 삭제를 포함해 500회 초과를 거부한다', async () => {
    for (let i = 0; i < 498; i++) store.docs.set(`users/u/tasks/existing-${i}`, { title: '기존', due: null })
    await expect(prepareImport('u', parsed())).rejects.toThrow('범위를 넘었어요')
    expect(store.batches).toBe(0)
    expect(store.docs.has('users/u/tasks/old')).toBe(true)
  })

  it('같은 ID는 delete+set 두 번으로 세지 않으며 정확히 500회는 한 batch로 처리한다', async () => {
    store.docs.clear()
    const bundle = parseBundle(JSON.stringify({ ...good(), subjects: [], tasks: Array.from({ length: 499 }, (_, i) => ({ id: `t-${i}`, title: '파일 할 일' })) }))
    for (const task of bundle.tasks) store.docs.set(`users/u/tasks/${task.id}`, { title: '기존' })
    const preview = await prepareImport('u', bundle)
    expect(preview.operationCount).toBe(500)
    await importAll('u', preview.bundle, preview.backup)
    expect(store.batches).toBe(1)
    expect(store.commits).toBe(1)
    expect(store.docs.size).toBe(500)
  })

  it('batch commit 실패 시 기존 데이터가 남고 일부 새 데이터도 생기지 않는다', async () => {
    const preview = await prepareImport('u', parsed())
    store.failCommit = true
    await expect(importAll('u', preview.bundle, preview.backup)).rejects.toThrow('commit failed')
    expect(store.commits).toBe(0)
    expect(store.docs.has('users/u/tasks/old')).toBe(true)
    expect(store.docs.has('users/u/tasks/t1')).toBe(false)
  })

  it('교체·설정을 한 번에 저장하고 날짜를 Timestamp로 되돌린다', async () => {
    const preview = await prepareImport('u', parsed())
    await importAll('u', preview.bundle, preview.backup)
    expect(store.commits).toBe(1)
    expect(store.docs.has('users/u/tasks/old')).toBe(false)
    expect(store.docs.get('users/u/tasks/t1')?.due).toBeInstanceOf(Timestamp)
    expect(store.docs.get('users/u/settings/app')).toEqual({ lang: 'ko', theme: 'dark' })
    const backup = await exportAll('u')
    expect(backup.tasks[0].due).toBe('2026-09-08T14:59:00.000Z')
  })

  it('계정이 바뀌면 기존 UID로 서버 데이터를 읽지 않는다', async () => {
    await expect(exportAll('someone-else')).rejects.toThrow('현재 계정')
    expect(store.reads).toBe(0)
  })
})

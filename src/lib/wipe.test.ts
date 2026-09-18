import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from 'firebase/auth'
import { AccountDeletionIncomplete, NeedsFreshLogin, deleteAccount, wipeSemester } from './wipe'

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(), events: [] as string[],
  fresh: true, authFailure: false, popupFailure: false, stillStale: false,
  offline: false, pending: false, unsubscribeFailure: false, batchFailure: false, deleteFailure: false,
}))
vi.mock('./firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u' } }, googleProvider: {} }))
vi.mock('./push', () => ({ unsubscribeThisDevice: async () => {
  state.events.push('unsubscribe')
  if (state.unsubscribeFailure) throw new Error('unsubscribe failed')
} }))
vi.mock('firebase/auth', () => ({
  getIdTokenResult: async () => {
    state.events.push('token')
    if (state.authFailure) throw new Error('token failed')
    return { authTime: new Date(Date.now() - (state.fresh ? 60_000 : 3600_000)).toISOString() }
  },
  reauthenticateWithPopup: async () => {
    state.events.push('reauth')
    if (state.popupFailure) throw new Error('popup blocked')
    if (!state.stillStale) state.fresh = true
  },
  deleteUser: async () => {
    state.events.push('deleteUser')
    if (state.deleteFailure) throw new Error('auth deletion failed')
  },
}))
vi.mock('firebase/firestore', () => {
  type Ref = { path: string }
  return {
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
    getDocsFromServer: async (ref: Ref) => {
      state.events.push('read')
      if (state.offline) throw new Error('offline')
      const docs = [...state.docs.keys()].filter(path => path.startsWith(ref.path + '/')).map(path => ({ ref: { path } }))
      return { docs, metadata: { fromCache: false, hasPendingWrites: state.pending } }
    },
    writeBatch: () => {
      state.events.push('batch')
      const deletions: string[] = []
      return {
        delete: (ref: Ref) => deletions.push(ref.path),
        commit: async () => {
          state.events.push('commit')
          if (state.batchFailure) throw new Error('batch failed')
          deletions.forEach(path => state.docs.delete(path))
        },
      }
    },
  }
})
const user = { uid: 'u' } as User
beforeEach(() => {
  state.docs.clear()
  for (const name of ['tasks/t', 'subjects/s', 'settings/app', 'pushSubs/device']) state.docs.set(`users/u/${name}`, { example: true })
  state.events = []
  state.fresh = true
  state.authFailure = state.popupFailure = state.stillStale = state.offline = state.pending = false
  state.unsubscribeFailure = state.batchFailure = state.deleteFailure = false
})

describe('계정 삭제 전 본인 확인', () => {
  it('최근 로그인은 추가 popup 없이 확인한 뒤 데이터와 계정을 삭제한다', async () => {
    await deleteAccount(user)
    expect(state.events).toEqual(['token', 'read', 'read', 'read', 'read', 'unsubscribe', 'batch', 'commit', 'deleteUser'])
    expect(state.docs.size).toBe(0)
  })

  it('오래된 로그인은 재인증을 마친 다음에만 서버 데이터를 읽고 지운다', async () => {
    state.fresh = false
    await deleteAccount(user)
    expect(state.events.slice(0, 4)).toEqual(['token', 'reauth', 'token', 'read'])
    expect(state.docs.size).toBe(0)
  })

  it.each(['authFailure', 'popupFailure', 'stillStale'] as const)('%s이면 데이터 읽기·쓰기를 시작하지 않는다', async mode => {
    state.fresh = false
    state[mode] = true
    await expect(deleteAccount(user)).rejects.toBeInstanceOf(NeedsFreshLogin)
    expect(state.events).not.toContain('read')
    expect(state.events).not.toContain('unsubscribe')
    expect(state.docs.size).toBe(4)
  })

  it.each(['offline', 'pending'] as const)('%s이면 구독 해제와 삭제를 하지 않는다', async mode => {
    state[mode] = true
    await expect(deleteAccount(user)).rejects.toThrow()
    expect(state.events).not.toContain('unsubscribe')
    expect(state.events).not.toContain('batch')
    expect(state.docs.size).toBe(4)
  })

  it('알림 정리가 실패하면 사용자 데이터를 지우지 않고 복구 가능한 오류를 알린다', async () => {
    state.unsubscribeFailure = true
    await expect(deleteAccount(user)).rejects.toThrow('할 일과 과목은 삭제하지 않았어요')
    expect(state.events).not.toContain('batch')
    expect(state.events).not.toContain('deleteUser')
    expect(state.docs.size).toBe(4)
  })

  it('데이터 batch 실패 시 계정을 삭제하지 않는다', async () => {
    state.batchFailure = true
    await expect(deleteAccount(user)).rejects.toThrow('batch failed')
    expect(state.events).not.toContain('deleteUser')
    expect(state.docs.size).toBe(4)
  })

  it('데이터 삭제 후 Auth 실패는 완료된 부분을 구분해서 알려준다', async () => {
    state.deleteFailure = true
    await expect(deleteAccount(user)).rejects.toBeInstanceOf(AccountDeletionIncomplete)
    expect(state.docs.size).toBe(0)
    expect(state.events.at(-1)).toBe('deleteUser')
  })

  it('삭제할 데이터가 500개를 넘으면 구독·데이터·계정을 모두 유지한다', async () => {
    for (let i = 0; i < 500; i++) state.docs.set(`users/u/tasks/${i}`, { title: '많은 데이터' })
    await expect(deleteAccount(user)).rejects.toThrow('한 번에 안전하게 삭제')
    expect(state.events).not.toContain('unsubscribe')
    expect(state.events).not.toContain('batch')
    expect(state.events).not.toContain('deleteUser')
    expect(state.docs.size).toBe(504)
  })
})

describe('학기 초기화', () => {
  it('할 일·과목만 한 번에 지우고 설정과 알림은 보존한다', async () => {
    expect(await wipeSemester('u')).toEqual({ tasks: 1, subjects: 1 })
    expect(state.events.filter(event => event === 'commit')).toHaveLength(1)
    expect([...state.docs.keys()]).toEqual(['users/u/settings/app', 'users/u/pushSubs/device'])
  })

  it('commit 실패 시 과목과 할 일이 모두 남는다', async () => {
    state.batchFailure = true
    await expect(wipeSemester('u')).rejects.toThrow()
    expect(state.docs.size).toBe(4)
  })

  it('다른 계정의 삭제는 서버 조회 전에 거부한다', async () => {
    await expect(wipeSemester('other')).rejects.toThrow('현재 계정')
    expect(state.events).toEqual([])
  })
})

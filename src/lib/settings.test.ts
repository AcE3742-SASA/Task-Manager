import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({ write: vi.fn(), statuses: [] as { saving: boolean; failed: boolean }[] }))
vi.mock('./firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'), setDoc: mock.write, onSnapshot: vi.fn(),
}))
// 이 테스트는 hook의 비동기 저장 로직만 실행한다. 화면 렌더링은 데모에서 별도로 확인한다.
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => void) => effect(),
  useState: (value: unknown) => [value, (next: { saving: boolean; failed: boolean }) => mock.statuses.push(next)],
}))
import { useSettingsMutation } from './settings'

function deferred() {
  let resolve: () => void = () => {}
  let reject: (reason: Error) => void = () => {}
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => { vi.clearAllMocks(); mock.statuses.length = 0; mock.write.mockResolvedValue(undefined) })

describe('settings save feedback and retry', () => {
  it('keeps an independent field failure visible after a later field succeeds and retries only the failed value', async () => {
    const earlier = deferred()
    mock.write.mockReturnValueOnce(earlier.promise)
    const changes = useSettingsMutation('synthetic-user')
    const morning = changes.save({ notify: { morningHour: 8 } })
    await changes.save({ lang: 'en' })
    expect(mock.statuses.at(-1)).toEqual({ saving: true, failed: false })
    earlier.reject(new Error('permission-denied'))
    await morning
    expect(mock.statuses.at(-1)).toEqual({ saving: false, failed: true })
    await changes.retry()
    expect(mock.write.mock.calls[2]).toEqual(['users/synthetic-user/settings/app', { notify: { morningHour: 8 } }, { merge: true }])
    expect(mock.statuses.at(-1)).toEqual({ saving: false, failed: false })
  })

  it('does not retry an old failed choice when that same field was replaced by a newer choice', async () => {
    const earlier = deferred()
    mock.write.mockReturnValueOnce(earlier.promise)
    const changes = useSettingsMutation('synthetic-user')
    const oldChoice = changes.save({ theme: 'light' })
    await changes.save({ theme: 'dark' })
    earlier.reject(new Error('old-write-failed'))
    await oldChoice
    expect(mock.statuses.at(-1)).toEqual({ saving: false, failed: false })
    await changes.retry()
    expect(mock.write).toHaveBeenCalledTimes(2)
  })

  it('combines failed notification fields without replacing their siblings and never auto-retries pending writes', async () => {
    const pending = deferred()
    mock.write.mockReturnValueOnce(pending.promise)
    const changes = useSettingsMutation('synthetic-user')
    const waiting = changes.save({ notify: { morningHour: 8 } })
    await changes.retry()
    expect(mock.write).toHaveBeenCalledTimes(1)
    pending.reject(new Error('offline-write-rejected'))
    await waiting
    mock.write.mockRejectedValueOnce(new Error('denied'))
    await changes.save({ notify: { eveningHour: 21 } })
    await changes.retry()
    expect(mock.write.mock.calls[2][1]).toEqual({ notify: { morningHour: 8, eveningHour: 21 } })
  })
})

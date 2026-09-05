import { describe, expect, it } from 'vitest'
import { parseBundle } from './transfer'

/** 남의 JSON 을 Firestore 에 그대로 붓지 않는지가 이 파일의 전부다. */
describe('계정 이전 — 파일 검증', () => {
  const good = {
    app: 'sasa-task-manager',
    version: 1,
    exportedAt: '2026-09-05T06:00:00.000Z',
    settings: { lang: 'ko' },
    subjects: [{ id: 's1', name: '일반물리학I' }],
    tasks: [{ id: 't1', title: '3장 연습문제', due: '2026-09-08T14:59:00.000Z' }],
  }

  it('제대로 된 번들을 통과시킨다', () => {
    const b = parseBundle(JSON.stringify(good))
    expect(b.subjects).toHaveLength(1)
    expect(b.tasks[0].id).toBe('t1')
  })

  it('JSON 이 아니면 거부한다', () => {
    expect(() => parseBundle('시간표.pdf')).toThrow()
  })

  it('다른 앱의 JSON 을 거부한다', () => {
    expect(() => parseBundle(JSON.stringify({ ...good, app: 'other-app' }))).toThrow()
    expect(() => parseBundle(JSON.stringify({ ...good, version: 2 }))).toThrow()
  })

  it('문서 id 가 없으면 거부한다 — 어디에 쓸지 알 수 없다', () => {
    expect(() => parseBundle(JSON.stringify({ ...good, tasks: [{ title: 'x' }] }))).toThrow()
  })

  it('settings 가 없어도 빈 객체로 통과한다', () => {
    const { settings: _drop, ...noSettings } = good
    expect(parseBundle(JSON.stringify(noSettings)).settings).toEqual({})
  })
})

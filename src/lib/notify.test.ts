import { describe, expect, it } from 'vitest'
import { countDue, countDueSoon, dueSoonCopy, kstHour, notifyCopy, pickKinds } from './notify'

/** 테스트를 로컬 시간대와 무관하게 쓰기 위해 UTC 순간으로 다룬다. KST = UTC+9. */
const at = (iso: string) => new Date(iso)

describe('kstHour', () => {
  it('UTC 를 KST 시로 옮긴다', () => {
    expect(kstHour(at('2026-08-23T00:00:00Z'))).toBe(9)
    expect(kstHour(at('2026-08-23T12:00:00Z'))).toBe(21)
  })

  it('자정을 넘기면 0 으로 돌아온다 — 24 가 나오면 안 된다', () => {
    expect(kstHour(at('2026-08-23T15:00:00Z'))).toBe(0) // 8/24 00:00 KST
    expect(kstHour(at('2026-08-23T22:30:00Z'))).toBe(7) // 8/24 07:30 KST
  })
})

describe('pickKinds', () => {
  const both = { morningHour: 7, eveningHour: 21 }

  it('아침 시각이면 아침만', () => {
    expect(pickKinds(7, both)).toEqual(['morning'])
  })

  it('저녁 시각이면 저녁만', () => {
    expect(pickKinds(21, both)).toEqual(['evening'])
  })

  it('아무 시각도 아니면 빈 배열', () => {
    expect(pickKinds(13, both)).toEqual([])
  })

  it('null 은 끈 것이다', () => {
    expect(pickKinds(7, { morningHour: null, eveningHour: 21 })).toEqual([])
    expect(pickKinds(21, { morningHour: 7, eveningHour: null })).toEqual([])
    expect(pickKinds(7, { morningHour: null, eveningHour: null })).toEqual([])
  })

  it('두 시각이 같으면 둘 다 보낸다 — 아침이 먼저다', () => {
    expect(pickKinds(9, { morningHour: 9, eveningHour: 9 })).toEqual(['morning', 'evening'])
  })

  it('0 시는 끔이 아니다', () => {
    expect(pickKinds(0, { morningHour: 0, eveningHour: 21 })).toEqual(['morning'])
  })
})

describe('countDue', () => {
  const now = at('2026-08-20T01:00:00Z') // 8/20(목) 10:00 KST

  it('오늘과 내일을 센다', () => {
    const dues = [
      at('2026-08-20T14:59:00Z'), // 8/20 23:59 KST — 오늘
      at('2026-08-20T02:00:00Z'), // 8/20 11:00 KST — 오늘
      at('2026-08-21T14:59:00Z'), // 8/21 23:59 KST — 내일
      at('2026-08-24T14:59:00Z'), // 8/24 — 둘 다 아님
    ]
    expect(countDue(dues, now)).toEqual({ today: 2, tomorrow: 1 })
  })

  it('기한이 지난 것은 오늘로 센다 — groupOf 와 같은 규칙이다', () => {
    const dues = [at('2026-08-18T14:59:00Z'), at('2026-07-01T14:59:00Z')]
    expect(countDue(dues, now)).toEqual({ today: 2, tomorrow: 0 })
  })

  it('아무것도 없으면 0 건', () => {
    expect(countDue([], now)).toEqual({ today: 0, tomorrow: 0 })
  })

  it('KST 자정 직전에도 날짜가 밀리지 않는다', () => {
    const late = at('2026-08-20T14:30:00Z') // 8/20 23:30 KST, 아직 목요일
    expect(countDue([at('2026-08-20T14:59:00Z')], late)).toEqual({ today: 1, tomorrow: 0 })
  })
})

describe('countDueSoon', () => {
  // 8/20(목) 20:00 KST. leadHours=2 면 22:00 버킷 마감이 걸린다.
  const now = at('2026-08-20T11:00:00Z')

  it('마감이 정확히 leadHours 버킷 뒤인 과제만 센다', () => {
    const dues = [
      at('2026-08-20T13:00:00Z'), // 22:00 KST — 2시간 뒤 ✓
      at('2026-08-20T13:59:00Z'), // 22:59 KST — 여전히 22시 버킷 ✓
      at('2026-08-20T14:59:00Z'), // 23:59 KST — 3시간 뒤, 아님
      at('2026-08-20T12:30:00Z'), // 21:30 KST — 1시간 뒤, 아님
    ]
    expect(countDueSoon(dues, now, 2)).toBe(2)
  })

  it('23:59 마감은 lead 3 일 때 걸린다 — 이 앱의 흔한 마감', () => {
    const due = [at('2026-08-20T14:59:00Z')] // 23:59 KST
    expect(countDueSoon(due, now, 3)).toBe(1)
    expect(countDueSoon(due, now, 2)).toBe(0)
  })

  it('이미 지난 마감은 세지 않는다', () => {
    expect(countDueSoon([at('2026-08-20T09:00:00Z')], now, 2)).toBe(0) // 18:00 KST, 지남
  })

  it('자정을 넘겨야 걸리는 마감도 시간 차로 잡는다', () => {
    const late = at('2026-08-20T14:00:00Z') // 23:00 KST
    const due = [at('2026-08-20T16:00:00Z')] // 8/21 01:00 KST — 2시간 뒤
    expect(countDueSoon(due, late, 2)).toBe(1)
  })

  it('아무것도 없으면 0', () => {
    expect(countDueSoon([], now, 2)).toBe(0)
  })
})

describe('dueSoonCopy', () => {
  it('건수와 여유 시간을 담고 List 로 보낸다', () => {
    const c = dueSoonCopy('ko', 2, 3)
    expect(c.body).toBe('3시간 안에 마감 2건')
    expect(c.screen).toBe('/')
  })

  it('영어 문구가 따로 있다', () => {
    expect(dueSoonCopy('en', 1, 2).body).toBe('1 due within 2h')
  })
})

describe('notifyCopy', () => {
  it('아침은 건수를 담고 List 로 보낸다', () => {
    const c = notifyCopy('morning', 'ko', { today: 2, tomorrow: 1 })
    expect(c.body).toBe('오늘 마감 2건 · 내일 1건')
    expect(c.screen).toBe('/')
  })

  it('0 건이어도 문구를 만든다 — 발송을 건너뛰지 않는다', () => {
    expect(notifyCopy('morning', 'ko', { today: 0, tomorrow: 0 }).body).toBe(
      '오늘 마감 0건 · 내일 0건',
    )
  })

  it('저녁은 건수를 쓰지 않고 New 로 보낸다', () => {
    const c = notifyCopy('evening', 'ko', { today: 0, tomorrow: 0 })
    expect(c.body).toBe('오늘 받은 과제, 지금 넣어두자.')
    expect(c.screen).toBe('/new')
  })

  it('영어 문구가 따로 있다', () => {
    expect(notifyCopy('morning', 'en', { today: 2, tomorrow: 1 }).body).toBe(
      'Due today 2 · tomorrow 1',
    )
    expect(notifyCopy('evening', 'en', { today: 0, tomorrow: 0 }).body).toBe(
      "Add today's assignments before you forget.",
    )
  })
})

import { mergeSettings } from './settings'

describe('mergeSettings — 마이그레이션 없이 옛 문서를 읽는다', () => {
  it('notify 가 없는 옛 문서는 기본값을 받는다', () => {
    expect(mergeSettings({ weekStartsOn: 0, lang: 'en' }).notify).toEqual({
      morningHour: 7,
      eveningHour: 21,
      soonBefore: null,
    })
  })

  it('빈 문서도 전부 기본값이 된다', () => {
    expect(mergeSettings({})).toEqual({
      weekStartsOn: 1,
      lang: 'ko',
      notify: { morningHour: 7, eveningHour: 21, soonBefore: null },
      theme: 'system',
    })
  })

  it('한쪽만 저장된 문서는 나머지만 기본값으로 채운다', () => {
    expect(mergeSettings({ notify: { morningHour: 6 } as never }).notify).toEqual({
      morningHour: 6,
      eveningHour: 21,
      soonBefore: null,
    })
  })

  it('soonBefore 를 켜 둔 문서는 그 값이 유지된다', () => {
    expect(mergeSettings({ notify: { soonBefore: 3 } as never }).notify).toEqual({
      morningHour: 7,
      eveningHour: 21,
      soonBefore: 3,
    })
  })

  it('theme 가 없는 옛 문서는 system 으로 채운다', () => {
    expect(mergeSettings({ theme: 'dark' }).theme).toBe('dark')
    expect(mergeSettings({}).theme).toBe('system')
  })

  it('null 은 기본값으로 덮이지 않는다 — 꺼둔 상태가 유지돼야 한다', () => {
    expect(mergeSettings({ notify: { morningHour: null } as never }).notify.morningHour).toBeNull()
  })
})

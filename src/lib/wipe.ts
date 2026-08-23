import { collection, getDocs, writeBatch } from 'firebase/firestore'
import { deleteUser } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { db } from './firebase'
import { unsubscribeThisDevice } from './push'

async function dropAll(uid: string, name: string) {
  if (!db) throw new Error('Firestore 가 설정되지 않았다')
  const snap = await getDocs(collection(db, 'users', uid, name))
  if (snap.empty) return 0
  // 한 학기 데이터는 많아야 수십 건이라 500개 배치 한 번으로 끝난다.
  const batch = writeBatch(db)
  snap.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
  return snap.size
}

/** 새 학기: 시간표와 할일을 비운다. 설정(주 시작 요일·언어)은 남긴다. */
export async function wipeSemester(uid: string) {
  const tasks = await dropAll(uid, 'tasks')
  const subjects = await dropAll(uid, 'subjects')
  return { tasks, subjects }
}

export class NeedsFreshLogin extends Error {}

/** 계정 삭제: 데이터를 먼저 지우고 계정을 지운다. 순서를 바꾸면 데이터가 고아로 남는다. */
export async function deleteAccount(user: User) {
  // 이 기기 구독을 가장 먼저 끊는다 — 아래 어느 단계가 실패해도 이 기기는 즉시 알림을 안 받는다.
  // 실패해도 계정 삭제 자체는 계속되어야 하므로 예외를 삼킨다.
  await unsubscribeThisDevice(user.uid).catch(() => {})
  await wipeSemester(user.uid)
  await dropAll(user.uid, 'settings')
  // pushSubs 를 안 지우면 계정이 사라진 뒤에도 cron 의 collectionGroup('pushSubs') 순회에
  // 이 uid 가 계속 걸린다. settings 문서도 없으니 DEFAULT_NOTIFY(07/21시)로 떨어져
  // 아무도 못 끄는 알림이 영원히 나간다.
  await dropAll(user.uid, 'pushSubs')
  try {
    await deleteUser(user)
  } catch (e) {
    // Firebase 는 오래된 세션의 계정 삭제를 거부한다. 재인증 흐름을 새로 짜지 않고 안내한다.
    if (e instanceof Error && e.message.includes('requires-recent-login')) throw new NeedsFreshLogin()
    throw e
  }
}

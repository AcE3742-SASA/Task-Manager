import { collection, getDocs, writeBatch } from 'firebase/firestore'
import { deleteUser } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { db } from './firebase'

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
  await wipeSemester(user.uid)
  await dropAll(user.uid, 'settings')
  try {
    await deleteUser(user)
  } catch (e) {
    // Firebase 는 오래된 세션의 계정 삭제를 거부한다. 재인증 흐름을 새로 짜지 않고 안내한다.
    if (e instanceof Error && e.message.includes('requires-recent-login')) throw new NeedsFreshLogin()
    throw e
  }
}

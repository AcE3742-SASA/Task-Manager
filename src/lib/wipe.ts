import { collection, getDocsFromServer, writeBatch } from 'firebase/firestore'
import type { QueryDocumentSnapshot } from 'firebase/firestore'
import { deleteUser, getIdTokenResult, reauthenticateWithPopup } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth, db, googleProvider } from './firebase'
import { unsubscribeThisDevice } from './push'

function need(uid: string) {
  if (!db || auth?.currentUser?.uid !== uid) throw new Error('현재 계정을 확인하지 못했어요. 다시 로그인해 주세요.')
  return db
}

async function deletionPlan(uid: string, names: string[]) {
  const store = need(uid)
  const groups = await Promise.all(names.map(async name => {
    const snapshot = await getDocsFromServer(collection(store, 'users', uid, name))
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites)
      throw new Error('동기화가 끝난 뒤 다시 시도해 주세요. 아직 데이터를 삭제하지 않았어요.')
    return { name, docs: snapshot.docs }
  }))
  const docs = groups.flatMap(group => group.docs)
  if (docs.length > 500) throw new Error('데이터가 많아 한 번에 안전하게 삭제할 수 없어요. 계정과 데이터는 그대로 유지돼요.')
  return { groups, docs }
}
async function removePlanned(uid: string, docs: QueryDocumentSnapshot[]) {
  if (docs.length === 0) return
  const batch = writeBatch(need(uid))
  for (const d of docs) batch.delete(d.ref)
  await batch.commit()
}

/** 빈 캐시를 전체 목록으로 오인하지 않고, 시간표·할 일을 한 번에 비운다. */
export async function wipeSemester(uid: string) {
  const { groups, docs } = await deletionPlan(uid, ['tasks', 'subjects'])
  await removePlanned(uid, docs)
  return { tasks: groups[0].docs.length, subjects: groups[1].docs.length }
}

export class NeedsFreshLogin extends Error {
  constructor() {
    super('계정 확인을 마치지 못했어요. 데이터는 삭제하지 않았어요. 로그아웃 후 다시 로그인하고 시도해 주세요.')
  }
}
export class AccountDeletionIncomplete extends Error {
  constructor() {
    super('할 일·과목·설정은 삭제했지만 계정 삭제를 완료하지 못했어요. 다시 로그인한 뒤 계정 삭제를 한 번 더 눌러 주세요.')
  }
}

/** popup이 막힌 iPhone에서는 재로그인한 뒤 다시 시도할 수 있다. 삭제를 자동 재개하지 않는다. */
async function confirmIdentity(user: User) {
  need(user.uid)
  const fresh = async () => {
    const result = await getIdTokenResult(user, true)
    const age = Date.now() - new Date(result.authTime).getTime()
    return Number.isFinite(age) && age >= -60_000 && age < 5 * 60_000
  }
  try {
    if (await fresh()) return
    await reauthenticateWithPopup(user, googleProvider)
    if (!await fresh()) throw new NeedsFreshLogin()
  } catch {
    throw new NeedsFreshLogin()
  }
}

/** 재인증 → 서버에서 전체 삭제 범위 확인 → 구독 해제 → 데이터 → 계정 순서. */
export async function deleteAccount(user: User) {
  await confirmIdentity(user)
  const { docs } = await deletionPlan(user.uid, ['tasks', 'subjects', 'settings', 'pushSubs'])
  // 실패하면 데이터 삭제로 넘어가지 않는다. 계정은 남고 알림만 꺼졌을 수 있다.
  try {
    await unsubscribeThisDevice(user.uid)
  } catch {
    throw new Error('알림 연결을 정리하지 못했어요. 할 일과 과목은 삭제하지 않았어요. 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  await removePlanned(user.uid, docs)
  try {
    await deleteUser(user)
  } catch {
    // Auth와 Firestore 사이에는 원자 트랜잭션이 없다. 완료된 부분을 정확히 알린다.
    throw new AccountDeletionIncomplete()
  }
}

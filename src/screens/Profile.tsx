import { useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Screen } from '../components/Screen'
import { Link } from 'react-router-dom'
import { IconArrow, IconCalendar, IconList, IconSignOut } from '../components/icons'
import { SubjectIcon } from '../components/subject-icons'
import { LiquidSurface } from '../components/LiquidSurface'
import { signOutSafely } from '../lib/push'
import { useT } from '../lib/i18n'
import { deleteAccount, wipeSemester } from '../lib/wipe'
import { MAX_IMPORT_BYTES, downloadBundle, exportAll, importAll, parseBundle, prepareImport } from '../lib/transfer'
import type { ImportPreview } from '../lib/transfer'

export function Profile({ user }: { user: User }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [backupStarted, setBackupStarted] = useState(false)
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const name = user.displayName ?? t('이름 없음', 'No name')
  const filePick = useRef<HTMLInputElement>(null)

  function showFailure(error: unknown) {
    const code = (error as { code?: string })?.code
    setMsg(code || (error instanceof Error && /^[a-z][a-z-]+$/.test(error.message))
      ? t('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', 'Cannot reach the server. Check your connection and try again.')
      : error instanceof Error ? error.message : t('처리하지 못했어요. 다시 시도해 주세요.', 'Could not finish. Please try again.'))
  }

  async function exportData() {
    setBusy(true)
    setMsg(null)
    try {
      const bundle = await exportAll(user.uid)
      downloadBundle(bundle)
      setMsg(t(
        `과목 ${bundle.subjects.length}개와 할 일 ${bundle.tasks.length}건의 다운로드를 시작했어요. 파일이 저장됐는지 확인해 주세요.`,
        `Downloading ${bundle.subjects.length} subjects and ${bundle.tasks.length} tasks. Check that the file was saved.`,
      ))
    } catch (error) { showFailure(error) }
    finally { setBusy(false) }
  }

  async function importData(file: File) {
    setBusy(true)
    setMsg(null)
    setPreview(null)
    setBackupStarted(false)
    setBackupConfirmed(false)
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error(t('가져올 수 있는 파일 크기는 최대 2 MB예요.', 'Import files must be 2 MB or smaller.'))
      const bundle = parseBundle(await file.text())
      setPreview(await prepareImport(user.uid, bundle))
    } catch (error) { showFailure(error) }
    finally { setBusy(false) }
  }

  function backupBeforeImport() {
    if (!preview) return
    try {
      downloadBundle(preview.backup, '-before-import')
      setBackupStarted(true)
      setMsg(t('백업 다운로드를 시작했어요. 파일 앱이나 다운로드 폴더에 저장됐는지 확인해 주세요.', 'Backup download started. Check your Files app or Downloads folder.'))
    } catch (error) { showFailure(error) }
  }

  async function applyImport() {
    if (!preview || !backupConfirmed || !backupStarted || busy) return
    setBusy(true)
    setMsg(null)
    try {
      const n = await importAll(user.uid, preview.bundle, preview.backup)
      setPreview(null)
      setMsg(t(`과목 ${n.subjects}개와 할 일 ${n.tasks}건을 가져왔어요.`, `Imported ${n.subjects} subjects and ${n.tasks} tasks.`))
    } catch (error) { showFailure(error) }
    finally { setBusy(false) }
  }

  async function reset() {
    if (!confirm(t('시간표와 할 일을 모두 비울까요? 설정은 유지돼요. 먼저 현재 데이터의 백업 파일을 받아요.',
      'Clear the timetable and all tasks? Settings are kept. Download a backup first.'))) return
    setBusy(true)
    setMsg(null)
    setPreview(null)
    try {
      downloadBundle(await exportAll(user.uid), '-before-reset')
      if (!confirm(t('백업 파일이 저장됐는지 확인해 주세요. 시간표와 할 일을 모두 비울까요?',
        'Check that your backup file was saved. Clear the timetable and all tasks?'))) return
      const n = await wipeSemester(user.uid)
      setMsg(t(`과목 ${n.subjects}개와 할 일 ${n.tasks}건을 비웠어요.`, `Cleared ${n.subjects} subjects and ${n.tasks} tasks.`))
    } catch (error) { showFailure(error) }
    finally { setBusy(false) }
  }

  async function signOut() {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try { await signOutSafely(user) }
    catch (error) { showFailure(error) }
    finally { setBusy(false) }
  }

  async function drop() {
    if (!confirm(t('계정과 할 일·과목·설정을 삭제할까요? 되돌릴 수 없어요. 필요한 데이터는 먼저 내보내기로 보관해 주세요.',
      'Delete the account and all data? This cannot be undone. Export any data you want to keep first.'))) return
    setBusy(true)
    setMsg(null)
    setPreview(null)
    try { await deleteAccount(user) }
    catch (error) { showFailure(error) }
    finally { setBusy(false) }
  }

  return (
    <Screen title={t('프로필', 'Profile')}>
      <div className="acct">
        <LiquidSurface />
        <span className="av">
          {user.photoURL ? <img src={user.photoURL} alt="" /> : name.slice(0, 1)}
        </span>
        <span className="who">
          <b>{name}</b>
          <em>{user.email ?? ''}</em>
        </span>
      </div>

      <span className="ttlbl">{t('시간표', 'TIMETABLE')}</span>
      <div className="rows">
        <Link className="row" to="/timetable">
          <LiquidSurface />
          <IconCalendar />
          <span className="rl">
            <b>{t('시간표', 'Timetable')}</b>
            <em>{t('요일과 교시별로 수업을 배치해요', 'Place subjects on the day × period grid')}</em>
          </span>
          <IconArrow />
        </Link>

        <Link className="row" to="/subjects">
          <LiquidSurface />
          <IconList />
          <span className="rl">
            <b>{t('과목', 'Subjects')}</b>
            <em>{t('이름 · 줄임말 · 아이콘 · 색', 'Name · short name · icon · color')}</em>
          </span>
          <IconArrow />
        </Link>

        <button className="row" onClick={reset} disabled={busy}>
          <LiquidSurface />
          <SubjectIcon id="flag" />
          <span className="rl">
            <b>{t('새 학기 시작', 'Start a new semester')}</b>
            <em>{t('백업 후 시간표와 할 일을 비워요', 'Clears the timetable and every task')}</em>
          </span>
        </button>

        <button className="row danger" onClick={signOut} disabled={busy}>
          <span className="rl">
            <b>{t('로그아웃', 'Sign out')}</b>
            <em>{t('이 기기의 알림과 계정 연결을 해제해요', 'Disconnect this device')}</em>
          </span>
          <IconSignOut />
        </button>

        <button className="row danger" onClick={drop} disabled={busy}>
          <span className="rl">
            <b>{t('계정 삭제', 'Delete account')}</b>
            <em>{t('계정과 할 일·과목·설정을 삭제해요', 'This cannot be undone')}</em>
          </span>
        </button>
      </div>

      <span className="ttlbl">{t('데이터 백업과 이전', 'BACKUP & TRANSFER')}</span>
      <div className="rows">
        <button className="row" onClick={exportData} disabled={busy}>
          <LiquidSurface />
          <SubjectIcon id="folder" />
          <span className="rl">
            <b>{t('데이터 내보내기', 'Export data')}</b>
            <em>{t('시간표 · 할 일 · 설정을 파일 하나로', 'Timetable, tasks, and settings as one file')}</em>
          </span>
        </button>

        <button className="row" onClick={() => filePick.current?.click()} disabled={busy}>
          <LiquidSurface />
          <SubjectIcon id="report" />
          <span className="rl">
            <b>{t('데이터 가져오기', 'Import data')}</b>
            <em>{t('내용을 미리 확인하고 백업한 뒤 가져와요', "Replaces this account's contents with the file")}</em>
          </span>
        </button>
        {/* 행 전체가 눌림 대상이라 파일 입력은 숨겨 둔다. */}
        <input
          ref={filePick}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            // 같은 파일을 두 번 고를 수 있어야 하므로 값을 비운다.
            e.target.value = ''
            if (file) void importData(file)
          }}
        />
      </div>

      {preview && (
        <section className="form" aria-label={t('가져오기 미리보기', 'Import preview')}>
          <h2>{t('가져오기 미리보기', 'Import preview')}</h2>
          <p>{t(
            `현재 과목 ${preview.backup.subjects.length}개·할 일 ${preview.backup.tasks.length}건을 파일의 과목 ${preview.bundle.subjects.length}개·할 일 ${preview.bundle.tasks.length}건으로 교체해요.`,
            `Replace ${preview.backup.subjects.length} subjects and ${preview.backup.tasks.length} tasks with ${preview.bundle.subjects.length} subjects and ${preview.bundle.tasks.length} tasks from the file.`,
          )}</p>
          <p className="hint">{t('가져오는 동안 다른 기기에서 수정하지 마세요. 먼저 현재 데이터의 백업 파일을 저장해 주세요.',
            'Do not edit on another device during import. Save a backup of your current data first.')}</p>
          {preview.missingSubjectCount > 0 && <p className="hint">{t(
            `연결된 과목이 없는 할 일이 ${preview.missingSubjectCount}건 있어요. 할 일은 그대로 가져오고 과목은 '과목 없음'으로 표시해요.`,
            `${preview.missingSubjectCount} tasks refer to missing subjects. Tasks are kept and shown with no subject.`,
          )}</p>}
          <button className="bigbtn" onClick={backupBeforeImport} disabled={busy}>
            {t('현재 데이터 백업 받기', 'Download current data backup')}
          </button>
          <label className="row">
            <input type="checkbox" checked={backupConfirmed} disabled={!backupStarted || busy}
              onChange={e => setBackupConfirmed(e.target.checked)} />
            <span>{t('백업 파일이 저장된 것을 확인했어요', 'I checked that the backup file was saved')}</span>
          </label>
          <button className="bigbtn" onClick={applyImport} disabled={busy || !backupConfirmed}>
            {busy ? t('가져오는 중…', 'Importing…') : t('이 파일의 내용으로 교체', 'Replace with this file')}
          </button>
          <button className="row" onClick={() => setPreview(null)} disabled={busy}>{t('취소', 'Cancel')}</button>
        </section>
      )}

      <p className="rows-note">
        {t('계정 삭제 시 할 일·과목·설정·기기 알림 등록을 지워요. 테스트 알림의 시도 시각과 횟수는 서버 운영 기록으로 별도 보관돼요.', 'Account deletion removes tasks, subjects, settings and device subscriptions. Test notification attempt times and counts are kept separately as operational records.')}
      </p>
      <p className="rows-note">
        {t(
          '다른 계정으로 옮기려면 먼저 내보낸 뒤 새 계정으로 로그인해 파일을 가져오세요. 가져오기는 기존 할 일과 과목을 교체해요. 알림은 새 계정에서 다시 켜 주세요.',
          'To move: export here, sign out, sign in with the new Google account, and import the file. Notifications are per-device, so turn them on again there.',
        )}
      </p>

      <div className="rows">
        <Link className="row" to="/help">
          <LiquidSurface />
          <SubjectIcon id="report" />
          <span className="rl"><b>{t('사용 방법', 'How to use')}</b><em>{t('첫 할 일부터 오늘 할 일 고르기까지', 'From your first task to planning today')}</em></span>
          <IconArrow />
        </Link>
        <a className="row" href="/fonts/Moneygraphy-LICENSE.txt" target="_blank" rel="noreferrer">
          <span className="rl"><b>{t('머니그라피 글꼴 라이선스', 'Moneygraphy font license')}</b></span>
          <IconArrow />
        </a>
      </div>

      {msg && (
        <div className="form">
          <div className="hint" role="status" aria-live="polite">{msg}</div>
        </div>
      )}
    </Screen>
  )
}

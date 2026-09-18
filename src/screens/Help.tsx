import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { useT } from '../lib/i18n'
import { saveGuideStatus } from '../lib/onboarding'
import '../styles/onboarding.css'

export function Help({ uid }: { uid: string }) {
  const t = useT()
  const navigate = useNavigate()

  function finish(path: string, skipped = false) {
    saveGuideStatus(uid, skipped ? 'skipped' : 'completed')
    navigate(path)
  }

  return (
    <Screen title={t('사용 방법', 'Getting started')} action={
      <button className="act" onClick={() => finish('/', true)}>{t('건너뛰기', 'Skip')}</button>
    }>
      <div className="guide">
        <p className="guide-intro">
          {t('할 일 하나부터 시작해 보세요. 과목과 시간표는 나중에 설정해도 괜찮아요.', 'Start with one task. Subjects and your timetable can wait.')}
        </p>
        <ol className="guide-steps">
          <li>
            <h2>{t('할 일을 기록해요', 'Write down a task')}</h2>
            <p>{t('아래의 추가 버튼을 누르고 제목과 기한을 확인한 뒤 저장하세요. 날짜가 아직 정해지지 않았다면 기한 없음을 선택하면 돼요.', 'Tap Add below, enter a title, check the due date, and save. Choose No due date if the date is not decided yet.')}</p>
          </li>
          <li>
            <h2>{t('오늘 할 일을 골라요', 'Choose what to finish today')}</h2>
            <p>{t('할 일 옆 압정을 누르면 오늘 끝낼 것에 모여요. 제출 기한은 그대로예요. 일을 마치면 완료 버튼을 누르세요.', 'Tap the pin beside a task to add it to Finish today. Its due date stays the same. Tap the checkbox when it is done.')}</p>
            <p className="guide-note">{t('기한 하루 늦추기는 앱에 저장된 마감 날짜를 바꿔요. 시각은 유지돼요. 오늘 목록에서만 빼려면 압정을 다시 누르세요.', 'Moving a due date changes the deadline saved in this app and keeps its time. To remove a task only from today’s list, tap its pin again.')}</p>
          </li>
          <li>
            <h2>{t('필요할 때 수업과 연결해요', 'Connect your classes when needed')}</h2>
            <p>{t('내 정보에서 과목을 만들고 시간표에 배치할 수 있어요. 새 할 일에서 과목을 고르면 다음 주 첫 수업 전날로 기한을 제안해요. 실제 제출 날짜와 맞는지 확인해 주세요.', 'In Profile, add a subject and place it on your timetable. Selecting it for a new task suggests the evening before its first class next week. Check that it matches the actual deadline.')}</p>
          </li>
        </ol>
        <p className="guide-note">{t('알림과 테마는 설정에서 바꿀 수 있어요. 이 안내는 내 정보에서 다시 볼 수 있어요.', 'Notifications and themes are in Settings. You can open this guide again from Profile.')}</p>
        <div className="guide-actions">
          <button className="bigbtn" onClick={() => finish('/new')}>{t('첫 할 일 추가', 'Add a task')}</button>
          <button className="guide-link" onClick={() => finish('/')}>{t('알겠어요, 목록으로', 'Got it, back to my list')}</button>
        </div>
      </div>
    </Screen>
  )
}

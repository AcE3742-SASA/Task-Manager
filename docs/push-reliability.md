# 알림 연결과 진단

현재 구현은 브라우저 구독만으로 ‘켜짐’을 표시하지 않는다. 알림 권한, 현재 VAPID 공개키, 현재 로그인 계정의 Firestore 등록(endpoint와 암호화 키)을 모두 확인한다. 서버 확인에 실패하면 확인 실패를 표시한다. 캐시 응답을 연결 정상으로 오인하지 않게 서버 읽기를 사용한다.

## 계정 전환과 로그아웃

- `reconcilePushAccount(uid)`를 로그인 계정 변경 시 호출한다. 이전 계정 소유 endpoint는 브라우저에서 먼저 해제한다. 이전 계정의 Firestore 경로를 새 계정 권한으로 수정하지 않는다. 서버의 무효 endpoint는 다음 발송에서 404/410 정리 대상이다.
- 기존 버전의 소유 정보 없는 구독은 현재 계정의 서버 등록을 확인한 뒤 유지한다. 확인할 수 없으면 해제하며 다시 연결하도록 안내한다.
- `signOutSafely(user)`는 기기의 알림 구독과 현재 계정 서버 등록 정리가 끝난 뒤 로그아웃한다. 정리 실패 시 로그아웃하지 않는다. 브라우저에서 먼저 해제됐어도 로컬에 endpoint를 남겨 서버 정리를 다시 시도할 수 있다.
- 서비스워커 준비와 구독 조회/해제, 등록 확인/정리는 10초 뒤 실패를 반환한다. Firebase 쓰기 제한시간 초과는 전송 취소를 뜻하지 않는다. 같은 endpoint 등록/삭제는 재시도해도 같은 결과가 나도록 사용한다. 등록이 늦게 끝나기 전에 계정이 바뀌면 해당 endpoint를 무효화한다. 그 뒤 이전 계정의 대기 중 쓰기가 서버에 도착하더라도 무효 endpoint라 이전 계정의 알림을 새 계정에 전달하지 못한다. 자동 재시도 발송은 하지 않는다.

## 테스트 알림 API

`POST /api/test-push`

- Firebase 클라이언트 ID 토큰을 `Authorization: Bearer …`로 받으며 Admin SDK로 서명·발급 대상·만료·취소 여부를 검증한다.
- 요청 본문은 `{ "subscriptionId": "현재 기기의 등록 ID" }`이다. 대상 UID는 토큰에서만 얻는다. 클라이언트가 UID나 발송 endpoint를 보내도 사용하지 않는다.
- 현재 계정 하위의 실제 구독 문서를 읽고 VAPID와 허용된 push 서비스 URL을 검증한다. Apple(`*.push.apple.com`), Google FCM, Mozilla, Microsoft push 호스트만 허용한다. 자격 증명·포트·비 HTTPS·임의 목적지는 거부한다.
- 계정마다 1분에 1번, UTC 하루에 최대 10번 요청을 허용한다. `pushTestLimits/{uid}`의 서버 전용 문서를 Firestore transaction으로 갱신하며 실패한 발송도 한 번의 시도로 센다. 현재 Firestore 규칙은 `/users` 외 경로의 클라이언트 접근을 허용하지 않는다. 이 제한 문서를 사용자에게 쓰기 허용하면 안 된다.
- 서버 제한 기록에는 시도 시각, 카운트와 만료시각만 저장하고 과제, 알림 본문과 기기 endpoint는 넣지 않는다. `expiresAt`은 마지막 시도에서 48시간 뒤다. 예약 발송 실행이 만료된 `pushTestLimits` 문서를 최대 40개씩 정리하므로 Firestore TTL 정책은 필수가 아니다. 계정 삭제가 이 서버 기록을 직접 지우지는 않는다. 예약 실행 중단이나 정리할 기록의 누적으로 삭제가 늦어질 수 있다.
- 테스트 발송은 예약 실행을 거치지 않는다. 전송의 전체 제한시간은 5초이며 실제 HTTPS 요청을 abort한다. 푸시 서비스의 보관 TTL은 60초다. 테스트 요청을 자동 재시도하지 않는다.
- API 성공은 push 서비스가 요청을 받았다는 뜻이다. 기기 알림 표시 성공은 사용자가 직접 확인해야 한다.
- 401 인증 실패, 400 잘못된 등록 ID, 409 재연결 필요, 429 사용 제한, 502 발송 실패, 503 서버 준비/조회 실패를 반환한다. 토큰·암호화 키·endpoint를 로그에 남기지 않는다.

테스트 발송은 기존 `FIREBASE_SERVICE_ACCOUNT`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, 선택 `VAPID_SUBJECT`를 재사용한다. 예약 API는 기존 GitHub용 `CRON_SECRET`과 cron-job.org 전용 `CRON_JOB_SECRET` 중 등록된 키로 인증한다. 키 등록과 교체는 [예약 설정 문서](cron-job-setup.md)를 따른다.

## 예약 발송

`POST /api/notify`를 cron-job.org에서 5분마다 호출하는 구성을 권장한다. 호출 빈도가 알림 빈도는 아니다. 설정된 KST 정각과 마감 임박 시간대를 서버가 판정한다. 현재 정각을 먼저 처리한 뒤, 90분 이내의 직전 정각을 복구한다. 첫 설치 이전 시간은 소급하지 않으며 이미 지난 마감 임박 알림도 보내지 않는다.

같은 정각, 계정과 기기 경로, 구독 키, 알림 종류로 만든 전송 ID를 Firestore에 기록한다. transaction으로 전체 실행과 개별 발송의 60초 lease를 잡아 동시 호출을 제한한다. 30초 안의 잦은 재호출은 작업을 건너뛴다. 푸시 서비스의 topic과 기기 알림 tag에도 같은 사건의 ID를 사용한다.

네트워크 오류, 408, 429와 5xx는 최초 발송 포함 총 3회까지 시도한다. 첫 실패 후 최소 1분, 두 번째 실패 후 최소 3분 뒤 다시 시도할 수 있으며 실제 재시도 시각은 다음 예약 호출에 달려 있다. 404/410은 만료된 구독을 정리한다. 발송 중 교체된 새 구독을 이전 오류로 지우지 않도록 현재 키를 다시 비교한다.

외부 푸시 전송과 Firestore 기록은 하나의 transaction으로 묶을 수 없다. 전송 직후 성공 기록이 실패하면 다음 실행에서 같은 ID로 다시 시도할 수 있다. 이미 표시된 알림의 재표시를 완전히 막는 exactly-once 보장은 없다. 90분을 넘긴 장애, 재시도 한도 소진이나 기기 상태에 따른 누락도 남는다.

실행은 약 18초의 처리 예산 안에서 페이지와 커서를 저장하고 다음 호출에서 이어간다. 진행 중인 Firestore 요청까지 18초에 취소하는 하드 제한은 아니다. Vercel 함수 제한은 25초로 설정하고, 각 푸시의 DNS부터 응답 종료까지는 5초 뒤 실제 HTTPS 요청을 abort한다. 소켓이 계속 데이터를 보내도 제한이 늘어나지 않는다. 이 전송은 TLS 인증서 검증을 유지하고 redirect를 따라가지 않는다. 먼저 200을 반환한 뒤 백그라운드 작업이 계속된다고 가정하지 않는다.

일부 전송이나 계정 조회가 실패하면 다른 수신자 처리는 계속하고 503을 반환한다. `sent`는 푸시 접수와 성공 기록 완료 건수이며 기기 표시 건수가 아니다. `pending`은 다음 호출에서 이어갈 작업, `pruned`는 정리한 구독, `abandoned`는 시도 한도나 영구 오류 등으로 더 보내지 않는 건수다. `busy: true`인 200은 다른 실행이 있거나 호출 간격이 짧아 건너뛴 결과다. 따라서 HTTP 200만으로 모든 예약 처리가 끝났다고 판단하지 않는다.

`POST /api/notify?check=1`은 인증과 서버 준비, 시작 시각 형식, 스케줄러 상태 문서 읽기를 확인한다. 구독과 과제를 조회하거나 상태를 쓰거나 알림을 보내지 않는다. 이 경로는 v1.5.0 배포를 확인한 뒤에만 사용한다. 이전 API는 query를 무시하고 발송할 수 있다.

## 운영 기록 정리

`notificationDeliveries`와 `notificationRuns`의 `expiresAt`은 해당 정각에서 48시간 뒤다. `pushTestLimits`는 마지막 테스트 시도에서 48시간 뒤다. 정상 예약 실행의 시작에서 각 컬렉션의 만료 문서를 최대 40개씩 삭제한다. TTL 정책 없이 동작하지만 Firestore 읽기와 삭제 사용량은 발생한다. 점검 호출과 busy로 건너뛴 호출은 정리를 수행하지 않는다.

스케줄러가 멈추면 기록도 남는다. 48시간은 삭제 대상이 되는 시각이며 정확한 삭제 시한이 아니다. 과제와 알림 본문, endpoint는 발송 기록에 보관하지 않는다. `notificationScheduler/state`의 시작 정각, 실행 소유 ID와 lease는 운영을 이어가기 위한 제어 상태로 유지한다.

## 검증 범위

서버는 Node 24.x를 사용한다. Firebase Admin 14의 인증 모듈이 `jwks-rsa`를 거쳐 ESM 전용 `jose`를 불러오므로, Vercel에서 기본으로 꺼 둔 require(ESM) 지원이 필요하다. `vercel.json`의 `NODE_OPTIONS=--experimental-require-module`을 유지한다. [공식 설정 설명](https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration#experimental-nodejs-require-of-es-module)

`npm run check:server-runtime`은 실제 Firebase Auth·Firestore·Web Push 모듈을 별도 Node 프로세스에서 불러온다. 계정 조회나 네트워크 전송은 하지 않는다. 배포 후에도 인증 없는 두 API 요청이 500이 아닌 401인지 확인한다. 2026-09-19 첫 운영 점검에서 발견한 `ERR_REQUIRE_ESM`은 일반 테스트와 화면 빌드만으로 잡히지 않았던 오류다.

로컬 테스트는 Firebase, PushManager, HTTPS와 web-push를 합성 응답으로 대체한다. `src/lib/push.test.ts`와 `src/server/`의 테스트에서 계정 격리, API 인증, 요청 제한, 잘못된 endpoint, 중복 실행, 시간 경계, 부분 실패, 기록 실패와 전송 강제 중단을 확인한다. 이 결과는 실계정이나 실제 푸시 수신 검증이 아니다. 최종 실행 결과는 [v1.5.0 출시 기록](releases/1.5.0.md)에 남긴다.

출시 전 별도 테스트 계정과 실제 iPhone 홈 화면 PWA에서 수신·알림 클릭·권한 거부·재연결·A→B 계정 전환·로그아웃 실패를 검증해야 한다. 일반 Chrome 데모는 서비스워커와 push 서버를 사용하지 않으므로 이 검증을 대신하지 않는다.

참고 공식 문서:
- Firebase ID 토큰 검증: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Firestore transaction: https://firebase.google.com/docs/firestore/manage-data/transactions
- Apple Web Push 서버 호스트: https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers

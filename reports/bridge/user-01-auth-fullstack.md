# user-01 인증 페이지 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
>
> 입력: `medipanda-web-test/docs/user/01_AUTH_PAGES.md`, `medipanda-api/docs/user/01_AUTH_PAGES.md`,
> `reports/backend-ingestion-20260427/{01-controllers,02-services,03-repositories,04-domain,05-security,06-config}.md`

---

## 1. 화면 요약

비로그인 상태에서 진입 가능한 4개 공개 화면이 `AuthController` + `MemberController` + `KmcAuthController` + `TermsController` 의 엔드포인트를 공유한다.

| 라우트 | 컴포넌트 | 핵심 동작 | 주요 BE 호출 |
|---|---|---|---|
| `/login` | `pages-user/Login.tsx` (229줄) | userId/password + 자동로그인(`localStorage`+`btoa`), `useSession().login()` | `POST /v1/auth/login` |
| `/signup` | `pages-user/Signup.tsx` (579줄) | KMC 본인인증 팝업 → 폼 자동 채움, 아이디/전화 중복확인, CSO 신고증 multipart, 5단 약관 | `POST /v1/kmc/auth/request`, `GET /v1/members/{id}/available`, `POST /v1/members/available-phone`, `POST /v1/members`, `GET /v1/terms/latest`, `GET /v1/terms/privacy/latest` |
| `/find-account` | `pages-user/FindAccount.tsx` (285줄) | SMS 인증 → 마스킹된 userId 표시 (`/(?<=.{4})./g → x`) | `POST /v1/auth/verification-code/account/send`, `POST /v1/auth/verification-code/id/verify` |
| `/find-password` | `pages-user/FindPassword.tsx` (375줄) | userId+SMS 인증 → 새 비밀번호 PATCH | 위 send + `POST /v1/auth/verification-code/password/verify`, `PATCH /v1/members/{userId}/password-for-find-account` |

공통 훅/유틸: `useSession()` (전역 로그인), `requestKmcAuth()` (팝업 Promise), `normalizePhoneNumber()`, `isValidUserId/Password/Email` (`true | string` 반환), `switch(true)+startsWith` 에러 분기 — 모두 BE 응답 본문(평문 메시지 prefix)에 의존.

---

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | 경로 | Controller#method | Service#method | Repository · 캐시 | RBAC |
|---|---|---|---|---|---|---|
| 1 | POST | `/v1/auth/login` | `AuthController.login:59` (01-controllers.md:48) | `AuthService.login:304` (02-services.md:21) | `MemberRepository.findActivateMemberByUserId` (03-repositories.md:15), `MemberDeviceRepository.findByDeviceUuid/findTopByMemberAndFcmTokenOrderByModifiedAtDesc` (03:45) | PUBLIC |
| 2 | GET | `/v1/members/{userId}/available` | `MemberController.isUserIdAvailable:315` | `MemberService.isUserIdAvailable:422` (02:44) | `MemberRepository.existsByUserId` (deleted 포함) | PUBLIC |
| 3 | POST | `/v1/members/available-phone?phone=` | `MemberController.checkPhone:217` | `MemberService.isDuplicatedPhone:441` | `MemberRepository.existsByPhoneNumber` (deleted=false) | PUBLIC |
| 4 | POST | `/v1/members` (multipart) | `MemberController.signup:169` | `MemberService.signup:362` | `MemberRepository.existsByActiveUserId / existsByPhoneNumber / save / existsByReferralCode / findByReferralCode` + `MemberPushPreferenceRepository.save` + `MemberFileRepository.save` (CSO_CERTIFICATE) | PUBLIC |
| 5 | POST | `/v1/auth/verification-code/account/send?phoneNumber=` | `AuthController.sendVerificationCodeForFindAccount:133` | `AuthService.issueAuthCodeForFindAccount:98` | `MemberRepository.findFirstByPhoneNumberAndDeletedFalse` (03:138) + `AuthCodeCacheForFindAccount` (Caffeine, key=E.164 phone, TTL 3분) + `AligoSmsSender` (06-config.md:124) | PUBLIC |
| 6 | POST | `/v1/auth/verification-code/id/verify?phoneNumber&verificationCode` | `AuthController.verifyCodeForFindId:159` | `AuthService.verifyAuthCodeForFindId:127` | `AuthCodeCacheForFindAccount.get/remove` | PUBLIC |
| 7 | POST | `/v1/auth/verification-code/password/verify?userId&phoneNumber&verificationCode` | `AuthController.verifyCodeForFindPassword:178` | `AuthService.verifyAuthCodeForFindPassword:146` | `MemberRepository.findActivateMemberByUserId / save(refreshToken,lastLoginDate)` + 캐시 삭제 + `JwtService.generateToken` + 쿠키 발급 | PUBLIC ⚠ 사실상 로그인 |
| 8 | PATCH | `/v1/members/{userId}/password-for-find-account` | `MemberController.changePassword:301` | `AuthService.changePasswordForFindAccount:268` | `MemberRepository.findActivateMemberByUserId / save(password)` | **PUBLIC ← RISK-08 P0** |
| 9 | POST | `/v1/kmc/auth/request` | `KmcAuthController.kt:21` (01:91) | `KmcAuthService.request*` (02:246) → `HttpURLConnection` 외부 KMC API (timeout 5s, 02:251) | `KmcAuthSessionRepository.findByCertNum` + entity `kmc_auth_session(originalBytes, originalHex)` (04-domain.md:76) | PUBLIC |
| 10 | GET/POST | `/v1/kmc/auth/{callback-page,launch,callback,result}` | `KmcAuthController.kt:24,76,85,127` | `KmcAuthService` (`KmcCrypto.jar` JNI, 06-config.md:75) | `KmcAuthSessionRepository` | PUBLIC (KMC 콜백 서버 입장) |
| 11 | GET | `/v1/terms/{latest,{version}}` & `/v1/terms/privacy/{latest,{version}}` | `TermsController.kt:19,25,31,37` (01:349) | `TermsService` (02:303) | `TermsRepository` (03:59) | PUBLIC |

엔드포인트 11개 + KMC 5개 + Terms 4개. **8개 핵심 모두 `@RequiredRole` 없음** = `SecurityConfig` permitAll. FE 문서가 선언한 8경로 전부 BE 실경로와 일치(drift 0).

---

## 3. DB 테이블

| 테이블 | 역할 | 핵심 컬럼 / UNIQUE | Aggregate (04-domain.md:237) |
|---|---|---|---|
| `member` | 회원가입 메인 타겟 | `user_id`/`nickname`/`referral_code` 3종 UNIQUE, `password`(BCrypt $2a$10$), `phone_number`(sanitized), `birth_date`, `gender`, `account_status`(ACTIVATED/BLOCKED/…), `role`(USER 기본), `marketing_*_agree`+`marketing_*_agreed_at`, `refresh_token`, `last_login_date`, `deleted` | Member (Root) |
| `member_push_preference` | signup 부산물(`ensureDefaultPushPreference`) | `member_id` UNIQUE FK, `allow_notice/allow_sales_agency/allow_prescription/allow_settlement/allow_community` | Member |
| `member_device` | login 시 `fcmToken` 동반되면 upsert | `device_uuid` UNIQUE, `platform`(ANDROID/IOS/OTHER), `fcm_token`, `app_version`, `last_seen_at`, `logged_out` | Member |
| `member_file` | CSO 신고증 첨부 | `member_id`+`file_type='CSO_CERTIFICATE'`+`s3_file_id`(EAGER, 04:407) | Member |
| `kmc_auth_session` | KMC 본인인증 세션 | `cert_num`, `status`(KmcStatus PENDING/SUCCESS/FAIL, 04:125), `original_bytes`(VARBINARY)+`original_hex`(TEXT) 중복 저장(04:412) | Kmc |
| `terms` | 약관/개인정보처리방침 | `type`(TermsType TERMS/PRIVACY, 04:126), `version`, `body` | Terms |
| Caffeine 캐시 (테이블 아님) | `AuthCodeCache` (userId→code, TTL3분, 로그인 후 비번 변경용) · `AuthCodeCacheForFindAccount` (E.164 phone → `AuthCodeData(authCode,userId)`, TTL3분) | maxSize 10,000 | — |

핵심 JOIN:
```sql
-- 회원가입 직후 부산물 무결성 확인 (push preference 자동 생성됐는지)
SELECT m.id, m.user_id, m.nickname, m.referral_code,
       pp.allow_notice, pp.allow_community,
       mf.file_type AS cso_file
  FROM member m
  LEFT JOIN member_push_preference pp ON pp.member_id = m.id
  LEFT JOIN member_file mf
         ON mf.member_id = m.id AND mf.file_type = 'CSO_CERTIFICATE'
 WHERE m.user_id = :userId;

-- 로그인+디바이스 묶음 (fcmToken 등록 상태)
SELECT m.id, m.user_id, m.last_login_date, m.account_status,
       d.device_uuid, d.platform, d.app_version, d.fcm_token, d.logged_out
  FROM member m
  LEFT JOIN member_device d ON d.member_id = m.id AND d.deleted = false
 WHERE m.user_id = :userId;

-- 동일 active 전화번호 중복 탐지 (RISK-J 재현)
SELECT phone_number, ARRAY_AGG(id ORDER BY id) ids, COUNT(*) AS active_c
  FROM member
 WHERE role='USER' AND deleted = false
 GROUP BY phone_number HAVING COUNT(*) > 1;   -- 01010002000 | {8,33} | 2
```

`Member` 엔티티는 `@Where(deleted=false)` 미적용 → 모든 Repository 쿼리에서 `deleted` 조건을 수동 명시해야 함(03-repositories.md:174). `existsByUserId`는 의도적으로 deleted 포함(userId 재사용 금지), `existsByPhoneNumber`는 deleted=false → 정책 비대칭.

---

## 4. 권한·트랜잭션

- **RBAC 매트릭스**: 8개 핵심 + KMC 5 + Terms 4 = **17개 모두 PUBLIC**. `@RequiredRole`/`@PreAuthorize` 없음. 인증/회원가입은 비로그인 호출이 필수이므로 7개는 정상이지만 #8 (비밀번호 변경 PATCH)는 권한 누락 P0 (§5 RISK-08).
- **트랜잭션 경계**:
  - `MemberService.signup` — `@Transactional` 단일 경계. 내부에서 `existsByActiveUserId` → `existsByPhoneNumber` → `save(member)` → `ensureReferralCodeAssigned` (REQUIRED, 02:394 RISK-4 부모와 함께 rollback) → `ensureDefaultPushPreference` → CSO 파일 저장 + `NotificationEmailEvent` publish → `nickname` 재저장 → `updateReferralPoint`. 중간 어떤 IllegalArgumentException도 전체 rollback.
  - `AuthService.login` — `@Transactional`, BCrypt match → `member.copy(refreshToken,lastLoginDate=utcNow())` save + (조건부) `member_device` upsert. 트랜잭션 내 SMS/외부 호출 없음.
  - `AuthService.verifyAuthCodeForFindPassword` — login과 동급 갱신 (`refresh_token` + `last_login_date` 재설정 + 쿠키 발급, RISK-O 감사 영향).
  - `AuthService.changePasswordForFindAccount` — `member.copy(password=encode(...))` 한 행 update.
- **세션/토큰**:
  - JWT(`JwtService`) accessToken+refreshToken 쌍, response body + `Set-Cookie: AUTH_TOKEN=...; HttpOnly` (`genLoginCookie`).
  - 자동 로그인은 FE `localStorage.autoLogin = {btoa(userId), btoa(password)}` (난독화일 뿐 암호화 아님; FE문서 §2-2).
  - KMC 본인인증은 별도 세션(`kmc_auth_session`) — `certNum`로 폴링(`/v1/kmc/auth/result`).
- **에러 코드 계약**: 401(login 실패 일괄), 404(`NoSuchElementException`), 400(`IllegalArgumentException` 일부), 500(`IllegalArgumentException`은 ControllerAdvice 미적용으로 자주 500). FE는 `e.response.data.startsWith('phone not found:'|'Invalid Korean phone number format:'|'user id'|'phone number')`로 분기 (RISK-D 계약 굳어 있음).

---

## 5. 리스크 / 후속 액션

> 5-A~5-O는 BE 인제스트(`backend-ingestion-20260427/05-security.md`)와 backend doc(`docs/user/01_AUTH_PAGES.md` §5)에서 인용.

| ID | 등급 | 내용 | 근거 |
|---|---|---|---|
| **RISK-01** | High | **Refresh Token DB 비교 미수행** — `AuthService.refreshToken()`이 서명/만료만 검증, `member.refresh_token` 컬럼과 대조하지 않음. 한 번 유출된 refreshToken 폐기 불가 (rotation 없음) | 05-security.md:286, AuthService.kt:434 |
| **RISK-02** | High | **프로모션 토큰 XOR + Base64 (PII 포함)** — 키 노출 시 평문 복원. 인증과 직접 관련은 적지만 동일 AuthService 모듈 신뢰성 영향 | 05-security.md:292, AuthService.kt:474-497 |
| **RISK-03** | High | **비밀번호 평문 전송 (`encryptPassword=false`)** — RSA 인프라(`/v1/auth/public-key`, `RsaUtil`)는 갖춰져 있으나 모든 프로필에서 비활성. login + changePasswordForFindAccount + signup 비밀번호가 HTTP 바디 평문 | 05-security.md:298, application.yml 전 프로필 |
| **RISK-07** | Medium | **쿠키 `Secure=false` 하드코딩** — `genLoginCookie`가 운영 HTTPS에서도 Secure 미설정. `SameSite` 미지정 + CSRF disabled 조합으로 토큰 탈취 표면 확대 | 05-security.md:100,322, AuthController.kt:69 |
| **RISK-08 (P0)** | High | **`PATCH /v1/members/{userId}/password-for-find-account` 인증 누락** — RBAC 없음 + verify 선행 강제 서버 상태 없음. 임의 userId로 비밀번호 재설정 가능. `verifyCodeForFindPassword`가 쿠키를 발급하지만 PATCH는 쿠키를 검증하지 않음 | backend doc §5-H, 05-security.md:343 |
| RISK-10 | Medium | **BCrypt strength=10 (기본값) + RSA 우회 경로** — `BCryptPasswordEncoder()` strength 미지정. 권고치 12 미만 | 05-security.md:18,180,340 |
| 5-B | Med | userId 비교 case-sensitive (`Foo`≠`foo`) — `idx__member__lower_user_id` 인덱스만 있고 활용 없음 | backend doc §5-B |
| 5-C / 5-G | Med | `checkPhone`/`verifyAuthCodeForFindPassword`가 `sanitizePhoneNumber()` 미적용. 하이픈 포함 입력은 DB(`01012345678`)와 미스매치. FE가 KMC 결과/`replace(/[^0-9]/g,'')`로 항상 sanitize 보내서 우연히 동작 | backend doc §5-C/G |
| 5-D | Med | signup 중복 에러가 `IllegalArgumentException` → 500 + 평문 메시지. FE가 `startsWith('user id')`/`startsWith('phone number')`로 매칭 → 리팩터 금지 영역. `ProblemDetails`+4xx 정비 권장 | backend doc §5-D, 01-controllers.md:376 |
| 5-E | High | **SMS/verify 둘 다 rate limit 없음** — 동일 phone으로 무제한 발송, 6자리 코드 brute force(20bit) 3분 윈도우 | backend doc §5-E |
| 5-F | Med | `verifyCodeForFindId`가 모든 Exception swallow → 항상 200+null 반환. FE는 `userId === ''`(빈 문자열) 체크로 분기 | backend doc §5-F, FE문서 §5 |
| 5-I | Med | Caffeine **단일 인스턴스 가정** — 멀티 인스턴스 배포 시 인증코드 발급/검증이 다른 노드로 라우팅되면 실패. Sticky session 또는 Redis 이관 필요 | backend doc §5-I, 03-repositories.md(캐시 섹션) |
| 5-J | Med | **active 회원 전화번호 중복 실재** — `01010002000` id=8(user1), id=33(knmedicine) 둘 다 deleted=false. FindAccount는 `findFirst…OrderBy…` 정렬 미지정으로 어느 계정의 코드인지 비결정적 | backend doc §4-3, 5-J |
| 5-O | Low | `verifyAuthCodeForFindPassword` 성공 시 `last_login_date` 갱신 → 비번찾기 시도자도 "최근 활동" 사용자로 잡혀 inactive 정리 정책 왜곡 | backend doc §5-O |
| 5-N | Low | `DevicePlatform.fromWire`가 매칭 안 되면 silently `OTHER`. `"windows"` 같은 값이 조용히 OTHER로 저장 | backend doc §5-N |
| 5-K / 5-L | Low | `referral_code` 컬럼 `varchar(8)`인데 실제 5자(생성기 길이 불일치) · `nickname`에 `member.id` 그대로 노출(가입순서 추정 가능) | backend doc §5-K/L |

**즉시 조치 권고 (3건)**
1. **RISK-08**: `changePasswordForFindAccount`에 단기 토큰(`verifyAuthCodeForFindPassword` 응답에 1회용 reset-token 포함) 또는 `@RequiredRole(SELF)`+쿠키 검증.
2. **RISK-03 + RISK-07**: 운영 프로필부터 `app.encrypt-password=true` + `genLoginCookie` Secure/SameSite 동적 설정.
3. **5-E**: phone+IP 기준 token bucket(SMS send 1건/분, verify 5회/분) + verify 5회 실패 시 phone 잠금.

**중기 (4건)**
4. RISK-01 refresh token DB 대조 + rotation, 5-J active phone dedup 데이터 정리, 5-C/G phone sanitize 통일, 5-D `IllegalArgumentException` → 4xx + ProblemDetails.

---

## 6. 참조

**FE 소스 (medipanda-web-test)**
- `src/pages-user/Login.tsx`, `Signup.tsx`, `FindAccount.tsx`, `FindPassword.tsx`
- `src/hooks/useSession.ts`, `src/utils/kmc.ts` (`requestKmcAuth`), `src/utils/form.ts`/`src/lib/utils/form.ts`
- `docs/user/01_AUTH_PAGES.md`

**BE 소스 (medipanda-api)**
- `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/AuthController.kt:59,133,159,178`
- `.../web/v1/MemberController.kt:169,217,274,301,315`
- `.../web/v1/KmcAuthController.kt:21,24,76,85,127`
- `.../web/v1/TermsController.kt:19,25,31,37`
- `.../service/AuthService.kt:85,98,127,146,268,304,434,462`
- `.../service/MemberService.kt:362,422,441,584-595`
- `.../service/KmcAuthService.kt:120-128`
- `.../repo/postgresql/MemberRepository.kt:104-105,110,112-113,115-116,118-119,125,148`
- `.../repo/postgresql/MemberDeviceRepository.kt`, `KmcAuthSessionRepository.kt`, `TermsRepository.kt`
- `.../security/JwtService.kt`, `.../utils/Utils.kt:59,193,207`, `.../cache/AuthCodeCache.kt`, `AuthCodeCacheForFindAccount.kt`
- `.../domain/entity/postgresql/{Member,MemberPushPreference,MemberDevice,MemberFile,KmcAuthSession,Terms}.kt`
- `docs/user/01_AUTH_PAGES.md`, `docs/JPQL_TO_SQL_GUIDE.md`

**인제스트 산출물 (claude-opus-test)**
- `reports/backend-ingestion-20260427/01-controllers.md` (AuthController:19, KmcAuthController:21, MemberController:78, TermsController:40)
- `reports/backend-ingestion-20260427/02-services.md` (AuthService:21, MemberService:44, KmcAuthService:246, TermsService:303, RISK-1~4:380-395)
- `reports/backend-ingestion-20260427/03-repositories.md` (MemberRepository:15, MemberDeviceRepository:45, KmcAuthSessionRepository:51, TermsRepository:59)
- `reports/backend-ingestion-20260427/04-domain.md` (Member:27, MemberDevice:30, MemberPushPreference:31, MemberFile:28, KmcAuthSession:76, Terms:75, MarketingAgreement:273, KmcStatus/TermsType/DevicePlatform:125-127)
- `reports/backend-ingestion-20260427/05-security.md` (RISK-01:286, RISK-02:292, RISK-03:298, RISK-07:322, RISK-08:343, BCrypt:18,180, Secure cookie:100)
- `reports/backend-ingestion-20260427/06-config.md` (Aligo SMS:124,138, KMC:127,141,219, AWS SNS:185, KmcCrypto.jar:75)

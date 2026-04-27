# user-10 마이페이지 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer 폴백)
> 프론트: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/10_MYPAGE.md`
> 백엔드: `/Users/jmk0629/keymedi/medipanda-api/docs/user/10_MYPAGE.md`
> 인제스트: `reports/backend-ingestion-20260427/01-controllers.md` … `06-config.md`

---

## 1. 화면 요약

`MypageInfo.tsx` / `MypageNotification.tsx` / `MypageWithdraw.tsx` 3개 라우트로 구성된 사용자 자기 정보 관리 영역.

- `/mypage/info` — 기본정보(이메일/이름/휴대폰/비밀번호) + 추가정보(닉네임/CSO 신고증/추천인) 수정. KMC 본인인증 후 휴대폰 변경, 비밀번호는 메인 폼과 분리된 onClick 핸들러.
- `/mypage/notification` — 푸시 5종(공지/영업/처방/정산/커뮤니티) 마스터 Switch + 마케팅 동의(SMS/Email/Push) 체크박스. 두 API를 `Promise.all`로 동시 저장.
- `/mypage/withdraw` — `confirm()` → `deleteMember()` → `localStorage.clear()` → `window.location.href='/logout'` 단순 흐름.

가드: `LoginMemberGuard` + `MypageGuard` (로그인 필수). 백엔드는 대부분 `@RequiredRole(ADMIN_OR_SELF, MEMBER_MANAGEMENT)` 적용.

---

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| 화면 동작 | Method · Path | Controller | Service | Repository / SQL | RBAC |
|---|---|---|---|---|---|
| 회원정보 수정 (이름/이메일/CSO 파일) | `PATCH /v1/members/{userId}` (multipart) | `MemberController.updateMember` (`MemberController.kt:179`) | `MemberService.update` (`MemberService.kt:277-359`) | `MemberRepository.findByUserId` / `existsByPhoneNumber` / `save` + `S3FileUploadEvent`, `MemberFileRepository` | ADMIN_OR_SELF + MEMBER_MANAGEMENT |
| 닉네임 가용·쿨다운 확인 | `POST /v1/members/available-nickname` | `MemberController.isAvailableNickname` (:265) | `MemberService.isAvailableNickname` (:426) | `MemberRepository.findActivateMemberByUserId` + `existsByNickname` (`uq__member__nickname`) | 로그인만 (`@RequiredRole` 없음) |
| 닉네임 변경 | `POST /v1/members/{userId}/nickname` | `MemberController.updateNickname` (:274) | `MemberService.updateNickname` (:445) | `MemberRepository.findActivateMemberByUserId` + `save(member.copy(nickname=…, nicknameChangedAt=today))` | **가드 없음**, path `{userId}` 무시 → 항상 `loginUser.userId` (§5-A) |
| 비밀번호 변경 | `PATCH /v1/members/{userId}/password` | `MemberController.changePassword` (:283) | `AuthService.changePassword` (`AuthService.kt:243-265`) | `MemberRepository.findByUserId` + `save(password=encode(new))`. 400 → "현재 비밀번호 불일치" | ADMIN_OR_SELF + MEMBER_MANAGEMENT |
| KMC 본인인증 요청 | `POST /v1/kmc/auth/request` | `KmcAuthController.createAuthRequest` (`KmcAuthController.kt:20`) | `KmcAuthService.generateTrCert` (:41-63) | `KmcAuthSessionRepository.save(status=PENDING)` (FK 없음) | Profile gate(`local`/`dev`/`prod`/`local-kmc-test`)만, 인증/Rate-limit 없음 (§5-T) |
| 푸시 수신 조회 | `GET /v1/members/me/push-preferences` | `MemberController.getPushPreferences` (:321) | `MemberService.findOrCreatePushPref` (:110-123) | `MemberPushPreferenceRepository.findByMemberId` (`uk_…member_id`) → 없으면 INSERT | ADMIN_OR_SELF + MEMBER_MANAGEMENT |
| 푸시 수신 수정 | `PATCH /v1/members/me/push-preferences` | `MemberController.patchPushPreferences` (:334) | `MemberService.patchPushPreferences` (:95-108) | `findOrCreatePushPref` + 5개 `?.let { … }` + `save` | ADMIN_OR_SELF + MEMBER_MANAGEMENT |
| 마케팅 동의 수정 | `PATCH /v1/members/{userId}` | (위 `updateMember` 재사용) | (위 `update` 내 `marketingAgreement?.let` 분기) | `MarketingAgreement` 새 객체 교체 (`changedToTrue` 적용) | ADMIN_OR_SELF + MEMBER_MANAGEMENT |
| 회원 탈퇴 | `DELETE /v1/members/{userId}` | `MemberController.deleteMember` (:194) | `MemberService.softDeleteBy` (:199-207) | `softDeleteByUserId` + `markDeletedAndClearNicknameByUserId` (UPDATE 2회) | ADMIN_OR_SELF + MEMBER_MANAGEMENT |

> 출처: `01-controllers.md:66-81`, `02-services.md:44-76`, `03-repositories.md:15-47`, `05-security.md:153-176`.

---

## 3. DB 테이블

핵심 3종: `member` (106) · `member_push_preference` (104) · `kmc_auth_session` (481).

- `member`: `user_id` UNIQUE / `nickname` UNIQUE(탈퇴 시 NULL) / `nickname_changed_at` (1달 쿨다운 기준) / `marketing_*_agree` + `*_agreed_at` / `refresh_token` / `deleted` (소프트). FK 다수 — 탈퇴 시 정리 없음 (§5-J).
- `member_push_preference`: `member_id` UNIQUE 1:1, 5개 `allow_*` BOOLEAN. 조회 시 lazy-create.
- `kmc_auth_session`: `cert_num` UNIQUE, `status PENDING|SUCCESS|FAIL`, name/phone/birth/gender, `member_id` FK 없음(§5-L). 현재 PENDING 356건 누적(§5-K).
- `member_device`: `MemberDeviceRepository.findAllByMemberIdAndDeletedFalse` 등 — FCM 토큰 저장. 탈퇴 시 정리 없음.

핵심 JOIN:
```sql
-- 마이페이지 사용자 단일 화면 — 자기 정보 + 푸시 설정 + KMC 최근 SUCCESS
SELECT m.user_id,
       m.name, m.email, m.phone_number, m.nickname, m.nickname_changed_at,
       m.marketing_push_agree,  m.marketing_push_agreed_at,
       m.marketing_sms_agree,   m.marketing_sms_agreed_at,
       m.marketing_email_agree, m.marketing_email_agreed_at,
       p.allow_notice, p.allow_sales_agency, p.allow_prescription,
       p.allow_settlement, p.allow_community,
       k.cert_num AS kmc_last_cert, k.status AS kmc_last_status, k.modified_at AS kmc_last_at
  FROM member m
  LEFT JOIN member_push_preference p
         ON p.member_id = m.id
  LEFT JOIN LATERAL (
       SELECT s.cert_num, s.status, s.modified_at
         FROM kmc_auth_session s
        WHERE s.name  = m.name
          AND TO_CHAR(m.birth_date, 'YYYYMMDD') = s.birth
          AND s.status = 'SUCCESS'
        ORDER BY s.modified_at DESC
        LIMIT 1
       ) k ON TRUE
 WHERE m.user_id = $1
   AND m.deleted = false;
```

> KMC ↔ member는 FK가 없어 `name + birth_date(YYYYMMDD)` 조합으로만 LATERAL 매칭 가능 (§5-L).

---

## 4. 권한·트랜잭션

- **권한 모드**: 마이페이지 7개 EP 중 5개가 `ADMIN_OR_SELF + MEMBER_MANAGEMENT`. `RoleCheckAspect`가 `@PathVariable userId`를 `loginUser.userId`와 비교해 SELF 판정 (`05-security.md:166-175`).
- **자가 검증 미적용 EP**:
  - `updateNickname`(`POST /{userId}/nickname`) — `@RequiredRole` 없음 + `@PathVariable` 없음. ADMIN 대리 변경 불가, 항상 본인만 (§5-A).
  - `isAvailableNickname` — `@RequiredRole` 없음. JWT 필터로만 로그인 보장.
  - `KmcAuthController.createAuthRequest` — Profile gate만, 인증/Rate-limit 없음 (§5-T).
- **트랜잭션 경계**:
  - `MemberService.update` / `patchPushPreferences` / `softDeleteBy` / `AuthService.changePassword` — `@Transactional` REQUIRED.
  - `MemberService.getPushPreferences` — `@Transactional` 없음 → `findOrCreatePushPref`의 `find→INSERT` 경쟁 (§5-M, `uk_1t1txm7at7xo0rf5c4bacsove` 위반 가능).
  - `softDeleteBy` 내부 2개 `@Modifying` UPDATE는 동일 트랜잭션. `markDeletedAndClearNicknameByUserId(clearAutomatically=true, flushAutomatically=true)`로 영속 컨텍스트 정리.
- **캐시 무효화 미흡**: `MemberSecurityCacheService.@Cacheable(activeAuthMemberByUserId, memberRoleByUserId)`에 `@CacheEvict` 없음 → `update`/`softDeleteBy`/`updateByAdmin` 후 캐시 만료 전까지 stale 인증 가능 ([RISK-3], `02-services.md:282, 390-392`).
- **이벤트 흐름**: CSO 파일 업로드는 `S3FileUploadEvent` + `publishCsoCertSubmittedEvent` 발행. 푸시 발송은 `pushEventQueue`(`NotificationQueueConfig.kt:15`) → `PushEventAfterCommitListener` → `FirebaseMessaging.sendAsync()` (`06-config.md:192-274`).

---

## 5. 리스크 / 후속 액션

핵심 리스크는 **자기 정보 변경 EP들의 권한 체크 누락 + RSA 우회 경로**.

- **[RISK-10 / 백엔드 §5-T]** RSA 우회 — `PATCH /v1/members/{userId}/password-for-find-account`에 `@RequiredRole` 없음. 비밀번호 찾기 후 변경 경로가 **단기 토큰/세션 검증 없이** 호출 가능 (`05-security.md:340-344`, `01-controllers.md:407`). 마이페이지의 `changePassword`(`/{userId}/password`)는 `ADMIN_OR_SELF` 보호되지만 같은 컨트롤러의 외부 경로가 안전망을 깬다. → 단기 패스워드 리셋 토큰 검증 또는 직전 KMC/이메일 인증 세션 재확인 필수.
- **[§5-A] `updateNickname` 권한 누락 + path 무시** — `@RequiredRole` 없고 `@PathVariable userId` 미사용. 외부에서 `/v1/members/anyone/nickname` 호출 가능하지만 항상 자기 닉네임만 변경. 의도라면 `POST /me/nickname` 으로 라우트 정리, 아니면 `ADMIN_OR_SELF` 가드 + path 사용.
- **[§5-B] TOCTOU** — `updateNickname` 내부에 `existsByNickname`/`recentlyChanged` 재검증 없음. 프론트가 건너뛰면 1달 쿨다운 무력화 + UNIQUE 위반 raw 노출.
- **[§5-H] `accountStatus` 임의 변경 가능** — SELF가 `PATCH /{userId}` 바디로 `accountStatus=BLOCKED/DELETED` 전송 가능. 프론트는 항상 null이지만 curl로 우회 가능. → SELF 경로 화이트리스트 필요.
- **[§5-I] 비밀번호 변경 후 세션 무효화 없음** — `refresh_token` 미회전. 다른 디바이스 세션 유지.
- **[§5-J] 탈퇴 시 PII 익명화·연관 정리 부재** — `deleted=true` + `nickname=NULL`만. `name/phone/email/birth_date/refresh_token/member_device/member_push_preference/member_file` 잔류. 개인정보보호법 파기 기한 위반 우려. 리프레시 토큰 유효 시 탈퇴 후에도 API 호출 가능.
- **[§5-P] 탈퇴 시 비밀번호 재확인 없음** — 토큰 탈취 시 즉시 탈퇴 가능. → confirm 외에 비밀번호 재입력 또는 KMC 재인증.
- **[§5-E] 마케팅 동의 시각 소실 (실DB 25/106 = 24%)** — `MarketingAgreement` 매번 새 객체 교체 + `changedToTrue(true,true)=false`로 `agreedAt`이 null로 덮임. 개인정보보호법 §22 위반 소지.
- **[§5-L] KMC 결과 ↔ member 매핑 프론트 의존** — 백엔드가 `name/birth` 비교 안 함. 조작된 프론트로 임의 phoneNumber 저장 가능. → 서버에서 KMC SUCCESS + name/birth match + cert 만료 검증 후에만 `phoneNumber` 갱신 승인 (별도 EP 분리 권장).
- **[RISK-3 / 02-services.md:390]** `MemberSecurityCacheService` `@CacheEvict` 누락 — 마이페이지에서 BLOCKED/DELETED 처리 후에도 캐시 TTL 만료 전까지 이전 권한으로 통과 가능. → `MemberService.update`/`softDeleteBy`/`AuthService.changePassword`에 `@CacheEvict(activeAuthMemberByUserId, memberRoleByUserId)` 추가.
- **[§5-M] `getPushPreferences` 동시 INSERT 경쟁** — `@Transactional` 없음 + UNIQUE 제약 위반 가능. → `@Transactional(readOnly=true)` + `ON CONFLICT DO NOTHING` 또는 re-read.
- **[§5-K] KMC PENDING 세션 356건 누적** — cleanup 스케줄 없음. → 10분/1일 cutoff 배치 + `created_at` 인덱스.
- **[§5-T] KMC 요청 EP 인증·Rate-limit 부재** — prod 프로파일에 노출. 무제한 INSERT + 외부 KMC 호출 비용 증가. → 인증 필수화 + per-userId 분당 N회 제한.

---

## 6. 참조

- 프론트 문서: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/10_MYPAGE.md`
- 백엔드 문서: `/Users/jmk0629/keymedi/medipanda-api/docs/user/10_MYPAGE.md`
- Controller: `MemberController.kt:179-346`, `KmcAuthController.kt:20-22`
- Service: `MemberService.kt:95-454`, `AuthService.kt:243-265`, `KmcAuthService.kt:41-63`
- Repository: `MemberRepository.kt:104-135`, `MemberPushPreferenceRepository`, `KmcAuthSessionRepository`
- 인제스트: `reports/backend-ingestion-20260427/01-controllers.md:66-81, 407` · `02-services.md:44-76, 282-394` · `03-repositories.md:15-47, 161-174` · `05-security.md:146-176, 340-352` · `06-config.md:192-274`
- 동일 화면 admin 측 매핑: `reports/bridge/admin-01-member-fullstack.md`

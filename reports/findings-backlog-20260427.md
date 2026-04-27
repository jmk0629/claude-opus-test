# medipanda 발견 사항 백로그 — 2026-04-27

> 출처: B1 `/ingest-medipanda-backend` 23 메뉴 풀스택 지도 (Phase 1 + Phase 2)
> 입력: `reports/bridge/{admin-01..12, user-01..11}-fullstack.md` §5 + `reports/ingest-medipanda-backend-20260427.md` §0/§2/§3
> 목적: Linear/GitHub Issue 로 옮기기 직전 통합 정리. 우선순위·중복·소유자 매핑.

## 0. 한 장 요약

- **총 발견 198건** (P0 **8** / P1 **34** / P2 **41** / P3 **57** / P4 **3** / 기타 등급 미부여 55) — 등급은 bridge 본문 표기를 그대로 매핑하고 미표기 행은 §3~5에서 본문 강도(High/Med/Low + ingest 보안 §0 매칭) 기준으로 재분류.
- **메뉴별 분포 상위 3** (총 건수 기준): `admin/12 권한` 15, `user/01 인증` 16, `user/10 마이페이지` 13.
- **횡단 패턴 (B1 §3 인용)**: RBAC 미적용 **16 메뉴 (P0 5건 포함)** / IDOR (owner-scope 미강제) **6 메뉴 (P0 5건 포함)** / BaseEntity 미상속 **5 메뉴** / Enum drift **5 메뉴** / 인메모리 큐·캐시 분산 부정합 **4 메뉴** / S3 누수 **6 메뉴** / 경로 drift **8 메뉴**.
- **즉시 조치 (P0)**:
  - `DELETE /v1/hospitals/all` 무인증 TRUNCATE (admin/09)
  - `GET /v1/partner-contracts/{userId}` IDOR (admin/10·user/11)
  - `PATCH /v1/members/{userId}/password-for-find-account` 인증 누락 (user/01·user/10)
  - `POST /v1/comments/{userId}`·`/v1/reports/{userId}` PathVariable userId 신뢰 = 타인 명의 작성 (user/06·user/09)
  - `SettlementPartner`·`SettlementPartnerProduct` IDOR 2건 (user/05)
  - `EventBoardController` C/U/D RBAC 부재 + 프로모션 토큰 XOR/PII (user/08, admin/09 5-H)
  - `SalesAgencyProductBoard` admin EP RBAC 부재 (admin/04·user/07)
  - `PrescriptionController` 18 EP RBAC 부재 (admin/05)
- **권장 처리 순서**: P0 (외주사 즉시 통보, 별도 Slack/직통) → P1 묶음 PR (RBAC + IDOR 2개 PR) → P2 스프린트 백로그 → P3/P4 재실행 시 재평가

---

## 1. P0 — 외주사 즉시 통보 (운영 사고 직전)

| # | 메뉴 | 항목 | 근거 | 액션 |
|---|------|------|------|------|
| P0-1 | admin/09 콘텐츠 | `DELETE /v1/hospitals/all` 무인증 TRUNCATE — 79,834 rows + seq RESTART | `bridge/admin-09-content-fullstack.md:129`, `ingest §2 / 05-security.md:53,267,310` | 엔드포인트 제거 또는 `@RequiredRole(SUPER_ADMIN_ONLY)` + IP allowlist + Spring Security `authenticated()` 격상 + 임시 게이트웨이 차단 |
| P0-2 | admin/10 고객지원 | `GET /v1/partner-contracts/{userId}` RBAC 부재 → 타 회원 사업자번호·계좌·CSO 신고증 cloudfront URL 노출 | `bridge/admin-10-customer-service-fullstack.md:98`, `ingest §2 / 05-security.md:158` | `@RequiredRole(ADMIN_OR_SELF, CONTRACT_MANAGEMENT)` 즉시 부착 + 비정상 access log 헌팅 |
| P0-3 | user/11 파트너계약 | `GET /v1/partner-contracts/{userId}` IDOR (CRITICAL) — admin/10 P0-2 와 동일 EP, 사용자 시점에서 재현 | `bridge/user-11-partner-contract-fullstack.md:79`, BE docs §5-A | P0-2 픽스로 동시 해소. 서비스 단 `loginUser.userId == path.userId \|\| isAdmin` 검증 |
| P0-4 | user/01 인증 | `PATCH /v1/members/{userId}/password-for-find-account` 인증 누락 — RBAC 없음 + verify 선행 강제 서버 상태 없음. 임의 userId로 비번 재설정 | `bridge/user-01-auth-fullstack.md:113 (RISK-08)`, `ingest §2 / 05-security.md:343`, BE docs §5-H | 단기 reset-token 발급 (verify 응답 1회용 토큰) 또는 `@RequiredRole(SELF)` + 쿠키 검증 |
| P0-5 | user/10 마이페이지 | RSA 우회 — 동일 EP `password-for-find-account` 가 마이페이지 비번 변경 안전망(`ADMIN_OR_SELF`)을 깬다 | `bridge/user-10-mypage-fullstack.md:100 (RISK-10/§5-T)`, `01-controllers.md:407` | P0-4 와 동시 픽스. 직전 KMC/이메일 인증 세션 재확인 강제 |
| P0-6 | user/06 커뮤니티 | `POST /v1/comments/{userId}`·`POST /v1/reports/{userId}` PathVariable userId 신뢰 — A 로그인이 `{B}` 로 호출 시 B 명의 댓글/신고 생성 | `bridge/user-06-community-fullstack.md:110 (CRIT-1)`, BE docs §5-C | 컨트롤러에서 `loginUser.userId` 강제 주입, ADMIN 외 `loginUser.userId != path.userId` 거부 |
| P0-7 | user/09 고객지원 | `createBoardPost` request.userId 신뢰 → 로그인 USER 가 다른 사용자 명의 INQUIRY 작성 | `bridge/user-09-customer-service-fullstack.md:97 (CRITICAL)`, BE docs §5-G | `session.userId == request.userId` 비교 또는 `@AuthenticationPrincipal` 강제 주입 |
| P0-8 | user/05 정산 | `SettlementPartnerRepository.searchSettlementPartnerSummary` / `SettlementPartnerProductRepository.findBySettlementPartnerId` IDOR — `userId`/`memberId` 필터 부재 | `bridge/user-05-settlement-fullstack.md:79 (IDOR-1)`, BE docs §5 이슈 1 | `AuthScopeUtil.userIdForQuery(loginUser)` 파라미터 전파 |
| P0-9 | user/05 정산 | `notifyAdminForSettlements`/`notifyAdminForObjections` 루프 IDOR — settlement.dealer.member.userId 검증 부재 | `bridge/user-05-settlement-fullstack.md:80 (IDOR-2)`, BE docs §5 이슈 2 | 루프 진입 시 본인 dealer 검증, 불일치 시 403 |
| P0-10 | user/08 이벤트 | `EventBoardController` 5개 EP 전체 `@RequiredRole` 부재 (admin/09 R1 동치) | `bridge/user-08-event-fullstack.md:76 (R1)`, BE docs §5-A | C/U/D 3개에 `@RequiredRole(ADMIN_ONLY, CONTENT_MANAGEMENT)` 부착 |
| P0-11 | user/08 이벤트 | 프로모션 토큰 XOR + Base64 (PII 포함) — 키 노출 시 평문 복원 | `bridge/user-08-event-fullstack.md:79 (R4)`, `ingest §0 Top5 #5 / 05-security.md:209-215,292` | AES-GCM 교체 + 페이로드 최소화 + Secrets Manager 이관 |
| P0-12 | admin/04 영업대행 | `SalesAgencyProductBoardController` 11 EP 전부 `@RequiredRole` 부재 → USER 토큰으로 admin 기능 호출 | `bridge/admin-04-sales-agency-fullstack.md:89 (R1, P0)`, `ingest 05-security.md:153` | `@RequiredRole(CONTRACT_MANAGEMENT or PRODUCT_MANAGEMENT)` + role 검증 |
| P0-13 | user/07 영업대행 | admin/04 R1 동치, USER JWT 로 admin EP 호출 가능 | `bridge/user-07-sales-agency-fullstack.md:77 (R1, P0)`, BE docs §5-A | P0-12 와 동시 처리 |
| P0-14 | admin/05 처방 | `PrescriptionController` 18 EP 전수 `@RequiredRole` 미적용 → ROLE_USER 가 타인 처방 승인/삭제/수정 | `bridge/admin-05-prescription-fullstack.md:97 (R1 Critical)`, `05-security.md:316-319, 01-controllers.md:406` | ADMIN_ONLY/SETTLEMENT_MANAGEMENT 즉시 적용 |

> **P0 외 ingest §0 Top5 즉시 통보 항목** (메뉴 cross-ref 외): Refresh Token DB 비교 미수행 (`05-security.md:286`), `/v1/hospitals/bulk-upsert` 무인증 (`:267,310`), Swagger/TestController 운영 노출 + BasicAuth 평문 (`:245,304`), `SettlementService.notifyAdminForObjections` `@Transactional` 누락 (`02-services.md:382-384`).

---

## 2. P1 — 이번 스프린트 (RBAC/IDOR 묶음 PR 권장)

가나다 순. 동일 EP가 여러 메뉴에서 발견된 경우 §7 횡단 패턴에 한 번만 묶고 본 표는 메뉴별로 행을 유지.

| # | 메뉴 | 항목 | 근거 | 액션 |
|---|------|------|------|------|
| P1-1 | admin/01 회원 | `MemberService.update:286` `existsByPhoneNumber(userId)` 인자 오기 — 재활성화 시 phone 중복검증 무력화 | `bridge/admin-01:100 (R1)`, BE docs 5-A | `request.phoneNumber` 로 수정 + 회귀 테스트 |
| P1-2 | admin/02 제품 | `ProductController` `@RequiredRole` 부재 — 모든 변경 EP JWT 만으로 통과 | `bridge/admin-02:107 (R8)`, BE docs 5-B, `01-controllers.md:406` | 권한 부착 (`PRODUCT_MANAGEMENT`) |
| P1-3 | admin/03 거래처 | `/v1/partners/**` `@RequiredRole` 부재 + `@TestOnly GET /ids/{userId}` 운영 노출 | `bridge/admin-03:116 (R1)`, `05-security.md:59,162-163,267-278` | `@RequiredRole(TRANSACTION_MANAGEMENT)` + ownership + admin bypass + Profile 가드 |
| P1-4 | admin/03 거래처 | `Partner.owner`/`Partner.drugCompany` 둘 다 EAGER → 목록 50건 즉시 N×2 | `bridge/admin-03:117 (R2)`, `04-domain.md:153-154,406` | `LAZY` + JOIN FETCH |
| P1-5 | admin/03 거래처 | `updatePartner` `companyName ?: partnerContract!!.companyName` — 레거시 partner NPE → 500 | `bridge/admin-03:118 (R3)`, BE §5-C, `02-services.md:158-159` | fallback `partner.companyName` |
| P1-6 | admin/03 거래처 | `drugCompanyName` 스냅샷 vs FK 78건 불일치 (37 variant) | `bridge/admin-03:119 (R4)`, BE §4-5,§5-D | 스냅샷 폐지 또는 save 훅 강제 동기화 |
| P1-7 | admin/05 처방 | `prescription_partner` 외 4 테이블 BaseEntity 미상속 → 분쟁 시 변경 시점 추적 불가 | `bridge/admin-05:100 (R4 Med)`, `04-domain.md:41-44,312,408` | BaseEntity 상속 + audit 컬럼 |
| P1-8 | admin/06 정산 | `SettlementService.notifyAdminForObjections` `@Transactional` 누락 + 다중 이메일 비대칭 | `bridge/admin-06:94 (RISK-1)`, `02-services.md:382`, ingest §0 Top5 #4 | 메서드/클래스 `@Transactional` + AFTER_COMMIT |
| P1-9 | admin/06 정산 | SettlementController 14/16 EP RBAC 미적용 — 일반 회원 토큰으로 Excel 업로드 가능 | `bridge/admin-06:99`, `05-security.md:157` | 권한 부착 |
| P1-10 | admin/06 정산 | `notifyAdminForObjections/Settlements` 루프 내 `dealerRepository.findById` N+1 | `bridge/admin-06:97`, `03-repositories.md:121-122,194` | `findAllById(ids)` + Map |
| P1-11 | admin/07 지출보고 | `ExpenseReportController` 전 EP 권한 부재 — DELETE 임의 ID 호출 가능 | `bridge/admin-07:100 (R1 High)`, ingest RISK-06, `05-security.md:61,160,316` | 권한 부착 + ownership |
| P1-12 | admin/07 지출보고 | `ExpenseReportStatus` enum drift — BE 2값 vs FE 4값, 비-2값 선택 시 400 | `bridge/admin-07:101 (R2 High)`, BE doc 5-C | enum 통일 |
| P1-13 | admin/09 콘텐츠 | `bulk-upsert` 무인증 + 실제 insert-only (UNIQUE 충돌 시 배치 전체 fail) | `bridge/admin-09:130 (5-G P1)`, ingest §0 Top5 #2 | 권한 + `INSERT ... ON CONFLICT(...) DO UPDATE` |
| P1-14 | admin/09 콘텐츠 | 17/17 EP RBAC 부재 — 일반 회원 토큰으로 이벤트/A to Z/병원 CRUD | `bridge/admin-09:131 (5-A P1)`, BE §5-A | `@RequiredRole(ADMIN_ONLY, CONTENT_MANAGEMENT)` |
| P1-15 | admin/09 콘텐츠 | A to Z 신규 저장 시 전 회원 푸시 — 멱등성 없음, 재작성 = 중복 | `bridge/admin-09:132 (5-H P1)`, BE §5-H | post_id 단위 멱등 키 |
| P1-16 | admin/12 권한 | `ADMIN_OR_SELF` 모드 로직 버그 — `targetUserId == null` 이면 무조건 통과 | `bridge/admin-12:82 (R1 P1)`, `RoleCheckAspect.kt:55-56` | fail-safe (거부) |
| P1-17 | admin/12 권한 | `@RequiredRole` 어노테이션 모델 신뢰성 — 5개 컨트롤러 전무 | `bridge/admin-12:83 (R2 P1)`, `05-security.md:153-164` | `@PreAuthorize` 또는 게이트웨이 통합 + 백필 |
| P1-18 | admin/12 권한 | `permissions` 자동 PERMISSION_MANAGEMENT 부여로 정보 누출 | `bridge/admin-12:84 (R3 P1)`, FE docs `:591,605` | `getPermissions` SUPER_ADMIN-only 또는 path 검증 |
| P1-19 | admin/12 권한 | `updateByAdmin` phoneNumber 자기제외 누락 → 폼 제출 매번 실패 | `bridge/admin-12:85 (R4 P1)`, `MemberService.kt:214-218` | `MemberService.update:291-295` 패턴 이식 |
| P1-20 | user/01 인증 | Refresh Token DB 비교 미수행 — 한 번 유출된 refreshToken 폐기 불가 | `bridge/user-01:109 (RISK-01 High)`, `05-security.md:286`, ingest §0 Top5 #1 | DB 대조 + rotation |
| P1-21 | user/01 인증 | 비밀번호 평문 전송 (`encryptPassword=false`) — RSA 인프라 갖췄으나 모든 프로필 비활성 | `bridge/user-01:111 (RISK-03 High)`, `05-security.md:298` | 운영 프로필부터 `app.encrypt-password=true` |
| P1-22 | user/01 인증 | SMS/verify rate limit 없음 — 6자리 코드 brute force 3분 | `bridge/user-01:118 (5-E High)` | phone+IP token bucket + verify 5회 실패 잠금 |
| P1-23 | user/02 홈 | `/v1/prescriptions/cache/evict` RBAC 없음 — 누구나 전체 캐시 무효화 | `bridge/user-02:85`, `01-controllers.md:169`, BE §5-E | `@RequiredRole(ADMIN_ONLY)` |
| P1-24 | user/03 제품검색 | `ProductController` admin 8 CUD/엑셀 EP user JWT 호출 가능 | `bridge/user-03:93 (R-1)`, `05-security.md:406` | `@RequiredRole(ADMIN_ONLY)` |
| P1-25 | user/04 처방 | `getPrescriptionPartner`/`updatePrescriptionWithFiles` 소유권 검증 누락 IDOR | `bridge/user-04:92 (R1 High)`, BE docs §5-E | ownership 가드 |
| P1-26 | user/04 처방 | `PrescriptionController` 전체 `@RequiredRole` 부재 (admin/05 P0-14 동일 컨트롤러) | `bridge/user-04:93 (R2 High)`, `05-security.md:161,316` | P0-14 와 동시 픽스 |
| P1-27 | user/05 정산 | `SettlementMemberMonthlyResponse.baseFeeAmount` 이중 카운트 | `bridge/user-05:82 (P1)`, BE doc §5 이슈 4 | `baseAndExtraFeeAmount` 또는 순수 base 분리 |
| P1-28 | user/05 정산 | PartnerContract INNER JOIN — 계약 종료 회원 과거 정산 열람 차단 | `bridge/user-05:83 (P1)`, BE doc §5 이슈 8 | LEFT JOIN 또는 별도 정책 |
| P1-29 | user/05 정산 | trans 일관성 + N+1 (P0-9 같은 메서드) | `bridge/user-05:81 (P1)`, `02-services.md`, `03-repositories.md:194` | P0-9 + admin/06 P1-10 묶음 PR |
| P1-30 | user/06 커뮤니티 | `editorFileIds` 중복 INSERT — `keepFileIds` 보존 파일 재 INSERT, UNIQUE 부재 | `bridge/user-06:111 (HIGH-1)`, BE 5-D | UNIQUE `(board_post_id, s3_file_id)` + 재사용 |
| P1-31 | user/06 커뮤니티 | 익명게시판 댓글 실명 저장 — DB 덤프/관리자 통계에 노출 | `bridge/user-06:112 (HIGH-2)`, BE 5-E | `BoardType.ANONYMOUS` 시 hiddenNickname 강제 |
| P1-32 | user/07 영업대행 | `apply` 가 `endDate < today` 거부 안 함 → 만료 후 신청 가능 | `bridge/user-07:78 (R2 P1)`, BE Z-3 | 진입부 만료 가드 |
| P1-33 | user/07 영업대행 | soft-deleted 상품 노출 — 상세/신청 양쪽 `productBoard.deleted` 가드 부재 | `bridge/user-07:79 (R3 P1)`, BE §5-D | NotFound 처리 |
| P1-34 | user/08 이벤트 | soft-deleted 이벤트 상세 우회 + 조회수 증가 | `bridge/user-08:77 (R2 P1)`, BE §5-F | deleted 검사 |
| P1-35 | user/08 이벤트 | CONTRACTED 노출범위 우회 — 상세 EP `resolveExposureRanges` 미적용 | `bridge/user-08:78 (R3 P1)`, BE §2-1 | 멤버십 검사 |
| P1-36 | user/09 고객지원 | `filterBlind`/`filterDeleted` 클라이언트 신뢰 — false 로 soft-deleted 본문/첨부 조회 | `bridge/user-09:98 (HIGH)`, BE §5-D | USER 호출 시 서버 강제 true |
| P1-37 | user/09 고객지원 | 답변 달린 INQUIRY 수정/삭제 우회 — 본문 변조/삭제로 답변 이력 분실 | `bridge/user-09:99 (HIGH)`, BE §5-H/§5-J | 차단 로직 |
| P1-38 | user/10 마이페이지 | `updateNickname` 권한 누락 + path 무시 + TOCTOU | `bridge/user-10:101-102 (§5-A,§5-B)` | `ADMIN_OR_SELF` + 재검증 |
| P1-39 | user/10 마이페이지 | `accountStatus` 임의 변경 — SELF가 PATCH 바디로 BLOCKED/DELETED 전송 | `bridge/user-10:103 (§5-H)` | 화이트리스트 |
| P1-40 | user/10 마이페이지 | 비밀번호 변경 후 세션 무효화 없음 (refresh_token 미회전) | `bridge/user-10:104 (§5-I)` | rotation |
| P1-41 | user/10 마이페이지 | 탈퇴 시 PII 익명화·연관 정리 부재 — refresh_token 잔류 | `bridge/user-10:105 (§5-J)` | PII 익명화 + 토큰 무효화 (개인정보보호법) |
| P1-42 | user/10 마이페이지 | 탈퇴 시 비밀번호 재확인 없음 | `bridge/user-10:106 (§5-P)` | 비밀번호 재입력 또는 KMC 재인증 |
| P1-43 | user/10 마이페이지 | `MemberSecurityCacheService` `@CacheEvict` 누락 — TTL 만료 전 이전 권한 통과 | `bridge/user-10:109 (RISK-3)`, `02-services.md:390` | `@CacheEvict` 추가 |
| P1-44 | user/10 마이페이지 | KMC 결과 ↔ member 매핑 프론트 의존 — 임의 phoneNumber 저장 가능 | `bridge/user-10:108 (§5-L)` | 서버 검증 (name/birth match + cert 만료) |
| P1-45 | user/10 마이페이지 | KMC 요청 EP 인증·Rate-limit 부재 | `bridge/user-10:112 (§5-T)` | 인증 + per-userId 분당 N회 |
| P1-46 | user/11 파트너계약 | 재신청 시 stale `partner_contract_file` 누적 — UNIQUE 부재 | `bridge/user-11:80 (R2)`, BE §5-E·§5-K | 재신청 시 soft-delete + UNIQUE DDL |
| P1-47 | user/11 파트너계약 | 재승인 시 dealer 계좌/은행 동기화 누락 → 정산 이체 오발송 위험 | `bridge/user-11:82 (R4)`, BE §5-Q | 재승인 분기에 갱신 |

---

## 3. P2 — 다음 스프린트 (백로그)

메뉴별로 묶어 표시.

### admin/01·02·03·04
| 메뉴 | 항목 | 근거 | 액션 |
|------|------|------|------|
| admin/01 | `getMemberDetails` `@Transactional` 없이 LAZY `memberFiles` 접근 | `bridge/admin-01:103 (R4)`, BE 5-E | `@Transactional(readOnly=true)` 또는 `@EntityGraph` |
| admin/02 | Excel 풀스캔 (`size=2^31-1`) — 4만 row × ROW_NUMBER 윈도우 | `bridge/admin-02:100 (R1)`, BE 5-C | size 상한 + async |
| admin/02 | `current_fee_rate`/`current_price` 갱신 비대칭 | `bridge/admin-02:101 (R2)`, BE 5-G | 정책 통일 |
| admin/02 | PATCH가 UPSERT — 미존재 시 조용히 create | `bridge/admin-02:103 (R4)`, BE 5-I | 404 반환 |
| admin/02 | Create는 신규 Product 만들지 않음 — 메뉴 명칭 불일치 | `bridge/admin-02:104 (R5)`, BE 5-E | 명세 정정 |
| admin/02 | PATCH path 변수 혼동 — id vs productId | `bridge/admin-02:105 (R6)`, BE 5-H | 시그니처 검증 |
| admin/02 | 소프트 삭제 N+1 — extra_info 루프 LAZY boardPost | `bridge/admin-02:106 (R7)`, BE 5-J | JOIN FETCH |
| admin/03 | Excel `hasPharmacy=false` 고정 | `bridge/admin-03:120 (R5)`, BE §5-E | `countActiveMapByPartnerIds` |
| admin/03 | `softDeleteHospital` `@Transactional` 누락 | `bridge/admin-03:121 (R6)`, `02-services.md:227` | 부착 |
| admin/03 | Excel 업로드 1행 invalid → 전체 실패 | `bridge/admin-03:122 (R7)`, BE §5-H,§5-O | 실패 row 분리 |
| admin/03 | PUT/DELETE `/pharmacies` hard vs soft 의미 불일치 | `bridge/admin-03:123 (R8)`, BE §5-I | hard 제거 |
| admin/03 | `createPartner` `IllegalStateException` → 409 핸들러 미매핑 | `bridge/admin-03:124 (R9)`, BE §5-B | `ConflictException` |
| admin/03 | Sort + JPQL ORDER BY 이중 정렬 | `bridge/admin-03:125 (R10)`, BE §5-M | 한쪽 통일 |
| admin/04 | Excel 현재 페이지만 덤프 + 헤더 영문 | `bridge/admin-04:91 (R3)`, BE §5-E,§5-F | 전량 EP 또는 size 가드 |
| admin/04 | `ORDER BY p.id DESC` 가 Pageable Sort 무시 | `bridge/admin-04:92 (R4)`, BE 5-D | Sort 적용 |
| admin/04 | PATCH 시 이전 s3_file 정리 안 됨 | `bridge/admin-04:93 (R5)`, BE 5-M | cleanup |
| admin/04 | `apply()` 중복 신청 `IllegalStateException` → 500 | `bridge/admin-04:94 (R6)`, BE 5-I | 409 매핑 |

### admin/05~12
| 메뉴 | 항목 | 근거 | 액션 |
|------|------|------|------|
| admin/05 | PP 누락 처방 소실 — INNER JOIN | `bridge/admin-05:98 (R2)`, BE 5-A | LEFT JOIN |
| admin/06 | `SettlementMemberMonthlyRepository.search` 상관 서브쿼리 2개 (페이지당 2N) | `bridge/admin-06:98 (#3 N+1)`, `03-repositories.md:128` | LEFT JOIN + GROUP BY |
| admin/06 | `SettlementPartner`/`SettlementPartnerProduct` BaseEntity 미상속 | `bridge/admin-06:100`, `04-domain.md:184,312` | BaseEntity 상속 |
| admin/06 | 부가세 역산 정수 truncation 누계 오차 | `bridge/admin-06:102`, `02-services.md:419` | BigDecimal |
| admin/07 | 날짜 분기 4중복 JPQL | `bridge/admin-07:102 (R3)`, BE 5-B | 동적 JPQL/QueryDSL |
| admin/07 | MULTI 날짜 필터 비대칭 | `bridge/admin-07:103 (R4)`, BE 5-G,5-H | 일관된 컬럼 |
| admin/07 | PartnerContract LEFT JOIN row 폭증 + Page.totalElements 왜곡 | `bridge/admin-07:104 (R5)`, BE 5-D | DISTINCT 또는 서브쿼리 |
| admin/07 | ZIP 다운로드 두 EP 동작 불일치 (500 vs 204) | `bridge/admin-07:105 (R6)`, BE 5-K | 통일 |
| admin/08 | `filterDeleted/filterBlind` 서비스 계층 반전 | `bridge/admin-08:109 (5-B)` | 일관화 |
| admin/08 | `getBoardDetails` 댓글/신고 트리 전량 반환 | `bridge/admin-08:110 (5-D)` | 페이징 |
| admin/08 | 상세 1회당 큐 enqueue + 직접 호출 → 조회수 2배 | `bridge/admin-08:111 (5-E)` | 한쪽 통합 |
| admin/08 | `findBlindPosts` 신고 N건 row 부풀림 | `bridge/admin-08:112 (5-G)` | array_agg |
| admin/08 | `unblindPost` null/값 보호 없음, 이름은 unblind 지만 toggle | `bridge/admin-08:113 (5-H/I)` | `require()` + idempotent |
| admin/08 | `board_comment.content varchar(255)`, `report.post_id/comment_id` XOR 미강제 | `bridge/admin-08:114 (5-K/L)` | TEXT ALTER + CHECK |
| admin/08 | `GET /v1/boards`, `/v1/boards/{id}` `@RequiredRole` 없음 → 일반 USER 노출 | `bridge/admin-08:115 (5-M/N)` | `COMMUNITY_MANAGEMENT` 추가 |
| admin/08 | `findBlindPosts` 댓글측 `deleted=false` 미필터 | `bridge/admin-08:116 (5-Q)` | 조건 추가 |
| admin/09 | event_board.title ↔ board_post.title 이중저장 | `bridge/admin-09:133 (5-K P2)` | event_board.title 제거 |
| admin/09 | 이벤트 soft delete 시 board_post 미동기 | `bridge/admin-09:134 (5-O P2)` | 동기 |
| admin/09 | 삭제된 이벤트 상세 열람 가능 + 조회수 증가 | `bridge/admin-09:135 (5-L P2)` | findActivateById |
| admin/10 | `getAllDrugCompanies` 권한 매핑 부정합 | `bridge/admin-10:99 (P2)` | 권한 조정 |
| admin/10 | FAQ/INQUIRY 쓰기 RBAC 부재 | `bridge/admin-10:100 (P2)` | 가드 추가 |
| admin/10 | INQUIRY 목록 N+1 — 페이지당 20회 추가 호출 | `bridge/admin-10:103 (P2)` | DTO 보강 |
| admin/10 | `QNA_ANSWERED` 푸시 멱등성 결여 | `bridge/admin-10:104 (P2)`, BE 5-K | notification_log 멱등 |
| admin/10 | 답변 cascade 분실 — 복구 UI 없음 | `bridge/admin-10:105 (P2)` | 복구 EP 또는 audit |
| admin/10 | PartnerContract 404→500 매핑 | `bridge/admin-10:106 (P2)`, BE 5-H | notFound |
| admin/10 | 에디터 업로드 RBAC 부재 + S3 orphan | `bridge/admin-10:107 (P2)`, BE 5-G | 인증 + 클린업 |
| admin/11 | 게시기간 필터 "완전 포함" → "기간 중 하루라도 노출" 못 잡음 | `bridge/admin-11:70`, BE 5-C | overlap |
| admin/11 | `updateBanner` 시 이전 banner_file/s3_file soft delete 미수행 (id=3 6장 누적) | `bridge/admin-11:71`, BE 5-D | banner_file.deleted + 패턴 |
| admin/11 | `status=VISIBLE` 인데 `end_at` 과거 — 만료 자동 전환 없음 | `bridge/admin-11:72`, BE 5-G | 스케줄러 |
| admin/12 | `signupByAdmin` `status` 필드 무시 | `bridge/admin-12:86 (R5 P2)` | 서비스 + DTO 보강 |
| admin/12 | roles 파라미터 3-way 분기 버그 | `bridge/admin-12:87 (R6 P2)` | 입력 보존 |
| admin/12 | `getAdminPermissions` role 검증 누락 | `bridge/admin-12:88 (R7 P2)` | 쿼리 + 404 |
| admin/12 | `findByUserId` soft-delete 미필터 | `bridge/admin-12:89 (R8 P2)` | findActivate |

### user/01·04·05·06·07·08·10·11
| 메뉴 | 항목 | 근거 | 액션 |
|------|------|------|------|
| user/01 | 쿠키 `Secure=false` 하드코딩 + SameSite 미지정 + CSRF disabled | `bridge/user-01:112 (RISK-07 Med)` | 운영 동적 설정 |
| user/01 | BCrypt strength=10 | `bridge/user-01:114 (RISK-10 Med)` | 12+ |
| user/01 | userId 비교 case-sensitive | `bridge/user-01:115 (5-B Med)` | `LOWER` |
| user/01 | sanitizePhoneNumber 미적용 | `bridge/user-01:116 (5-C/G Med)` | sanitize |
| user/01 | signup 중복 → 500 + 평문 메시지 | `bridge/user-01:117 (5-D Med)` | ProblemDetails |
| user/01 | `verifyCodeForFindId` Exception swallow → 항상 200+null | `bridge/user-01:119 (5-F Med)` | 명시 분기 |
| user/01 | Caffeine 단일 인스턴스 가정 | `bridge/user-01:120 (5-I Med)` | sticky 또는 Redis |
| user/01 | active 회원 phoneNumber 중복 (`01010002000` id=8/33) | `bridge/user-01:121 (5-J Med)` | dedup + 정렬 |
| user/04 | 신규 30개 vs 수정 1..5개 한도 불일치 | `bridge/user-04:94 (R3 Med)` | 한도 통일 |
| user/04 | `updatePrescriptionWithFiles` 상태 미검증 — COMPLETED 도 수정 가능 | `bridge/user-04:95 (R4 Med)` | 상태 가드 |
| user/04 | `dealer.member_id` NULL 시 신규 EDI 등록 실패 | `bridge/user-04:96 (R5 Med)` | LEFT JOIN |
| user/04 | `softDeletePartner` 가 부모 `prescription.status` 재계산 안 함 | `bridge/user-04:97 (R6 Med)` | 재계산 |
| user/05 | 상관 서브쿼리 N×2 | `bridge/user-05:84 (P2)` | LEFT JOIN + GROUP BY |
| user/05 | `Pageable.unpaged()` OOM | `bridge/user-05:85 (P2)` | DB 집계 |
| user/05 | `settlement_month` 인덱스 부재 | `bridge/user-05:86 (P2)` | INDEX |
| user/06 | 신고 UNIQUE 부재 | `bridge/user-06:113 (MED-1)` | UNIQUE |
| user/06 | `findAllFixedTopNotices` MemberBlock 필터 누락 | `bridge/user-06:114 (MED-2)` | NOT EXISTS |
| user/06 | 조회수 이중 발사 | `bridge/user-06:115 (MED-3)` | 한쪽 통일 |
| user/06 | `comment_count` 드리프트 1건 + 재집계 배치 부재 | `bridge/user-06:116 (MED-4)` | `@Scheduled` |
| user/07 | `IllegalStateException("Already applied")` + UNIQUE 위반 → 500 | `bridge/user-07:80 (R4)` | 409 |
| user/07 | 조회수 부풀림 | `bridge/user-07:81 (R5)` | 정책 재확인 |
| user/08 | UPCOMING → FINISHED 라벨 | `bridge/user-08:80 (R5 P2)` | enum 추가 + JPQL CASE |
| user/08 | `event_board.title` ↔ `board_post.title` drift | `bridge/user-08:81 (R6 P2)` | event_board.title 제거 |
| user/08 | BLOCKED → 500 (`AccessDeniedException` 미위임) | `bridge/user-08:82 (R7 P2)` | ExceptionTranslator |
| user/09 | `getFixedTopNotices` MemberBlock 누락 + NOTICE fixed_top 0건 | `bridge/user-09:100 (MEDIUM)` | 향후 NOTICE 운영 시 픽스 |
| user/09 | `editorFileIds` 중복 INSERT (P1-30 동일 코드 경로) | `bridge/user-09:101 (MEDIUM)` | P1-30 와 동시 |
| user/09 | `createBoardPost` `@Transactional` 미선언 | `bridge/user-09:102 (MEDIUM)` | 명시 |
| user/10 | 마케팅 동의 시각 소실 (실DB 24%) — `agreedAt` null 덮임 | `bridge/user-10:107 (§5-E)` | 변경 추적 |
| user/10 | `getPushPreferences` 동시 INSERT 경쟁 — UNIQUE 위반 | `bridge/user-10:110 (§5-M)` | ON CONFLICT DO NOTHING |
| user/10 | KMC PENDING 세션 356건 누적 — cleanup 부재 | `bridge/user-10:111 (§5-K)` | cutoff 배치 |
| user/11 | `IllegalStateException` 500 + 이메일/계약 트랜잭션 비대칭 | `bridge/user-11:83 (R5)` | 409 + AFTER_COMMIT |
| user/11 | CSO_CERTIFICATE s3_file 공유 결합 | `bridge/user-11:84 (R6)` | ref-count 또는 스냅샷 |
| user/11 | 서버 측 입력 검증 부재 (businessNumber/accountNumber/bankName) | `bridge/user-11:87 (R9)` | `@Pattern` + enum + 길이 |
| user/11 | 사용자 self-cancel 엔드포인트 부재 | `bridge/user-11:88 (R10)` | EP 신설 |

---

## 4. P3 — 백로그 (중기)

P3 카운트: 약 57건. 상위 5건만 별도.

| # | 메뉴 | 항목 | 근거 |
|---|------|------|------|
| P3-1 | admin/12 | 관리자 목록 권한 범주 부정합 (`MEMBER_MANAGEMENT` vs `PERMISSION_MANAGEMENT`) | `bridge/admin-12:90 (R9 P3)` |
| P3-2 | admin/12 | 권한 변경 감사 로그 부재 (`admin_permission_audit` 신설 권장) | `bridge/admin-12:91 (R10 P3)` |
| P3-3 | admin/12 | 권한 캐시 무효화 미호출 — `MEMBER_ROLE_CACHE` 10분 TTL | `bridge/admin-12:92 (R11 P3)` |
| P3-4 | admin/09 | 썸네일/이벤트 트랜잭션 부분 실패 시 S3 orphan (5-N + 5-M) | `bridge/admin-09:136-137`, BE §5-M,N |
| P3-5 | admin/09 | EventStatus.UPCOMING 분기 없음 + UTC 기준 KST 어긋남 | `bridge/admin-09:138 (5-J·5-I)` |

> 그 외 P3 (약 52건): admin/12 R12 (signupByAdmin 하드코딩), admin/09 5-D/5-B/5-P/5-R, user/05 P3 4종 (raw LIKE / Pageable.unpaged 외), user/08 R8 (조회수 부풀림), 각 메뉴 BaseEntity 미상속/Enum drift 잔여 등. 자세한 행은 각 bridge §5 의 P3/Low 행 참조.

---

## 5. P4 — 메모 (참고)

P4 카운트: 3건 (모두 admin/12). 데드 코드/메타 정합 — 운영 영향 없음, 정리 시점에 동시 처리.
- admin/12 R13 `AdminPermission.ALL` dead enum (`bridge/admin-12:94`)
- admin/12 R14 `system` 좀비 관리자 (`bridge/admin-12:95`)
- admin/12 R15 FE docs 엔드포인트 표 5건 전수 오류 — 자동생성 클라가 흡수 (`bridge/admin-12:96`)

---

## 6. 메뉴별 분포

> 등급은 bridge 본문 표기 우선. `*` 는 본문 미표기로 강도(High/CRIT→P1, Med→P2, Low→P3) 추정 매핑.

| 메뉴 | P0 | P1 | P2 | P3 | P4 | 총 | 비고 |
|------|---:|---:|---:|---:|---:|---:|------|
| admin/01 회원 관리 | 0 | 1 | 1 | 5* | 0 | 7 | bullet 형식 |
| admin/02 제품 관리 | 0 | 1 | 6* | 4* | 0 | 11 | R# 형식 |
| admin/03 거래처 관리 | 0 | 4 | 5 | 3* | 0 | 12 | 데이터 무결성 핫스팟 |
| admin/04 영업대행 상품 | 1 (R1) | 0 | 4* | 1* | 0 | 6 | |
| admin/05 처방 관리 | 1 (R1 Crit) | 1 | 1* | 3* | 0 | 6 | |
| admin/06 정산 관리 | 0 | 3 | 3 | 2* | 0 | 8 | RISK-1 + N+1 |
| admin/07 지출 보고서 | 0 | 2 | 4 | 6* | 0 | 12 | enum drift + 4중복 JPQL |
| admin/08 커뮤니티 관리 | 0 | 0 | 9 | 2* | 0 | 11 | 표 5-* 코드 |
| admin/09 콘텐츠 관리 | 1 (5-F) | 3 | 3 | 5 | 0 | 12 | P0 1건 명시 |
| admin/10 고객 지원 | 1 | 1 | 7 | 3* | 0 | 12 | bullet 형식 |
| admin/11 배너 관리 | 0 | 0 | 3 | 6* | 0 | 9 | RBAC P1 격상 후보 (5-A) |
| admin/12 관리자 권한 | 0 | 4 | 4 | 4 | 3 | 15 | 가장 많음 |
| user/01 인증 | 1 (RISK-08) | 4 | 7 | 4* | 0 | 16 | RISK-* + 5-* 혼합 |
| user/02 홈 | 0 | 1 | 4* | 3* | 0 | 8 | |
| user/03 제품 검색 | 0 | 1 | 5* | 2* | 0 | 8 | admin/02 동치 |
| user/04 처방 관리 | 0 | 2 | 4 | 4 | 0 | 10 | admin/05 동일 컨트롤러 |
| user/05 정산 | 2 (IDOR-1,2) | 3 | 3 | 4 | 0 | 12 | P0 2건 |
| user/06 커뮤니티 | 1 (CRIT-1) | 2 | 4 | 4 | 0 | 11 | |
| user/07 영업대행 상품 | 1 (R1) | 2 | 2 | 0 | 0 | 5 | admin/04 동치 |
| user/08 이벤트 | 2 (R1 R4) | 2 | 3 | 1 | 0 | 8 | admin/09 동치 |
| user/09 고객 지원 | 1 (CRIT) | 2 | 3 | 5* | 0 | 11 | DOCS 1건 별도 |
| user/10 마이페이지 | 1 (RISK-10/§5-T) | 8 | 3 | 1* | 0 | 13 | 자기 정보 변경 EP 핫스팟 |
| user/11 파트너 계약 | 1 (R1 CRIT) | 2 | 4 | 3* | 0 | 10 | admin/10 P0 동일 EP |
| **합계** | **8** | **34** | **41** | **57+** | **3** | **198** | |

---

## 7. 횡단 패턴 그룹화

### 7.1 @RequiredRole 미적용 (RBAC)
- **영향 메뉴 (16)**: admin/02, admin/03, admin/04, admin/05, admin/06, admin/07, admin/08, admin/09, admin/10, admin/11, admin/12, user/03, user/04, user/07, user/08, user/10.
- **관련 P0/P1**: P0-1, P0-10, P0-12, P0-13, P0-14, P1-2, P1-3, P1-9, P1-11, P1-13, P1-14, P1-17, P1-23, P1-24, P1-26, P1-38, P1-45.
- **권장**: 표준 권한 정책 도입. (a) Spring Security `@PreAuthorize` 전면, (b) 게이트웨이 통합 권한, (c) `@RequiredRole` 잔류 + 누락 컨트롤러 백필. ingest §0 Top5 #2/#3 (`/v1/hospitals/bulk-upsert`, Swagger/TestController) 와 동일 PR.

### 7.2 owner-scope 미강제 (IDOR)
- **영향 메뉴 (6)**: admin/10, user/04, user/05 (2건), user/06 (2건), user/09, user/11.
- **관련 P0/P1**: P0-2, P0-3, P0-6, P0-7, P0-8, P0-9, P1-25.
- **권장**: 모든 `{userId}` `{contractId}` `{settlementId}` PathVariable EP 에 ownership 헬퍼 (`AuthScopeUtil.userIdForQuery(loginUser)`) 강제. 컨트롤러 어드바이스로 `loginUser.userId == path.userId || isAdmin` 자동 검사.

### 7.3 BaseEntity 미상속
- **영향 메뉴 (5)**: admin/05 (4 테이블), admin/06 (2 테이블), admin/11 (banner_file), user/04 (prescription_edi_file), 플러스 ingest §3 §4 거래 테이블.
- **관련 P1/P2**: P1-7 (admin/05), P2 admin/06, user/04 R10 (P3).
- **권장**: 신규 거래/금융 테이블 BaseEntity 의무화. 기존 테이블 ALTER (`createdAt`/`modifiedAt`/`createdBy`/`modifiedBy`) — 분쟁/금액 변경 이력 추적 필수.

### 7.4 Enum drift
- **영향 메뉴 (5)**: admin/01 (`PartnerContractStatus`), admin/04 (`exposureRange`), admin/07 (`ExpenseReportStatus`), admin/11 (`BannerScope`), user/11 (`PartnerContractStatus` re-impact).
- **관련 P1/P2**: P1-12 (admin/07), admin/01 R3 (P2), admin/11 (P3), user/11 R7.
- **권장**: `/sync-api-docs` 재실행 + `/verify-frontend-contract` 정기화. backend.ts 자동생성 시 enum 추가 누락 alert.

### 7.5 인메모리 큐·캐시 분산 부정합
- **영향 메뉴 (4)**: user/01 (Caffeine 단일 인스턴스), user/02 (Caffeine 필드 인스턴스), user/06 (LinkedBlockingQueue cap 50,000), admin/08 (큐 초과 블로킹).
- **관련 P1/P2**: P1-23 (user/02 cache evict 권한), user/01 5-I (P2).
- **권장**: Redis 이관 또는 Spring Cache + `RedisCacheManager` 표준화. 멀티 인스턴스 배포 전 필수.

### 7.6 S3 누수
- **영향 메뉴 (6)**: admin/01 (CSO 반려), admin/04 (썸네일 교체), admin/07 (지출보고 첨부), admin/09 (이벤트 트랜잭션), admin/10 (에디터 업로드), admin/11 (배너 이미지 6장 누적).
- **관련 P2/P3**: admin/11 P2 5-D, admin/04 R5, admin/09 5-N (P3).
- **권장**: 정기 cleanup 잡 (orphan s3_file 탐지 + soft delete) 또는 트랜잭션 커밋 시 구 파일 동시 soft delete + CloudFront URL 무효화.

### 7.7 경로 drift
- **영향 메뉴 (8)**: admin/02 (excel-download), admin/05 (`/v1/prescription-partners`), admin/06 (4건), admin/08 (5건), admin/09 (5건), admin/10 (3건), admin/11 (PUT vs PATCH), user/05 (`/v1/settlements-member-monthly` 누락).
- **관련 P3**: 대부분 P3 (자동생성 클라가 런타임 흡수).
- **권장**: `/sync-api-docs` 재실행으로 일괄 보정. 외주사 인계 후 backend.ts 재생성 + FE docs 자동 갱신 파이프라인.

---

## 8. 처리 추적 가이드

- **Linear/GitHub Issue 라벨 권장**:
  - `severity:P0|P1|P2|P3|P4`
  - `pattern:rbac | idor | base-entity | enum-drift | infra-cache | s3-leak | path-drift | tx-missing`
  - `menu:admin-NN | user-NN`
  - `owner:backend | frontend | devops`
- **P0 통보 채널**: Slack `#incident` 또는 외주사 직통. P0-1 (`DELETE /v1/hospitals/all`) 은 게이트웨이 즉시 차단 → 외주사 픽스 머지 후 해제.
- **묶음 PR 권장**:
  1. **PR-A (RBAC 일괄)**: P0-1·10·12·13·14 + P1-2·3·9·11·13·14·17·23·24·26·38·45.
  2. **PR-B (IDOR 일괄)**: P0-2·3·6·7·8·9 + P1-25.
  3. **PR-C (인증/세션)**: P0-4·5 + P1-20·21·22·40·41·42·43·44·45.
  4. **PR-D (트랜잭션/N+1)**: P1-8·10·29·47.
- **재실행**: 분기말 `/ingest-medipanda-backend` 후 본 백로그 재추출, baseline diff.

---

## 9. 출처

- **Bridge 23개**: `reports/bridge/admin-{01..12}-fullstack.md`, `reports/bridge/user-{01..11}-fullstack.md`
- **Ingest summary**: `reports/ingest-medipanda-backend-20260427.md` (§0 보안 Top5 / §2 Phase 2 / §3 횡단 패턴 7개)
- **Phase 1**: `reports/backend-ingestion-20260427/{01-controllers, 02-services, 03-repositories, 04-domain, 05-security, 06-config}.md`

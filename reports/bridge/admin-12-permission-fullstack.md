# admin-12 관리자 권한 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`12_ADMIN_PERMISSION.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427/`) / 백엔드 docs(`12_ADMIN_PERMISSION.md`)

## 1. 화면 요약

- 메인 페이지(목록 → 등록/수정 2단)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/permission/MpAdminAdminList.tsx` — 관리자 목록 (`/admin/admins`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/permission/MpAdminAdminEdit.tsx` — 등록 (`/admin/admins/new`) / 수정 (`/admin/admins/:userId/edit`)
- 권한: `AdminPermission.PERMISSION_MANAGEMENT` — 단, 목록 API(2-1)는 `MEMBER_MANAGEMENT`로 가드되는 부정합 존재(§5-D)
- FE 가드: `isSuperAdmin(session)` — 수정 모드에서 SUPER_ADMIN이 아니면 `window.history.back()`. 등록은 모든 ADMIN 가능(FE docs `12_ADMIN_PERMISSION.md:88-110`).
- PK: 다른 메뉴와 달리 숫자 `id`가 아닌 문자열 `userId`로 식별(목록 row key, URL 파라미터 모두 `userId`).
- 핵심 사용자 액션
  1) `roles=[ADMIN, SUPER_ADMIN]` 필터로 관리자 5명 조회. 검색유형(name/userId/email/phoneNumber) + 키워드, 페이지네이션
  2) 등록: status 토글(장식, §5-G), name/userId/password(8자+confirm 일치)/email(정규식)/phoneNumber(실시간 포맷팅 → 저장 시 하이픈 제거)/permissions 체크박스
  3) 수정: `getMemberDetails` + `getPermissions` 2 API `Promise.all` 동시 로드. userId disabled, password 비우면 null로 전송(기존 유지), 권한 체크박스 토글(`splice/push` 후 `setValue`)
  4) 저장 시 항상 `permissions = [...checked, AdminPermission.PERMISSION_MANAGEMENT]` 자동 추가(자기 자신 권한관리 보장 의도, but §5-B 누출 위험)
  5) 서버 에러 분기: `switch(true)` + 정규식으로 `user id already exists` / `phone number \w+ already exists` 텍스트 매칭

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 (호출부) | Controller | Service | Repository | RBAC / 비고 |
|---|------|------|---------------------|------------|---------|------------|------|
| 1 | GET | `/v1/members?roles=ADMIN&roles=SUPER_ADMIN` | `getUserMembers` (`MpAdminAdminList.tsx:fetchContents`, FE docs `12_ADMIN_PERMISSION.md:228`) | `MemberController.getUserMembers` (`web/v1/MemberController.kt:48`, ingest `01-controllers.md:20`) | `MemberService.getUserMembers` (`service/MemberService.kt:44`, ingest `02-services.md:44`) | `MemberRepository.getUserMembers` (`MemberRepository.kt:17`, ingest `03-repositories.md:74`) | `ADMIN_ONLY + MEMBER_MANAGEMENT`. roles 보정 3-way 분기 버그(§5-C). FE docs는 `/v1/user-members`로 잘못 표기(BE docs 1-A) |
| 2 | GET | `/v1/members/{userId}/details` | `getMemberDetails` (`MpAdminAdminEdit.tsx:fetchDetail`) | `MemberController.getMemberDetails` (`web/v1/MemberController.kt:156`) | `MemberService.getMemberDetails` (`service/MemberService.kt:84`) | `MemberRepository.findByUserId` (`MemberRepository.kt:107`) | `ADMIN_OR_SELF + MEMBER_MANAGEMENT`. `findByUserId`는 `deleted` 미필터(§5-E). FE docs는 `/details` 누락 |
| 3 | GET | `/v1/members/admins/{userId}/permissions` | `getPermissions` (`MpAdminAdminEdit.tsx:fetchDetail`) | `MemberController.getPermissions:230` | `MemberService.getAdminPermissions:88` | `AdminPermissionMappingRepository.findAdminPermissionNamesByUserId` (`AdminPermissionMappingRepository.kt:19`, native, ingest `03-repositories.md:48`) | `ADMIN_ONLY + PERMISSION_MANAGEMENT`. role 검증 누락(§5-F). FE docs는 `/v1/permissions/{userId}` 오기 |
| 4 | POST | `/v1/members/admins` | `signupByAdmin` (`MpAdminAdminEdit.tsx:submitHandler`, isNew 분기) | `MemberController.signupByAdmin:242` | `MemberService.signupByAdmin:241` (`@Transactional`, ingest `02-services.md:51`) | `MemberRepository.existsByActiveUserId/existsByPhoneNumber/save` + `AdminPermissionMetaRepository.findAll` + `AdminPermissionMappingRepository.saveAll` | `ADMIN_ONLY + PERMISSION_MANAGEMENT`. `status` 무시(§5-G), role/memberType/birthDate/marketing 하드코딩(§5-H,I) |
| 5 | PATCH | `/v1/members/admins/{userId}` | `updateByAdmin` (`MpAdminAdminEdit.tsx:submitHandler`, !isNew 분기) | `MemberController.updateByAdmin:255` | `MemberService.updateByAdmin:210` (`@Transactional`, ingest `02-services.md:53`) | `MemberRepository.findActivateMemberByUserId` (`MemberRepository.kt:104`), `existsByActiveUserId`, `existsByPhoneNumber`, `save` + `AdminPermissionMappingRepository.findAllByMember/saveAll/deleteAll` | `ADMIN_ONLY + PERMISSION_MANAGEMENT` + `priority` 비교로 ADMIN→ADMIN 차단(§4). phoneNumber 자기제외 누락 → 폼 제출 시 항상 실패(§5-J P1). FE docs는 `PUT /v1/members/{userId}/by-admin`으로 메서드·경로 모두 오기 |

> ⚠️ FE docs(`12_ADMIN_PERMISSION.md:38-47`) 5건 엔드포인트 표 전부 실제 BE와 다름. OpenAPI 자동 클라이언트 호출은 정상 — 문서만 구식. (BE docs 5-A)

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|--------|------|------|------|
| `member` | 회원 마스터 (관리자 관점에서는 role 필터) | — | `role ∈ {USER, ADMIN, SUPER_ADMIN}` (`Role.kt:3`, ingest `04-domain.md:91`). `account_status ∈ {ACTIVATED, BLOCKED, DELETED}` (`04-domain.md:88`). `user_id`/`phone_number`/`referral_code` UNIQUE, `deleted` soft-delete |
| `admin_permission_meta` | `AdminPermission` enum seed 테이블 | — | 13행 시드(`MEMBER_MANAGEMENT`~`PERMISSION_MANAGEMENT` 12 + `ALL` 1, ingest `04-domain.md:124`). `permission` UNIQUE+CHECK. id=13 `ALL`은 매핑 0건 dead enum(§5-L). BaseEntity 비상속 → created/modifiedAt 없음(`04-domain.md:312`) |
| `admin_permission_mapping` | Member ↔ AdminPermissionMeta M:N 매핑 | `member_id` FK→member.id, `permission_meta_id` FK→admin_permission_meta.id | UNIQUE(`member_id`,`permission_meta_id`). BaseEntity 상속(created_at/modified_at 있으나 actor 컬럼 없음 — 권한변경 감사 공백 §5-N). 현재 36행 = 3 admins × 12 perms |

### 핵심 JOIN

```sql
-- 3-A. /v1/members/admins/{userId}/permissions (native, AdminPermissionMappingRepository.kt:11-19)
SELECT DISTINCT apm2.permission
FROM admin_permission_mapping apm
JOIN admin_permission_meta    apm2 ON apm.permission_meta_id = apm2.id
JOIN member                   m    ON apm.member_id = m.id
WHERE m.user_id  = :userId
  AND m.deleted  = false;
-- ⚠️ m.role IN ('ADMIN','SUPER_ADMIN') 필터 없음(§5-F): USER userId 호출도 200/[]

-- 3-B. /v1/members?roles=ADMIN&roles=SUPER_ADMIN (JPQL DTO projection, MemberRepository.kt:17-88)
SELECT m.id, m.user_id, m.name, ..., pc.company_name, m.role, m.account_status
FROM member m
LEFT JOIN partner_contract pc ON pc.member_id = m.id
WHERE m.role IN ('ADMIN','SUPER_ADMIN')
  AND m.deleted = false
ORDER BY m.id DESC LIMIT 50 OFFSET 0;
```

실데이터(BE docs 4-1): super(SUPER_ADMIN, perms=0 — aspect 우회), system(ADMIN, perms=0 — 좀비 §5-M), knmedicine1/keh9938/wkrud3529(ADMIN, 각 perms=12 — 전권). 권한 세분화는 사실상 미사용(§5-K).

## 4. 권한·트랜잭션

- **AOP 진입**: `@RequiredRole(mode, permission)` → `RoleCheckAspect` (`aspect/RoleCheckAspect.kt:43-64`, ingest `05-security.md:146-174`). Spring 표준 `@PreAuthorize` 미사용 — JWT 재파싱으로 역할 확인(이중화).
- **모드 분기**:
  - `ADMIN_ONLY`: 본인 요청(`isSelfRequest=true`)이면 `permissions.isEmpty()` 체크만 후 통과 — ADMIN이 본인 `/v1/members/admins/{자기-userId}`로 자기 계정 수정 가능. 그 외엔 `checkAdminAndHasHigherRoleThanTargetMember` (`:80`) 호출 → `requestRole.priority <= targetRole.priority`면 `UnauthorizedException`. ADMIN(200) ≤ ADMIN(200) → **차단**, SUPER_ADMIN(300) > ADMIN(200) → 허용. FE의 `isSuperAdmin` 가드는 이 BE 규칙의 미러.
  - `ADMIN_OR_SELF` (2-2): self-request면 `proceed()`. ⚠️ `targetUserId == null`(PathVariable 없음)인 경우 모든 사용자 통과(`RoleCheckAspect.kt:55-56`, ingest `05-security.md:166-174`) — `@RequiredRole` 어노테이션 모델 자체의 신뢰성 약점.
- **SUPER_ADMIN bypass**: aspect는 SUPER_ADMIN이면 모든 permission 검사 우회 → `super` 계정에 mapping 0건이어도 모든 화면 접근 가능. 반대로 `system`(ADMIN, mapping 0)은 모든 관리자 API 401.
- **트랜잭션**:
  - `signupByAdmin` `@Transactional REQUIRED`: userId/phone 중복 체크 → Member.save → `ensureDefaultPushPreference` → `ensureReferralCodeAssigned` → 닉네임 자동 할당 → `updateAdminPermission`. 단일 트랜잭션. `ensureReferralCodeAssigned`는 별도 `@Transactional`이지만 REQUIRED → 부모에 참여(ingest `02-services.md:394` 동일 위험).
  - `updateByAdmin` `@Transactional REQUIRED`: `findActivateMemberByUserId` → 중복 체크 → password BCrypt → dirty checking으로 컬럼별 UPDATE → `updateAdminPermission`(diff: `toAdd = incoming - existing`, `toDelete = existing - incoming`).
  - `updateAdminPermission`(`MemberService.kt:497-529`): null → no-op, emptySet → 전체 삭제, 그 외 → `saveAll` + `deleteAll`. delete 즉시 flush 안 되지만 `toAdd ∩ toDelete = ∅`라 unique 충돌 안 남(BE docs 5-O).
- **비밀번호**: `BCryptPasswordEncoder()` strength 기본(10, ingest `05-security.md:182-184`). password 갱신은 null 무시, 빈 문자열은 FE에서 null로 변환 후 전송.
- **캐시 무효화 누락**: `MemberService.update/updateByAdmin/softDeleteBy` 모두 `ACTIVE_AUTH_MEMBER_CACHE`/`MEMBER_ROLE_CACHE` 무효화 호출 없음(ingest `02-services.md:392`, `06-config.md:294`). 권한 박탈 직후에도 10분 TTL 동안 기존 권한으로 동작 가능.

## 5. 리스크 / 후속 액션

| ID | 심각도 | 근거 | 액션 |
|----|--------|------|------|
| R1 — `ADMIN_OR_SELF` 모드 로직 버그 | 🔴 P1 | `RoleCheckAspect.kt:55-56` (ingest `05-security.md:166-174`) — `targetUserId == null`이면 어떤 역할도 무조건 통과 | `@RequiredRole(ADMIN_OR_SELF)`+`{userId}` 없는 EP 전수 점검(BE 측). `targetUserId == null`이면 mode 무관 거부로 fail-safe 변경 |
| R2 — `@RequiredRole` 어노테이션 모델 신뢰성 | 🔴 P1 | ingest `05-security.md:153-164` — `ExpenseReportController/PrescriptionController/HospitalController/PartnerController/ReportController` 전무. `MemberController.kt:301` `password-for-find-account` 적용 누락 | 표준 `@PreAuthorize` 또는 게이트웨이 레이어 권한 정책으로 통합 검토. 누락 컨트롤러 백필 |
| R3 — `permissions` 자동 PERMISSION_MANAGEMENT 부여로 정보 누출 | 🔴 P1 | `MpAdminAdminEdit.tsx`의 `[...values.permissions, AdminPermission.PERMISSION_MANAGEMENT]` (FE docs `:591,605`) + 2-3 EP가 PERMISSION_MANAGEMENT만 요구 → 모든 ADMIN이 타 ADMIN의 권한 목록 조회 가능 (BE docs 5-B) | `getPermissions`를 SUPER_ADMIN-only 또는 `path.userId == requestUserId`만 허용으로 강화 |
| R4 — `updateByAdmin` phoneNumber 자기제외 누락 | 🔴 P1 | `MemberService.kt:214-218` (BE docs 5-J, 6-Z-6) — FE는 항상 phoneNumber 전송 → `existsByPhoneNumber`가 자기 자신 매치 → IllegalArgumentException → 폼 제출 매번 실패 가능 | `MemberService.update:291-295` 패턴(`newPhone != member.phoneNumber && existsBy...`) 이식 |
| R5 — `signupByAdmin` `status` 필드 무시 | 🟠 P2 | `MemberService.signupByAdmin:250-265` (BE docs 5-G, 6-Z-3) — FE Switch가 장식. accountStatus 항상 ACTIVATED. AdminUpdateRequest에 status 자체 없음 → 수정 경로로도 변경 불가 | DB UPDATE 없이 화면에서 비활성 등록 불가능. 서비스에 `accountStatus = if (status) ACTIVATED else BLOCKED` 추가 + AdminUpdateRequest에 status 추가 |
| R6 — roles 파라미터 3-way 분기 버그 | 🟠 P2 | `MemberService.kt:59-65` (BE docs 5-C) — `[SUPER_ADMIN]`만 보내면 USER 목록 반환. FE는 우연히 `[ADMIN, SUPER_ADMIN]` 쌍 전송으로 회피 | `roles?.takeIf { it.isNotEmpty() } ?: listOf(Role.USER)`로 입력 보존 |
| R7 — `getAdminPermissions` role 검증 누락 | 🟠 P2 | `AdminPermissionMappingRepository.kt:11-19` (BE docs 5-F) — USER userId로도 200/[] 응답 | repo 쿼리에 `m.role IN ('ADMIN','SUPER_ADMIN')` 추가 + 미존재/USER 시 404 |
| R8 — `findByUserId` soft-delete 미필터 | 🟠 P2 | `MemberRepository.kt:107`, `MemberService.getMemberDetails:84` (BE docs 5-E) — 탈퇴 관리자도 상세 조회됨. 현재 데이터 0건이라 미발현 | `findActivateMemberByUserId`로 전환 또는 `@Where(deleted = false)` 도입 |
| R9 — 관리자 목록 권한 범주 부정합 | 🟡 P3 | 2-1이 `MEMBER_MANAGEMENT`로 가드(BE docs 5-D) | `PERMISSION_MANAGEMENT`로 변경 검토 |
| R10 — 권한 변경 감사 로그 부재 | 🟡 P3 | `admin_permission_mapping`에 actor 컬럼 없음(BE docs 5-N) | `admin_permission_audit(actor_member_id, target_member_id, added[], removed[], at)` 신설 |
| R11 — 권한 캐시 무효화 미호출 | 🟡 P3 | ingest `02-services.md:392`, `06-config.md:294` — `MEMBER_ROLE_CACHE` 10분 TTL | `updateByAdmin`/`updateAdminPermission`에 `@CacheEvict` 추가 |
| R12 — `signupByAdmin` 하드코딩(role/memberType/birthDate/marketing) | 🟡 P3 | `MemberService.signupByAdmin:250-265` (BE docs 5-H, 5-I) — SUPER_ADMIN 승격 경로 없음, birth_date=오늘, marketing=true | role 파라미터화, birth_date nullable, marketing 기본 false |
| R13 — `AdminPermission.ALL` dead enum | 🟢 P4 | `04-domain.md:124`, BE docs 5-L — 매핑 0건, FE 노출 없음 | enum + meta seed 제거 검토 |
| R14 — `system` 좀비 관리자 | 🟢 P4 | BE docs 4-2, 5-M — ADMIN인데 mapping 0 → 모든 관리자 화면 401 | 삭제 / 최소권한 부여 / BLOCKED 전환 운영 결정 |
| R15 — FE docs 엔드포인트 표 5건 전수 오류 | 🟢 P4 | FE docs `12_ADMIN_PERMISSION.md:38-47` (BE docs 5-A) | 표 갱신 (실제 호출은 OpenAPI 자동 클라이언트라 영향 없음) |

## 6. 참조

- 프론트
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/permission/MpAdminAdminList.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/permission/MpAdminAdminEdit.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/12_ADMIN_PERMISSION.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/12_ADMIN_PERMISSION.md`
- 백엔드 ingest
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md:20,66,407` (MemberController 20EP, password EP RBAC 누락)
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/02-services.md:44,51,53,392,394` (MemberService 트랜잭션·캐시 무효화 누락)
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/03-repositories.md:15,48,74,138,161,174` (MemberRepository, AdminPermissionMappingRepository, soft-delete 패턴)
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/04-domain.md:27,77,78,88,91,124,141,312,326` (Member/AdminPermissionMeta/AdminPermissionMapping, Role/AccountStatus/AdminPermission enum, M:N)
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/05-security.md:15,146-174,182` (RBAC AOP 모델, ADMIN_OR_SELF 버그 §166, BCrypt strength)
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/06-config.md:120-122,290,294` (JWT/SSM 키, MemberSecurityCacheConfig 10분 TTL)
- 백엔드 코드(BE docs 인용)
  - `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/MemberController.kt:48,156,230,242,255`
  - `application/src/main/kotlin/kr/co/medipanda/portal/service/MemberService.kt:44,84,88,210,241,497`
  - `application/src/main/kotlin/kr/co/medipanda/portal/repo/postgresql/MemberRepository.kt:17,74,104,107,112,118`
  - `application/src/main/kotlin/kr/co/medipanda/portal/repo/postgresql/AdminPermissionMappingRepository.kt:19,21`
  - `application/src/main/kotlin/kr/co/medipanda/portal/aspect/RoleCheckAspect.kt:43-64,80`

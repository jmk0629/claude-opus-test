# admin-01 회원 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`01_MEMBER_MANAGEMENT.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427/`) / 백엔드 docs(`01_MEMBER_MANAGEMENT.md`)

## 1. 화면 요약

- 메인 페이지(목록 → 상세 2단)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminMemberList.tsx` — 회원 목록 (`/admin/members`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminMemberEdit.tsx` — 회원 상세/수정 (`/admin/members/:userId/edit`)
- 권한: `AdminPermission.MEMBER_MANAGEMENT` (계약 승인/종료는 `CONTRACT_MANAGEMENT`)
- 핵심 사용자 액션
  1) 6종 검색 필터(name/memberId/userId/phoneNumber/email/companyName) + 가입일 구간 + contractStatus 로 회원 목록 조회 (URL 파라미터 기반, 20건/페이지)
  2) Excel 전수 다운로드(`href` 직바인딩, `size=2^31-1` 그러나 백엔드는 `Pageable.unpaged()` 사용)
  3) 회원 상세 + 파트너 계약 상세를 `Promise.all` 로 동시 조회 (계약 없으면 404 → null 처리)
  4) 회원 정보 수정 (multipart, password/마케팅 동의/계정상태/관리자 메모 등)
  5) CSO 신고증 PDF 업로드 → 승인/반려 (`isApproved=true|false`)
  6) 파트너 계약 수정/승인/종료 (승인 시 dealer 자동 생성 + member.memberType 변경)
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/01_MEMBER_MANAGEMENT.md:32-46`, `:163-178`

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 (호출부) | Controller | Service | Repository | 비고 |
|---|------|------|---------------------|------------|---------|------------|------|
| 1 | GET | `/v1/members` | `getUserMembers` (`MpAdminMemberList.tsx:102`, frontend docs `01_MEMBER_MANAGEMENT.md:38`) | `MemberController.getUserMembers` (`web/v1/MemberController.kt:48`, ingest `01-controllers.md:20`) | `MemberService.getUserMembers` (`service/MemberService.kt:44`, ingest `02-services.md:44`) | `MemberRepository.getUserMembers` (`repo/postgresql/MemberRepository.kt:17`, ingest `03-repositories.md:74`) | 12개 옵션 필터 + LEFT JOIN PartnerContract + EXISTS(MemberFile CSO_CERT). DTO projection. ADMIN_ONLY+MEMBER_MANAGEMENT |
| 2 | GET | `/v1/members/excel-download` | `getDownloadUserMembersExcel` (URL 빌더, `MpAdminMemberList.tsx:129`) | `MemberController.downloadUserMembersExcel` (`web/v1/MemberController.kt:92`) | `MemberService.getUserMembers` + `ExcelExportUtil.fromPage` | (동일) `MemberRepository.getUserMembers` (Pageable.unpaged) | 2-1과 동일 SQL, `Pageable.unpaged()` → 프론트 `size=2^31-1` 무시됨 (백엔드 docs `01_MEMBER_MANAGEMENT.md:208-213`) |
| 3 | GET | `/v1/members/{userId}/details` | `getMemberDetails` (`MpAdminMemberEdit.tsx:fetchDetail`, frontend docs:38) | `MemberController.getMemberDetails` (`web/v1/MemberController.kt:156`) | `MemberService.getMemberDetails` (`service/MemberService.kt:84`) | `MemberRepository.findByUserId` (`MemberRepository.kt:107`) | soft-delete 회원도 조회. `toDetailsDto()` 안에서 `memberFiles` LAZY 접근 → N+1 (백엔드 docs 5-E) |
| 4 | PATCH | `/v1/members/{userId}` | `updateMember` (`MpAdminMemberEdit.tsx:submitHandler`, frontend docs:40) | `MemberController.updateMember` (`web/v1/MemberController.kt:183`) | `MemberService.update` (`service/MemberService.kt:278`, `@Transactional`) | `MemberRepository.findByUserId`, `existsByActiveUserId` (`:112`), `existsByPhoneNumber` (`:118`), `MemberFileRepository`(insert), `S3FileRepository` | multipart(`request` JSON + `file` PDF). 5-A 버그: 재활성화 시 `existsByPhoneNumber(userId)` 잘못된 인자 |
| 5 | PATCH | `/v1/members/{userId}/cso-approval` | `updateCsoApproval` (`MpAdminMemberEdit.tsx`, frontend docs:42) | `MemberController.approveOrRejectCso` (`web/v1/MemberController.kt:138`) | `MemberService.approveOrRejectCso` (`service/MemberService.kt:126,137`) | 승인: `MemberRepository.updateMemberTypeByUserId` (`:127` `@Modifying`); 반려: `MemberFileRepository.deleteByUserIdAndFileType` (`:13`) | `?isApproved=true` → memberType=CSO + `CSO_CERT_APPROVED` 푸시 / `false` → CSO_CERTIFICATE hard delete + `CSO_CERT_REJECTED` 푸시. s3_file 자체는 보존(고아 가능, 6-L 메모) |
| 6 | GET | `/v1/partner-contracts/{userId}` | `getContractDetails` (`MpAdminMemberEdit.tsx:fetchContractDetail`, frontend docs:39) | `PartnerContractController.getContractDetails` (`web/v1/PartnerContractController.kt:33`, ingest `01-controllers.md:143`) | `PartnerContractService.getContractDetails` (`service/PartnerContractService.kt:245`) | `MemberRepository.findActivateMemberByUserId` (`:104`), `PartnerContractRepository.findLatestByMemberId` (native, `:15`), `PartnerContractFileRepository.findActiveFilesByPartnerContractId` (`:11`) | `@RequiredRole` 미지정 (백엔드 docs 5-F) — 임의 userId 로 회사명·사업자번호·계좌 노출 가능 |
| 7 | POST | `/v1/partner-contracts/{contractId}/update` | `updateContract` (`MpAdminMemberEdit.tsx:submitHandler`, frontend docs:41) | `PartnerContractController.updateContract` (`PartnerContractController.kt:62`) | `PartnerContractService.updateContract` (`service/PartnerContractService.kt:172`, `@Transactional`) | `PartnerContractRepository.findById`(JpaRepository 기본), `S3FileRepository.findAllByMd5HashInAndDeletedFalse`, `PartnerContractFileRepository`(insert) | multipart. MD5 기반 파일 중복제거 + 중복 아니면 `S3FileUploadEvent` 발행 |
| 8 | POST | `/v1/partner-contracts/{contractId}/approve` | `approveContract` (`MpAdminMemberEdit.tsx`, frontend docs:43) | `PartnerContractController.approveContract` (`PartnerContractController.kt:94`) | `PartnerContractService.approveContract` (`service/PartnerContractService.kt:270`, `@Transactional`) | `PartnerContractRepository.findById`, `PartnerContractApprovalHistoryRepository.existsByMemberUserId` (파생, `:9`), `MemberRepository.updateMemberTypeByUserId`, `DealerRepository`(insert) | ADMIN_ONLY+CONTRACT_MANAGEMENT. 최초 승인 시 dealer row 자동 INSERT, 승인이력 적재, member.memberType ← INDIVIDUAL/ORGANIZATION, `PARTNER_APPROVED` 푸시 |
| 9 | POST | `/v1/partner-contracts/{contractId}/reject` | `rejectContract` (`MpAdminMemberEdit.tsx`, frontend docs:44) | `PartnerContractController.rejectContract` (`PartnerContractController.kt:104`) | `PartnerContractService.rejectAndCancelContract` (`service/PartnerContractService.kt:317`, `@Transactional`) | `PartnerContractRepository.findById`, `PartnerContractApprovalHistoryRepository.findTop1ByMemberUserIdOrderByCreatedAtDesc` (파생, `:10`), `MemberRepository.updateMemberTypeByUserId` | ADMIN_ONLY+CONTRACT_MANAGEMENT. 승인이력 있음→`CANCELLED`+memberType 롤백 / 없음→`REJECTED` |

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|--------|------|------|------|
| `member` | 회원 마스터 (USER/ADMIN/SUPER_ADMIN) | — | soft-delete(`deleted`), `nickname`/`user_id`/`referral_code` UNIQUE. `member_type` ∈ {NONE,CSO,INDIVIDUAL,ORGANIZATION}. `account_status` ∈ {ACTIVATED,BLOCKED,DELETED}. (`04-domain.md:27`, 백엔드 docs 3-1) |
| `partner_contract` | 파트너 계약 (회원당 1건) | `member_id` UNIQUE (`uk_cse96aw64p9q2m37nhr9hvkfk`) | `status` ∈ {PENDING,APPROVED,REJECTED,CANCELLED}. `contract_type` ∈ {INDIVIDUAL,ORGANIZATION}. (`04-domain.md:36`) |
| `partner_contract_file` | 계약 첨부 (4종) | `partner_contract_id`, `s3_file_id` | BUSINESS_REGISTRATION, SUBCONTRACT_AGREEMENT, CSO_CERTIFICATE, SALES_EDUCATION_CERT (`04-domain.md:38`, 도메인 enum `04-domain.md:99`) |
| `partner_contract_approval_history` | 승인 감사 이력 | `partner_contract_id`, `member_id` | `approved_member_type` 컬럼이 거절/취소 시 롤백 타겟 (`04-domain.md:37`) |
| `member_file` | 회원 업로드 파일 (CSO 등) | `member_id`, `s3_file_id` | CASCADE.ALL + orphanRemoval (Member Aggregate 멤버, `04-domain.md:138,238`) |
| `member_device` | FCM 디바이스 토큰 | `member_id` | CSO/PARTNER 푸시 수신자 결정에 사용 (`04-domain.md:30,144`) |
| `member_block` | 회원 차단 | `member_id`, `blocked_member_id` (2 FK) | (`04-domain.md:29,142-143`) — 본 메뉴에서 직접 호출 X, 도메인 정의만 |
| `member_push_preference` | 푸시 카테고리 on/off | `member_id` 1:1 | (`04-domain.md:31,139`) |
| `s3_file` | S3 파일 메타 (cloudfront URL, MD5) | — | `deleted` 플래그로 soft-delete 표현. `S3FileUploadListener` (`06-config.md:275`)가 비동기 업로드 처리 |
| `dealer` | 파트너 승인 시 자동 생성되는 딜러 | `owner_member_id`, `member_id` (2 FK) | 최초 승인 시에만 INSERT (`04-domain.md:32,150-151`) |

### 핵심 JOIN (백엔드 docs `01_MEMBER_MANAGEMENT.md:104-122` 인용)

```sql
SELECT new MemberResponse(m.id, m.userId, m.name, ..., pc.companyName, ...)
FROM Member m
LEFT JOIN PartnerContract pc ON pc.member.id = m.id
WHERE m.role IN :roles
  AND (:filterDeleted IS NULL OR (:filterDeleted = true AND m.deleted = false) OR (:filterDeleted = false))
  AND (:memberId IS NULL OR m.id = :memberId)
  AND (:userId IS NULL OR LOWER(m.userId) LIKE LOWER(CONCAT('%', :userId, '%')))
  ...
  AND (
       :contractStatus IS NULL
    OR (:contractStatus = 'NON_CONTRACT' AND m.memberType IN (NONE, CSO))
    OR (:contractStatus = 'CONTRACT'     AND m.memberType NOT IN (NONE, CSO))
  )
  AND (:startAt IS NULL OR to_char(m.createdAt,'yyyyMMdd') >= CAST(:startAt AS string))
  AND (:endAt   IS NULL OR to_char(m.createdAt,'yyyyMMdd') <= CAST(:endAt   AS string))
```

```sql
-- 상세 응답 csoCertUrl 산출 서브쿼리 (백엔드 docs:286-292)
SELECT (SELECT s.cloudfront_url
          FROM member_file mf
          JOIN s3_file s ON s.id = mf.s3_file_id
         WHERE mf.member_id = m.id
           AND mf.file_type = 'CSO_CERTIFICATE'
           AND s.deleted = false
         LIMIT 1) AS cso_cert_url
FROM member m WHERE m.user_id = :userId;
```

## 4. 권한·트랜잭션

- 권한 (`05-security.md:155,158`)
  - `MemberController` — `MEMBER_MANAGEMENT` + 모드 혼합 (목록/엑셀/CSO 승인 = `ADMIN_ONLY`, 상세/수정 = `ADMIN_OR_SELF`). 백엔드 docs:24-34 표
  - `PartnerContractController.approve/reject` — `ADMIN_ONLY` + `CONTRACT_MANAGEMENT`
  - `PartnerContractController.getContractDetails / updateContract` — `@RequiredRole` 미지정 (`05-security.md:158`, 백엔드 docs 5-F) → 리스크 R2
  - `ADMIN_OR_SELF` 모드는 `targetUserId == null` 일 때 무조건 통과하는 분기 의심 (`05-security.md:166-174`)
- 트랜잭션
  - `MemberService.update` `@Transactional`: 전화번호 중복 검증 + S3 업로드 이벤트 + 마케팅 false→true 전이 시점 기록까지 한 트랜잭션
  - `PartnerContractService.approveContract` `@Transactional`: `dealer INSERT` + `partner_contract.status=APPROVED` + `partner_contract_approval_history INSERT` + `member.memberType` UPDATE + `PARTNER_APPROVED` 푸시 (백엔드 docs 2-8)
  - `PartnerContractService.rejectAndCancelContract` `@Transactional`: 승인 이력 유무에 따라 status 분기 + memberType 롤백
  - 푸시/S3 업로드는 `@TransactionalEventListener(AFTER_COMMIT)` 로 큐 투입 (`06-config.md:274-275`)
- 외부 연동 (`06-config.md`)
  - AWS S3(`medipanda` 버킷) — CSO PDF 및 계약 첨부 4종 저장. CloudFront URL 노출 (`06-config.md:107,168-173`)
  - GCP Firebase FCM — `CSO_CERT_SUBMITTED/APPROVED/REJECTED`, `PARTNER_APPROVED` 푸시 (`06-config.md:192,263,274`)

## 5. 리스크 / 후속 액션

- R1. 재활성화 시 전화번호 중복검증 버그 — `MemberService.update:286` 가 `existsByPhoneNumber(userId)` 호출 (인자 오기) → soft-delete 회원 복구 시 phoneNumber 충돌 검증 무력화 (백엔드 docs 5-A, ingest `03-repositories.md` 6-E). **TODO**: `request.phoneNumber` 로 수정 + 회귀 테스트
- R2. `GET /v1/partner-contracts/{userId}` 권한 미지정 — 인증만 통과하면 임의 회원의 회사명·사업자번호·계좌번호 열람 가능 (`05-security.md:158`, 백엔드 docs 5-F). **TODO**: `@RequiredRole(ADMIN_OR_SELF, MEMBER_MANAGEMENT)` 부착
- R3. 프론트↔백 enum 불일치 (`PartnerContractStatus`) — 프론트 `APPLIED/APPROVED/REJECTED` vs 백엔드 `PENDING/APPROVED/REJECTED/CANCELLED`. `CANCELLED` 가 프론트에 없음 (백엔드 docs 5-B). **TODO**: axios 인터셉터 변환 여부 확인 + 프론트 enum 보강
- R4. `MemberService.getMemberDetails` 가 `@Transactional` 없이 LAZY `memberFiles` 접근 → `OpenEntityManagerInViewFilter` 의존, 비활성 시 `LazyInitializationException` 위험 (백엔드 docs 5-E). **TODO**: 메서드에 `@Transactional(readOnly=true)` 추가 또는 `@EntityGraph`/JOIN FETCH
- R5. CSO 반려 시 `s3_file` 보존, 참조만 끊김 → S3 고아 파일 누적 (`MemberFileRepository.deleteByUserIdAndFileType`, 백엔드 docs 6-L). **TODO**: 정기 cleanup 잡 또는 같은 트랜잭션에서 `s3_file.deleted=true` 마킹
- R6. 목록 검색 LIKE 풀스캔 — 모든 텍스트 필터가 `%keyword%` 패턴이라 btree(`idx__member__lower_user_id`)가 prefix-only 한계. 현재 106행이라 체감 없음, 증가 시 `pg_trgm` GIN 인덱스 검토 (백엔드 docs 5-C, ingest 03-repositories.md:74)
- R7. `member_type=NONE + partner_contract.status=CANCELLED` 1건 잔존 — `rejectAndCancelContract` 로직(이력 있음→CANCELLED, 없음→REJECTED)과 어긋남. 이력 삭제 또는 레거시 데이터 의심 (백엔드 docs 5-G). **TODO**: `partner_contract_approval_history` 교차 쿼리(6-Z)로 진단

## 6. 참조

- 프론트
  - 페이지: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminMemberList.tsx`, `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminMemberEdit.tsx`
  - docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/01_MEMBER_MANAGEMENT.md`
  - 분석문서: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/analysis/01_MEMBER_ANALYSIS.md`
- 백엔드
  - 컨트롤러: `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/MemberController.kt`, `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/PartnerContractController.kt`
  - 서비스: `application/src/main/kotlin/kr/co/medipanda/portal/service/MemberService.kt`, `application/src/main/kotlin/kr/co/medipanda/portal/service/PartnerContractService.kt`
  - 리포지토리: `application/src/main/kotlin/kr/co/medipanda/portal/repo/postgresql/MemberRepository.kt`, `PartnerContractRepository.kt`, `PartnerContractFileRepository.kt`, `PartnerContractApprovalHistoryRepository.kt`, `MemberFileRepository.kt`
  - docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/01_MEMBER_MANAGEMENT.md`
- Ingest 산출물 (`/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/`)
  - `01-controllers.md` (MemberController :20, PartnerContractController :143)
  - `02-services.md` (MemberService :44, PartnerContractService :133)
  - `03-repositories.md` (MemberRepository :15, PartnerContractRepository :26, MemberFileRepository :46, PartnerContractFileRepository :57, PartnerContractApprovalHistoryRepository :56)
  - `04-domain.md` (Member :27, PartnerContract :36, 1:1 매핑 :140,156)
  - `05-security.md` (MemberController/PartnerContractController :155,158)
  - `06-config.md` (S3 :107,168 / FCM :192,263,274 / S3FileUploadListener :275)

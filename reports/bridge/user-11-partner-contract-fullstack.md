# user-11 파트너 계약 (사용자) — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`user/11_PARTNER_CONTRACT.md`) / 백엔드 docs(`user/11_PARTNER_CONTRACT.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427/`)

## 1. 화면 요약

- 페이지(1개, 단일 라우트 듀얼모드):
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/PartnerContract.tsx` — `/partner-contract`. `contractDetails` 상태 1개로 두 화면을 토글: `null → 신청 폼` / `non-null(PENDING|APPROVED) → 계약 현황(읽기전용)`. REJECTED·CANCELLED는 `setContractDetails` 호출하지 않아 신청 폼 유지(재신청 가능).
  - 동봉 모달: `BankSelectModal` — 은행 32 / 증권사 29 grid(150px×4열, flex-wrap). `!open → return null` 로 닫힘 시 `tab` state 초기화.
- 핵심 사용자 액션:
  1) 마운트/세션 변경 — `useEffect([session])` → `getContractDetails(session.userId)` 호출. PENDING/APPROVED만 현황 모드로 진입, REJECTED/CANCELLED·404 은 신청 폼 유지.
  2) 신청 — multipart 7-step submitHandler 검증(회사명/사업자번호/사업자등록증/은행/계좌/CSO신고증·교육이수증) 후 `applyContract({...})`. `isCsoApproved`(`session.partnerContractStatus === MemberType.CSO`)면 CSO 파일 검증 skip + `cso_certificate: undefined` 전송.
  3) 신청 완료 후 — `fetchContractDetails()` 재호출로 서버 최신 상태 반영(직접 `setContractDetails` 안 함).
- 화면 단서: 사업자번호 `normalizeBusinessNumber(value, prevValue)` 인라인 자동 포맷, S3 URL은 `extractFileName(url)` 로 `UUID_원본.pdf` → `원본.pdf` 복원, PENDING 계약일은 `color: red !important` + `-webkit-text-fill-color` 로 MUI disabled 회색 override.
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/11_PARTNER_CONTRACT.md:22-51, 79-99, 130-160, 196-225, 240-258, 283-330, 459-470`

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 이 화면이 호출하는 EP는 5개 중 **2개(GET, POST)** 뿐. 수정·승인·거절 3개는 admin 측에서만 호출(admin/03 거래처관리 부속) — `reports/bridge/admin-03-partner-fullstack.md:47-57` 참조.

| # | HTTP | Path | 프론트 함수 (`backend.ts`) | Controller | Service | Repository | 비고 (출처) |
|---|------|------|---------------------------|-----------|---------|------------|-----|
| 1 | GET | `/v1/partner-contracts/{userId}` | `getContractDetails` | `PartnerContractController#getContractDetails:31` (`01-controllers.md:139-143`) | `PartnerContractService#getContractDetails:245-268` (`02-services.md:131-146`) | `MemberRepository#findActivateMemberByUserId`, `PartnerContractRepository#findLatestByMemberId`(native, `03-repositories.md:94`), `PartnerContractFileRepository#findActiveFilesByPartnerContractId` (`03-repositories.md:57`) | `@RequiredRole`/`@AuthenticationPrincipal` **둘 다 없음** → IDOR(R1, 백엔드 docs §5-A). `fileUrls`는 `PartnerContractFileType.entries.associateWith { … cloudfrontUrl }` 로 4타입 모두 키 포함, 미제출은 `null`. native `ORDER BY contract_date DESC` 는 unique(member_id) 때문에 dead code(R3, §5-B) |
| 2 | POST (multipart) | `/v1/partner-contracts` | `applyContract` | `PartnerContractController#applyContract:39-60` (`01-controllers.md:144`) | `PartnerContractService#applyContract:39-145` `@Transactional` (`02-services.md:140`) | `MemberRepository#findActivateMemberByUserId`, `PartnerContractRepository#findLatestByMemberId`/`save`, `MemberFileRepository#findTopByMemberIdAndFileTypeOrderByIdDesc`(CSO s3 재사용), `S3FileRepository#save`, `PartnerContractFileRepository#save` | 로그인 필요(`loginUser.userId`). PENDING/APPROVED 면 `IllegalStateException` → 500 매핑 누락(R5, §5-Q). REJECTED/CANCELLED 면 row 재사용 + `status=PENDING` 재오픈(`02-services.md:143`, 비즈니스 규칙 5번 `02-services.md:411`). 기존 `partner_contract_file` **정리 안 함** → stale 누적(R2, §5-E·§5-K). `S3FileUploadEvent`(AFTER_COMMIT, `06-config.md:275`) + `EmailEventPublisher.PARTNER_REQUESTED`(즉시 큐, 롤백 미반영, §5-O) |
| — | POST (multipart) | `/v1/partner-contracts/{contractId}/update` | (사용자 미호출) | `:62-88` | `updateContract:172-243` | 동상 + `S3FileRepository#findAllByMd5HashInAndDeletedFalse`(MD5 전역, §5-L) | **가드 없음 IDOR(CRITICAL, §5-D)** — admin/03 매트릭스에 동거(`admin-03-partner-fullstack.md:55`). 사용자 화면 노출은 없으나 API 노출 |
| — | POST | `/v1/partner-contracts/{contractId}/approve` | (admin) | `:90` `ADMIN_ONLY/CONTRACT_MANAGEMENT` (`05-security.md:158`) | `approveContract:270-315` | `PartnerContractApprovalHistoryRepository#existsByMemberUserId`(`03-repositories.md:56`), `DealerRepository.save`, `MemberRepository.save` | `Dealer` 신규 생성은 **첫 승인일 때만**(R4, §5-F). 재승인 시 dealer 계좌/은행 동기화 누락. `NotificationPushEvent(PARTNER_APPROVED)` AFTER_COMMIT |
| — | POST | `/v1/partner-contracts/{contractId}/reject` | (admin) | `:104` `ADMIN_ONLY/CONTRACT_MANAGEMENT` | `rejectAndCancelContract:317-336` | `PartnerContractApprovalHistoryRepository#findTop1ByMemberUserIdOrderByCreatedAtDesc`, `MemberRepository.save` | 이력 있으면 CANCELLED + `member.memberType ← approvedMemberType` 복원, 없으면 REJECTED. **dealer 비활성화 안 함**(§5-G) |

## 3. DB 테이블

- 핵심 3개 + 참조 2개 (Aggregate 4: PartnerContract — `04-domain.md:252-255`):
  - `partner_contract` (75 rows) — `member_id BIGINT NOT NULL UNIQUE` (`uk_cse96aw64p9q2m37nhr9hvkfk`, 회원당 1계약, R3). `contract_type CHECK(INDIVIDUAL|ORGANIZATION)`, `status CHECK(PENDING|APPROVED|REJECTED|CANCELLED)`, `contract_date TIMESTAMP`. `BaseEntity` 상속(`04-domain.md:180`).
  - `partner_contract_file` (228 rows) — `(partner_contract_id, file_type)` UNIQUE **부재**(R2, §5-E·§5-K). `file_type CHECK(BUSINESS_REGISTRATION|SUBCONTRACT_AGREEMENT|CSO_CERTIFICATE|SALES_EDUCATION_CERT)`. `s3File` 관계 EAGER(`04-domain.md:158, 396, 407`).
  - `partner_contract_approval_history` (78 rows) — 승인 cycle 누적용. `approved_by varchar(64)`(admin userId), `approved_member_type varchar(32)`(승인 직전 memberType, CANCELLED 복원용).
  - `member` — `member.memberType` 이 승인/거절·CSO 계약 분기의 핵심(비즈니스 규칙 1번, `02-services.md:403`). `memberType=CSO`이면 CSO 신고증 재첨부 불필요.
  - `s3_file` — `cloudfront_url` = `fileUrls.{TYPE}` 응답값. CSO 신고증은 `member_file` 의 동일 `s3_file_id` 를 **공유**(R6, §5-C).

핵심 JOIN(상세 조회 = `getContractDetails` JPQL→Postgres):

```sql
-- equivalent to: GET /v1/partner-contracts/{userId}
WITH m AS (
  SELECT id FROM member
   WHERE user_id = $1 AND deleted = false                          -- findActivateMemberByUserId
)
SELECT pc.*
  FROM partner_contract pc
 WHERE pc.member_id = (SELECT id FROM m)
 ORDER BY pc.contract_date DESC, pc.id DESC                         -- native(dead, unique 보장)
 LIMIT 1;

-- 그 후
SELECT pcf.*, s3.cloudfront_url
  FROM partner_contract_file pcf
  JOIN s3_file s3 ON s3.id = pcf.s3_file_id                         -- EAGER
 WHERE pcf.partner_contract_id = $contractId
   AND s3.deleted = false;                                          -- findActiveFilesByPartnerContractId
-- 응답에서 PartnerContractFileType.entries 로 4타입 fix, 미제출은 null
```

## 4. 권한·트랜잭션 (admin/03 과의 차이)

- **이 화면의 시점 = 신청자(applicant)**. user-11 은 `getContractDetails`(자기 자신) + `applyContract`(신청 1회) 만 호출. 승인/거절/수정은 admin 권한 화면(`reports/bridge/admin-03-partner-fullstack.md` §2-B 14~18) 의 책임.
- 권한 매트릭스(`05-security.md:158`):
  - `GET /{userId}`, `POST /` (신청), `POST /{id}/update` — **JWT만 요구, `@RequiredRole` 없음**. 본인 검증조차 없음 → IDOR 2개(§5-A 조회, §5-D 수정).
  - `POST /{id}/approve`, `POST /{id}/reject` — `ADMIN_ONLY` + `CONTRACT_MANAGEMENT`. admin/03 화면이 단독 호출.
- 트랜잭션 경계:
  - `applyContract` `@Transactional` 단일 — member 조회 → contract upsert → 이메일 enqueue → 파일별 (S3File save + PartnerContractFile save + S3FileUploadEvent) 반복.
  - `S3FileUploadEvent` 는 `@TransactionalEventListener(AFTER_COMMIT)`(`06-config.md:172, 275`)로 트랜잭션 커밋 후 코루틴 비동기 업로드. 롤백 시 S3 PUT 미발생(안전).
  - `EmailEventPublisher.enqueue(PARTNER_REQUESTED)` 는 즉시 인메모리 큐 enqueue → **계약 저장 롤백 시 이메일만 발송될 수 있음**(R5, §5-O).
- admin/03 거래처 관리와의 권한 차이 요약:
  - admin/03 의 `PartnerService.updatePartner` / `uploadExcel` 가 **PartnerContract row 존재**를 강제로 의존(`admin-03-partner-fullstack.md:36, 40, 47-49`). 즉 user-11 에서 신청·승인되지 않으면 admin/03 의 동작이 NPE 위험을 안음(§5-C of admin/03).
  - 즉 user-11 = **state producer**(신청자 권한, 본인 1계약 생성), admin/03·승인 EP = **state consumer/transitioner**(승인자 권한, status·dealer·memberType 변경).
- 참고: 사용자가 PENDING 계약을 직접 취소할 엔드포인트가 **없음**(§5-P) → 프론트 UX에서 "신청 후 취소 불가" 알림이 필요.

## 5. 리스크 / 후속 액션

- **R1 — `GET /{userId}` IDOR (CRITICAL)**: 다른 회원 `userId` 로 사업자번호·계좌번호·CSO 신고증 cloudfront URL 까지 그대로 반환. 출처: 백엔드 docs §5-A, `05-security.md:158`. 액션: `@RequiredRole(ADMIN_OR_SELF, CONTRACT_MANAGEMENT)` 추가 + 서비스 단에서 `loginUser.userId == path.userId || isAdmin` 검증.
- **R2 — 재신청 시 stale `partner_contract_file` 누적**: REJECTED/CANCELLED row 재사용하면서 기존 파일 정리/소프트삭제 없음, UNIQUE(contract_id, file_type) 부재. 실 DB 에 CANCELLED 1건 × 파일 3건 잔존. 출처: §5-E·§5-K, `04-domain.md:158`. 액션: 재신청 진입 시 기존 행 soft-delete + DDL 에 UNIQUE 추가.
- **R3 — `findLatestByMemberId` native + dead `ORDER BY`**: `uk_cse96aw64p9q2m37nhr9hvkfk UNIQUE(member_id)` 라 `ORDER BY ... LIMIT 1` 이 dead code. 동일 의도의 `findByMemberId` 가 이미 존재(`03-repositories.md:26`). 액션: native 제거 + `findByMemberId` 일원화.
- **R4 — 재승인 시 dealer 계좌/은행 동기화 누락**: `approveContract` 가 `existsByMemberUserId=true` 면 dealer 신규 생성 skip 만 하고 기존 dealer 의 `bankName/accountNumber` 갱신 안 함. CANCELLED → 다른 계좌로 재신청·재승인 시 정산 이체 오발송 위험. 출처: §5-F. 액션: 재승인 분기에 `dealer.bankName = contract.bankName; dealer.accountNumber = contract.accountNumber` 추가.
- **R5 — `IllegalStateException` 500 + 이메일/계약 트랜잭션 비대칭**: PENDING/APPROVED 재신청 차단이 `IllegalStateException` → 글로벌 매핑 없으면 500 (§5-Q). 동시에 `applyContract` 가 정상 진행 중에도 이메일 enqueue 가 트랜잭션 밖에서 동작(§5-O). 액션: `ResponseStatusException(CONFLICT)` 매핑 + EmailEventPublisher 도 AFTER_COMMIT.
- **R6 — CSO_CERTIFICATE s3_file 공유 결합**: `applyContract` 가 `member_file.CSO_CERTIFICATE` 의 `s3_file` 을 `partner_contract_file` 에 그대로 재사용(§5-C). member 가 CSO 신고증을 교체하면 계약쪽 cloudfront URL 이 깨질 수 있음. 액션: 사용처 ref-count 또는 partner_contract 시점 스냅샷 복제.
- **R7 — `PartnerContractStatus` enum drift 영향**: admin/01 R3(`reports/bridge/admin-01-member-fullstack.md` 참조)에서 지적된 `PartnerContractStatus` 의 프론트/백엔드 표기 drift 가 이 화면의 핵심 분기(`PENDING/APPROVED → 현황`, `REJECTED/CANCELLED → 신청폼`)와 직접 충돌. 백엔드가 새 상태를 추가하면 프론트는 default-case 가 없어 신청 폼 모드로 빠짐(REJECTED 처리와 동치). 액션: backend.ts enum 재생성 시 default-case alert 추가.
- **R8 — `SUBCONTRACT_AGREEMENT` dead enum**: `PartnerContractFileType` 4종 중 SUBCONTRACT_AGREEMENT 실 사용 0건(백엔드 docs §4-3, §5-R). 응답 `fileUrls` 에는 항상 키가 존재(value=null). 액션: 사용 계획 없으면 enum/Controller `@RequestPart(subcontract_agreement)` 제거.
- **R9 — 서버 측 입력 검증 부재**: businessNumber/accountNumber/bankName 정규식·whitelist 검증 없음(§5-N). 프론트 `normalizeBusinessNumber` 가 유일한 방어. 액션: `@Pattern(\\d{3}-\\d{2}-\\d{5})`, bankName enum, accountNumber 길이.
- **R10 — 사용자 self-cancel 엔드포인트 부재**: PENDING 신청 후 취소 = 고객센터 1:1 문의(§5-P). 액션: `POST /{contractId}/cancel` (self-only) 추가 + 프론트 "취소" 버튼.

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/11_PARTNER_CONTRACT.md`
- 프론트 컴포넌트: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/PartnerContract.tsx`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/user/11_PARTNER_CONTRACT.md`
- 백엔드 ingest:
  - `reports/backend-ingestion-20260427/01-controllers.md:24, 138-147` (PartnerContractController 5 EP)
  - `reports/backend-ingestion-20260427/02-services.md:131-146, 411` (PartnerContractService, 비즈니스 규칙 5번 — 재신청 차단)
  - `reports/backend-ingestion-20260427/03-repositories.md:26, 56-57, 94` (Repository 3종, native ORDER BY 핫스팟)
  - `reports/backend-ingestion-20260427/04-domain.md:36-38, 97-99, 140, 156-158, 252-255, 396, 407` (엔티티·EAGER·Aggregate 4·enum 정의)
  - `reports/backend-ingestion-20260427/05-security.md:158` (approve/reject 만 ADMIN_ONLY, 조회/수정은 가드 없음)
  - `reports/backend-ingestion-20260427/06-config.md:169-172, 275` (S3 medipanda 버킷, AFTER_COMMIT 업로드 리스너)
- 인접 풀스택 지도:
  - `reports/bridge/admin-03-partner-fullstack.md` (admin 거래처 관리 — PartnerContract 5 EP 동거 + approve/reject 호출자)
  - `reports/bridge/admin-01-member-fullstack.md` (PartnerContractStatus enum drift 발원지)
  - `reports/bridge/user-01-auth-fullstack.md` (`session.partnerContractStatus`, `MemberType.CSO` 의 출처)

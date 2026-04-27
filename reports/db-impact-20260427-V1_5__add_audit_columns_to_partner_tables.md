# /db-impact 리포트 — 2026-04-27 (V1_5__add_audit_columns_to_partner_tables)

> 입력 SQL: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/db-impact-fixtures/V1_5__add_audit_columns_to_partner_tables.sql`
> bridge 인덱스: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/` (23 메뉴 풀스택 지도)
> ingest 인덱스: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/`
> 생성: 2026-04-27 by /db-impact (migration-impact-analyzer 폴백)

## 0. 한 장 요약
- 영향 테이블 **3개** (`prescription_partner`, `partner_contract_file`, `banner_file`) / 영향 메뉴 **6개** (admin/05 처방, user/04 처방, user/02 홈, user/11 파트너 계약, admin/03 거래처, admin/01 회원, admin/11 배너) — 예상 6개 중 **admin/06 정산은 미해당**(설명 ↓), **admin/01 회원이 추가 발견**.
- 위험 분포: **CRIT 1 / HIGH 2 / MED 3 / LOW 2** (파일 단위)
  - CRIT: `partner_contract_file` UNIQUE(`partner_contract_id`, `file_kind`) — Phase 2 user/11 R2 stale 데이터(실 DB CANCELLED 1건 × 파일 3건 잔존, `bridge/user-11-partner-contract-fullstack.md:80`)와 직접 충돌 → 마이그레이션 자체가 실패할 가능성. **추가**: SQL이 `file_kind` 컬럼을 참조하지만 `PartnerContractFile.fileType` (= 컬럼 `file_type`) 만 존재(`PartnerContractFile.kt:29`) → DDL 즉시 실패.
  - HIGH: `prescription_partner.created_at/modified_at NOT NULL DEFAULT CURRENT_TIMESTAMP`(과거 행 일괄 채움), `banner_file.deleted NOT NULL DEFAULT FALSE`(soft-delete 의미 도입 → 모든 SELECT 에 `deleted=false` 필터 회귀 필요).
  - MED: `partner_contract_file.created_at/modified_at` ADD, `banner_file.created_at` ADD, 인덱스 2종 추가.
- 즉시 점검 필요: **user/11 파트너 계약** (UNIQUE), **admin/11 배너** (deleted 컬럼 도입 → `BannerRepository.findBanners` JPQL `WHERE bf.deleted=false` 미적용 시 동작 불변이지만 의미 누락), **admin/05·user/04 처방** (BaseEntity 상속 추가).
- Phase 2 리스크 해결: BaseEntity 미상속 거래 테이블(B1 §3 횡단패턴 #4, ingest `04-domain.md:312`, 408), partner_contract_file UNIQUE(user/11 R2, `bridge/user-11-partner-contract-fullstack.md:80`), banner_file deleted(admin/11 R3 = bridge S3 누수 항목, `bridge/admin-11-banner-fullstack.md:71`).
- **고아 테이블 없음** — 3개 모두 bridge 어딘가에 등장.

## 1. SQL 파싱 결과
| # | 변경 종류 | 테이블 | 컬럼 | 위험 | 비고 |
|---|----------|--------|------|------|------|
| 1 | ADD COLUMN NOT NULL DEFAULT | `prescription_partner` | `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | MED | Postgres 11+ 메타데이터 전용. 기존 2,579 행은 마이그레이션 시각으로 채워짐 → 진짜 시점 아님(주의) |
| 2 | ADD COLUMN NOT NULL DEFAULT | `prescription_partner` | `modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | MED | 동상 |
| 3 | ADD COLUMN NOT NULL DEFAULT | `partner_contract_file` | `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | MED | 228 rows |
| 4 | ADD COLUMN NOT NULL DEFAULT | `partner_contract_file` | `modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | MED | 동상 |
| 5 | ADD UNIQUE CONSTRAINT | `partner_contract_file` | `(partner_contract_id, file_kind)` | **CRIT** | (a) 컬럼명 drift: 실제 컬럼은 `file_type`이며 `file_kind` 컬럼은 존재하지 않음 (`PartnerContractFile.kt:29`) → DDL 실패. (b) 컬럼명을 `file_type`으로 수정해도 stale CANCELLED 행(R2, 실 DB 1×3건)이 남아 있어 충돌. |
| 6 | ADD COLUMN NOT NULL DEFAULT | `banner_file` | `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | MED | 10 rows |
| 7 | ADD COLUMN NOT NULL DEFAULT | `banner_file` | `deleted BOOLEAN DEFAULT FALSE` | HIGH | soft-delete 의미 신설. 기존 `BannerRepository.findBanners` JPQL은 `bf.deleted` 필터 없음(`bridge/admin-11-banner-fullstack.md:41-49`) → 후속 `updateBanner` 가 deleted=true 토글 시작하기 전에는 동작 동일하나, 코드/엔티티/레포 추가 변경 미수행 시 무의미. |
| 8 | CREATE INDEX | `prescription_partner` | `created_at` | LOW | 신규 정렬·필터 도입할 때만 의미 |
| 9 | CREATE INDEX | `partner_contract_file` | `modified_at` | LOW | 동상 |

## 2. 영향 메뉴 매트릭스
| # | 영향 메뉴 | bridge 파일 | 테이블 | 주요 EP | 깨질 가능성 | 위험 |
|---|----------|-------------|--------|---------|-------------|------|
| 1 | admin/05 처방 관리 | `bridge/admin-05-prescription-fullstack.md:48` (DB 표), `:63,68,80` (JPQL FROM/JOIN), `:100` (R4) | `prescription_partner` | `GET /v1/prescriptions` (`PrescriptionRepository.findFullRowsByMemberIdAndPrescriptionMonths`, native 6-JOIN, ingest `03-repositories.md:86`), `GET /v1/prescriptions/partners` (`PrescriptionPartnerRepository.searchPrescriptionPartnerList`, ingest `03-repositories.md:78`), `PATCH /v1/prescriptions/partners/{id}/complete`, `DELETE /v1/prescriptions/partners/{id}`, `POST /v1/prescriptions/partner-files/update` | INSERT/UPDATE 경로(접수·완료·삭제·EDI 갱신)가 `data class PrescriptionPartner` 에 새 컬럼이 NOT NULL 로 추가됨 → JPA Auditing(@CreatedDate/@LastModifiedDate) 미상속 상태에서 INSERT 시 DB DEFAULT 가 채워주므로 1차 통과. 다만 `data class` copy/생성자 호출이 명시적으로 두 컬럼을 받지 않게 되면 OK. SELECT JPQL 17필드 projection 은 컬럼 추가에 영향 없음. | MED |
| 2 | user/04 처방 관리 (사용자) | `bridge/user-04-prescription-fullstack.md:36` (DB 표), `:49,57` (JPQL), `:101` (R10) | `prescription_partner` | `GET /v1/prescriptions/partners`, `GET /v1/prescriptions/partners/{id}`, `POST /v1/prescriptions/partner-files`(INSERT 트리거), `POST /v1/prescriptions/partner-files/update`, `DELETE /v1/prescriptions/partners/{id}` | 동상. `createPrescriptionWithFiles` (`02-services.md:95`) 가 `PrescriptionPartner` 신규 INSERT — 두 신규 컬럼 NOT NULL 이지만 DB DEFAULT 가 막아줌. 프론트 응답 DTO 17필드는 변동 無 (`PrescriptionPartnerResponse`). | MED |
| 3 | user/02 홈 (대시보드) | `bridge/user-02-home-fullstack.md:38` (DB 표), `:46-50` (당월 통계 JOIN) | `prescription_partner`, `banner_file` | `GET /v1/prescriptions/monthly-count` (`PrescriptionRepository.countBySubmittedDateBetween`), `GET /v1/prescriptions/monthly-total-amount` (`PrescriptionPartnerProductRepository.sumTotalAmountBySubmittedDateBetween`), `GET /v1/banners` (`BannerRepository.findBanners` + `BannerFileRepository#findTopByBannerIdInAndDeletedFalseGrouped`) | SELECT-only. `prescription_partner` 신규 컬럼은 영향 없음. **`banner_file.deleted` 컬럼이 신설되면서 `findTopByBannerIdInAndDeletedFalseGrouped` 의 native 쿼리가 컬럼 존재를 가정** — 현재 native 쿼리는 `s3_file.deleted` 만 필터(`bridge/admin-11-banner-fullstack.md:46`). DDL 적용 후 native 쿼리에 `bf.deleted=false` 추가 필요 (그렇지 않으면 추후 `updateBanner` 로 `deleted=true` 토글 시 stale 이미지 노출 회귀). | HIGH |
| 4 | user/11 파트너 계약 (사용자) | `bridge/user-11-partner-contract-fullstack.md:34` (DB 표), `:55` (JPQL), `:80` (R2 stale 데이터), `:84` (R6) | `partner_contract_file` | `GET /v1/partner-contracts/{userId}` (`PartnerContractFileRepository#findActiveFilesByPartnerContractId`, ingest `03-repositories.md:57`), `POST /v1/partner-contracts` `applyContract` (INSERT, `02-services.md:140`) | (a) UNIQUE `(contract_id, file_kind)` 컬럼명 drift 로 DDL 자체 실패. (b) 가정상 `file_type` 으로 수정해도 — `applyContract` 가 REJECTED/CANCELLED row 재사용 시 기존 `partner_contract_file` 정리 안 함 → 두 번째 신청 시 `INSERT … VALUES (BUSINESS_REGISTRATION)` 충돌 → `DataIntegrityViolationException` → 500. **마이그레이션 적용 전 `WHERE deleted = false` 필터 + 진입 시 stale 행 soft-delete 코드가 선행되어야 안전**. | **CRIT** |
| 5 | admin/03 거래처 관리 (PartnerContract 보조) | `bridge/admin-03-partner-fullstack.md:55` (POST /update 행), `:68` (DB 표) | `partner_contract_file` | `POST /v1/partner-contracts/{contractId}/update` `updateContract` (`02-services.md:163`) — multipart 신규 파일 INSERT, MD5 기반 중복제거 후 `PartnerContractFileRepository.save` | UNIQUE 추가 시 동일 contract 에 동일 file_type 파일을 두 번 업로드하면 INSERT 충돌. `updateContract` 는 기존 행 정리 코드가 없어 보이므로 동일 위험. | HIGH |
| 6 | admin/01 회원 관리 | `bridge/admin-01-member-fullstack.md:30` (#6 GET contractDetails), `:31` (#7 POST update), `:41` (DB 표), `:117` (참조) | `partner_contract_file` | `GET /v1/partner-contracts/{userId}` (회원 상세 진입 시 `Promise.all`, `bridge/admin-01-member-fullstack.md:15`), `POST /v1/partner-contracts/{contractId}/update` (관리자 수정), `POST /v1/partner-contracts/{contractId}/approve/reject` (status 전이만, 파일 INSERT 없음) | user/11 R2 와 동일. admin 계정으로 회원 상세에서 계약 수정 시 동일 INSERT 충돌. | HIGH |
| 7 | admin/11 배너 관리 | `bridge/admin-11-banner-fullstack.md:22` (#4 PATCH), `:27` (DB 표), `:41-49` (JPQL), `:71` (R 5-D = S3 누수) | `banner_file` | `GET /v1/banners` (`bridge/admin-11-banner-fullstack.md:19`), `GET /v1/banners/{id}` (`:20`), `POST /v1/banners` `createBanner` (INSERT BannerFile + S3FileUploadEvent), `PATCH /v1/banners/{id}` `updateBanner` (이미지 교체 시 기존 `banner_file` 잔존 — 5-D) | (a) `created_at` ADD: BannerFile 엔티티가 BaseEntity 미상속(`04-domain.md:312`)이라 INSERT 시 DEFAULT 채워짐. (b) `deleted` ADD: Phase 2 R3 의도이지만 **BannerService.updateBanner / S3FileUploadListener 어디에도 `deleted=true` 토글 코드가 아직 없음** — DDL 만 들어가고 코드 변경 미동반 시 의미 없음. JPQL 도 `bf.deleted=false` 필터 추가 필요 (admin/11 + user/02 홈 양쪽). | HIGH |

> **admin/06 정산 — 미해당**: `bridge/admin-06-settlement-fullstack.md:42-49` 의 DB 표는 `settlement, settlement_partner, settlement_partner_product, settlement_member_monthly, partner_contract` 만 사용. `prescription_partner` 는 ingest 의 `03-repositories.md:78` LIKE 색인 비교에만 등장하며 정산 SQL JOIN 사슬에 없음. (예상 vs 실제 차이 — §0에 명시)

## 3. 코드 변경 체크리스트 (Repository / Service / Controller / Entity)
- [ ] **PrescriptionPartner 엔티티 — BaseEntity 상속** (`PrescriptionPartner.kt:17-49`): `data class` 필드에 `createdAt: LocalDateTime`, `modifiedAt: LocalDateTime` 자동 채움 보장. 현재 BaseEntity 미상속(`04-domain.md:312, 408`, `03-repositories.md:182`).
- [ ] **PartnerContractFile 엔티티 — BaseEntity 상속** (`PartnerContractFile.kt:14-30`): `04-domain.md:312` 명시적 미상속 항목.
- [ ] **BannerFile 엔티티 — BaseEntity 상속 + `deleted: Boolean = false` 필드** (`BannerFile.kt:7-27`): `04-domain.md:312` 명시적 미상속.
- [ ] **SQL 컬럼명 수정**: `partner_contract_file` UNIQUE 의 `file_kind` → `file_type` 으로 정정 (실제 엔티티/DB 컬럼명, `PartnerContractFile.kt:29`). **이 수정 없이는 마이그레이션이 즉시 실패**.
- [ ] **stale 데이터 정리 선행 마이그레이션 (V1.4 또는 V1.5 데이터 단계)**: `partner_contract_file` 의 기존 중복 (CANCELLED 1건 × file_type 3건 잔존, user/11 R2) → 가장 최신 id 만 남기고 나머지 hard delete 또는 deleted 마킹. UNIQUE 추가 전 필수.
- [ ] **PartnerContractService.applyContract 수정** (`02-services.md:140`, `bridge/user-11-partner-contract-fullstack.md:25`): REJECTED/CANCELLED row 재사용 분기 진입 시 기존 `partner_contract_file` soft-delete (또는 hard delete) 추가. UNIQUE 차단 후 INSERT 가 즉시 실패하지 않도록.
- [ ] **PartnerContractService.updateContract 수정** (admin/03·admin/01 #7, `service/PartnerContractService.kt:172`): 동일 file_type 새 파일 업로드 시 기존 행 처리 로직 추가.
- [ ] **BannerService.updateBanner 수정** (`bridge/admin-11-banner-fullstack.md:71`): 이미지 교체 시 기존 `BannerFile` 행 `deleted=true` 토글. 신규 컬럼이 의미를 가지려면 동반 변경 필수.
- [ ] **BannerRepository.findBanners JPQL / `findTopByBannerIdInAndDeletedFalseGrouped` 수정** (`bridge/admin-11-banner-fullstack.md:41-49`): `bf.deleted=false` 필터 추가 (메서드 이름이 이미 `…AndDeletedFalseGrouped` 인 점은 바뀐 의미와 일치하도록 본문 보강 필요).
- [ ] **PartnerContractFileRepository.findActiveFilesByPartnerContractId 검토** (`03-repositories.md:57`): 메서드명에 "Active" 가 있지만 현재 컬럼 부재로 사실상 전부 반환. `s3.deleted=false` 만 의존 중(`bridge/user-11-partner-contract-fullstack.md:58`). UNIQUE 도입 후 stale 행 정리 정책과 정합 확인.
- [ ] **백엔드 통합 테스트**: `applyContract` 재신청 시나리오, `updateContract` 동일 file_type 재업로드 시나리오, `updateBanner` 이미지 교체 시나리오 회귀 테스트.

## 4. 프론트 점검 체크리스트 (메뉴 단위)
- [ ] **admin/05 처방 관리** (`MpAdminPrescriptionReceptionList.tsx`, `MpAdminPrescriptionFormList.tsx`, `MpAdminPrescriptionFormEdit.tsx`): 응답 DTO `PrescriptionPartnerResponse` 17필드 변동 없음 — 화면 회귀 위험 낮음. 단 admin 운영자가 `confirmedAt/checkedAt` 외 `createdAt/modifiedAt` 컬럼을 보고 싶다면 backend.ts 재생성 + 컬럼 추가.
- [ ] **user/04 처방 관리** (`PrescriptionList.tsx`, `EdiIndividualUploadForm.tsx`, `EdiDetailOverlay.tsx`): 동상.
- [ ] **user/02 홈** (`Home.tsx`): `getBanners` 응답 — `BannerFile.deleted=true` 행이 native query 에서 자동 제외되도록 백엔드 픽스가 선행되면 화면 회귀 없음. 백엔드 픽스 누락 시 일시적으로 stale 이미지 노출 가능. 캐러셀 자체 인터페이스 변동 無.
- [ ] **user/11 파트너 계약** (`PartnerContract.tsx`): UNIQUE 도입 후 `applyContract` 가 409/500 으로 실패하면 R10 (self-cancel 부재)과 결합되어 사용자가 빠져나갈 길 없음. 백엔드 픽스 + `IllegalStateException → CONFLICT(409)` 매핑(R5) 동반 필요. UI 측 "재신청 실패 — 고객센터 문의" 알림 케이스 추가.
- [ ] **admin/03 거래처 관리** (`MpAdminPartnerList.tsx`, `MpAdminPartnerEdit.tsx`): `updateContract` 가 동일 file_type 재업로드 시 409 반환할 수 있음. 다이얼로그 에러 핸들링 보강.
- [ ] **admin/01 회원 관리** (`MpAdminMemberEdit.tsx`): `getContractDetails` 응답 fileUrls 4-key 구조는 변동 없음. `updateContract` 에러 핸들링은 admin/03 동일.
- [ ] **admin/11 배너 관리** (`MpAdminBannerList.tsx`, `MpAdminBannerEdit.tsx`): 이미지 교체 후 목록에서 stale URL 가 사라지는지 시각 확인. `BannerFile` 행 deleted 도입 후에도 응답 DTO 변동 없음.
- [ ] **계약 함수 검증** (`/verify-frontend-contract` 재실행): backend.ts 의 `getContractDetails`, `applyContract`, `updateContract`, `updateBanner` 시그니처 변동 없음 예상이지만, BaseEntity 상속 시 응답 DTO 에 `createdAt/modifiedAt` 가 노출되면 frontend orphan call 점검 필요.

## 5. 추가 권고
- **마이그레이션 순서** (`V1.4-data` → `V1.5-DDL` 분리 권장):
  1. **V1.4-data**: `partner_contract_file` 의 `(partner_contract_id, file_type)` 중복 행을 최신 id 만 남기고 정리 (실 DB CANCELLED 1×3건 식별·삭제). banner_file 의 stale 행도 사전 정리(banner id=3 6장 누적, `bridge/admin-11-banner-fullstack.md:71`).
  2. **V1.5-DDL**: 본 SQL 적용. UNIQUE 의 `file_kind` → `file_type` 정정 필수.
  3. **앱 코드 배포**: BaseEntity 상속, BannerService.updateBanner deleted 토글, PartnerContractService 재신청 정리 로직, BannerRepository JPQL `bf.deleted=false` 필터.
- **무중단 적용 가이드** (Postgres):
  - ADD COLUMN NOT NULL DEFAULT CURRENT_TIMESTAMP / DEFAULT FALSE 는 Postgres 11+ 에서 metadata-only (`bridge/admin-11-banner-fullstack.md` 외 일반 가이드). 잠금 시간 짧음.
  - ADD CONSTRAINT UNIQUE 는 내부적으로 CREATE UNIQUE INDEX → 짧지만 ACCESS EXCLUSIVE LOCK. 우선 `CREATE UNIQUE INDEX CONCURRENTLY` 로 인덱스를 만든 뒤 `ALTER TABLE ... ADD CONSTRAINT … USING INDEX` 로 변환 권장.
  - `CREATE INDEX` 두 건도 `CONCURRENTLY` 옵션 권장 (운영 트래픽 시간대).
- **롤백 전략**:
  - `ALTER TABLE ... DROP COLUMN` 은 메타데이터 전용이라 복구 가능. 단 데이터는 손실.
  - UNIQUE 제거: `ALTER TABLE partner_contract_file DROP CONSTRAINT uk_partner_contract_file_contract_kind`. 인덱스는 같이 사라짐.
  - 코드 측 BaseEntity 상속 추가는 backward-compat 안전(읽기는 자동 채움, 기존 INSERT 도 자동).
  - **위험**: BannerFile 에 `deleted=true` 행이 생긴 뒤 컬럼 DROP 하면 soft-delete 의도가 사라져 stale 행이 다시 노출됨. 롤백 시 `deleted=true` 행 hard delete 동반 필요.

## 6. 참조
- 입력 SQL: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/db-impact-fixtures/V1_5__add_audit_columns_to_partner_tables.sql`
- bridge 풀스택 지도 (영향 메뉴 7종):
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-05-prescription-fullstack.md`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/user-04-prescription-fullstack.md`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/user-02-home-fullstack.md`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/user-11-partner-contract-fullstack.md`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-03-partner-fullstack.md`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-01-member-fullstack.md`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-11-banner-fullstack.md`
- ingest 6종: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md`, `02-services.md`, `03-repositories.md`(:57, :78, :86, :103-104, :168, :182, :200), `04-domain.md`(:38, :41, :73, :312, :408), `05-security.md`, `06-config.md`
- 백엔드 엔티티 (수정 필요): `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/domain/entity/postgresql/PrescriptionPartner.kt`, `PartnerContractFile.kt`, `BannerFile.kt`
- 백엔드 서비스 (수정 필요): `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/service/PartnerContractService.kt`(applyContract, updateContract), `BannerService.kt`(updateBanner)
- 백엔드 레포지토리 (검토): `PartnerContractFileRepository.kt`, `BannerRepository.kt`, `BannerFileRepository.kt`, `PrescriptionPartnerRepository.kt`

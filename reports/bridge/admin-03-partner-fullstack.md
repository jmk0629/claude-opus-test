# admin-03 거래처 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`03_PARTNER_MANAGEMENT.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427`) / 백엔드 docs(`03_PARTNER_MANAGEMENT.md`)

## 1. 화면 요약

- 진입 라우트: `/admin/partners` (목록), `/admin/partners/new` (등록), `/admin/partners/:partnerId/edit` (수정)
- 권한 태그(프론트): `TRANSACTION_MANAGEMENT` — 단, 백엔드 `/v1/partners/**`는 `@RequiredRole` 미부착(아래 §4)
- 페이지 파일
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPartnerList.tsx` — 거래선 목록 + 다중삭제 + Excel 다운로드 + 일괄업로드 모달
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPartnerEdit.tsx` — 신규/수정 폼 + 문전약국 인라인 테이블
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/components/MpPartnerUploadModal.tsx` — Excel 일괄 업로드 (드래그앤드롭, react-dropzone)
  - 모달 보조: `MpDrugCompanySelectModal`, `MpMemberSelectModal` (계약 회원 필터 `contractStatus: CONTRACT`)
- 핵심 사용자 액션
  1) 검색(`searchType` ∈ companyName/institutionName/drugCompanyName/memberName/institutionCode + `memberType` 필터) → 페이지네이션 50/페이지
  2) 다중 선택 후 `Promise.all([DELETE …])` 병렬 삭제
  3) Excel 다운로드(현 검색조건 그대로) — `getExportPartnersExcel(...)` href
  4) 등록/수정: 제약사·회원 모달 선택 → 문전약국 4-병렬배열(id/name/address/status) 관리 → 신규는 1콜, 수정은 PUT + (새 약국만 별도 POST)
  5) Excel 일괄 업로드: 회원 1명에 대해 거래선 다건 UPSERT
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/03_PARTNER_MANAGEMENT.md:25-49, 305-345, 392-410`

> 거래처 자체 메뉴(`admin-03`)는 Partner + PartnerPharmacy 가 본체. **PartnerContract**(파트너 계약 신청·승인)는 admin 별도 메뉴(`/admin/partner-contracts`)에 있지만, `updatePartner`가 `partnerContract!!.companyName` 로 fallback (NPE 위험, §5)하고 `uploadExcel`이 `PartnerContract.companyName` 으로 신규 partner.companyName 채움 — 본 메뉴 동작 시에도 **PartnerContract row 존재가 사실상 전제**. Hospital/Dealer 는 본 메뉴에서 직접 사용하진 않으나 `approveContract → Dealer 생성`, `ensureDealerDrugCompanyMapping(DealerDrugCompany)` 사이드이펙트로 후행 영향. 본 매트릭스는 `PartnerController(12)` + `PartnerContractController(5)` 까지 포함한다.

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 메서드 라인번호는 ingest(`01-controllers.md`, `02-services.md`, `03-repositories.md`) 와 백엔드 docs `03_PARTNER_MANAGEMENT.md` 의 §2 표기를 우선 채용.

### 2-A. Partner 본체 (`PartnerController`, 12 EP — 01-controllers.md:120-136)

| # | HTTP | Path | 프론트 함수(backend.ts 추정) | Controller | Service | Repository | 비고 |
|---|------|------|-------------------------------|------------|---------|------------|------|
| 1 | GET | `/v1/partners` | `getPartners` | `PartnerController#getPartners:72` | `PartnerService#searchPartners:177` | `PartnerRepository#searchPartners:32` (+ `PartnerPharmacyRepository#countActiveMapByPartnerIds` for `hasPharmacy`) | 동적 LIKE 8개 + 페이지 size **기본 50**, JPQL `ORDER BY institutionName ASC` 가 Pageable Sort 덮어씀 (백엔드 docs §5-M) |
| 2 | GET | `/v1/partners/export-excel` | `getExportPartnersExcel` | `PartnerController#exportPartnersExcel:101` | `PartnerService#getPartnerExcelRows:371` | `PartnerRepository#searchPartnersAll:133` | Pageable 없음, **`hasPharmacy=false` 고정 버그** (docs §5-E) |
| 3 | POST | `/v1/partners` | `createPartner` | `PartnerController#createPartner:131` | `PartnerService#createPartner:122` | `PartnerRepository#existsByOwnerIdAndDrugCompanyIdAndInstitutionCodeAndDeletedFalse` (선제 dup), `save`, `PartnerPharmacyService.createAll` | 중복 시 `IllegalStateException` → FE는 409 분기. 글로벌 핸들러 매핑 미확인(docs §5-B) |
| 4 | PUT | `/v1/partners/{id}` | `updatePartner` | `PartnerController#updatePartner:138` | `PartnerService#updatePartner:78` | `PartnerRepository.findById/save`, `PartnerContractRepository#findByMemberId`, `PartnerPharmacyService.updateAll` | **`companyName ?: partnerContract!!.companyName` NPE 위험** (docs §5-C) |
| 5 | DELETE | `/v1/partners/{id}` | `deletePartner` | `PartnerController#deletePartner:148` | `PartnerService#deletePartner:64` | `PartnerPharmacyRepository#findActiveByPartnerId` + `saveAll(deleted=true)`, `partnerRepository.save` | soft delete (Partner + Pharmacy 동시) |
| 6 | GET | `/v1/partners/{id}` | `getPartnerDetails` | `PartnerController#getPartnerDetails:162` | `PartnerService#getPartnerDetails:166` | `findById` + `PartnerPharmacyRepository#findActiveByPartnerId` | `hasPharmacy = pharmacies.isNotEmpty()` 실시간 |
| 7 | GET | `/v1/partners/drug-companies` | `getPartnerDrugCompanies` | `PartnerController#getDrugCompanies:155` | `PartnerService#getDistinctDrugCompanies:53` | `PartnerRepository#findDistinctDrugCompanyByOwnerId:63` | admin → 전체, user → 본인 owner 스코프 |
| 8 | POST | `/v1/partners/upload/{userId}` | `uploadPartnersExcel` | `PartnerController#uploadPartnersExcel:168` | `PartnerService#uploadExcel:223` | `PartnerRepository#findByOwnerIdAndDrugCompanyIdInAndDeletedFalse` (벌크), `saveAll(toUpdate/toInsert)` | `companyName ← PartnerContract.companyName` 로 자동 채움. 1행 invalid → **전체 실패** (docs §5-O) |
| 9 | GET | `/v1/partners/ids/{userId}` | (테스트 전용) | `PartnerController#getPartnerIdsByUserId:180` `@TestOnly` | `PartnerService#getPartnerIdsByUserId:48` | `PartnerRepository#findActiveIdsByOwnerUserId:53` | 운영에도 노출 (docs §5-N, 05-security:276-278) |
| 10 | GET | `/v1/partners/{partnerId}/pharmacies` | `listPartnerPharmacies` | `PartnerController#list:39` | `PartnerPharmacyService#list:25` | `PartnerPharmacyRepository#findActiveByPartnerId` | Edit 진입 시 호출 |
| 11 | POST | `/v1/partners/{partnerId}/pharmacies` | `createPartnerPharmacies` | `PartnerController#createAll:45` | `PartnerPharmacyService#createAll:33` | `existsByPartnerIdAndPharmacyNameIgnoreCaseAndDeletedFalse`, `saveAll` | 배치 내 중복/DB 중복 → 409, UNIQUE 부분인덱스로 2중 방어 |
| 12 | PUT | `/v1/partners/{partnerId}/pharmacies` | (수정 1콜) | `PartnerController#updateAll:54` | `PartnerPharmacyService#updateAll:71` | `findActiveByPartnerAndIds`, `deleteAll` (**hard delete!**), 부분 업데이트 | DELETE 경로(soft)와 의미 불일치 (docs §5-I) |
| 13 | DELETE | `/v1/partners/{partnerId}/pharmacies` | (사용처 미확인) | `PartnerController#deleteAll:63` | `PartnerPharmacyService#deleteAll:133` | `PartnerPharmacyRepository#softDeleteAll` (`@Modifying UPDATE`) | affected=0 → 404 |

### 2-B. PartnerContract 보조 (`PartnerContractController`, 5 EP — 01-controllers.md:139-147)

> admin-03 화면에서 직접 호출되진 않지만 `PartnerService.updatePartner / uploadExcel` 가 `PartnerContract` row를 강제 의존하므로 동거.

| # | HTTP | Path | Controller | Service | 비고 |
|---|------|------|------------|---------|------|
| 14 | GET | `/v1/partner-contracts/{userId}` | `PartnerContractController:31` | `PartnerContractService` | 회원 단건 계약 상세 |
| 15 | POST | `/v1/partner-contracts` | `:39` | `applyContract` | 신청. PENDING/APPROVED 면 재신청 불가 (`02-services.md:139`) |
| 16 | POST | `/v1/partner-contracts/{contractId}/update` | `:62` | `updateContract` | 파일 MD5 기반 재사용 |
| 17 | POST | `/v1/partner-contracts/{contractId}/approve` | `:90` `ADMIN_ONLY/CONTRACT_MANAGEMENT` | `approveContract` | **이력 없을 때만 Dealer 신규 생성** + `MemberType` 변경 + Push (`02-services.md:140`) |
| 18 | POST | `/v1/partner-contracts/{contractId}/reject` | `:104` `ADMIN_ONLY/CONTRACT_MANAGEMENT` | `rejectAndCancelContract` | 이력 있으면 CANCELLED, 없으면 REJECTED |

근거: 컨트롤러 매트릭스 `01-controllers.md:23-24, 120-147`, 서비스 `02-services.md:131-163`, 리포지토리 `03-repositories.md:25-26, 56`.

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|--------|------|-------|------|
| `partner` | 거래선 본체 (제약사 × 거래처 owner 1:N) | `owner_member_id` → member, `drug_company_id` → drug_company | `Partner.kt:8`, BaseEntity 상속, soft delete (`04-domain.md:35,164,180`). UNIQUE 부분인덱스 `(owner_member_id, drug_company_id, institution_code) WHERE deleted=false AND institution_code IS NOT NULL` |
| `partner_pharmacy` | 문전약국 정규화 (Partner 1:N, 활성 3건만 존재) | `partner_id` | UNIQUE 부분인덱스 `(partner_id, pharmacy_name) WHERE deleted=false`. soft delete |
| `partner_contract` | 파트너 계약 신청 본체 (Member 1:1) | `member_id` (unique) | `04-domain.md:36,140,156`. 상태 머신 PENDING/APPROVED/REJECTED/CANCELLED |
| `partner_contract_file` | 계약 첨부 (BUSINESS_REGISTRATION/SUBCONTRACT_AGREEMENT/CSO_CERTIFICATE/SALES_EDUCATION_CERT) | `partner_contract_id`, `s3_file_id` (EAGER) | `04-domain.md:38,158,396` |
| `partner_contract_approval_history` | 승인 이력 (있으면 reject→CANCELLED, 없으면 REJECTED) | `partner_contract_id` | `04-domain.md:37,157` |
| `dealer` | 딜러 (Member owner의 영업 단위) | `owner_member_id`, `member_id`(self, nullable) | `04-domain.md:32,150-151`. `approveContract` 시 신규 생성 |
| `dealer_drug_company` | Dealer × DrugCompany N:M 매핑 (조인 엔티티) | `dealer_id`, `drug_company_id` | `04-domain.md:33,152`. `PartnerService.ensureDealerDrugCompanyMapping/Mappings` 가 create/update/upload 모두에서 갱신 |
| `drug_company` | 제약사 마스터 (FK 대상) | — | UNIQUE(`name`). `partner.drug_company_name`은 **스냅샷** — canonical과 78건 드리프트 (백엔드 docs §4-5, §5-D) |
| `hospital` | 개원병원 (별도 메뉴, 본 화면에서 직접 사용 X) | `region_category_id` (nullable) | `04-domain.md:58, 167`. `softDeleteHospital` `@Transactional` 누락 (`02-services.md:227,386-388`) |

핵심 JOIN — 거래선 목록 (실제 실행 SQL은 백엔드 docs §2-1 예제 A/B/C/D 참고):

```sql
-- equivalent to: GET /v1/partners?companyName=메디&drugCompanyName=동구&contractType=CONTRACT&page=0&size=50
SELECT p.id, p.company_name, p.institution_name, p.institution_code,
       p.drug_company_name, p.contract_type,
       m.user_id, m.name AS member_name,
       dc.name AS canonical_drug_company,
       (SELECT COUNT(*) FROM partner_pharmacy pp
         WHERE pp.partner_id = p.id AND pp.deleted = false) > 0 AS has_pharmacy
FROM partner p
JOIN member m        ON m.id = p.owner_member_id           -- Partner.owner (EAGER)
JOIN drug_company dc ON dc.id = p.drug_company_id          -- Partner.drugCompany (EAGER) ← N+1 핵심
WHERE LOWER(p.company_name) LIKE LOWER('%' || '메디' || '%')
  AND LOWER(dc.name)        LIKE LOWER('%' || '동구' || '%')
  AND p.contract_type = 'CONTRACT'
  AND p.deleted = false
ORDER BY p.institution_name ASC
LIMIT 50 OFFSET 0;
```

> `hasPharmacy` 는 코드상 `countActiveMapByPartnerIds` 단일 쿼리 (현재 페이지 partnerIds GROUP BY) — 위 서브쿼리는 의미 등가 표현. 실제 호출은 docs §6-I (`03-repositories.md` 핫스팟표 6번 항목과 연계).

## 4. 권한·트랜잭션

- **인증/인가**
  - `WebSecurityConfig`: `/v1/partners/**` → `authenticated` 만, `@RequiredRole` 부재 (`05-security.md:59, 162-163`).
  - `PartnerContractController`: `approve/reject` 만 `ADMIN_ONLY/CONTRACT_MANAGEMENT`, 조회·수정은 인증만 (`05-security.md:158`).
  - 결과적으로 **path id/userId만 알면 일반 계약회원이 타인 partner CRUD·엑셀 업로드 가능** (백엔드 docs §5-A).
  - 프론트 라우팅의 `TRANSACTION_MANAGEMENT` 가드는 단순 화면 가시성 — 서버 가드와 불일치.
- **스코프 계산 이원화** — 목록은 util `userIdForQuery(loginUser)`, 엑셀은 인라인 `if (loginUser.isAdmin()) null else loginUser.userId` (백엔드 docs §5-F). 정책 변경 시 drift.
- **트랜잭션**
  - `PartnerService.create/update/delete/uploadExcel` 모두 `@Transactional REQUIRED` (`02-services.md:158-161`).
  - `PartnerPharmacyService.create/update/deleteAll` 동일 — 단 `updateAll`의 `deletedIds` 는 **hard delete** (`PartnerPharmacyRepository.deleteAll`), `softDeleteAll` 는 별도 (`@Modifying UPDATE`) — 의미 불일치 (`02-services.md` 표 + 백엔드 docs §5-I).
  - `HospitalService.softDeleteHospital` **`@Transactional` 누락** (`02-services.md:227, 386-388`) — 본 메뉴 외 영역이지만 같은 ingest의 트랜잭션 레드플래그.
- **이벤트** — `PartnerContractService.approveContract` → `NotificationPushEvent(PARTNER_APPROVED)` + `EmailEventPublisher`, `applyContract` → `NotificationEmailEvent(PARTNER_REQUESTED)` (`02-services.md:146`).

## 5. 리스크 / 후속 액션

| ID | 영역 | 내용 | 근거 | 후속 |
|----|------|------|------|------|
| R1 | 보안 | `/v1/partners/**` `@RequiredRole` 부재 → 일반 사용자가 타 owner 데이터 CRUD 가능. `@TestOnly GET /ids/{userId}` 운영 노출 | `05-security.md:59,162-163,267-278`, BE docs §5-A,§5-N | `@RequiredRole(TRANSACTION_MANAGEMENT)` + ownership 체크 + admin bypass + Profile 가드 |
| R2 | 성능(N+1) | `Partner.owner`/`Partner.drugCompany` 둘 다 **EAGER** → 목록 50건 시 즉시 조회 N×2. `existingPartners` 맵 구성에서도 EAGER 트리거 | `04-domain.md:153-154, 406`, `03-repositories.md:126,193` | `LAZY` 전환 + `searchPartners`/`searchPartnersAll`에 `JOIN FETCH p.owner, p.drugCompany` 추가 |
| R3 | 데이터 무결성 | `updatePartner`의 `companyName ?: partnerContract!!.companyName` — `partnerContract` null 인 레거시 partner 수정 시 **NPE → 500** | BE docs §5-C, `02-services.md:158-159` | fallback을 `partner.companyName` 으로 변경 |
| R4 | 정합성 | `drugCompanyName` 스냅샷 vs FK `drug_company.name` 78건 불일치(37 variant) — 엑셀 cell 그대로 저장, Update 도 임의 문자열 가능 | BE docs §4-5, §5-D | 스냅샷 폐지하고 FK name 조인, 또는 save 훅에서 `partner.drugCompanyName = partner.drugCompany.name` 강제 |
| R5 | UX | `exportPartnersExcel` 의 `hasPharmacy = false` 고정 — Excel "문전약국" 컬럼이 항상 N | BE docs §5-E | `getPartnerExcelRows` 에서도 `countActiveMapByPartnerIds` 호출 |
| R6 | 정합성 | `softDeleteHospital` `@Transactional` 누락 (별 메뉴지만 본 ingest 핫스팟) | `02-services.md:227, 386-388` | `@Transactional` 부착 |
| R7 | UX/데이터 | Excel 업로드: `drugCompanyId` 1행 invalid → 전체 실패. 헤더 인덱스 1~6 고정, silent skip | BE docs §5-H, §5-O | 실패 row 분리 리포트 + 헤더명 검증 |
| R8 | 정합성 | PUT `/pharmacies` 의 `deletedIds` 는 hard delete, DELETE `/pharmacies` 는 soft — 의미 불일치 | BE docs §5-I | hard 경로 제거하고 soft로 통일 |
| R9 | 응답 매핑 | `createPartner` 중복 시 `IllegalStateException` → 글로벌 핸들러가 409 매핑 안 하면 FE의 `status===409` 분기 미동작 | BE docs §5-B, FE docs L:339-343 | 전역 예외 핸들러에 매핑 추가, 또는 `ConflictException` 도입 |
| R10 | 정렬/페이징 | Controller `Sort DESC DEFAULT_SORT_TYPE` → JPQL `ORDER BY institutionName ASC` 로 덮임 (이중 정렬) | BE docs §5-M | 한쪽으로 통일, FE 가 sort 파라미터 사용한다면 JPQL `ORDER BY` 제거 |
| R11 | 데이터 품질 | `institution_code` 길이 이상치 63건, owner 중복 16건 / `medicalDepartment` DB 28종 vs FE 23종 | BE docs §4-6,§4-7,§4-8,§5-K,§5-L | `normalizeInstitutionCode` + 진료과 enum 화 |
| R12 | 레거시 코드 | `partner.pharmacy_name/address/status` 컬럼 실사용 0이지만 DTO·Entity·`pharmacyStatus==DELETED` 분기 잔존 | BE docs §4-9, §5-J | DTO/엔티티 정리 + DB 컬럼 drop |

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/03_PARTNER_MANAGEMENT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/03_PARTNER_MANAGEMENT.md`
- ingest 디렉터리: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/`
  - `01-controllers.md:23-24, 120-147` (PartnerController 12 EP, PartnerContractController 5 EP)
  - `02-services.md:131-163, 217-229, 380-413` (PartnerService/PartnerContractService/HospitalService, 트랜잭션 레드플래그, 비즈니스 규칙)
  - `03-repositories.md:25-26, 41-43, 56-58, 126, 142, 164, 193, 198` (Partner/PartnerContract/Hospital/Dealer 핫스팟·N+1 위험)
  - `04-domain.md:35-39, 86-100, 140-159, 252-255, 297-303, 396, 406-410` (엔티티·EAGER 위험·Aggregate 4 PartnerContract)
  - `05-security.md:53-65, 157-163, 267-278` (`/v1/partners/**` 가드 부재, `@TestOnly` 노출)
  - `06-config.md:240-244, 312, 430` (HospitalSidoCount 캐시·스케줄러 — 본 메뉴 직접 무관)
- 프론트 페이지/모달: `MpAdminPartnerList.tsx`, `MpAdminPartnerEdit.tsx`, `MpPartnerUploadModal.tsx`, `MpDrugCompanySelectModal.tsx`, `MpMemberSelectModal.tsx`

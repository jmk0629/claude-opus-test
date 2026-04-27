# admin-05 처방 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(05_PRESCRIPTION_MANAGEMENT.md) / 백엔드 ingest(reports/backend-ingestion-20260427) / 백엔드 docs(05_PRESCRIPTION_MANAGEMENT.md)

## 1. 화면 요약
- 메인 페이지(2개 하위 메뉴):
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPrescriptionReceptionList.tsx` — 처방접수 목록 (`/admin/prescription-receptions`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPrescriptionFormList.tsx` — 처방입력 목록 (`/admin/prescription-forms`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPrescriptionFormEdit.tsx` — 처방입력 상세/편집 (`/admin/prescription-forms/:id/edit`)
- 핵심 사용자 액션:
  1) 딜러가 제출한 처방(EDI 묶음) 접수 목록 조회 + 개별/일괄 EDI ZIP 다운로드
  2) 접수 확인(`PENDING → IN_PROGRESS`)으로 상태 전이
  3) 거래처별 처방품목(수량·단가·수수료율) upsert + OCR 원본 비교
  4) 처방-파트너 단위 승인(`COMPLETED`) → 모든 파트너 완료 시 처방 전체 COMPLETED + EDI_COMPLETE 푸시
  5) PENDING/IN_PROGRESS 파트너 소프트 삭제, 처방입력 목록 엑셀 다운로드
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/05_PRESCRIPTION_MANAGEMENT.md:43-61`

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 경로 표기는 **`backend.ts` 및 `PrescriptionController.kt` 실제 경로** 기준. 프론트 docs는 `/v1/prescription-partners` 형태로 normalize 되어 있으나 실제 호출은 모두 `/v1/prescriptions/partners` (5장 리스크 R3 참조).

| # | HTTP | Path | 프론트 함수 (backend.ts) | Controller | Service | Repository | 비고 |
|---|------|------|--------------------------|------------|---------|------------|------|
| 1 | GET | `/v1/prescriptions` | `searchPrescriptions` (`backend.ts:3378`) | `PrescriptionController.searchPrescriptions` (`PrescriptionController.kt:162`) | `PrescriptionService` (목록 조회) | `PrescriptionRepository` (4 @Query, 1 native) (`03-repositories.md:28`) | 처방접수 목록. native: `findFullRowsByMemberIdAndPrescriptionMonths` (6 JOIN) `PrescriptionRepository.kt:17` |
| 2 | PATCH | `/v1/prescriptions/{id}/confirm` | `confirmPrescription` (추정, backend.ts grep no-hit→파일 후반부에 존재) | `PrescriptionController.confirmPrescription` (`PrescriptionController.kt:118`) | `PrescriptionService.confirmPrescription` (`PrescriptionService.kt:221`) | `PrescriptionRepository` | 상태 전이 PENDING→IN_PROGRESS (`02-services.md:98`) |
| 3 | GET | `/v1/prescriptions/export-zip` | `exportPrescriptionsZip` (`backend.ts:3414`) | `PrescriptionController.exportZip` (`PrescriptionController.kt:264`) | `PrescriptionService.createBulkEdiZipFile` | `PrescriptionEdiFileRepository.findAllActiveByPrescriptionIds` (6 JOIN FETCH) (`03-repositories.md:104`) | `?prescriptionIds=1,2,3` |
| 4 | GET | `/v1/prescriptions/partners/{prescriptionId}/edi-files/download` | `downloadZippedEdiFiles` (`backend.ts:3551`) | `PrescriptionController` (`PrescriptionController.kt:46`) | `PrescriptionService.buildEdiZipFileName` (`PrescriptionService.kt:127`) | `PrescriptionEdiFileRepository.findAllActiveByPrescriptionId` (JOIN FETCH s3File) | 단건 EDI ZIP. S3 스트리밍 |
| 5 | GET | `/v1/prescriptions/partners` | `getPrescriptionPartnerList` (`backend.ts:3503`) | `PrescriptionController` (`PrescriptionController.kt:72`) | `PrescriptionService` (`PrescriptionService.kt:205`) | `PrescriptionPartnerRepository.searchPrescriptionPartnerList` (`PrescriptionPartnerRepository.kt:138`) | 처방입력 목록. 10개 동적 필터 + GROUP BY |
| 6 | PATCH | `/v1/prescriptions/partners/{prescriptionPartnerId}/complete` | `completePrescriptionPartner` (`backend.ts:3585`) | `PrescriptionController.completePartner` (`PrescriptionController.kt:125`) | `PrescriptionService.completePartner` (`PrescriptionService.kt:237`) | `PrescriptionPartnerRepository`, `PrescriptionRepository` | 모든 PP COMPLETED 시 Prescription COMPLETED + `NotificationPushEvent(EDI_COMPLETE)` (`02-services.md:99,107`) |
| 7 | DELETE | `/v1/prescriptions/partners/{prescriptionPartnerId}` | `deletePrescriptionPartner` (`backend.ts:3574`) | `PrescriptionController.softDeletePartner` (`PrescriptionController.kt:134`) | `PrescriptionService.softDeletePartner` (`PrescriptionService.kt:266`) | `PrescriptionPartnerRepository`, `PrescriptionEdiFileRepository.softDeleteByPrescriptionPartnerId` (native FROM-UPDATE) | PENDING이거나 (IN_PROGRESS+Admin)만 삭제 가능 (`02-services.md:100`) |
| 8 | GET | `/v1/prescriptions/partners/export-excel` | `getExportPrescriptionPartnersExcel` (`backend.ts:3528`) | `PrescriptionController` (`PrescriptionController.kt:280`) | `PrescriptionService` (`Pageable.unpaged()`) | `PrescriptionPartnerRepository.searchPrescriptionPartnerList` | 동일 필터로 unpaged |
| 9 | GET | `/v1/prescriptions/partners/{prescriptionPartnerId}` | `getPrescriptionPartner` (`backend.ts:3562`) | `PrescriptionController` (`PrescriptionController.kt:64`) | `PrescriptionService` | `PrescriptionPartnerRepository.findOneById` (생성자 프로젝션 JPQL) | FormEdit 상세 진입 |
| 10 | GET | `/v1/prescriptions/partners/{prescriptionPartnerId}/products` | `getPartnerProducts` (`backend.ts:3608`) | `PrescriptionController` (`PrescriptionController.kt:144`) | `PrescriptionService` | `PrescriptionPartnerProductRepository` | 품목 목록 |
| 11 | PATCH | `/v1/prescriptions/partners/{prescriptionPartnerId}/products` | `upsertPatchPartnerProducts` (`backend.ts:3620`) | `PrescriptionController.upsertPatchPartnerProducts` (`PrescriptionController.kt:108`) | `PrescriptionService.upsertPatchPartnerProducts` (`PrescriptionService.kt:289`) | `PrescriptionPartnerProductRepository`, `PrescriptionPartnerProductOcrRepository`, `ProductRepository.findByKdCode` | 신규 품목 reflection 필수 검증, OCR 원본 동기화 (`02-services.md:101`) |
| 12 | GET | `/v1/prescriptions/partners/{prescriptionPartnerId}/products/ocr-original-diff` | `getOriginalOcrDiff` (`backend.ts:3635`) | `PrescriptionController` (`PrescriptionController.kt:193`) | `PrescriptionService` | `PrescriptionPartnerProductOcrRepository` | OCR 원본 vs 현재값 diff |
| 13 | GET | `/v1/prescriptions/partners/{prescriptionPartnerId}/edi-files/attached` | `getAttachedEdiFiles` (`backend.ts:3596`) | `PrescriptionController` (`PrescriptionController.kt:38`) | `PrescriptionService` | `PrescriptionEdiFileRepository.findAllActiveByPrescriptionId` | FormEdit 첨부 EDI 뷰어 |
| 14 | POST | `/v1/prescriptions/partner-files/update` | `updatePartnerEdiFiles` (`backend.ts:3472`) | `PrescriptionController` (`PrescriptionController.kt:221`) | `PrescriptionService.updatePrescriptionWithFiles` (`02-services.md:96`) | `PrescriptionRepository`, `PrescriptionPartnerRepository`, `PrescriptionEdiFileRepository`, `S3FileRepository` | 거래처/처방월/EDI 파일 갱신. 파일 1~5개 제한 |
| 15 | GET | `/v1/products/code/{productCode}/details` | (호출부 `MpAdminPrescriptionFormEdit.tsx`에서 직접 사용 — 추정, frontend docs:60 인용) | `ProductController` (`ProductController.kt:146`) | `ProductService` | `ProductRepository.findByKdCode` | FormEdit에서 productCode 기반 단가/수수료율 조회 |

근거: 컨트롤러 매트릭스 `01-controllers.md:152-173`, 서비스 매트릭스 `02-services.md:88-107`, 레포지토리 `03-repositories.md:28-31`.

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|--------|------|-------|------|
| `prescription` | 처방 헤더 (제출 단위, 상태 머신 루트) | `registered_dealer_id` → dealer, `drug_company_id` → drug_company | `Prescription.kt:8`, BaseEntity 상속 (`04-domain.md:40`) |
| `prescription_partner` | 처방-거래처 N:1 (처방 1건이 여러 거래처 묶음) | `prescription_id`, `partner_id`, `dealer_id` | **BaseEntity 미상속 → 시점 추적 불가** (`04-domain.md:41,408`) |
| `prescription_partner_product` | 처방-거래처별 품목 행 (수량·단가·수수료) | `prescription_partner_id`, `product_id` | `totalPrice`/`unitPrice` Int 타입 (`04-domain.md:42,410`) |
| `prescription_partner_product_ocr` | 품목 행 OCR 원본 (1:1) | `prescription_partner_product_id` (unique), `prescription_partner_id` | OCR diff 비교 기준 |
| `prescription_edi_file` | EDI 첨부 파일 (PNG/JPG/HEIC 등) | `prescription_partner_id`, `s3_file_id` | S3 위임 저장 |
| `partner` / `dealer` / `drug_company` | 거래처·딜러·제약사 (조인 대상) | — | `partner.drug_company` EAGER (N+1 위험, `03-repositories.md:126`) |
| `s3_file` | EDI 실제 파일 메타 | — | soft-delete 컬럼 (`03-repositories.md:170`) |

핵심 JOIN (백엔드 docs 인용):
```sql
-- 출처: /Users/jmk0629/keymedi/medipanda-api/docs/admin/05_PRESCRIPTION_MANAGEMENT.md:312-350
-- equivalent to: GET /v1/prescriptions/partners?status=COMPLETED&drugCompany=영진...
SELECT pp.id, partner.company_name, dc.name AS drug_company,
       pp.prescription_month, pp.settlement_month,
       COALESCE(SUM(ppp.total_price), 0) AS amount,
       pp.prescription_partner_status AS status, d.dealer_name
FROM prescription_partner pp
JOIN prescription pr        ON pr.id = pp.prescription_id
JOIN partner                ON partner.id = pp.partner_id
JOIN drug_company dc        ON dc.id = partner.drug_company_id
JOIN dealer d               ON d.id = pp.dealer_id
LEFT JOIN prescription_partner_product ppp ON ppp.prescription_partner_id = pp.id
WHERE pp.deleted = false
  AND pp.prescription_partner_status != 'PENDING'   -- admin 분기 (queryUserId IS NULL)
GROUP BY ... ORDER BY pp.id DESC LIMIT 50;
```
```sql
-- 출처: /Users/jmk0629/keymedi/medipanda-api/docs/admin/05_PRESCRIPTION_MANAGEMENT.md:138-148
-- GET /v1/prescriptions — 처방접수 목록의 INNER JOIN 체인 (PP 없는 처방은 누락 — 5-A)
FROM prescription p
JOIN dealer d                ON d.id = p.registered_dealer_id
JOIN member m                ON m.id = d.owner_member_id
JOIN partner_contract pc     ON pc.member_id = m.id
JOIN prescription_partner pp ON pp.prescription_id = p.id
JOIN partner                 ON partner.id = pp.partner_id
JOIN drug_company dc         ON dc.id = p.drug_company_id;
```

## 4. 권한·트랜잭션
- 권한 어노테이션: **`PrescriptionController` 전체 `@RequiredRole` 미적용**, JWT 인증만 통과하면 호출 가능 (`05-security.md:60,161,316-319`).
- 트랜잭션 경계:
  - `confirmPrescription` / `completePartner` / `softDeletePartner` / `upsertPatchPartnerProducts` 모두 메서드 단위 `@Transactional REQUIRED` (`02-services.md:98-101`).
  - `completePartner` 후 모든 PP COMPLETED 일 때만 Prescription 상태 전이 + `NotificationPushEvent(EDI_COMPLETE)` AFTER_COMMIT 비동기 발행.
  - `prescriptionZipUploadV2` 는 `TransactionSynchronizationManager.registerSynchronization` + `@Async`로 커밋 후 `PrescriptionMonthlyStatsService.refreshByUserId` 캐시 갱신 (`02-services.md:105`, RISK-5 `02-services.md:397`).
- 외부 연동:
  - **AWS S3** (버킷 `medipanda`) — EDI 파일 업로드/다운로드. `S3FileUploadEvent` → `S3FileUploadListener` AFTER_COMMIT 비동기 (`06-config.md:168-173,275`).
  - **FCM Push** — `EDI_COMPLETE` 알림. `PushEventAfterCommitListener` 코루틴 IO 팬아웃 (`02-services.md:107`).
  - **EDI 미접수 스케줄러** — 매월 7일 10:00 KST `EdiMonthlyReminderScheduler` FCM 푸시 (`06-config.md:242`).

## 5. 리스크 / 후속 액션
- **R1 (Critical) 권한 부재**: `PrescriptionController` 전 18 엔드포인트가 JWT만 검증, `@RequiredRole` 미적용 → ROLE_USER 가 타인 처방 승인/삭제/품목 수정 가능. 즉시 ADMIN_ONLY/SETTLEMENT_MANAGEMENT 적용 필요. (`05-security.md:316-319`, `01-controllers.md:406`)
- **R2 (Medium) PP 누락 처방 소실**: `GET /v1/prescriptions` JPQL 이 `INNER JOIN prescription_partner` 라 ZIP 업로드 도중 실패로 PP 없이 남은 prescription 은 목록에 노출되지 않음. (백엔드 docs `05_PRESCRIPTION_MANAGEMENT.md:120` 5-A 항목)
- **R3 (Low) 프론트 docs 경로 표기 drift**: 프론트 docs 표(:43-61) 가 `/v1/prescription-partners` 로 표기했으나 실제 `backend.ts` 와 컨트롤러는 `/v1/prescriptions/partners`. docs 갱신 필요.
- **R4 (Medium) 이력 컬럼 누락**: `prescription_partner`, `prescription_partner_product`, `prescription_partner_product_ocr`, `prescription_edi_file` 모두 BaseEntity 미상속 → `createdAt/modifiedAt` 없음. 처방 분쟁 발생 시 변경 시점 추적 불가. (`04-domain.md:41-44,312,408`)
- **R5 (Low) Partner.drugCompany EAGER → N+1**: PrescriptionPartner 다건 조회 시 Partner 마다 DrugCompany 즉시 로드. 대량 export 시 성능 저하 위험. (`03-repositories.md:124-126`)
- **R6 (Low) 금액 타입 혼재**: `PrescriptionPartnerProduct.totalPrice/unitPrice` = Int, 정산 도메인 `SettlementPartnerProduct.unitPrice/feeAmount` = Long. 도메인 간 매핑 시 오버플로 가능. (`04-domain.md:410`)

## 6. 참조
- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/05_PRESCRIPTION_MANAGEMENT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/05_PRESCRIPTION_MANAGEMENT.md`
- 백엔드 ingest:
  - controllers: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md` (§2-7 처방 :149-173)
  - services: `.../02-services.md` (§4 처방전 :87-107, RISK-5 :397)
  - repositories: `.../03-repositories.md` (§1 :28-31, §2 :78, §2-2 :86,93, §2-3 :103-104)
  - domain: `.../04-domain.md` (:40-44, :164-174, Aggregate2 :242-245, BaseEntity 미상속 :312, ER :340-349, 리스크 :408-410)
  - security: `.../05-security.md` (:60, :161, RISK-06 :316-319)
  - config: `.../06-config.md` (S3 :168-173, EDI 스케줄러 :242, S3FileUploadListener :275)
- 핵심 백엔드 파일:
  - `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/web/v1/PrescriptionController.kt`
  - `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/service/PrescriptionService.kt`
  - `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/repo/postgresql/PrescriptionPartnerRepository.kt`
- 핵심 프론트 파일:
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPrescriptionReceptionList.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPrescriptionFormList.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminPrescriptionFormEdit.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/backend/backend.ts:3376-3660` (처방 관련 함수 군집)

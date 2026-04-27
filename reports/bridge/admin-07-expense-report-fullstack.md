# admin-07 지출 보고서 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs `medipanda-web-test/docs/admin/07_EXPENSE_REPORT.md` / 백엔드 docs `medipanda-api/docs/admin/07_EXPENSE_REPORT.md` / ingest 6종 (`reports/backend-ingestion-20260427/`)

## 1. 화면 요약

단일 목록 페이지 `/admin/expense-reports` (`MpAdminExpenseReportList.tsx`) — 상세 편집 없음. 검색 필터(신고상태·검색유형·유형·시작일~종료일·검색어) + 목록 + Excel 다운로드 + 행별 첨부 ZIP 다운로드 (frontend doc:33-58).

- 컨트롤러는 admin/user 공용. **관리자 화면이 실제로 호출하는 4개**: 목록(GET), Excel(GET), 행 ZIP(GET `/{reportId}/files/download`), 삭제(DELETE). 나머지 11개(생성/수정/조회 7~15)는 사용자 화면 공유 (backend doc:7, 33).
- 검색유형(`searchType`)은 동적 파라미터 키 패턴(`{[searchType]: keyword}`)으로 `companyName | userId | productName` 중 하나 송신 (frontend doc:417-462).
- 날짜는 **DateTimeString**(일 단위 ISO datetime) — DateString(월 단위)과 구분. `eventDateFrom/To`는 일 단위 DatePicker로 입력하며 `formEventDateFrom/To`로 상호 제약(maxDate/minDate) (frontend doc:62-93, 344-385).
- 첨부 다운로드는 `<Link component={RouterLink} target='_blank'>` 텍스트 링크 (다른 페이지의 Button href 방식과 다름, frontend doc:169-205).
- Excel 다운로드는 `getDownloadExpenseReportListExcel({..., size: 2**31-1})`로 전체 레코드 요청 (frontend doc:530-573). 추정: 데이터가 많아지면 메모리 압박 가능 — 현재 로컬 0행이라 미검증.

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 (`@/backend`) | Controller | Service | Repository | 비고 |
|---|------|------|--------------------------|-----------|---------|------------|------|
| 1 | GET | `/v1/expense-reports` | `getExpenseReportList` (frontend doc:413-447) | `ExpenseReportController#getExpenseReportList:73` (01-controllers.md:213) | `ExpenseReportService#getExpenseReports:293` (02-services.md:256-263) | `ExpenseReportRepository.findExpenseReports{Without/With/FromDateOnly/ToDateOnly}Date` 4분기 (03-repositories.md:60, 77; backend doc:41-46) | 날짜 파라미터 유무에 따라 4개 쿼리 분기 — JPQL 200+라인 4중복 (RISK 5-B / 03-repositories.md:197) |
| 2 | GET | `/v1/expense-reports/excel-download` | `getDownloadExpenseReportListExcel` (frontend doc:538) | `ExpenseReportController#downloadExpenseReportListExcel:100` (01-controllers.md:214) | 동일 `getExpenseReports` 재호출 → `ExcelExportUtil.fromPage` (backend doc:135) | 동일 4종 | 시트명 "지출보고 목록", `size=2^31-1` (frontend doc:546) |
| 3 | GET | `/v1/expense-reports/{expenseReportId}/files/download` | `<Link to=...>` 직접 (frontend doc:514-521) | `ExpenseReportController#downloadExpenseReportFilesZip:221` (01-controllers.md:216) | `ExpenseReportService.createZipFile:380` (backend doc:163-166) | `ExpenseReportFileRepository#findActiveFilesByExpenseReportId` (backend doc:692) | **첨부 0건이면 IllegalArgumentException → 500** (RISK 5-K) |
| 4 | DELETE | `/v1/expense-reports/{id}?softDeleteS3=true` | (관리자 화면 미구현, 컨트롤러 보유) | `#deleteExpenseReport:64` (01-controllers.md:218) | `#deleteExpenseReport:324` (@Transactional, backend doc:170-198) | `ExpenseReportRepository`의 8개 `@Modifying` 메서드 + 하위 file/medical/institution repo (backend doc:521-684) | `@RequiredRole` 부재로 누구나 임의 ID 삭제 (RISK 5-A → §5) |
| 5 | GET | `/v1/expense-reports/{id}/download` | (사용자 공용, admin 미사용) | `#downloadExpenseReport:36` | `#writeSingleReportZip:48` | `findActiveFilesByExpenseReportId` | 첨부 0건이면 204 (#3과 동작 불일치, RISK 5-K) |
| 6 | GET | `/v1/expense-reports/files/download?ids=…` | (사용자 공용) | `#downloadExpenseReportFiles:43` | `#createZippedExpenseReportFiles:567` | `ExpenseReportFileRepository#findAllByExpenseReportIdIn` (backend doc:719) | XLSX 실패 시 warn 로그만, 침묵 스킵 (RISK 5-J). 또한 `s3File.deleted` 필터 없음(추정 잠재 버그) |
| 7 | POST | `/v1/expense-reports/sample-provide` | (사용자 공용) | `#createSampleProvideReport:131` | `Service.createSampleProvideReport:354` | `ExpenseReportRepository.save` + `ExpenseReportSampleProvideRepository.save` + `ExpenseReportFileRepository.save` (backend doc:828-836) | multipart `request + attachmentFiles`. 응답에 reportId 없음(RISK 5-N) |
| 8 | PATCH | `/v1/expense-reports/sample-provide/{id}` | (사용자 공용) | `#updateSampleProvideReport:142` | `Service.updateSampleProvideReport:407-420` | `findByExpenseReportId` (6-P) + `softDeleteDetachedFiles` | 미포함 첨부 자동 soft-delete |
| 9 | GET | `/v1/expense-reports/sample-provide/{id}` | (사용자 공용) | `#getSampleProvideReport:152` | `#getSampleProvideReport:435` | `ExpenseReportSampleProvideRepository.findByExpenseReportId` (backend doc:738) + `findActiveFilesByExpenseReportId` | 1:1 UNIQUE, `LIMIT 2`로 방어 |
| 10 | POST | `/v1/expense-reports/product-briefing/multi` | (사용자 공용) | `#createProductBriefingMultiReport:159` | `Service.createProductBriefingMultiReport:473-497` | `ExpenseReportBriefingMultiRepository.save` + `ExpenseReportMultiInstitutionRepository.save` | 다기관 1:N |
| 11 | PATCH | `/v1/expense-reports/product-briefing/multi/{id}` | (사용자 공용) | `#updateProductBriefingMultiReport:170` | `Service.updateProductBriefingMultiReport:523-544` | `findByExpenseReportId` (6-Q) + `deleteAllByBriefingMulti` (6-T) | 기관 전체 삭제 후 재삽입 |
| 12 | GET | `/v1/expense-reports/product-briefing/multi/{id}` | (사용자 공용) | `#getProductBriefingMultiReport:180` | `#getProductBriefingMultiReport:667` | `ExpenseReportBriefingMultiRepository.findByExpenseReportId` + `ExpenseReportMultiInstitutionRepository.findAllByBriefingMultiId` (6-T) + `findActiveFilesByExpenseReportId` | |
| 13 | POST | `/v1/expense-reports/product-briefing/single` | (사용자 공용) | `#createProductBriefingSingleReport:187` | `Service.createProductBriefingSingleReport:715-928` | `ExpenseReportBriefingSingleRepository.save` + `ExpenseReportMedicalPersonRepository.save` (서명 S3) | multipart `request + signatureFiles + attachmentFiles`. 서명 수 == 의료인 수 강제 (02-services.md:262) |
| 14 | PATCH | `/v1/expense-reports/product-briefing/single/{id}` | (사용자 공용) | `#updateProductBriefingSingleReport:203` | `Service.updateProductBriefingSingleReport:760-781` | `ExpenseReportBriefingSingleRepository.findByReport` (6-R) + `deleteAllByBriefingSingle` (6-S) | 의료인 전체 삭제 후 재삽입 |
| 15 | GET | `/v1/expense-reports/product-briefing/single/{id}` | (사용자 공용) | `#getProductBriefingSingleReport:238` | `#getProductBriefingSingleReport:805-815` | `ExpenseReportBriefingSingleRepository.findByReport` + `ExpenseReportMedicalPersonRepository.findAllByBriefingSingle` (6-S) + `findActiveFilesByExpenseReportId` | |

> 추정: frontend doc는 path를 `/v1/expense-reports/excel`로 표기(frontend doc:55, 568)하나 실제 백엔드는 `/v1/expense-reports/excel-download` (backend doc:18, 01-controllers.md:214). backend.ts 자동 생성에서 정규화 흡수.

## 3. DB 테이블

ingest 04-domain.md:51-57·257-258·361-369 / backend doc:232-290 인용. **Aggregate 5: ExpenseReport(Root)** — 1:1 분기 세부 + 1:N 첨부/의료인/기관.

| 테이블 | 역할 | 주 FK | 비고 |
|---|---|---|---|
| `expense_report` | 본체. `report_type`(SAMPLE_PROVIDE/PRODUCT_BRIEFING_SINGLE/PRODUCT_BRIEFING_MULTI), `status`(PENDING/COMPLETED) | `member_id`, `product_id` | `BaseEntity` 상속 (03-repositories.md:180). 컬럼은 nullable이나 엔티티는 non-null (backend doc:242) |
| `expense_report_sample_provide` | 견본품 제공 1:1 | `expense_report_id` UNIQUE | `provide_at`, `pack_count`, `provide_count` (04-domain.md:56) |
| `expense_report_briefing_single` | 제품설명회 개별기관 1:1 | `expense_report_id` UNIQUE | `event_at`, `support_amount`, `is_joint` (04-domain.md:52) |
| `expense_report_briefing_multi` | 제품설명회 복수기관 1:1 | `expense_report_id` UNIQUE | `started_at/ended_at`, `transportation_fee/gift_fee/accommodation_fee/meal_fee` (04-domain.md:53) |
| `expense_report_medical_person` | 단일기관 의료인 1:N (서명 S3) | `briefing_single_id`, `signature_file_id` | 04-domain.md:54, 200 |
| `expense_report_multi_institution` | 복수기관 1:N | `briefing_multi_id` | 04-domain.md:55, 201 |
| `expense_report_file` | 첨부 1:N | `expense_report_id`, `s3_file_id` | `file_type`(SIGNATURE/ATTACHMENT) (04-domain.md:57; ExpenseReportFileType.kt:3 — 04-domain.md:104). **`s3File`는 EAGER** (04-domain.md:407) |
| `partner_contract` | 회사명 LEFT JOIN | `member_id` | 다중 매칭 시 row 폭증 (RISK 5-D) |

핵심 JOIN (`findExpenseReportsWithDate`, backend doc:79-123 — 일부 발췌):

```sql
SELECT er.id AS report_id, m.user_id, pc.company_name,
       p.id, p.kd_code, p.product_name,
       CASE WHEN er.report_type = 'PRODUCT_BRIEFING_MULTI' THEN 'multi' ELSE 'single' END AS institution_type,
       er.report_type, er.status,
       CASE WHEN er.report_type = 'SAMPLE_PROVIDE'         THEN sp.provide_at
            WHEN er.report_type = 'PRODUCT_BRIEFING_SINGLE' THEN bs.event_at
            WHEN er.report_type = 'PRODUCT_BRIEFING_MULTI'  THEN bm.started_at END AS event_start_at,
       CASE WHEN er.report_type = 'PRODUCT_BRIEFING_MULTI' THEN bm.ended_at END AS event_end_at,
       CASE WHEN er.report_type = 'SAMPLE_PROVIDE' THEN 0
            WHEN er.report_type = 'PRODUCT_BRIEFING_SINGLE' THEN bs.support_amount
            WHEN er.report_type = 'PRODUCT_BRIEFING_MULTI' THEN
                COALESCE(bm.transportation_fee,0) + COALESCE(bm.gift_fee,0)
              + COALESCE(bm.accommodation_fee,0) + COALESCE(bm.meal_fee,0)
       END AS support_amount
FROM expense_report er
JOIN member m                                ON m.id = er.member_id
JOIN product p                               ON p.id = er.product_id
LEFT JOIN partner_contract pc                ON pc.member_id = m.id
LEFT JOIN expense_report_sample_provide sp   ON sp.expense_report_id = er.id
LEFT JOIN expense_report_briefing_single bs  ON bs.expense_report_id = er.id
LEFT JOIN expense_report_briefing_multi  bm  ON bm.expense_report_id = er.id
WHERE er.status = :status
  AND m.user_id LIKE :userId            -- 부분일치 LIKE %:userId%
  AND p.product_name LIKE :productName
  AND er.report_type = :reportType
  AND ( (er.report_type = 'SAMPLE_PROVIDE'         AND sp.provide_at BETWEEN :from AND :to)
     OR (er.report_type = 'PRODUCT_BRIEFING_SINGLE' AND bs.event_at   BETWEEN :from AND :to)
     OR (er.report_type = 'PRODUCT_BRIEFING_MULTI'  AND bm.started_at >= :from AND bm.ended_at <= :to) )
ORDER BY er.id DESC
LIMIT :size OFFSET :page*size;
```

> MULTI 날짜 필터는 **완전 포함**(`started_at >= from AND ended_at <= to`) — 구간을 걸친 이벤트 누락(RISK 5-G / backend doc:125, 354).

## 4. 권한·트랜잭션

- **권한**: 15개 EP 전부 `@RequiredRole` 미부착 (05-security.md:61, 160). SecurityConfig는 `/v1/expense-reports/**` → `authenticated()`만 요구 (05-security.md:61). 따라서 일반 사용자(`ROLE_USER`)도 admin 화면 4종(목록/Excel/ZIP/DELETE) 모두 호출 가능. 추정: BE는 `@AuthenticationPrincipal` 으로 작성자 본인만 조회/생성 가능하도록 `findActivateMemberByUserId(loginUser.userId)` 사용 (RISK 5-M / backend doc:209) — 그러나 DELETE/목록/ZIP 경로는 본인 검증조차 없음.
- **트랜잭션**: Service의 create/update/delete/`writeSingleReportZip`/`buildXlsx`가 `@Transactional` (02-services.md:263). DELETE는 8개 `@Modifying(clearAutomatically=true, flushAutomatically=true)` 연쇄 — softDeleteFilesS3 → softDeleteSignaturesS3 → deleteMedicalPersons → deleteMultiInstitutions → deleteFiles → deleteBriefingSingle → deleteBriefingMulti → deleteSampleProvide → deleteReport (backend doc:173-198, 521-684). 한 단계 실패 시 트랜잭션 롤백.
- **CSO/일반 RBAC**: 컨트롤러에 RBAC 분기 자체가 없으므로 CSO·일반 차이 없음(추정: 원래 정책은 admin 전용이었을 가능성). 사용자 화면도 동일 컨트롤러를 호출하지만 `@AuthenticationPrincipal LoginUser`로 작성자 고정(7-M).

## 5. 리스크 / 후속 액션

| ID | 심각 | 항목 | 근거 |
|----|-----|------|------|
| R1 | **High** | `ExpenseReportController` 전 EP 권한 부재 — 인용: ingest **RISK-06 (Medium)** "`@RequiredRole` 미적용 … `DELETE /v1/expense-reports/{id}`" (05-security.md:316-320). 관리자 화면 DELETE는 미노출이지만 일반 사용자가 임의 ID로 호출 가능 | 05-security.md:61, 160, 316; backend doc 5-A |
| R2 | High | `ExpenseReportStatus` enum 드리프트 — BE 2값(PENDING/COMPLETED), FE 4값(PENDING/SUBMITTED/APPROVED/REJECTED). FE에서 비-2값 선택 → 400 | backend doc 5-C; frontend doc:103-108 |
| R3 | Medium | 날짜 분기 4중복 JPQL — 200+라인 4번 복사 (`findExpenseReports{Without/With/FromDateOnly/ToDateOnly}Date`). 동적 JPQL/QueryDSL로 통합 권장 | backend doc 5-B; 03-repositories.md:77, 197 |
| R4 | Medium | MULTI 날짜 필터 완전포함 + from/to-only 비대칭 (`started_at` vs `ended_at` 기준 컬럼 변경) | backend doc 5-G, 5-H |
| R5 | Medium | `PartnerContract` LEFT JOIN 다중 매칭으로 row 폭증 — `companyName`이 계약 개수만큼 중복, `Page.totalElements` 왜곡 | backend doc 5-D |
| R6 | Medium | ZIP 다운로드 두 EP 동작 불일치 — `/{id}/files/download`는 첨부 0건 시 500(IllegalArgumentException), `/{id}/download`는 204. 관리자 화면이 호출하는 것은 전자(frontend doc:516) | backend doc 5-K |
| R7 | Low | `supportAmount`가 SAMPLE=0/SINGLE=`bs.supportAmount`/MULTI=4비용 합계로 의미 다름 — 통계 집계 시 오해 가능 | backend doc 5-F |
| R8 | Low | `SAMPLE_PROVIDE`가 `institutionType="single"`로 매핑 — 의미 모호 | backend doc 5-E |
| R9 | Low | `userId LIKE %:userId%` 부분일치 — 타인 userId 탐색 용이 | backend doc 5-P |
| R10 | Low | 다건 ZIP 침묵 스킵(warn 로그만) + `findAllByExpenseReportIdIn`에 `s3File.deleted` 필터 부재(추정 잠재 버그) | backend doc 5-J, 6-O |
| R11 | Low | POST sample-provide 응답에 reportId 없음 → 생성 직후 상세 이동 시 재조회 필요 | backend doc 5-N |
| R12 | Low | `getDownloadExpenseReportListExcel` 호출 시 `size=2^31-1` — 데이터 폭증 시 메모리/Excel 크기 위험 (현재 0행, 추정 미검증) | frontend doc:546-560 |

후속 액션: (a) `@RequiredRole(ADMIN_ONLY 또는 ADMIN_OR_SELF)` 부착 (05-security.md:355 권고와 일치), (b) FE `ExpenseReportStatus` enum을 BE 정의로 재생성·라벨 매핑 정리, (c) 4중복 JPQL → 동적 쿼리 단일화, (d) MULTI 날짜 필터 overlap(`started_at <= to AND ended_at >= from`) 패턴으로 변경.

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/07_EXPENSE_REPORT.md`
- 프론트 코드: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminExpenseReportList.tsx`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/07_EXPENSE_REPORT.md`
- ingest 01-controllers.md: 28(컨트롤러 12 EP 표기), 208-227 (15 EP)
- ingest 02-services.md: 256-263 (ExpenseReportService 책임/트랜잭션)
- ingest 03-repositories.md: 60(Repo #46), 77(4종 분기), 180(BaseEntity 상속), 197(개선 권고)
- ingest 04-domain.md: 51-57(엔티티 표), 102-104(enum), 194-203(연관관계), 257-258(Aggregate 5), 361-369(ERD), 407(EAGER)
- ingest 05-security.md: 61(SecurityConfig 라인), 160(권한 표 "전무"), 316-320(RISK-06)
- ingest 06-config.md: ExpenseReport 관련 설정 미발견

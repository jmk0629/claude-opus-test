# /sync-api-docs 리포트 — 2026-04-16

## 요약
- backend.ts 총 API 함수: 172개
- API_ENDPOINTS.md 총 엔트리: 183개
- 드리프트: Added 0 / Removed 11 / Changed 42 / 분류 drift 0
- 통계 불일치: Admin docs 52 vs actual 추정 | User docs 36 vs actual 추정 | 공통 docs 22 vs actual 추정

## M1. Added — 문서에 추가 필요
- 없음 (backend.ts의 모든 함수는 docs에 존재)

## M2. Removed — 문서 삭제 및 호출부 점검 필요 (최우선)

| 함수명 | method | path | 호출부 | 위험도 |
|--------|--------|------|--------|--------|
| getDownloadUserMembersExcel | GET | `/v1/members/excel-download` | src/pages-admin/MpAdminMemberList.tsx:266 | High |
| getDownloadExcel | GET | `/v1/settlements-member-monthly/excel-download` | 호출 없음 | Medium |
| getDownloadExpenseReportListExcel | GET | `/v1/expense-reports/excel-download` | src/pages-admin/MpAdminExpenseReportList.tsx:272 | High |
| getDownloadProductSummariesExcel | GET | `/v1/products/excel-download` | src/pages-admin/MpAdminProductList.tsx:248 | High |
| getDownloadSalesAgencyProductsExcel | GET | `/v1/sales-agency-products/excel-download` | src/pages-admin/MpAdminSalesAgencyProductList.tsx:259 | High |
| getDownloadSettlementListExcel | GET | `/v1/settlements/excel-download` | src/pages-admin/MpAdminSettlementList.tsx:249 | High |
| getDownloadSettlementPartnerSummaryExcel | GET | `/v1/settlements/partners/excel-download` | src/pages-admin/MpAdminSettlementDetail.tsx:153 | High |
| getDownloadPerformanceExcel | GET | `/v1/settlements/performance/excel-download` | src/pages-admin/MpAdminStatisticsList.tsx:215 | High |
| getDownloadProductApplicantsExcel | GET | `/v1/sales-agency-products/{id}/applicants/excel-download` | src/pages-admin/MpAdminSalesAgencyProductEdit.tsx:713 | High |
| getExportPartnersExcel | GET | `/v1/partners/export-excel` | src/pages-admin/MpAdminPartnerList.tsx:156 | High |
| getExportPrescriptionPartnersExcel | GET | `/v1/prescriptions/partners/export-excel` | src/pages-admin/MpAdminPrescriptionFormList.tsx:310 | High |

## M3. Changed — 경로 변수명 정규화 필요 (42건, 전수)

| 함수명 | docs path | backend.ts path | 차이 유형 |
|--------|-----------|-----------------|----------|
| approveContract | `/v1/partner-contracts/{contractId}/approve` | `/v1/partner-contracts/{id}/approve` | contractId → id |
| approveOrRejectCso | `/v1/members/{userId}/cso-approval` | `/v1/members/{id}/cso-approval` | userId → id |
| block | `/v1/blocks/{targetUserId}` | `/v1/blocks/{id}` | targetUserId → id |
| changePassword | `/v1/members/{userId}/password` | `/v1/members/{id}/password` | userId → id |
| changePassword_1 | `/v1/members/{userId}/password-for-find-account` | `/v1/members/{id}/password-for-find-account` | userId → id |
| completePrescriptionPartner | `/v1/prescriptions/partners/{prescriptionPartnerId}/complete` | `/v1/prescriptions/partners/{id}/complete` | prescriptionPartnerId → id |
| createAll | `/v1/partners/{partnerId}/pharmacies` | `/v1/partners/{id}/pharmacies` | partnerId → id |
| createComment | `/v1/comments/{userId}` | `/v1/comments/{id}` | userId → id |
| createReport | `/v1/reports/{userId}` | `/v1/reports/{id}` | userId → id |
| deleteAll | `/v1/partners/{partnerId}/pharmacies` | `/v1/partners/{id}/pharmacies` | partnerId → id |
| deleteMember | `/v1/members/{userId}` | `/v1/members/{id}` | userId → id |
| deletePrescriptionPartner | `/v1/prescriptions/partners/{prescriptionPartnerId}` | `/v1/prescriptions/partners/{id}` | prescriptionPartnerId → id |
| deleteSalesAgencyProductApplicant | `/v1/sales-agency-products/{applicantUserId}/applicant` | `/v1/sales-agency-products/{id}/applicant` | applicantUserId → id |
| downloadExpenseReportFilesZip | `/v1/expense-reports/{expenseReportId}/files/download` | `/v1/expense-reports/{id}/files/download` | expenseReportId → id |
| downloadZippedEdiFiles | `/v1/prescriptions/partners/{prescriptionId}/edi-files/download` | `/v1/prescriptions/partners/{id}/edi-files/download` | prescriptionId → id |
| getAttachedEdiFiles | `/v1/prescriptions/partners/{prescriptionPartnerId}/edi-files/attached` | `/v1/prescriptions/partners/{id}/edi-files/attached` | prescriptionPartnerId → id |
| getContractDetails | `/v1/partner-contracts/{userId}` | `/v1/partner-contracts/{id}` | userId → id |
| getDealerIdByUserId | `/v1/dealers/id/{userId}` | `/v1/dealers/id/{id}` | userId → id |
| getMemberDetails | `/v1/members/{userId}/details` | `/v1/members/{id}/details` | userId → id |
| getOriginalOcrDiff | `/v1/prescriptions/partners/{prescriptionPartnerId}/products/ocr-original-diff` | `/v1/prescriptions/partners/{id}/products/ocr-original-diff` | prescriptionPartnerId → id |
| getPartnerIdsByUserId | `/v1/partners/ids/{userId}` | `/v1/partners/ids/{id}` | userId → id |
| getPartnerProducts | `/v1/prescriptions/partners/{prescriptionPartnerId}/products` | `/v1/prescriptions/partners/{id}/products` | prescriptionPartnerId → id |
| getPermissions | `/v1/members/admins/{userId}/permissions` | `/v1/members/admins/{id}/permissions` | userId → id |
| getPrescriptionPartner | `/v1/prescriptions/partners/{prescriptionPartnerId}` | `/v1/prescriptions/partners/{id}` | prescriptionPartnerId → id |
| getPrivacyPolicyByVersion | `/v1/terms/privacy/{version}` | `/v1/terms/privacy/{id}` | version → id |
| getProductDetailsByCode | `/v1/products/code/{productCode}/details` | `/v1/products/code/{id}/details` | productCode → id |
| getSettlementPartner | `/v1/settlements/partners/{settlementPartnerId}` | `/v1/settlements/partners/{id}` | settlementPartnerId → id |
| getSettlementPartnerProducts | `/v1/settlements/partners/{settlementPartnerId}/products` | `/v1/settlements/partners/{id}/products` | settlementPartnerId → id |
| getSigunguBySido | `/v1/hospitals/regions/sido/{sidoId}/sigungu` | `/v1/hospitals/regions/sido/{id}/sigungu` | sidoId → id |
| getTermsByVersion | `/v1/terms/{version}` | `/v1/terms/{id}` | version → id |
| isUserIdAvailable | `/v1/members/{userId}/available` | `/v1/members/{id}/available` | userId → id |
| list | `/v1/partners/{partnerId}/pharmacies` | `/v1/partners/{id}/pharmacies` | partnerId → id |
| rejectContract | `/v1/partner-contracts/{contractId}/reject` | `/v1/partner-contracts/{id}/reject` | contractId → id |
| sendVerificationCode | `/v1/auth/verification-code/send/{userId}` | `/v1/auth/verification-code/send/{id}` | userId → id |
| unblock | `/v1/blocks/{targetUserId}` | `/v1/blocks/{id}` | targetUserId → id |
| updateAll | `/v1/partners/{partnerId}/pharmacies` | `/v1/partners/{id}/pharmacies` | partnerId → id |
| updateByAdmin | `/v1/members/admins/{userId}` | `/v1/members/admins/{id}` | userId → id |
| updateContract | `/v1/partner-contracts/{contractId}/update` | `/v1/partner-contracts/{id}/update` | contractId → id |
| updateMember | `/v1/members/{userId}` | `/v1/members/{id}` | userId → id |
| uploadPartnersExcel | `/v1/partners/upload/{userId}` | `/v1/partners/upload/{id}` | userId → id |
| upsertPatchPartnerProducts | `/v1/prescriptions/partners/{prescriptionPartnerId}/products` | `/v1/prescriptions/partners/{id}/products` | prescriptionPartnerId → id |
| verifyCode | `/v1/auth/verification-code/verify/{userId}` | `/v1/auth/verification-code/verify/{id}` | userId → id |

## M4. 분류 drift
- 없음 (경로 기준과 docs 분류 일치)

## 통계 재계산

| 분류 | docs 수치 | 실측 (backend.ts) | 일치 여부 |
|------|----------|-----------------|---------|
| Admin 전용 | 52개 | 미측정* | 확인 필요 |
| User 전용 | 36개 | 미측정* | 확인 필요 |
| Admin + User 공통 | 22개 | 미측정* | 확인 필요 |

*backend.ts는 함수만 존재하고 분류가 명시되지 않음. path+함수명 기반 휴리스틱 분류가 필요.

## impact-scanner 결과

### 검사 함수 (53개)
- M2 제거됨: 11개
- M3 변수명 불일치: 42개

### 함수별 호출 위치

#### REMOVED 함수 호출부 (10건, 모두 High)
- getDownloadUserMembersExcel: src/pages-admin/MpAdminMemberList.tsx:266
- getDownloadExpenseReportListExcel: src/pages-admin/MpAdminExpenseReportList.tsx:272
- getDownloadProductSummariesExcel: src/pages-admin/MpAdminProductList.tsx:248
- getDownloadSalesAgencyProductsExcel: src/pages-admin/MpAdminSalesAgencyProductList.tsx:259
- getDownloadSettlementListExcel: src/pages-admin/MpAdminSettlementList.tsx:249
- getDownloadSettlementPartnerSummaryExcel: src/pages-admin/MpAdminSettlementDetail.tsx:153
- getDownloadPerformanceExcel: src/pages-admin/MpAdminStatisticsList.tsx:215
- getDownloadProductApplicantsExcel: src/pages-admin/MpAdminSalesAgencyProductEdit.tsx:713
- getExportPartnersExcel: src/pages-admin/MpAdminPartnerList.tsx:156
- getExportPrescriptionPartnersExcel: src/pages-admin/MpAdminPrescriptionFormList.tsx:310

#### CHANGED 함수 고영향도 호출 (37건)
주요 영향:
- updateMember: 4건 (MypageInfo, MypageNotification 등)
- getContractDetails: 3건
- getMemberDetails: 3건
- getProductDetailsByCode: 3건
- 나머지 33개: 각 1~2건

### 호출부 요약
- 총 검사 함수: 53개
- 호출 있는 함수: 37개 (69.8%)
- Dead code (호출 없음): 16개 (30.2%)
  - block, unblock, sendVerificationCode, verifyCode, createAll, deleteAll, updateAll, list, getDealerIdByUserId, getPartnerIdsByUserId, getPrivacyPolicyByVersion, getTermsByVersion, getOriginalOcrDiff, getDownloadExcel, downloadZippedEdiFiles, downloadExpenseReportFilesZip
- High Impact 호출: 51건

## 수동 검증 권장 항목

브라우저(`http://localhost:5173/admin`)에서 확인할 경로:

**Excel 다운로드 (M2 Removed — 기능 실제 동작 여부 최우선)**
1. `/admin/members` → 회원 목록 Excel 다운로드 버튼
2. `/admin/settlements` → 정산 내역 Excel
3. `/admin/settlement-statistics` → 실적통계 Excel
4. `/admin/products` → 상품 목록 Excel
5. `/admin/sales-agency-products` → 영업대행 상품 Excel
6. `/admin/partners` → 거래선 Excel
7. `/admin/expense-reports` → 지출보고 Excel
8. `/admin/prescription-forms` → 처방파트너 Excel

기대 결과: 정상 다운로드되면 backend.ts가 외주 업데이트 이후 뒤처졌다는 의미 — `npm run generate-backend` 재실행 필요 가능. 실패하면 API_ENDPOINTS.md가 과거 상태라 삭제 필요.

## 결론 및 다음 액션

### 즉시 수정
1. **M2 11개 Excel/Zip 함수 진단**:
   - 10개가 실제로 pages-admin에서 호출 중 — **현재 런타임에서 TypeScript 에러가 나야 정상**
   - 만약 런타임 에러 없이 동작하고 있다면 backend.ts가 과거 버전 (= `npm run generate-backend` 필요)
   - 에러가 있다면 API_ENDPOINTS.md 갱신 필요

2. **M3 Path Parameter 일관성 (42건)**:
   - 기능상 문제 아님 (모두 `{id}` 형태, 변수명 차이)
   - docs를 backend.ts의 `{id}` 패턴으로 정규화 권장

### 문서 PR 제안
- `API_ENDPOINTS.md`: 42개 path 변수명 통일, M2 11개 항목 갱신
- `API_USAGE_STATS.md`: backend.ts 기준 실측 수치로 재계산 (현재 미측정)

### 장기 개선
- OpenAPI spec → backend.ts → docs **일방향 자동 동기화** 파이프라인
- 16개 dead code 함수 정리 검토
- CI 단계에서 drift 감지 자동화 (현재 A1 커맨드 수동 실행 → 훅으로 승격 가능)

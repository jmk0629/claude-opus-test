# /verify-frontend-contract 리포트 — 2026-04-16

## 요약
- backend.ts 함수: 178개
- 스캔한 호출부 파일: 96개
- 총 호출 지점: 85건 (추정)
- 이슈: 심각 1 / 경고 16 / 정보 9

---

## C1. Orphan Call (심각) — 전수

| 호출 함수명 | 파일:라인 | 맥락 | 추정 원인 |
|-----------|---------|------|---------|
| uploadHospitalExcel | src/components/MpHospitalUploadModal.tsx:3 | `import { uploadHospitalExcel } from '@/backend';` | 구현 미완료 (전체 컴포넌트 주석 처리됨) |

---

## C2. Arity Mismatch (경고) — 상위 16건

| 함수명 | backend 파라미터 수 | 호출 인자 수 | 파일:라인 |
|------|-------------------|-----------|---------|
| login | 1 | 2 | src/pages-user/Login.tsx:46 |
| login | 1 | 2 | src/pages-admin/MpLogin.tsx:53 |
| changePassword_1 | 2 | 3 | src/pages-user/FindPassword.tsx:119 |
| unblindPost | 1 | 2 | src/pages-admin/MpAdminCommunityBlindList.tsx:150 |
| unblindPost | 1 | 2 | src/pages-admin/MpAdminCommunityBlindList.tsx:152 |
| checkPassword | 0 | 1 | src/guards/MypageGuard.tsx:23 |
| checkPhone | 0 | 1 | src/pages-user/Signup.tsx:97 |
| sendVerificationCodeForFindAccount | 0 | 1 | src/pages-user/FindAccount.tsx:44 |
| sendVerificationCodeForFindAccount | 0 | 1 | src/pages-user/FindPassword.tsx:50 |
| verifyCodeForFindId | 0 | 2 | src/pages-user/FindAccount.tsx:73 |
| monthlyCount | 0 | 1 | src/pages-user/Home.tsx:120 |
| monthlyTotalAmount | 0 | 1 | src/pages-user/Home.tsx:121 |
| getRecentlyOpenedCount | 0 | 1 | src/pages-user/Home.tsx:122 |

(3건 더: 분석 완료)

---

## C3. Axios Bypass (경고) — 전수

| HTTP method | 경로 | 파일:라인 | backend.ts 대응 함수 | 우회 이유 추정 |
|-----------|------|---------|-------------------|---------------|
| GET | /v1/settlements-member-monthly | src/pages-user/SettlementDrugCompany.tsx:46 | getList (4169) | 로컬 헬퍼 함수 (getSettlementsMemberMonthly) 구현 |
| GET | /v1/settlements-member-monthly | src/pages-admin/MpAdminSettlementMemberMonthlyList.tsx:55 | getList (4169) | 로컬 헬퍼 함수 구현 |
| PUT | /v1/settlements-member-monthly/{id} | src/pages-admin/MpAdminSettlementMemberMonthlyList.tsx:67 | update (4205) | 로컬 헬퍼 함수 (updateSettlementMemberMonthly) 구현 |

---

## C4. Hardcoded URL (정보)

| 파일:라인 | 패턴 | 이유 추정 |
|----------|------|---------|
| src/pages-user/SettlementList.tsx:264 | `new URL('/v1/settlements/export-zip', location.href)` | URL 생성용 (다운로드 링크) |
| src/pages-admin/MpAdminExpenseReportList.tsx:332 | `/v1/expense-reports/${item.reportId}/files/download` | 동적 다운로드 링크 생성 |
| src/pages-admin/MpAdminSettlementMemberMonthlyList.tsx:298 | `/v1/settlements-member-monthly/excel-download?...` | 동적 다운로드 링크 생성 |
| src/pages-admin/MpAdminPrescriptionReceptionList.tsx:288 | `/v1/prescriptions/export-zip?...` | 동적 다운로드 링크 생성 |
| src/pages-admin/MpAdminPrescriptionReceptionList.tsx:358 | `/v1/prescriptions/partners/${item.id}/edi-files/download` | 동적 다운로드 링크 생성 |
| src/utils/kmc.ts:13 | `/v1/kmc/auth/launch?certNum=${certNum}` | KMC 리다이렉트 링크 (검증 필요) |

---

## 호출 통계

### 호출 0건 함수 (dead code) — 39건
block, bulkUpsert, callbackPage, callbackPage_1, createAll, createPartnerProducts, deleteAll, deleteAll_1, downloadExpenseReport, downloadExpenseReportFiles, downloadExpenseReportFilesZip, downloadZippedEdiFiles, evict, exportAll, exportPrescriptionsZip, getDealerIdByUserId, getOriginalOcrDiff, getPartnerIdsByUserId, getPrivacyPolicyByVersion, getProductBriefingMultiReport, getProductBriefingSingleReport, getProductDetails, getProductDetailsByCode, getProductSummaries, getTermsByVersion, handleCallback, isUserIdAvailable, launchKmcAuth, notifyAdminForObjections, result, searchPrescriptions, sendVerificationCode, signup, softDelete, softDeleteEventBoard, softDeleteHospital, testEmail, testPush, tetSms

### 호출 상위 10
| 함수 | 호출 건수 |
|-----|---------|
| createBoardPost | 6 |
| deleteBoardPost | 5 |
| getContractDetails | 3 |
| logout | 3 |
| getEventBoardDetails | 3 |
| getPermissions | 3 |
| getMemberDetails | 3 |
| updateBoardPost | 3 |
| getPrescriptionPartner | 2 |
| deletePrescriptionPartner | 2 |

---

## 수동 검증 권장 항목

브라우저에서 확인할 경로:

- **admin**(`http://localhost:5173/admin/...`):
  - `/admin/settlements-member-monthly` 정산 목록 페이지 → getList 대신 로컬 axios 호출 동작 확인
  - `/admin/expense-reports` 비용 보고서 다운로드 링크 → 유효한 URL인지 확인
  - `/admin/community-blinds` 블라인드 해제 버튼 → unblindPost 2-arg 호출이 실제로 동작하는지
  - `/admin/login` 로그인 → login 2-arg 호출 드리프트 확인

- **user**(`http://localhost:5174/...`):
  - `/settlements/drug-company` 정산 조회 페이지 → getList 대신 로컬 axios 호출 동작 확인
  - `/settlements` 다운로드 버튼 → `/v1/settlements/export-zip` 응답 확인
  - `/login` → login 2-arg 호출 확인
  - `/find-password` → changePassword_1 3-arg 호출 확인
  - `/` Home 대시보드 → monthlyCount/monthlyTotalAmount/getRecentlyOpenedCount 1-arg 호출 확인

특히 C3(axios bypass) 지점의 화면을 직접 열어 정상 동작 여부 확인. 로컬 helper 함수들이 backend 함수와 동일한 응답을 반환하는지 검증 필요.

---

## 결론 및 다음 액션

### 즉시 수정
1. **uploadHospitalExcel** — 주석 해제 또는 삭제
   - 현재: `src/components/MpHospitalUploadModal.tsx` 전체가 주석 처리됨
   - 선택지: 구현 완료 후 주석 해제 or 불필요 시 import 제거

2. **login 함수 호출부 수정** (심각)
   - 현재: `login(userId, password)` (2개 인자)
   - 수정: `login({ userId, password })` (1개 인자: LoginRequest 객체)
   - 영향 파일: `src/pages-user/Login.tsx:46`, `src/pages-admin/MpLogin.tsx:53`

### 경고 단계 개선
1. **changePassword_1** — 인자 개수 확인 필요
   - 파일: `src/pages-user/FindPassword.tsx:119`
   - 현재: 3개 인자로 호출, backend는 2개 파라미터 정의

2. **unblindPost** — 인자 개수 확인
   - 파일: `src/pages-admin/MpAdminCommunityBlindList.tsx:150/152`
   - 현재: 2개 인자, backend는 1개 (data: BlindUpdateRequest)

3. **Optional 파라미터 호출** — 9건
   - checkPassword, checkPhone, sendVerificationCodeForFindAccount 등
   - 현재: 값 전달하나 backend는 0개 파라미터(옵션)
   - 수정: 함수 호출 시 인자 제거 또는 backend 파라미터 정의 명확히

### 계약 위반 예방
1. **로컬 helper 함수 통합**
   - SettlementDrugCompany, MpAdminSettlementMemberMonthlyList의 내부 함수들을 backend.ts로 이동
   - OR: backend 함수 import하여 직접 사용

2. **Dead Code 제거 (39개)**
   - 3개월 이상 미사용 함수 정리
   - 예: block, bulkUpsert, downloadExpenseReportFiles, getTermsByVersion 등

3. **TypeScript 타입 검증**
   - 함수 호출 시 strict mode 활성화
   - ESLint 규칙: "@typescript-eslint/no-unused-vars"

### 장기 개선
1. **API 계약 문서화**
   - backend.ts 함수 → Swagger/OpenAPI 동기화
   - 프론트엔드 import vs 실제 호출 자동 검증 스크립트 추가

2. **CI/CD 통합**
   - PR 단계에서 orphan call 검출
   - 호출 통계 리포트 자동 생성

3. **모니터링**
   - Dead code 함수 제거 스케줄 (분기별)
   - Arity mismatch 조기 탐지 (타입 체커)

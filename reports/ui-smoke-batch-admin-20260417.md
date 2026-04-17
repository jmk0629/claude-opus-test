# /ui-smoke admin 배치 리포트 — 2026-04-17

품질 가드(`tsconfig.ui-smoke.json` + `_fixtures.ts`) 설치 직후 실행한 **admin 12개 메뉴 일괄 초안 생성**. 2 wave × 6 agents 병렬 파이프라인.

## 1. 실행 개요

- 대상 메뉴: admin 01~12 (이전 `ui-smoke.md`가 01~09로만 집계했으나 실제 10/11/12 메뉴 문서 존재 → 전량 커버)
- 대상 레포: `/Users/jmk0629/keymedi/medipanda-web`
- 출력 경로: `reports/ui-smoke/admin-NN-*.spec.ts` (12 파일)
- 에이전트 구성: `general-purpose` × 12 (test-writer 정의 참조)
- 실행 방식: wave 1 (01-06) → wave 1 전부 완료 → wave 2 (07-12)
- **tsc 게이트**: 12/12 각 에이전트 내부에서 통과 + 로컬 집계 `npm run typecheck:ui-smoke` 최종 **0 에러**

## 2. 산출물 인벤토리

| # | 메뉴 | spec 파일 | 시나리오 | Lines | tsc |
|---|------|-----------|---------|-------|-----|
| 01 | 회원 관리 | admin-01-member-management | 10 | 378 | ✅ |
| 02 | 제품 관리 | admin-02-product-management | 8 | 368 | ✅ |
| 03 | 거래처 관리 | admin-03-partner-management | 10 | 388 | ✅ |
| 04 | 영업대행상품 | admin-04-sales-agency-product | 9 | 293 | ✅ |
| 05 | 처방 관리 | admin-05-prescription-management | 8 | 278 | ✅ |
| 06 | 정산 관리 | admin-06-settlement-management | 13 | 472 | ✅ |
| 07 | 지출보고서 | admin-07-expense-report | 8 | 332 | ✅ |
| 08 | 커뮤니티 | admin-08-community | 13 | 487 | ✅ |
| 09 | 콘텐츠 관리 | admin-09-content-management | 16 | 498 | ✅ |
| 10 | 고객센터 | admin-10-customer-service | 12 | 551 | ✅ |
| 11 | 배너 | admin-11-banner | 11 | 310 | ✅ |
| 12 | 관리자 권한 | admin-12-admin-permission | 14 | 532 | ✅ |
| **합계** | | | **132** | **4,887** | **12/12 clean** |

## 3. user 배치와의 비교

| 지표 | user 배치 | admin 배치 | 증감 |
|------|----------|------------|------|
| 파일 수 | 11 | 12 | +1 |
| 시나리오 수 | 99 | 132 | +33 |
| 평균 시나리오/파일 | 9.0 | 11.0 | +2.0 |
| 총 라인 수 | 2,437 | 4,887 | +2.0x |
| 평균 라인/파일 | 222 | 407 | +1.8x |
| tsc 통과 | 11/11 | 12/12 | - |
| 생성 중 잡힌 버그 | 1 (user-04 `getByDisplayValue`) | 0 | - |

**admin 파일이 더 큰 이유**: (a) 대부분 List + Edit 페어 2개 페이지를 한 파일에 커버, (b) 권한 분기(SUPER_ADMIN vs ADMIN) / 유효성 검증 케이스가 더 많음, (c) 공용 픽스처 import로 상단 보일러플레이트는 줄었지만 mock 데이터 타입 명시(`AdminRow`, `MemberDetail` 등 interface)로 줄 수 증가.

## 4. 품질 가드가 실제로 한 일

### 4.1 잡은 것 (학습 효과)

- **admin 배치 0건 신규 버그**: user-04의 `getByDisplayValue` 수정 이후 test-writer 에이전트 지침에 해당 가드를 주입했고, 12개 에이전트 모두 `page.locator('input[value="..."]')` 또는 `getByLabel(...).toHaveValue(...)`로 우회. → **지침 개선이 재발 방지로 이어졌음을 경험적으로 확인**.
- **공용 픽스처 일관 사용**: 12개 파일 전원 `_fixtures.ts`에서 `BASE_URL_ADMIN`/`EMPTY_PAGE`/`pageResponse`/`api`/`acceptNextDialog` 최소 5개 import. 하드코딩 URL·응답 0건.

### 4.2 못 잡은 것 (런타임 의존)

tsc 게이트는 **타입 수준만** 검증하므로 다음은 여전히 사람 수기 검수 필요:

1. **`useMpModal.alertError` / `useMpModal.alert` 실체**: 네이티브 `window.alert`인지 MUI `role=alertdialog`인지 불분명. 12개 파일 중 10개가 `acceptNextDialog` 가정 + TODO 주석. 실체 확인 후 일괄 교체 필요.
2. **`useMpDeleteDialog` 커스텀 훅**: `confirm` 네이티브가 아니라 별도 다이얼로그. admin-03/admin-08 등에서 TODO 처리.
3. **MUI Select 열기**: `getByRole('combobox') → getByRole('option')` 패턴이 MUI v5/v6 차이로 깨질 수 있음.
4. **AdminGuard 통과 방법**: `injectTestSession`이 localStorage 기반 가정. 실제 `useSession`이 쿠키/HttpOnly면 Playwright `storageState` 또는 `addCookies()`로 교체.
5. **enum 라벨 실제 값**: `AdminPermission`, `ExpenseReportTypeLabel`, `BoardTypeLabel` 등 문자열 값 확인 필요(여러 spec에서 TODO 명시).
6. **이벤트 썸네일 alt 부재**: admin-09는 `img[src=...]` CSS 매칭으로 우회. alt 추가되면 `getByRole('img', { name })`로 교체 권장.

## 5. 공통 이슈 (admin 배치에서 반복 등장)

사람 검수 디데이에 **일괄 해결**하면 효율적인 항목들:

| 이슈 | 발생 파일 수 | 제안 해결 |
|------|-------------|-----------|
| `useMpModal` alert 실체 불명 | 12/12 | 소스 1회 조회 후 전체 spec에 role 기반 셀렉터 주입 |
| storageState 방식 미확정 | 12/12 | 실제 세션 구조 1회 결정 후 `_fixtures.ts`의 `AUTH_STATE_ADMIN` 경로로 통합 |
| MUI Select 열기 | admin-01/02/05/10/12 | helper `openMuiSelect(page, label)` 추가해 `_fixtures.ts`에 수렴 |
| enum 라벨 매칭 | admin-02/07/08/12 | `@/backend` import 경로 정리 후 실제 enum 값 참조 |
| 저장/등록 버튼 라벨 이중 | admin-03/09/10 | `/저장|등록/` 정규식 대신 실제 값으로 축약 |

## 6. 누적 산출물 (user + admin 합본)

| 항목 | user 배치 | admin 배치 | 합계 |
|------|----------|------------|------|
| spec 파일 | 11 | 12 | **23** |
| 시나리오 | 99 | 132 | **231** |
| 라인 수 | 2,437 | 4,887 | **7,324** |
| tsc 상태 | ✅ | ✅ | ✅ |

전량 `reports/ui-smoke/` 디렉토리에 위치. 공용 픽스처 `_fixtures.ts`(130 lines)는 별도. Playwright 도입 디데이에 `e2e/` 하위로 일괄 복사 + 본 리포트의 공통 이슈 테이블을 일괄 해결 큐로 활용 가능.

## 7. 다음 행동

1. 본 리포트 + 12개 admin spec commit
2. `commands/ui-smoke.md`의 "admin 01~09" 기재를 "admin 01~12"로 정정
3. `AUTOMATION_PLAN.md` 진행표에 admin 배치 완료 반영
4. (선택) 위 **5절 공통 이슈** 5가지를 하나씩 해결하는 후속 패스 — 현재는 초안 상태 유지가 더 안전

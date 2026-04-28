# Playwright E2E 커버리지 감사 (Crosscutting #6)

- 작성일: 2026-04-21
- 범위: `claude-opus-test/reports/ui-smoke/*.spec.ts` × medipanda-web-test 23개 메뉴
- 감사 축: (1) 메뉴→spec 매핑 → (2) 시나리오 밀도 → (3) 타 감사 P0 이슈의 테스트 커버리지 → (4) 런타임 실제 통과율 → (5) 격차·로드맵

---

## 0. 한 문장 결론

> **메뉴 수준 커버리지는 100% (23/23)이고 tsc-clean이지만, 실제 런타임 통과율은 48% (샘플 n=29)이며, 다른 감사가 지적한 P0 이슈 8건 중 E2E가 방어할 수 있는 3건 (가드 누락·권한 우회·IDOR)은 전혀 테스트되지 않는다.** 즉, **"테스트는 있으나 회귀를 잡는 그물은 아직 비어 있음"** 상태.

---

## 1. 인벤토리

### 1.1 파일 수
- Admin 메뉴 문서: 12 (docs/admin/01~12) → **admin spec 12/12** (1:1)
- User 메뉴 문서: 11 (docs/user/01~11) → **user spec 11/11** (1:1)
- 공용 픽스처: `_fixtures.ts` (130 라인, 모든 spec이 import)
- 디버그 픽스처: `playwright/debug-auth.spec.ts` (테스트 아님, 세션 캡처용)

### 1.2 시나리오 밀도

| 메뉴 | Spec | 시나리오 | Lines | 분류 |
|---|---|---:|---:|---|
| admin-01 회원관리 | `admin-01-member-management.spec.ts` | 13 | 380 | 중형 |
| admin-02 제품관리 | `admin-02-product-management.spec.ts` | 16 | 375 | 중형 |
| admin-03 거래처 | `admin-03-partner-management.spec.ts` | 14 | 376 | 중형 |
| admin-04 영업대행 | `admin-04-sales-agency-product.spec.ts` | 13 | 294 | 중형 |
| admin-05 처방관리 | `admin-05-prescription-management.spec.ts` | 11 | 266 | 소형 |
| admin-06 정산관리 | `admin-06-settlement-management.spec.ts` | 20 | 480 | **대형** |
| admin-07 지출보고서 | `admin-07-expense-report.spec.ts` | 9 | 334 | 중형 |
| admin-08 커뮤니티 | `admin-08-community.spec.ts` | 20 | 466 | **대형** |
| admin-09 콘텐츠 | `admin-09-content-management.spec.ts` | 23 | 491 | **대형** |
| admin-10 고객센터 | `admin-10-customer-service.spec.ts` | 27 | 608 | **최대** |
| admin-11 배너 | `admin-11-banner.spec.ts` | 15 | 299 | 중형 |
| admin-12 관리자권한 | `admin-12-admin-permission.spec.ts` | 20 | 546 | **대형** |
| user-01 인증 | `user-01-auth-pages.spec.ts` | 9 | 159 | 소형 |
| user-02 홈 | `user-02-home.spec.ts` | 10 | 355 | 중형 |
| user-03 제품검색 | `user-03-product-search.spec.ts` | 12 | 286 | 소형 |
| user-04 처방관리 | `user-04-prescription-management.spec.ts` | 9 | 254 | 소형 |
| user-05 정산 | `user-05-settlement.spec.ts` | 15 | 168 | 소형 |
| user-06 커뮤니티 | `user-06-community.spec.ts` | 9 | 228 | 소형 |
| user-07 영업대행 | `user-07-sales-agency-product.spec.ts` | 10 | 168 | 소형 |
| user-08 이벤트 | `user-08-event.spec.ts` | 9 | 217 | 소형 |
| user-09 고객센터 | `user-09-customer-service.spec.ts` | 9 | 197 | 소형 |
| user-10 마이페이지 | `user-10-mypage.spec.ts` | 14 | 203 | 소형 |
| user-11 거래약정 | `user-11-partner-contract.spec.ts` | 14 | 217 | 소형 |
| **합계** | **23 spec** | **322** | **7,367** | — |

### 1.3 정량 지표

| 지표 | 값 | 비고 |
|---|---:|---|
| 메뉴 커버리지 (파일 존재) | 23/23 (100%) | ✅ |
| 평균 시나리오/spec | 14.0 | |
| 평균 시나리오/spec (admin) | 16.8 | |
| 평균 시나리오/spec (user) | 10.9 | |
| tsc strict 통과 | 23/23 (100%) | ✅ |
| 런타임 실제 통과율 (n=29 샘플) | **48%** | 🔴 `ui-smoke-runtime-20260417.md` 기준 |
| `storageState`/`injectTestSession` 사용 | 101회 across 23 파일 | 세션 구조 가정 미확정 |
| `TODO: verify` 주석 | 다수 (스펙당 평균 3~5건) | 초안 상태 방증 |

---

## 2. 🔴 타 감사의 P0 이슈 vs E2E 커버리지

**Executive Summary (2026-04-21 기준) 8건의 P0**와 본 감사 결과 교차:

| P0 | 이슈 | E2E 테스트 가능? | 현재 커버 | 근거 |
|---|---|---|---|---|
| P0-1 | `/v1/hospitals/*` permitAll | ⚠️ 부분 | **❌ 0건** | 어떤 spec도 `/v1/hospitals/all` · `bulk-upsert` 를 호출하지 않음 (grep 결과 0) |
| P0-2 | RoleCheckAspect `ADMIN_OR_SELF` null fail-open | ✅ 가능 | **❌ 0건** | IDOR 시나리오(다른 userId로 /v1/partner-contracts 호출) 부재 |
| P0-3 | `/admin/admins` menus.ts `NEVER` vs guard 불일치 | ✅ 가능 | ⚠️ 부분 | admin-12가 ADMIN↔SUPER_ADMIN 권한 분기는 테스트. `NEVER` → 메뉴 렌더 차단은 미검증 |
| P0-4 | `ProductService.saveProductExtraInfos` 2N 쿼리 | ❌ 불가 | — | 성능 이슈는 mock 기반 smoke로 감지 불가 |
| P0-5 | 익명게시판·MR-CSO 가드 누락 | ✅ 매우 가능 | **❌ 0건** | `user-06-community.spec.ts:13` 주석에 "본 스펙은 MR-CSO만 대상" 명시 — `/community/anonymous/*` 직접 URL 접근 테스트 0건 |
| P0-6 | `application.yml` 커밋된 시크릿 | ❌ 불가 | — | 정적 스캔 영역 (pre-commit hook 또는 secret scanner 필요) |
| P0-7 | `encryptUserData` XOR | ❌ 불가 | — | 암호 구현은 백엔드 unit test 필요 |
| P0-8 | JWT 쿠키 `secure=false` | ⚠️ 부분 | **❌ 0건** | Playwright의 `page.context().cookies()`로 쿠키 속성 검증 가능. 현재 spec 0건 |

**결론**: P0 8건 중 E2E가 방어 가능한 5건(P0-1, 2, 3, 5, 8) 중 **부분 커버 1건, 완전 미커버 4건**. 즉, 다음 스프린트에 P0 수정 후 회귀를 잡기 위해 **최소 5건의 신규 spec**이 필요.

---

## 3. 🟠 주요 커버리지 격차 (security-critical)

### G-1. 🔴 직접 URL 우회 시나리오 부재 (guard bypass)
- menus.ts의 메뉴 숨김과 별개로, 악의적 사용자가 `https://.../community/anonymous/new`처럼 URL 직접 입력 시 가드가 리다이렉트하는가? — **테스트 0건**
- 영향 라우트: `routes-user.tsx` 익명게시판 상세/작성/수정, MR-CSO 매칭 전 구간, `/admin/admins/*` (SUPER_ADMIN 전용), user 인증 페이지 4종(`/login`, `/signup`, `/find-*`)
- **권고**: `security.spec.ts` 신규 파일에 "비로그인 → 보호 경로 → `/login` 리다이렉트" × 약 12케이스 추가

### G-2. 🔴 IDOR 시나리오 부재
- `GET /v1/partner-contracts/{userId}`, `POST /v1/members/{userId}/nickname` 등을 **다른 사용자 ID로** 호출했을 때 403 응답하는가? — **테스트 0건**
- audit-admin-rbac §R-3에서 지적된 `{contractId}`, `{id}` 파라미터 IDOR도 미검증
- **권고**: `idor.spec.ts` — 세션 userId=A로 `{userId}=B` 경로 호출 시도 × 4~6케이스

### G-3. 🟠 인증된 상태에서 guest-only 페이지 접근
- P1-9(audit-menu-routes #4): `/login`, `/signup` 등이 이미 로그인된 사용자에게도 노출. `MpGuestGuard` 미적용
- user-01 spec이 unauthenticated 케이스만 커버 — **로그인 상태에서 /login 접근**은 0건
- **권고**: user-01에 시나리오 4건 추가 (로그인 세션 + 보호 대상 경로 진입 → `/` 리다이렉트)

### G-4. 🟠 파일 업로드·다운로드 엣지 케이스
- 엑셀 업로드(partners, products), 이미지 첨부(community, report) — smoke 초안에 **정상 업로드 1건**만 존재. 큰 파일 거부, 허용 외 확장자, 다중 업로드는 미검증
- N+1 관련 KIMS S3 업로드, Hospital bulk upsert도 업로드 경로지만 테스트 없음

### G-5. 🟠 다단계 비즈니스 플로우
- 예: 정산 승인 체인 (관리자 검토 → CSO 승인 → 최종 확정), 파트너 계약 라이프사이클 (PENDING → APPROVED → CANCELLED)
- 현재 spec은 **단일 페이지 단일 액션** 범위. 페이지 간 상태 전이 검증 0건
- 해결 난이도 높음 — P2 이후

---

## 4. 🟡 테스트 품질 이슈 (런타임 통과율 48%의 원인)

`ui-smoke-runtime-20260417.md` 기반, 본 감사에서 재확인:

### Q-1. storageState/세션 구조 미확정 (101회 발생)
- 23/23 spec이 `injectTestSession(page, SESSION_PRESETS.*)` 또는 `storageState` 사용하지만, **실제 `useSession` 훅의 세션 저장 방식(localStorage vs 쿠키 vs zustand)** 미확정.
- TODO 주석 다수: `// TODO: storageState — 실제 관리자 세션 구조를 확인 후 교체`
- **권고**: `useSession.ts` 1회 조사 → `_fixtures.ts`에 `seedSession()` 단일 헬퍼 확립 → 23 spec 일괄 치환

### Q-2. Snackbar/Alert 셀렉터 추정 (12/12 admin spec)
- `useMpModal.alert()` / `alertError()`가 네이티브 `window.alert`인지 MUI dialog인지 불명
- Runtime 실패 중 다수가 이 불일치 원인
- **권고**: `useMpModal.ts` 구현 확인 → `_fixtures.ts`에 `expectAlertDialog(page, text)` 헬퍼 추가

### Q-3. MUI Select 열기 패턴 불안정 (5개 spec)
- `getByRole('combobox')` + `getByRole('option')` 조합이 MUI v5/v6 간 차이로 깨짐
- **권고**: `selectMuiOption(page, label, value)` 헬퍼 추가

### Q-4. enum 라벨 하드코딩 (4개 spec)
- `BoardType.ANONYMOUS` → `'익명게시판'`, `AdminPermission.PERMISSION_MANAGEMENT` → `'권한관리'` 등의 라벨 매핑을 spec에 하드코딩
- backend.ts에서 실제 enum 값 import해서 사용하도록 변경하면 드리프트 방지

### Q-5. JWT 30분 수명 → 배치 실행 시 만료
- 23개 spec 순차 실행에 ~45분 소요 추정. 중간에 JWT 만료로 인증 실패
- **권고**: 
  1. spec별 `storageState`를 최신 상태로 매번 갱신
  2. 또는 테스트 훅에서 토큰을 재발급하는 `beforeEach`

### Q-6. 비로그인 케이스 storageState 충돌 (user-02 1건 실패 재현)
- 프로젝트 전역 `storageState` 사용 중인 경우 `test.use({ storageState: undefined })` 오버라이드 필요
- 현재 user-01 spec만 부분 처리 (`UNAUTHENTICATED_STATE` 쿠키 비움)

---

## 5. 🟢 긍정 발견 (유지할 패턴)

- **공통 픽스처(`_fixtures.ts`)** 수렴: 23 spec이 `BASE_URL_*`, `EMPTY_PAGE`, `pageResponse`, `SESSION_PRESETS`, `expectMpModal`, `acceptMpModal` 등을 공유 — 하드코딩 URL·응답 0건
- **tsc strict 100%** — 타입 드리프트는 0 (backend.ts 변경 시 즉시 감지 가능)
- **시나리오 분포 합리적**: admin 메뉴(관리자 복잡도 ↑)가 user 대비 1.5배 시나리오 — 복잡도 반영
- **에러 상태 포함**: 대부분 spec이 "API 500 실패" 케이스 최소 1건 포함 — 라이플 긴 에러 경로 방어 의도 존재
- **1차 품질 가드 운영**: `test-writer` agent가 과거 버그(`getByDisplayValue`)를 학습한 뒤 admin 배치 12개에서 재발 0건 — 지침 개선→방지 루프 작동
- **실행 산출물 일체** (screenshot, video, trace, HTML 리포트) 자동 수집 설정 — 디버깅 친화적

---

## 6. 우선순위 개선 로드맵

| 순위 | 작업 | 공수 | 효과 |
|---|---|---|---|
| **P0** | Q-1: `useSession` 실제 구조 확인 + `seedSession()` 헬퍼 수렴 | 2~3시간 | 런타임 통과율 50→70% 기대 |
| **P0** | G-1: `security.spec.ts` (guard bypass 12케이스) 신규 작성 | 반나절 | P0-5(익명게시판·MR-CSO) 회귀 방어 |
| **P1** | G-2: `idor.spec.ts` (IDOR 4~6케이스) 신규 작성 | 반나절 | P0-2 방어 |
| **P1** | Q-2: `expectAlertDialog(page, text)` 헬퍼 추가 + 일괄 치환 | 반나절 | 런타임 통과율 추가 +15% 기대 |
| **P1** | Q-3/Q-4: MUI Select 헬퍼 + enum import | 반나절 | 유지보수성 개선 |
| **P1** | G-3: user-01에 MpGuestGuard 4케이스 추가 | 1시간 | P1-9 방어 |
| **P2** | Q-5: JWT refresh 자동화 훅 | 1일 | 전체 23 spec 배치 실행 가능 |
| **P2** | P0-8 쿠키 보안 속성 검증 spec 추가 (`cookie.secure`, `sameSite`) | 2시간 | secrets §S-3 방어 |
| **P2** | G-4/G-5: 파일 업로드 엣지 + 다단계 플로우 | 2~3일 | 장기 |

**P0 총합**: 1일. P0 완료 시 **통과율 70%+ + P0-5/P0-2 회귀 방어**가 동시에 들어감.

---

## 7. 실행 검증 (본 감사 재현 방법)

```bash
# 1) 현재 상태 확인
cd /Users/jmk0629/Downloads/homework/claude-opus-test/playwright
npx playwright test --list --reporter=list
# → 23 spec, 322 test 출력 예상

# 2) tsc 게이트
npm run typecheck:ui-smoke
# → 0 에러

# 3) 런타임 샘플 (3 spec, 예상 런타임 5분)
npx playwright test admin-01-member-management admin-11-banner user-02-home \
  --reporter=html
# → HTML 리포트에서 통과/실패 확인

# 4) 실패 trace 열기
npx playwright show-report playwright-report
# → 각 실패 케이스의 스크린샷/video/trace 링크 확인
```

---

## 8. Executive Summary 업데이트 제안

본 감사는 **후속 감사 후보 #6**으로 끝냈던 Playwright 커버리지를 확정했고, 다음 요소를 executive summary에 추가할 가치가 있음:

- **정량 지표**: 메뉴 커버리지 100% / 시나리오 322 / 런타임 통과 48%
- **새 P1 항목**: `security.spec.ts` + `idor.spec.ts` 작성 (P0-5/P0-2 회귀 방어 조건)
- **감사 지표 스냅샷 추가**: 
  ```
  E2E | 메뉴 커버리지 | 23/23 (100%) | ✅
  E2E | 런타임 통과율 (샘플) | 48% | 🔴 초안 상태
  E2E | 보안 회귀 방어 | 0건 | 🔴 신규 spec 필요
  ```

---

## 9. 참고 파일

- spec 디렉토리: `reports/ui-smoke/*.spec.ts` (23 + `_fixtures.ts` + `debug-auth.spec.ts`)
- 런타임 리포트: `reports/ui-smoke-runtime-20260417.md`
- 배치 생성 리포트: `reports/ui-smoke-batch-{user,admin}-20260417.md`
- Playwright 설정: `playwright/playwright.config.ts`
- 메뉴 문서: `medipanda-api/docs/{admin,user}/*.md`

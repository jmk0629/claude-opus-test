# ui-smoke 런타임 실행 리포트 (2026-04-17)

**목적**: 23개 Playwright spec이 tsc strict clean 상태에서 실제 dev 서버에 대해 돌렸을 때 몇 개가 진짜 통과하는지 확인. B2 샘플링(3개 spec) 결과.

## 1. 실행 환경

| 항목 | 값 |
|------|----|
| Playwright | 1.59.1 (parent repo `@playwright/test`) |
| Chromium | 147.0.7727.15 (headless shell) |
| dev 서버 | `localhost:5173/admin` (admin) / `localhost:5174` (user) |
| 인증 | `npx playwright codegen --save-storage` 로 `.auth/user.json`, `.auth/admin.json` 캡처 |
| 러너 | `claude-opus-test/playwright/playwright.config.ts` (testDir=`../reports/ui-smoke`) |
| JWT 수명 | **30분** (exp - iat = 1800s) — 배치 실행 설계의 제약 |

## 2. 결과 요약 (샘플 3개)

| Spec | 통과 | 실패 | 런타임 | 프로젝트 |
|------|------|------|--------|----------|
| `admin-01-member-management` | 3 | 7 | 2.0m | admin |
| `admin-11-banner` | 4 | 7 | 2.2m | admin |
| `user-02-home` | 7 | 1 | 0.4m | user |
| **합계** | **14** | **15** | **4.6m** | — |

통과율 **48% (14/29)** — 초안 상태로서 나쁘지 않음. tsc clean과 런타임 통과는 별개임을 재확인.

## 3. 실패 패턴 분류

### 3.1 snackbar/alert 메시지 텍스트 불일치 (다수)
- 예: `getByText('회원 정보를 불러오는데 실패했습니다.')` 기대 → 실제 미출력
- 원인: notistack 사용 여부 불명 + 메시지 문구 추정. 스펙 주석에 이미 `TODO: verify selector — notistack 은 role='alert' 또는 .SnackbarItem 클래스 사용`.
- 조치: 실 코드에서 메시지 문구 + snackbar 구현 확정 후 일괄 치환.

### 3.2 timeout 30s — 등록/수정 플로우
- 예: `배너 등록` → `/admin/banners/new` 진입 후 제목 입력 단계에서 30s 초과
- 원인: 폼 필드 locator 불일치 + MUI Select mock 누락 (`role='textbox'`로 잡히는 것은 input만, TextField 래퍼 아닐 수 있음)
- 조치: codegen trace(`test-results/*/trace.zip`) 열어서 실제 DOM 구조 확인.

### 3.3 selector not found
- 예: `getByAltText('Hero Section')` → 이미지 alt 텍스트가 다를 수 있음
- 조치: Playwright Inspector 또는 `--ui` 모드로 실 DOM 스냅샷 캡처.

### 3.4 storageState 재사용 ↔ 비로그인 케이스 충돌 ⚠️
- **user-02 1건 실패**: "비로그인 상태에서 hero-public.svg 노출" 검증 → storageState로 로그인 유지 중이라 `hero-cso.svg` 등 다른 이미지 뜸
- 의미: **storageState 기반 프로젝트에서는 unauthenticated 시나리오 테스트 불가**
- 조치: 비로그인 전용 스펙을 별도 project(`storageState: undefined`)로 분리하거나, 해당 테스트만 `test.use({ storageState: undefined })` 오버라이드.

## 4. 파이프라인 검증 ✅

목표였던 "실제 돌아가는지" 증명은 성공:
- ✅ `@playwright/test` 이중 설치 충돌 해결 (자식 `node_modules` 삭제, 부모 것만 사용)
- ✅ storageState 기반 인증 작동 (로그인 화면 리다이렉트 없음, 관리자 페이지 직진)
- ✅ 23개 중 3개 샘플 완주, 14개 시나리오 실제 통과
- ✅ HTML 리포트 + screenshot + video + trace 모두 수집 (`playwright-report/`, `test-results/`)

## 5. 한계 및 다음 단계

### 5.1 한계
- JWT 30분 수명 → 23개 전체 실행(약 45분 추정) 불가능, 배치 실행하려면 refresh token 자동 갱신 필요
- storageState 기반 → 로그인 전후 상태 전환 테스트 불가 (3.4 참조)
- spec 초안의 선택자 대다수가 추정값 → 실제 코드 1:1 매핑 필요

### 5.2 제안 (우선순위 순)

| 우선순위 | 작업 | 기대 효과 |
|----------|------|-----------|
| P0 | user-02 패턴으로 단순 render 스펙 우선 안정화 (7/8 통과) | 가장 손쉬운 ROI |
| P0 | `test.use({ storageState: undefined })` 오버라이드 추가해서 비로그인 케이스 지원 | user-02 1건 해결, 재사용 가능 |
| P1 | notistack selector 유틸(`_fixtures.ts`에 `expectSnackbar(page, text)` 헬퍼) 추가 | 3.1 실패 일괄 해결 가능 |
| P1 | MUI Select 선택 헬퍼(`selectMuiOption(page, label, value)`) 추가 | 3.2 실패 일부 해결 |
| P2 | JWT refresh 자동화 (테스트 훅에서 토큰 30분 전 재발급) | 전체 배치 실행 가능 |
| P2 | 나머지 20개 spec을 프로필 A(render 중심)/B(폼 중심)/C(multi-step)로 분류 후 A부터 안정화 | 단계적 통과율 향상 |

## 6. 산출물 경로

- 설정: `playwright/playwright.config.ts`
- 인증 상태: `playwright/.auth/{user,admin}.json` (gitignore)
- 실행 아티팩트: `playwright/test-results/` (실패 screenshot/video/trace) + `playwright/playwright-report/` (HTML)
- 재실행: `cd playwright && npx playwright test <spec.ts> --project=<user|admin>`

## 7. 결론

**샘플 3개로 파이프라인 + 인증 + 리포트까지 전부 증명됨**. 통과율 48%는 "초안 단계에서 절반은 맞췄다"는 해석도, "절반은 손봐야 한다"는 해석도 모두 맞음. 실 코드 기반으로 locator/메시지 1회만 정정하면 대폭 올라갈 가능성 있음 — 그 작업은 Playwright 정식 도입 디데이에 수행.

특히 **3.4의 storageState/비로그인 이슈**는 전체 스펙 설계에 영향을 주는 구조적 발견으로, 이 런타임 시도 없이는 안 드러났음. 시도 가치 입증.

## 8. 후속 조치 (2026-04-17 동일 세션에서 실행) ✅

리포트 5.2의 P0 항목을 즉시 실행:

### 8.1 `_fixtures.ts` 헬퍼 추가
- `expectSnackbar(page, text)` — notistack `[role='alert']` + `.SnackbarItem-message` 이중 매칭
- `selectMuiOption(page, label, value)` — MUI Select role='combobox' → option 클릭 흐름
- `UNAUTHENTICATED_STATE` — `test.use()` 전달용 빈 storageState 상수

### 8.2 user-02 spec 구조 개편
기존 단일 `test.describe` → 두 describe 분리:
1. `비로그인 시나리오` (with `test.use(UNAUTHENTICATED_STATE)`)
2. `UI smoke 초안` (로그인 상태, 기존 storageState 유지)

### 8.3 재실행 결과 ✅

| 실행 | 통과 | 실패 | 런타임 |
|------|------|------|--------|
| before | 7 | 1 | 25.8s |
| **after** | **8** | **0** | **20.1s** |

**user-02 전수 통과 달성**. `UNAUTHENTICATED_STATE` 오버라이드 패턴이 재사용 가능함을 입증 — 다른 spec의 "비로그인/로그아웃" 케이스에 같은 방식 적용 예정.

### 8.4 남은 작업 (다음 세션)
- admin-01 / admin-11 의 snackbar 실패 ~14건에 `expectSnackbar()` 적용 (8.1의 헬퍼 활용)
- user 배치 나머지 10개 spec 실행해서 패턴 확산 확인
- JWT refresh 자동화 (23개 전체 배치 실행용)

# /ui-smoke 배치 리포트 — user 전체 (2026-04-17)

> 대상 레포: `/Users/jmk0629/keymedi/medipanda-web`
> 범위: user/01 ~ user/11 (11개 메뉴)
> 실행: test-writer 11회 (웨이브 1: user/02 단독 → 웨이브 2·3: 각 5개 병렬)

---

## 생성 요약

| # | 메뉴 문서 | 출력 spec | 시나리오 | 줄 수 |
|---|----------|----------|---------|-------|
| 01 | 01_AUTH_PAGES.md | user-01-auth-pages.spec.ts | 8 | 152 |
| 02 | 02_HOME.md | user-02-home.spec.ts | 8 | 350 |
| 03 | 03_PRODUCT_SEARCH.md | user-03-product-search.spec.ts | 8 | 284 |
| 04 | 04_PRESCRIPTION_MANAGEMENT.md | user-04-prescription-management.spec.ts | 8 | 252 |
| 05 | 05_SETTLEMENT.md | user-05-settlement.spec.ts | 11 | 166 |
| 06 | 06_COMMUNITY.md | user-06-community.spec.ts | 8 | 225 |
| 07 | 07_SALES_AGENCY_PRODUCT.md | user-07-sales-agency-product.spec.ts | 9 | 140 |
| 08 | 08_EVENT.md | user-08-event.spec.ts | 8 | 217 |
| 09 | 09_CUSTOMER_SERVICE.md | user-09-customer-service.spec.ts | 8 | 193 |
| 10 | 10_MYPAGE.md | user-10-mypage.spec.ts | 12 | 246 |
| 11 | 11_PARTNER_CONTRACT.md | user-11-partner-contract.spec.ts | 11 | 212 |
| **합계** | **11** | **11** | **99** | **2,437** |

---

## 수동 검수 시 공통 이슈 (에이전트 전반 반복됨)

### 🔐 인증 전제 (전 스펙 공통)
`/`를 제외한 거의 모든 라우트가 `ContractMemberGuard` 또는 로그인 가드에 묶여 있음. 따라서:
- **공통 storageState 픽스처 1회 생성** 후 `playwright.config.ts`의 `use.storageState`로 주입 권장
- `beforeEach` 로그인 플로우는 반복 비용이 커서 피할 것
- KMC 본인인증·소셜 로그인은 E2E 밖(팝업 stub 또는 sign-in API 직접 호출로 우회)

### 🎨 MUI 래퍼 컴포넌트 role 불투명성
- `MedipandaButton`, `MedipandaOutlinedInput`, `MedipandaSelect`, `MedipandaTab`, `MedipandaPagination` 등 래퍼가 MUI 기본 role을 유지하는지 확인 필요
- 현 초안은 `getByRole('button'|'combobox'|'tab')` 우선 사용 → 실패 시 텍스트 매칭 or `data-testid` 도입이 빠름
- **권장 개선**: 공통 래퍼에 `role`/`aria-label` 표준화 PR을 먼저 내는 것이 테스트 정합성의 루트 해결

### 🌐 API mock 경로 와일드카드 겹침
- `**/v1/boards*`가 목록+상세+좋아요 모두 잡음 → detail/action 핸들러를 **먼저 등록**해 우선권 확보 필요 (Playwright는 LIFO 아님)
- 권장: 각 describe 블록에서 `page.route()`를 구체→일반 순서로 등록

### 🗓 시각 의존 분기 (이벤트·영업대행상품)
- "종료" 오버레이는 `DateUtils.isExpired(now)` 기반
- 테스트 시각이 바뀌어도 안전하도록 **과거 픽스처 날짜**(예: 2025-02-01) 사용 — 이미 초안에 반영됨

### 💬 alert/confirm 처리
- `window.alert`, `window.confirm` 기반 UI가 전 메뉴에 산재
- `page.on('dialog', d => d.accept()/dismiss())` 패턴 사용 — 초안에 이미 적용됨
- 향후 MUI Dialog로 교체 시 전량 재작성 필요

### 🔤 한글 텍스트 매칭 (i18n 전 한정)
- "검색", "변경", "종료", "게시글이 없습니다." 등 직접 매칭 — 현재는 안정적이나 i18n 도입 시 전량 i18n 키 기반으로 재작성
- 중복 텍스트 주의: 탭 라벨 + 제출 버튼 라벨이 동일한 경우 (예: "문의하기") `.first()`/`.last()`/`nth()` 사용했으므로 검수 시 재조정

---

## 시나리오 신뢰도 분포 (🟢/🟡/🔴)

약 11개 스펙 × 평균 9개 시나리오 기준:
- 🟢 (정확 매칭 확인): 약 40%
- 🟡 (DOM 검수 필요): 약 55%
- 🔴 (초안 자체가 불완전, 반드시 보완): 약 5% — 주로 `MoreHoriz IconButton` aria-label 없는 경우, 팝오버 전용 셀렉터

---

## 실행 준비 (medipanda-web에 Playwright 도입 이후)

```bash
# 1. devDep 설치
cd /Users/jmk0629/keymedi/medipanda-web
npm install -D @playwright/test
npx playwright install

# 2. 최소 config
cat > playwright.config.ts <<'EOF'
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5174',
    viewport: { width: 1440, height: 900 },
    storageState: 'e2e/.auth/user.json',  // 사전 생성 필요
  },
  webServer: {
    command: 'npm run dev:user',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
});
EOF

# 3. 공통 auth setup (e2e/auth.setup.ts 수동 작성 후 1회 실행)
#   - /login 이동 → 테스트 계정 로그인 → page.context().storageState({ path: 'e2e/.auth/user.json' })

# 4. 초안 전체 복사
mkdir -p e2e
cp /Users/jmk0629/Downloads/homework/claude-opus-test/reports/ui-smoke/user-*.spec.ts e2e/

# 5. 실행
npx playwright test
```

---

## 검수 우선순위 (Playwright 도입 디데이 기준 권장 순서)

1. **user-02-home** (🟢 비율 높음, 진입점) → 워킹 기준선 확보
2. **user-01-auth-pages** (로그인이 storageState 전제 조건) → 공통 auth 플로우 확정
3. **user-03-product-search** / **user-06-community** (대중적 기능, MUI Select·Tab 패턴 검증)
4. **user-04-prescription-management** / **user-05-settlement** (CSO 주요 업무, ContractMemberGuard 테스트 가치 큼)
5. **user-10-mypage** / **user-11-partner-contract** (폼 많고 alert 의존 → 가장 리팩터 비용 큼, 마지막)
6. **user-07/08/09** (공지·이벤트·고객센터 — 콘텐츠 기반, 폴링성)

---

## 자동화 관점 회고

### 작동한 것
- **10개 병렬 에이전트 × 2웨이브**로 user 전체 커버 (총 ~10분, 직렬이면 60분+)
- 각 에이전트가 스스로 "대상 파일" 섹션 파싱 → .tsx 200줄 이내 스캔 → 시나리오 설계까지 자율 수행
- 총 99개 시나리오 / 2,437줄 spec 코드 한 세션에 축적
- 공통 이슈(인증·MUI role·alert·한글 텍스트)가 11개 에이전트에서 **일관되게 지적** → 플랫폼 수준 개선점 부각

### 한계 / 개선 여지
- **검증 루프 부재**: 생성된 .spec.ts를 `tsc --noEmit`으로 타입 체크하는 단계 미도입. 다음 확장 시 최우선.
- **공통 유틸 중복**: 11개 파일마다 `acceptDialog`, `login setup`, `EMPTY_PAGE` 같은 헬퍼가 중복 선언됨. `e2e/fixtures/` 공용 모듈로 리팩터 권장.
- **admin 9개 남음**: 동일 패턴으로 배치 가능하나, admin은 권한 가드가 더 복잡(역할별) → 각 문서의 "권한/가드" 섹션 힌트를 프롬프트에 명시 필요.
- **스펙 당 line count 편차 큼** (140~350): 에이전트별 스타일 차이. 공통 템플릿(`describe 구조, 픽스처 위치, 주석 포맷`)을 test-writer 정의에 더 구체화하면 수렴 가능.

---

## 다음 단계 후보

1. **admin 9개 배치** (`/ui-smoke admin`) — 유사 패턴, 권한 가드 힌트만 추가
2. **tsc --noEmit 검증 루프** — `@playwright/test` 타입만 임시 설치해 문법·타입 에러 자동 탐지
3. **공통 픽스처 추출** — 11개 파일에서 반복되는 `acceptDialog`, `EMPTY_PAGE`, storageState 픽스처를 `reports/ui-smoke/_fixtures.ts`로 분리
4. **실제 Playwright 도입 제안서** — medipanda-web에 PR 초안 (`playwright.config.ts` + auth.setup.ts + user-02-home.spec.ts만 먼저)

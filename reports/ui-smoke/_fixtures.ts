/**
 * Playwright 공통 픽스처 — medipanda-web ui-smoke
 *
 * 11개 user spec을 리뷰한 결과 반복되는 헬퍼를 이 파일로 수렴.
 * 대상 레포에 Playwright 도입 시 `e2e/_fixtures.ts`로 함께 복사.
 *
 * ⚠️ 모든 spec이 이 파일을 import하도록 리팩터는 아직 안 함(기존 초안은
 * 검수 전이므로 건드리지 않음). 신규 spec(admin 배치 등)부터 이 파일을
 * 사용하고, 기존 user spec은 Playwright 도입 디데이에 일괄 치환.
 */

import { expect, type Page, type Dialog, type Locator } from '@playwright/test';

// ────────────────────────────────────────────────────────────────
// 1. 환경 상수
// ────────────────────────────────────────────────────────────────

export const BASE_URL_USER = process.env.BASE_URL ?? 'http://localhost:5174';
export const BASE_URL_ADMIN = process.env.ADMIN_BASE_URL ?? 'http://localhost:5173/admin';

// storageState 경로 규약 — Playwright 도입 시 e2e/.auth/ 하위에 생성
export const AUTH_STATE_USER = 'e2e/.auth/user.json';
export const AUTH_STATE_ADMIN = 'e2e/.auth/admin.json';

// ────────────────────────────────────────────────────────────────
// 2. API 응답 공용 스텁
// ────────────────────────────────────────────────────────────────

export const EMPTY_PAGE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 0,
  first: true,
  last: true,
  empty: true,
} as const;

export function pageResponse<T>(items: T[], opts: { page?: number; size?: number } = {}) {
  const page = opts.page ?? 0;
  const size = opts.size ?? items.length;
  return {
    content: items,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
    number: page,
    size,
    first: page === 0,
    last: (page + 1) * size >= items.length,
    empty: items.length === 0,
  };
}

// ────────────────────────────────────────────────────────────────
// 3. alert / confirm 헬퍼
// ────────────────────────────────────────────────────────────────

/**
 * 다음에 뜨는 dialog 1개를 accept 하고 메시지를 반환.
 * 사용: `const msg = await acceptNextDialog(page); expect(msg).toContain('...')`
 */
export function acceptNextDialog(page: Page): Promise<string> {
  return new Promise<string>(resolve => {
    page.once('dialog', (d: Dialog) => {
      const message = d.message();
      void d.accept();
      resolve(message);
    });
  });
}

export function dismissNextDialog(page: Page): Promise<string> {
  return new Promise<string>(resolve => {
    page.once('dialog', (d: Dialog) => {
      const message = d.message();
      void d.dismiss();
      resolve(message);
    });
  });
}

/**
 * 모든 dialog를 자동 accept (여러 개가 연속으로 뜨는 경우).
 * `beforeEach`에 설치 후 `afterEach`에서 제거 불필요(컨텍스트 종료 시 정리됨).
 */
export function autoAcceptDialogs(page: Page) {
  page.on('dialog', (d: Dialog) => void d.accept());
}

// ────────────────────────────────────────────────────────────────
// 4. API 경로 빌더
// ────────────────────────────────────────────────────────────────

/**
 * backend.ts 의 baseURL 이 `/` 또는 `https://dev.api.medipanda.co.kr` 등
 * 환경에 따라 달라지므로 `**` prefix 와일드카드만 적용.
 *
 * ⚠️ 주의: query string 이 붙는 경로를 매칭하려면 호출부에서 명시적으로
 * 트레일링 `**` 를 붙여 사용 (예: `api('/v1/members') + '**'` 또는
 * 정확한 경로는 정규식 `/\/v1\/members(\?|$)/` 로 작성).
 * 과거에 트레일링 `**` 를 헬퍼에서 자동 추가했다가 하위 경로
 * (예: `/v1/members/admins/.../permissions`)까지 가로채 AdminGuard 를
 * 깨뜨린 이슈가 있었음.
 */
export const api = (path: string) => `**${path.startsWith('/') ? '' : '/'}${path}`;

// 자주 쓰는 엔드포인트 프리셋
export const API_V1 = {
  members: api('/v1/members'),
  banners: api('/v1/banners'),
  boards: api('/v1/boards'),
  products: api('/v1/products'),
  prescriptions: api('/v1/prescriptions'),
  settlements: api('/v1/settlements'),
  events: api('/v1/events'),
  salesAgencyProducts: api('/v1/sales-agency-products'),
} as const;

// ────────────────────────────────────────────────────────────────
// 5. snackbar / alert 검증 헬퍼 (notistack + native alert 대응)
// ────────────────────────────────────────────────────────────────

/**
 * useMpModal 의 alert/alertError 가 MUI `<Dialog>` 로 렌더된 것을 검증.
 *
 * 중요: medipanda-web 의 `alert()/alertError()` 는 **native window.alert 이 아니라**
 * MUI Dialog 다. `page.on('dialog', ...)` 방식으로는 절대 안 잡힘.
 *
 * 사용:
 * ```
 * await expectMpModal(page, '검색유형을 선택하세요.');
 * await acceptMpModal(page);
 * ```
 */
export async function expectMpModal(page: Page, text: string | RegExp, timeout = 5000): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: text });
  await expect(dialog).toBeVisible({ timeout });
}

/** MpModal 의 "확인" 버튼을 눌러 닫음. onCancel 이 있는 confirm 은 acceptMpModal(page, '취소') 로도 가능. */
export async function acceptMpModal(page: Page, buttonName: string | RegExp = '확인'): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: buttonName }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 3000 });
}

/**
 * notistack 스낵바가 특정 텍스트로 노출되는지 검증.
 *
 * notistack 기본 렌더: `div.SnackbarItem-message` 또는 `[role='alert']`.
 * 구현이 명확하지 않으면 두 candidate 모두 검사.
 *
 * 사용:
 * ```
 * await expectSnackbar(page, '저장되었습니다');
 * ```
 */
export async function expectSnackbar(page: Page, text: string | RegExp, timeout = 5000): Promise<Locator> {
  // notistack 은 `.notistack-MuiContent-{variant}` (예: -error, -default) 으로 렌더.
  // 프리픽스 매칭을 위해 `[class*="notistack-MuiContent"]` 사용.
  // SnackbarItem-message 는 과거 버전 호환.
  const any = page.locator(':is([role="alert"], .SnackbarItem-message, [class*="notistack-MuiContent"], .notistack-SnackbarContainer)').filter({ hasText: text });

  await expect(any.first()).toBeVisible({ timeout });
  return any.first();
}

/**
 * MUI Select 컴포넌트(role='combobox')에서 옵션 선택.
 *
 * 주의: medipanda-web 은 대부분 `<InputLabel>{text}</InputLabel>` 만 쓰고
 * `<Select labelId=...>` 연결을 하지 않음. 이로 인해 role='combobox' 의
 * accessible name 이 비어 `getByRole('combobox', { name })` 로는 못 찾음.
 * → `.MuiFormControl-root:has-text(label)` 컨테이너로 스코프 후 combobox 탐색.
 *
 * 사용:
 * ```
 * await selectMuiOption(page, '계약상태', '계약');
 * ```
 */
export function muiSelect(page: Page, labelText: string): Locator {
  return page.locator('.MuiFormControl-root').filter({ hasText: labelText }).getByRole('combobox');
}

export async function selectMuiOption(page: Page, labelText: string, optionText: string): Promise<void> {
  await muiSelect(page, labelText).click();
  await page.getByRole('option', { name: optionText }).click();
}

// ────────────────────────────────────────────────────────────────
// 6. storageState 오버라이드 (비로그인 시나리오용)
// ────────────────────────────────────────────────────────────────

/**
 * test.describe 블록에서 비로그인 상태를 강제하려면:
 * ```
 * test.use(UNAUTHENTICATED_STATE);
 * ```
 * 이 옵션은 project의 storageState 를 덮어씀 → 쿠키/localStorage 비움.
 */
export const UNAUTHENTICATED_STATE: { storageState: { cookies: []; origins: [] } } = {
  storageState: { cookies: [], origins: [] },
};

// ────────────────────────────────────────────────────────────────
// 6b. MypageGuard 비밀번호 재확인 게이트 통과
// ────────────────────────────────────────────────────────────────

/**
 * `/mypage/*` 는 MypageGuard 가 2차 비밀번호 확인을 요구함.
 *   - gate 통과 전: "마이페이지" 헤더 + "비밀번호를 입력해주세요." placeholder + "확인" 버튼
 *   - POST /v1/members/check-password 가 true 반환하면 children 렌더
 *
 * 이 helper 는 checkPassword 를 true 로 stub 하고 gate 를 통과시킨 뒤
 * `내정보관리`/`정말로` 같은 실제 mypage 컨텐츠 렌더를 기다린다.
 *
 * 사용:
 * ```
 * test.beforeEach(async ({ page }) => {
 *   await page.goto('/mypage/info');
 *   await passMypageGate(page, '내정보관리');
 * });
 * ```
 */
export async function passMypageGate(page: Page, expectContent: string | RegExp = '내정보관리'): Promise<void> {
  // checkPassword 는 POST /v1/members/check-password?password=... 형식 (params 로 전달)
  // glob `**/v1/members/check-password` 는 query string 포함 URL 을 못 잡으므로 regex 사용
  await page.route(/\/v1\/members\/check-password(\?|$)/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  );
  await page.getByPlaceholder('비밀번호를 입력해주세요.').fill('dummy');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(page.getByText(expectContent).first()).toBeVisible({ timeout: 10000 });
}

// ────────────────────────────────────────────────────────────────
// 7. 세션 주입 (storageState 없이 localStorage로 mock)
// ────────────────────────────────────────────────────────────────

/**
 * 실제 로그인 플로우 대신 localStorage에 테스트용 세션을 주입.
 * 실제 `useSession` 훅이 cookie 기반이면 이 방식 대신 storageState 사용.
 *
 * 사용:
 * ```
 * await injectTestSession(page, { role: 'CSO', partnerContractStatus: 'APPROVED' });
 * await page.goto('/prescriptions');
 * ```
 */
export async function injectTestSession(page: Page, session: Record<string, unknown>) {
  await page.addInitScript((s: unknown) => {
    window.localStorage.setItem('session', JSON.stringify(s));
  }, session);
}

// 자주 쓰는 세션 프리셋
export const SESSION_PRESETS = {
  csoApproved: {
    role: 'CSO',
    partnerContractStatus: 'APPROVED',
    userId: 'test-cso-user',
  },
  csoPending: {
    role: 'CSO',
    partnerContractStatus: 'PENDING',
    userId: 'test-cso-pending',
  },
  generalMember: {
    role: 'MEMBER',
    partnerContractStatus: null,
    userId: 'test-member',
  },
} as const;

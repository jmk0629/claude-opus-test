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

import type { Page, Dialog } from '@playwright/test';

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
 * backend.ts의 baseURL이 `/` 또는 `https://dev.api.medipanda.co.kr` 등
 * 환경에 따라 달라지므로 `**` prefix로 와일드카드 매칭.
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
// 5. 세션 주입 (storageState 없이 localStorage로 mock)
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

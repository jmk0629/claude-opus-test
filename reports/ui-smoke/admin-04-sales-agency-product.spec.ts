/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/04_SALES_AGENCY_PRODUCT.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminSalesAgencyProductList.tsx
 *   - src/pages-admin/MpAdminSalesAgencyProductEdit.tsx
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용:
 * 1. 셀렉터가 실제 DOM과 일치하는지 확인 (MUI Table/Chip/Tabs는 명시적 data-testid 없음)
 * 2. Admin은 AdminGuard + 관리자 권한 필요 — beforeEach에 storageState 설정 필수
 *    (아래 TODO 지점 참고). 현재는 mock 경로로 401/403을 우회하는 전제로 작성.
 * 3. API mock 경로는 `_fixtures.ts`의 `api()` + 와일드카드 패턴 사용
 * 4. 페이지 진입 직후 GET `/v1/sales-agency-products` 호출이 먼저 확정되어야
 *    테이블이 렌더됨. `page.waitForResponse` 병행을 권장.
 * 5. `useMpModal`의 alert/alertError는 `window.alert` 또는 MUI Dialog로 분기될 수
 *    있음 — 현재 초안은 `acceptNextDialog` 기반(window.alert 가정). 실제 DOM이
 *    Dialog라면 수동 검수 시 `getByRole('dialog')`로 치환 필요.
 * 6. `useMpDeleteDialog`는 별도 Confirm Dialog 컴포넌트 — 삭제 플로우 테스트 시
 *    실제 DOM 확인 필요 (현재 초안은 API mock 위주로 검증).
 *
 * 검수 체크리스트:
 *  [ ] AdminGuard 통과 방식 확정 (storageState vs localStorage 주입)
 *  [ ] 테이블 헤더/셀 텍스트가 문서와 일치하는지 DOM으로 확인
 *  [ ] 삭제 다이얼로그가 window.confirm인지 MUI Dialog인지 확인
 *  [ ] Excel 다운로드 버튼의 href (getDownloadSalesAgencyProductsExcel) 정상 렌더 확인
 *  [ ] 탭 전환(기본정보 ↔ 신청자) 시 URL 쿼리 동기화 확인
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  BASE_URL_ADMIN,
  EMPTY_PAGE,
  pageResponse,
  api,
  acceptNextDialog,
} from './_fixtures';

// ────────────────────────────────────────────────────────────────
// 경로 상수
// ────────────────────────────────────────────────────────────────

const LIST_PATH = '/sales-agency-products';
const NEW_PATH = '/sales-agency-products/new';
const SAMPLE_PRODUCT_ID = 1;
const EDIT_PATH = `/sales-agency-products/${SAMPLE_PRODUCT_ID}/edit`;

// ────────────────────────────────────────────────────────────────
// Mock 응답 fixture
// ────────────────────────────────────────────────────────────────

type ProductSummary = {
  id: number;
  productName: string;
  clientName: string;
  price: number;
  contractDate: string;
  isExposed: boolean;
  startAt: string;
  endAt: string;
  appliedCount: number;
  quantity: number;
  thumbnailUrl: string | null;
};

const SAMPLE_PRODUCT: ProductSummary = {
  id: SAMPLE_PRODUCT_ID,
  productName: '영업대행상품 샘플 A',
  clientName: '위탁사 알파',
  price: 150000,
  contractDate: '2026-01-15T00:00:00Z',
  isExposed: true,
  startAt: '2026-02-01T00:00:00Z',
  endAt: '2026-12-31T00:00:00Z',
  appliedCount: 3,
  quantity: 10,
  thumbnailUrl: 'https://via.placeholder.com/100',
};

type ProductDetail = {
  productId: number;
  clientName: string;
  productName: string;
  thumbnailUrl: string;
  videoUrl: string | null;
  contractDate: string;
  startDate: string;
  endDate: string;
  note: string | null;
  isExposed: boolean;
  exposureRange: 'ALL' | 'CONTRACT';
  boardPostDetail: {
    content: string;
    attachments: Array<{ s3fileId: number; type: 'EDITOR' | 'ATTACHMENT' }>;
    viewsCount: number;
  };
};

const SAMPLE_DETAIL: ProductDetail = {
  productId: SAMPLE_PRODUCT_ID,
  clientName: '위탁사 알파',
  productName: '영업대행상품 샘플 A',
  thumbnailUrl: 'https://via.placeholder.com/200',
  videoUrl: null,
  contractDate: '2026-01-15T00:00:00Z',
  startDate: '2026-02-01T00:00:00Z',
  endDate: '2026-12-31T00:00:00Z',
  note: null,
  isExposed: true,
  exposureRange: 'ALL',
  boardPostDetail: {
    content: '<p>샘플 본문</p>',
    attachments: [],
    viewsCount: 0,
  },
};

// ────────────────────────────────────────────────────────────────
// Mock helper
// ────────────────────────────────────────────────────────────────

async function mockListOk(page: Page, items: ProductSummary[]): Promise<void> {
  await page.route(api('/v1/sales-agency-products*'), (route: Route) => {
    const url = route.request().url();
    // 상세 조회(/v1/sales-agency-products/{id})는 여기서 처리하지 않음
    if (/\/v1\/sales-agency-products\/\d+(?:\?|$)/.test(url)) {
      return route.fallback();
    }
    return route.fulfill({ json: pageResponse<ProductSummary>(items) });
  });
}

async function mockListEmpty(page: Page): Promise<void> {
  await page.route(api('/v1/sales-agency-products*'), (route: Route) => {
    const url = route.request().url();
    if (/\/v1\/sales-agency-products\/\d+(?:\?|$)/.test(url)) {
      return route.fallback();
    }
    return route.fulfill({ json: EMPTY_PAGE });
  });
}

async function mockListError(page: Page): Promise<void> {
  await page.route(api('/v1/sales-agency-products*'), (route: Route) => {
    const url = route.request().url();
    if (/\/v1\/sales-agency-products\/\d+(?:\?|$)/.test(url)) {
      return route.fallback();
    }
    return route.fulfill({ status: 500, json: { message: 'internal error' } });
  });
}

async function mockDetailOk(page: Page, detail: ProductDetail): Promise<void> {
  await page.route(api(`/v1/sales-agency-products/${detail.productId}`), (route: Route) =>
    route.fulfill({ json: detail }),
  );
}

// ────────────────────────────────────────────────────────────────
// Test suite
// ────────────────────────────────────────────────────────────────

test.describe('계약관리 > 영업대행상품 (admin/04_SALES_AGENCY_PRODUCT)', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    // TODO: storageState 또는 localStorage 세션 주입으로 AdminGuard 통과시켜야 함.
    //       현재 초안은 mock 응답이 세션 검증을 우회한다는 전제로 작성.
    //       실제 구현 시:
    //         await page.context().storageState({ path: AUTH_STATE_ADMIN });
    //         또는 injectTestSession(page, { role: 'ADMIN', ... });
  });

  test('목록 진입 시 "영업대행상품" 헤딩과 검색 필터가 렌더된다', async ({ page }: { page: Page }) => {
    await mockListOk(page, [SAMPLE_PRODUCT]);

    await page.goto(`${BASE_URL_ADMIN}${LIST_PATH}`);

    await expect(page.getByRole('heading', { name: '영업대행상품' })).toBeVisible();
    // TODO: verify selector — MUI Select 라벨은 InputLabel이라 getByLabel 동작 확인 필요
    await expect(page.getByLabel('검색유형')).toBeVisible();
    await expect(page.getByLabel('검색어')).toBeVisible();
    await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
    await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
  });

  test('목록 API 정상 응답 시 테이블 행이 상품명·위탁사와 함께 렌더된다', async ({ page }: { page: Page }) => {
    await mockListOk(page, [SAMPLE_PRODUCT]);

    await page.goto(`${BASE_URL_ADMIN}${LIST_PATH}`);

    // 테이블 헤더 확인
    await expect(page.getByRole('columnheader', { name: '상품명' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '위탁사' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '판매가' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '노출상태' })).toBeVisible();

    // 상품명은 Link(RouterLink)로 렌더 — /admin/sales-agency-products/:id/edit
    const productLink = page.getByRole('link', { name: SAMPLE_PRODUCT.productName });
    await expect(productLink).toBeVisible();
    await expect(productLink).toHaveAttribute('href', /\/admin\/sales-agency-products\/\d+\/edit/);

    await expect(page.getByText(SAMPLE_PRODUCT.clientName)).toBeVisible();
    // price.toLocaleString() → "150,000"
    await expect(page.getByText('150,000')).toBeVisible();
    // 노출 Chip
    await expect(page.getByText('노출', { exact: true })).toBeVisible();
    // 신청자 수 "3명"
    await expect(page.getByText('3명', { exact: true })).toBeVisible();
  });

  test('목록이 비어있을 때 "검색 결과가 없습니다." 안내가 나타난다', async ({ page }: { page: Page }) => {
    await mockListEmpty(page);

    await page.goto(`${BASE_URL_ADMIN}${LIST_PATH}`);

    await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    await expect(page.getByText('검색결과: 0 건')).toBeVisible();
  });

  test('목록 API 실패 시 alertError가 호출된다', async ({ page }: { page: Page }) => {
    await mockListError(page);

    const dialogMessage = acceptNextDialog(page);
    await page.goto(`${BASE_URL_ADMIN}${LIST_PATH}`);

    // TODO: verify — useMpModal.alertError가 window.alert로 내려간다고 가정.
    //       MUI Dialog 컴포넌트라면 page.getByRole('dialog') 기반으로 재작성 필요.
    const message = await dialogMessage;
    expect(message).toContain('영업대행상품 목록을 불러오는 중 오류가 발생했습니다.');
  });

  test('검색유형 미선택 상태에서 검색어 입력 후 검색 시 경고 alert이 뜬다', async ({ page }: { page: Page }) => {
    await mockListOk(page, []);

    await page.goto(`${BASE_URL_ADMIN}${LIST_PATH}`);

    // 검색어만 입력
    await page.getByLabel('검색어').fill('테스트');

    const dialogMessage = acceptNextDialog(page);
    await page.getByRole('button', { name: '검색' }).click();

    const message = await dialogMessage;
    expect(message).toContain('검색유형을 선택하세요.');
  });

  test('[등록] 버튼 클릭 시 /sales-agency-products/new 경로로 이동한다', async ({ page }: { page: Page }) => {
    await mockListOk(page, []);

    await page.goto(`${BASE_URL_ADMIN}${LIST_PATH}`);

    const registerLink = page.getByRole('link', { name: '등록' });
    await expect(registerLink).toBeVisible();
    await expect(registerLink).toHaveAttribute('href', /\/admin\/sales-agency-products\/new$/);
  });

  test('Excel 버튼은 목록 필터를 담은 다운로드 URL을 href로 가진다', async ({ page }: { page: Page }) => {
    await mockListOk(page, [SAMPLE_PRODUCT]);

    await page.goto(`${BASE_URL_ADMIN}${LIST_PATH}`);

    // Excel 버튼은 <a href={...} target='_blank'>로 렌더됨
    const excelLink = page.getByRole('link', { name: /Excel/ });
    await expect(excelLink).toBeVisible();
    // excel-download 경로 포함 확인
    // TODO: verify — getDownloadSalesAgencyProductsExcel가 상대/절대 URL 중 어떤 걸 반환하는지 backend.ts 확인
    await expect(excelLink).toHaveAttribute('href', /excel-download/);
    await expect(excelLink).toHaveAttribute('target', '_blank');
  });

  test('신규 등록 페이지 진입 시 헤딩이 "영업대행상품 등록"이고 신청자 탭은 숨겨진다', async ({ page }: { page: Page }) => {
    // 신규 진입 시 상세 API는 호출되지 않음
    await page.goto(`${BASE_URL_ADMIN}${NEW_PATH}`);

    await expect(page.getByRole('heading', { name: '영업대행상품 등록' })).toBeVisible();
    // 탭은 렌더되지만 '신청자' 탭 클릭 시 컨텐츠가 뜨지 않아야 함(isNew 가드)
    await expect(page.getByRole('tab', { name: '기본정보' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '신청자' })).toBeVisible();

    // 기본정보 탭 내 필수 입력 라벨 일부 확인
    // TODO: verify selector — 실제 InfoTab 내 라벨 확인(초안은 form 필드명 추정)
  });

  test('상세 페이지 진입 시 상품 상세 API 응답을 기반으로 제목이 "영업대행상품 상세"로 표시된다', async ({ page }: { page: Page }) => {
    await mockDetailOk(page, SAMPLE_DETAIL);

    await page.goto(`${BASE_URL_ADMIN}${EDIT_PATH}?tab=info`);

    await expect(page.getByRole('heading', { name: '영업대행상품 상세' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '기본정보', selected: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: '신청자' })).toBeVisible();
  });
});

/**
 * 자동 생성된 UI smoke 초안 - medipanda-web (admin)
 * 원본 문서: docs/admin/02_PRODUCT_MANAGEMENT.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminProductList.tsx   (GET /v1/products, GET /v1/products/excel)
 *   - src/pages-admin/MpAdminProductDetail.tsx (GET /v1/products/{id}/details)
 *   - src/pages-admin/MpAdminProductEdit.tsx   (POST /v1/products/extra-info, PATCH /v1/products/{id}/extra-info)
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안입니다. 반드시 수동 검수 후 사용하세요.
 * [검수 체크리스트]
 *   1. AdminGuard 인증 플로우 — 현재 beforeEach의 localStorage 세션 주입은 mock.
 *      실제 useSession이 cookie 기반이면 storageState(AUTH_STATE_ADMIN) 로 교체 필요.
 *   2. 셀렉터 확인 — MUI Select/Checkbox는 role-based 접근자가 환경에 따라 다르게 잡히므로
 *      `getByRole`이 실패할 경우 `getByLabel('취급품목')` 등으로 fallback.
 *   3. API mock — page.route() 의 `**` 와일드카드는 backend.ts의 baseURL이 환경별로
 *      다르기 때문에 사용. 실제 실행 전 Network 탭에서 URL 한 번 확인.
 *   4. useMpModal.alert/alertError 는 브라우저 네이티브가 아닌 MUI Dialog 렌더.
 *      따라서 `page.on('dialog', ...)` 대신 `page.getByRole('dialog')` 로 검증.
 *      단, Detail의 useSnackbar(notistack) 에러는 토스트이므로 별도 처리.
 *   5. 엑셀 다운로드는 `Button href=...` + `target='_blank'` 라서 새 탭이 열림.
 *      Playwright에서는 `page.waitForEvent('popup')` 또는 href attribute 검증으로 대체.
 *   6. Tiptap 에디터는 mock 데이터가 `boardDetailsResponse.content`, `attachments` 필드를
 *      반드시 포함해야 함. 누락 시 Edit 페이지가 빈 화면으로 멈춤.
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
// 상수 / 픽스처
// ────────────────────────────────────────────────────────────────

const PRODUCTS_URL = `${BASE_URL_ADMIN}/products`;
const PRODUCT_DETAIL_URL = (id: number): string => `${BASE_URL_ADMIN}/products/${id}`;
const PRODUCT_NEW_URL = `${BASE_URL_ADMIN}/products/new`;

// backend.ts baseURL이 환경별로 달라서 와일드카드 매칭
const API_ROUTES = {
  list: api('/v1/products'),
  listWildcard: api('/v1/products*'),
  excel: api('/v1/products/excel'),
  details: /\/v1\/products\/\d+\/details(\?.*)?$/,
  createExtraInfo: api('/v1/products/extra-info'),
  updateExtraInfo: /\/v1\/products\/\d+\/extra-info/,
} as const;

interface ProductSummaryStub {
  id: number;
  manufacturerName: string | null;
  productName: string | null;
  composition: string | null;
  productCode: string;
  price: number | null;
  roundedFeeRate: number | null;
  changedFeeRate: number | null;
  changedMonth: string | null;
  isAcquisition: boolean;
  isPromotion: boolean;
  isOutOfStock: boolean;
  isStopSelling: boolean;
  note: string | null;
}

const SAMPLE_PRODUCT: ProductSummaryStub = {
  id: 1001,
  manufacturerName: '테스트제약',
  productName: '타이레놀정 500mg',
  composition: '아세트아미노펜 500mg',
  productCode: 'TEST-0001',
  price: 250,
  roundedFeeRate: 0.105,
  changedFeeRate: null,
  changedMonth: null,
  isAcquisition: true,
  isPromotion: false,
  isOutOfStock: false,
  isStopSelling: false,
  note: null,
};

const SAMPLE_PRODUCT_DETAIL = {
  id: 1001,
  manufacturer: '테스트제약',
  productName: '타이레놀정 500mg',
  composition: '아세트아미노펜 500mg',
  productCode: 'TEST-0001',
  price: 250,
  insurance: '급여',
  feeRate: 0.105,
  changedFeeRate: null,
  changedMonth: null,
  isAcquisition: true,
  isPromotion: false,
  isOutOfStock: false,
  isStopSelling: false,
  note: '테스트 비고',
  alternativeProducts: [],
  boardDetailsResponse: {
    content: '<p>상세 설명입니다.</p>',
    attachments: [],
  },
} as const;

// 세션 mock — AdminGuard가 내부적으로 useSession을 확인하므로 localStorage 주입으로 우회.
// TODO: storageState 기반 인증으로 교체 필요 (실제 useSession 구현이 cookie 이면).
const ADMIN_SESSION = {
  userId: 'test-admin',
  name: '테스트관리자',
  role: 'ADMIN',
} as const;

// ────────────────────────────────────────────────────────────────
// 공용 mock helper
// ────────────────────────────────────────────────────────────────

async function mockAdminSession(page: Page): Promise<void> {
  await page.addInitScript((session: typeof ADMIN_SESSION) => {
    window.localStorage.setItem('session', JSON.stringify(session));
  }, ADMIN_SESSION);
}

async function stubProductList(page: Page, items: ProductSummaryStub[]): Promise<void> {
  await page.route(API_ROUTES.listWildcard, async (route: Route) => {
    const url = route.request().url();
    // 상세 조회나 extra-info 요청은 이 핸들러에서 처리하지 않음
    if (/\/v1\/products\/\d+/.test(url)) {
      return route.fallback();
    }
    if (/\/v1\/products\/excel/.test(url)) {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pageResponse<ProductSummaryStub>(items, { page: 0, size: 20 })),
    });
  });
}

async function stubProductListError(page: Page): Promise<void> {
  await page.route(API_ROUTES.listWildcard, async (route: Route) => {
    const url = route.request().url();
    if (/\/v1\/products\/\d+/.test(url)) {
      return route.fallback();
    }
    if (/\/v1\/products\/excel/.test(url)) {
      return route.fallback();
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Internal Server Error' }),
    });
  });
}

async function stubProductDetail(page: Page, detail: typeof SAMPLE_PRODUCT_DETAIL): Promise<void> {
  await page.route(API_ROUTES.details, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    });
  });
}

// ────────────────────────────────────────────────────────────────
// test suite
// ────────────────────────────────────────────────────────────────

test.describe('admin: 제품관리 (docs/admin/02_PRODUCT_MANAGEMENT.md)', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    // TODO: storageState 기반 인증으로 교체. 지금은 localStorage mock.
    await mockAdminSession(page);
  });

  // ── 1. 정상 로드: 목록 페이지 진입 시 주요 섹션 렌더
  test('제품관리 목록 진입 시 제목·검색폼·엑셀 버튼·테이블이 렌더된다', async ({ page }: { page: Page }) => {
    await stubProductList(page, [SAMPLE_PRODUCT]);

    await page.goto(PRODUCTS_URL);

    // 페이지 제목
    await expect(page.getByRole('heading', { name: '제품관리' })).toBeVisible();

    // 검색 필터 체크박스 라벨 (FormControlLabel)
    await expect(page.getByText('취급품목', { exact: true })).toBeVisible();
    await expect(page.getByText('프로모션', { exact: true })).toBeVisible();

    // 검색/초기화 버튼
    await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
    await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();

    // 엑셀 다운로드 버튼 (href 기반 anchor 이지만 MUI는 role=button 유지)
    await expect(page.getByRole('button', { name: /Excel/i })).toBeVisible();

    // 테이블 헤더
    await expect(page.getByRole('columnheader', { name: '제약사' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '제품명' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '기본수수료율' })).toBeVisible();

    // 샘플 데이터 렌더 확인 (이름 링크 + 제약사)
    await expect(page.getByRole('link', { name: SAMPLE_PRODUCT.productName ?? '' })).toBeVisible();
  });

  // ── 2. 빈 상태: 검색 결과 0건
  test('검색 결과가 없을 때 "검색 결과가 없습니다." 메시지가 표시된다', async ({ page }: { page: Page }) => {
    await page.route(API_ROUTES.listWildcard, async (route: Route) => {
      const url = route.request().url();
      if (/\/v1\/products\/\d+/.test(url)) {
        return route.fallback();
      }
      if (/\/v1\/products\/excel/.test(url)) {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });

    await page.goto(PRODUCTS_URL);

    await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    // 검색 건수 표시
    await expect(page.getByText(/검색결과:\s*0\s*건/)).toBeVisible();
  });

  // ── 3. 에러 상태: GET /v1/products 500
  test('목록 API 실패 시 에러 다이얼로그가 뜨고 테이블은 비어 있다', async ({ page }: { page: Page }) => {
    await stubProductListError(page);

    await page.goto(PRODUCTS_URL);

    // useMpModal.alertError는 MUI Dialog 렌더. 메시지 일부만 검증.
    // TODO: verify selector — 실제 dialog role 구조 확인 필요
    await expect(
      page.getByText('제품 목록을 불러오는 중 오류가 발생했습니다.'),
    ).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
  });

  // ── 4. 검색 액션: 검색어 없이 검색유형만 비운 채 검색어 입력 → alert
  test('검색유형 없이 검색어만 입력 후 검색하면 "검색유형을 선택하세요" 안내가 뜬다', async ({ page }: { page: Page }) => {
    await stubProductList(page, [SAMPLE_PRODUCT]);

    await page.goto(PRODUCTS_URL);

    // 검색어 input — label 기반
    await page.getByLabel('검색어').fill('타이레놀');
    await page.getByRole('button', { name: '검색' }).click();

    await expect(page.getByText('검색유형을 선택하세요.')).toBeVisible();
  });

  // ── 5. 검색 액션: 검색유형 + 키워드 선택 후 URL 쿼리스트링 반영
  test('검색유형=제품명 + 키워드 입력 시 URL 쿼리가 갱신되고 API가 재호출된다', async ({ page }: { page: Page }) => {
    await stubProductList(page, [SAMPLE_PRODUCT]);

    await page.goto(PRODUCTS_URL);

    // MUI Select 클릭 방식 — getByLabel('검색유형')은 InputLabel을 잡음
    // TODO: verify selector — Select가 combobox role을 노출하지 않을 수 있음
    await page.getByLabel('검색유형').click();
    await page.getByRole('option', { name: '제품명' }).click();

    await page.getByLabel('검색어').fill('타이레놀');

    // GET /v1/products 가 재호출되는지 대기
    const requestPromise = page.waitForRequest((req) => {
      const url = req.url();
      return /\/v1\/products(\?|$)/.test(url) && !/\/\d+/.test(url);
    });
    await page.getByRole('button', { name: '검색' }).click();
    const req = await requestPromise;

    expect(req.url()).toMatch(/productName=/);
    expect(req.url()).toMatch(/%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80|타이레놀/);

    // URL 쿼리스트링 반영
    await expect(page).toHaveURL(/searchType=productName/);
    await expect(page).toHaveURL(/searchKeyword=/);
  });

  // ── 6. 정상 로드: 제품 상세 페이지
  test('제품 상세 진입 시 제품정보 헤딩 + 약가/기본수수료율이 표시된다', async ({ page }: { page: Page }) => {
    await stubProductDetail(page, SAMPLE_PRODUCT_DETAIL);

    await page.goto(PRODUCT_DETAIL_URL(SAMPLE_PRODUCT_DETAIL.id));

    await expect(page.getByRole('heading', { name: '제품정보' })).toBeVisible();

    // 레이블 텍스트
    await expect(page.getByText('제약사', { exact: true })).toBeVisible();
    await expect(page.getByText('제품명', { exact: true })).toBeVisible();
    await expect(page.getByText('기본수수료율', { exact: true })).toBeVisible();

    // 값 (약가: "250원 (급여)" 형태)
    await expect(page.getByText(/250원\s*\(급여\)/)).toBeVisible();
    // 기본수수료율: 0.105 → 10.5%
    await expect(page.getByText(/10\.5\s*%/)).toBeVisible();
  });

  // ── 7. 권한/에러 분기: 상세 API 실패 시 snackbar + 뒤로가기
  test('제품 상세 API 실패 시 에러 토스트가 뜨고 이전 화면으로 돌아간다', async ({ page }: { page: Page }) => {
    // 먼저 목록 페이지에 진입하여 history.back()이 이동할 곳 확보
    await stubProductList(page, [SAMPLE_PRODUCT]);
    await page.goto(PRODUCTS_URL);

    await page.route(API_ROUTES.details, async (route: Route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'error' }),
      });
    });

    await page.goto(PRODUCT_DETAIL_URL(SAMPLE_PRODUCT_DETAIL.id));

    // notistack snackbar (variant=error) — 메시지 일부 검증
    await expect(page.getByText('데이터를 불러오는데 실패했습니다.')).toBeVisible({ timeout: 5_000 });

    // window.history.back() 결과로 목록 페이지 URL 복귀
    // TODO: verify — 라우터 구현에 따라 history.back()이 즉시 반영되지 않을 수 있음
    await expect(page).toHaveURL(/\/admin\/products(\?|$)/, { timeout: 5_000 });
  });

  // ── 8. 신규 등록 폼: 필수 입력 유효성
  test('제품 등록 페이지에서 제약사 없이 저장하면 "제약사를 입력하세요" alert이 뜬다', async ({ page }: { page: Page }) => {
    // 신규 등록은 GET /details 호출하지 않지만, 에디터 이미지 업로드 API는 fallback.
    await page.goto(PRODUCT_NEW_URL);

    // 신규 등록 모드 헤딩: "제품정보 등록"
    await expect(page.getByRole('heading', { name: /제품정보\s*등록/ })).toBeVisible();

    // 저장 버튼 — 문서에 명시된 버튼 텍스트는 "저장"으로 추정.
    // TODO: verify selector — 실제 버튼 라벨이 "등록" 일 수 있음
    const saveButton = page.getByRole('button', { name: /저장|등록/ }).first();
    await saveButton.click();

    // useMpModal.alert → MUI Dialog 내부 텍스트
    await expect(page.getByText('제약사를 입력하세요.')).toBeVisible({ timeout: 5_000 });
  });
});

// ────────────────────────────────────────────────────────────────
// 참고: 미커버 케이스 (수동 검수 시 추가 고려)
// ────────────────────────────────────────────────────────────────
// - 엑셀 다운로드: `Button href=getDownloadProductSummariesExcel(...)` target=_blank →
//   href attribute 문자열 검증만 하는 편이 안정적. (popup 이벤트는 브라우저별 편차 큼)
// - 페이지네이션 클릭: PaginationItem 이 RouterLink 라서 URL만 바뀌고 API 재호출됨 → 별도 테스트 가능.
// - PATCH /v1/products/{id}/extra-info 성공 플로우: storageState + 폼 입력 자동화 필요,
//   Tiptap 에디터에 HTML 직접 주입해야 하므로 수동 검수에서 시나리오 설계 권장.
// - isAxiosError 분기(Invalid product code format / Product not found): 서버 에러 문자열 mock 필요.
// 이 파일은 최소 5-8개 시나리오 골격만 제공하며, 실제 머지 전에 위 항목을 확장해야 함.
// acceptNextDialog 는 현재 파일에서 직접 쓰이지 않지만, 수동 검수 시 브라우저 네이티브 dialog가 섞여 있을 경우
// import 되어 있으면 바로 활용할 수 있어 유지.
void acceptNextDialog;

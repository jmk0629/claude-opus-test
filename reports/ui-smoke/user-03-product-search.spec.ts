/**
 * 자동 생성된 UI smoke 초안 - medipanda-web
 * 원본 문서: docs/user/03_PRODUCT_SEARCH.md
 * 대상 컴포넌트: src/pages-user/ProductList.tsx
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안 - 반드시 수동 검수 후 사용
 * 1. /products 는 로그인 필요 - storageState 로 인증 쿠키 주입 필요 (현재는 stub 전제)
 * 2. 셀렉터 실제 DOM 확인 필요 (특히 MUI Button/Select 내부 텍스트 매칭)
 * 3. API mock 스키마(`PageResponse<ProductSummaryResponse>`)는 backend.ts 로 재확인
 * 4. alert() 에러 핸들링은 window 이벤트 listener 로 잡아야 함
 * 5. 제품 상세 Dialog 내부는 ReplaceableProductDialog 가 다루므로 별도 스펙 고려
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';
const PRODUCTS_URL = `${BASE_URL}/products`;

// ---------- API 경로 ----------
// docs/user/03_PRODUCT_SEARCH.md 의 "API 엔드포인트 요약" 기반
const API = {
  productSummaries: '**/v1/products?**', // GET /v1/products (query params)
  productSummariesBase: '**/v1/products**',
  productDetails: /\/v1\/products\/\d+\/details/,
};

// ---------- 픽스처 ----------
const EMPTY_PAGE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 10,
};

const SAMPLE_PRODUCT = {
  id: 101,
  manufacturerName: '한미약품',
  productName: '아스피린프로텍트정',
  composition: '아세틸살리실산 100mg',
  price: 129,
  insurance: '급여',
  roundedFeeRate: 0.15,
  roundedChangedFeeRate: 0.12,
  changedMonth: '2026-05-01',
  isAcquisition: true,
  isPromotion: false,
  isOutOfStock: false,
  isStopSelling: false,
  note: '1일 1회 복용',
};

const SAMPLE_PAGE = {
  content: [SAMPLE_PRODUCT],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 10,
};

const SAMPLE_DETAIL = {
  alternativeProducts: [],
  boardDetailsResponse: { content: '<p></p>' },
};

/**
 * GET /v1/products 응답 stub.
 * - 인증은 storageState 로 처리 (TODO: verify 실제 인증 방식이 Cookie/Bearer 인지)
 */
async function stubProductListApi(page: Page, body: unknown = SAMPLE_PAGE) {
  await page.route(API.productSummariesBase, async route => {
    const url = route.request().url();
    // /v1/products/{id}/details 는 여기서 처리하지 않음
    if (/\/v1\/products\/\d+\/details/.test(url)) {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function stubProductDetailApi(page: Page, body: unknown = SAMPLE_DETAIL) {
  await page.route(API.productDetails, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test.describe('user/03 제품검색 (/products) - UI smoke 초안', () => {
  test.beforeEach(async ({ page }) => {
    // 검색바/상세검색 패널이 가로로 넓게 배치됨
    await page.setViewportSize({ width: 1440, height: 900 });
    // TODO: verify - /products 는 로그인 필요. 실제 테스트에서는
    // test.use({ storageState: 'auth/user.json' }) 로 인증 상태 주입
  });

  // --------------------------------------------------------------------------
  // 1. 정상 로드 - 검색 UI + 테이블 헤더 + 전체 건수 렌더
  // --------------------------------------------------------------------------
  test('페이지 진입 시 검색바, 정렬 드롭다운, 테이블 헤더가 렌더된다', async ({ page }) => {
    await stubProductListApi(page, SAMPLE_PAGE);
    await page.goto(PRODUCTS_URL);

    // 기본 검색타입 버튼 (초기값: 성분명)
    await expect(page.getByRole('button', { name: '성분명' }).first()).toBeVisible();

    // 키워드 TextField placeholder (성분명을 검색하세요.)
    await expect(page.getByPlaceholder('성분명을 검색하세요.')).toBeVisible();

    // 전체 건수 카운트 라벨 - "전체 : 1건"
    await expect(page.getByText(/전체\s*:\s*1건/)).toBeVisible();

    // 정렬기준 라벨
    await expect(page.getByText('정렬기준 :')).toBeVisible();

    // 테이블 헤더 7 컬럼 (docs 3-1/3-6 기준)
    for (const header of ['제약사명', '제품정보', '약가', '급여정보', '기본 수수료율', '상태', '변경']) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
    }

    // 샘플 제품 행 - 제조사명 셀이 렌더됨
    await expect(page.getByText('한미약품')).toBeVisible();
    await expect(page.getByText('아스피린프로텍트정')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 2. 커스텀 검색타입 드롭다운 - 성분명 → 제품명 전환 (docs 2-9)
  // --------------------------------------------------------------------------
  test('검색타입 드롭다운을 열어 제품명으로 전환하면 placeholder 가 바뀐다', async ({ page }) => {
    await stubProductListApi(page, SAMPLE_PAGE);
    await page.goto(PRODUCTS_URL);

    // 드롭다운 토글 버튼 클릭 (초기 라벨: 성분명)
    await page.getByRole('button', { name: '성분명' }).first().click();

    // 드롭다운 패널에는 3개의 옵션이 표시됨 (composition / productName / manufacturerName)
    // TODO: verify selector - 토글 버튼과 옵션 버튼이 동일 텍스트를 가지므로 last() / nth 로 구분
    await page.getByRole('button', { name: '제품명' }).click();

    // 전환 후 placeholder 변경 (formSearchType 기반)
    await expect(page.getByPlaceholder('제품명을 검색하세요.')).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 3. 검색어 입력 + 제출 - URL 쿼리 파라미터 반영 (docs 2-5)
  // --------------------------------------------------------------------------
  test('검색어 입력 후 Enter 제출 시 URL 쿼리와 API 호출에 키워드가 반영된다', async ({ page }) => {
    await stubProductListApi(page, SAMPLE_PAGE);

    await page.goto(PRODUCTS_URL);

    // API 호출 대기 (GET /v1/products?...searchKeyword=...)
    const requestPromise = page.waitForRequest(req =>
      req.url().includes('/v1/products') && req.url().includes('composition=%EC%95%84%EC%8A%A4%ED%94%BC%EB%A6%B0'),
    );

    const input = page.getByPlaceholder('성분명을 검색하세요.');
    await input.fill('아스피린');
    await input.press('Enter');

    // URL 쿼리에 searchKeyword 가 반영됨
    await expect(page).toHaveURL(/searchKeyword=%EC%95%84%EC%8A%A4%ED%94%BC%EB%A6%B0/);
    // TODO: verify - backend 는 기본검색 시 searchType==composition 이면 composition 쿼리로 보냄.
    // 실제 요청 URL 은 composition=... 이 맞는지 네트워크 탭에서 재확인 필요.
    const request = await requestPromise.catch(() => null);
    expect(request, '기대한 composition 쿼리가 포함된 요청을 찾지 못함').not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // 4. 정렬 드롭다운 변경 - URL sortType 변경 (docs 2-6)
  // --------------------------------------------------------------------------
  test('정렬 드롭다운에서 "약가 높은순" 선택 시 URL 에 sortType=PRICE_DESC 가 반영된다', async ({ page }) => {
    await stubProductListApi(page, SAMPLE_PAGE);
    await page.goto(PRODUCTS_URL);

    // MUI Select 는 role=combobox 로 노출됨 (TODO: verify selector)
    await page.getByRole('combobox').click();

    // 옵션 리스트에서 "약가 높은순" 선택
    await page.getByRole('option', { name: '약가 높은순' }).click();

    await expect(page).toHaveURL(/sortType=PRICE_DESC/);
  });

  // --------------------------------------------------------------------------
  // 5. 상세검색 패널 토글 (formAdvancedSearch 기반, docs 2-2)
  // --------------------------------------------------------------------------
  test('상세검색 아이콘 클릭 시 상세검색 패널과 초기화/상세검색 버튼이 노출된다', async ({ page }) => {
    await stubProductListApi(page, SAMPLE_PAGE);
    await page.goto(PRODUCTS_URL);

    // 상세검색 토글 아이콘은 <img src="/assets/icons/icon-search-detail.svg">
    // TODO: verify selector - role 이 없으므로 alt 없으면 img locator + src 조건으로 잡아야 함
    await page.locator('img[src*="icon-search-detail"]').click();

    // 상세검색 패널 내 필드 라벨
    await expect(page.getByText('성분명', { exact: true })).toBeVisible();
    await expect(page.getByText('제약사', { exact: true })).toBeVisible();
    await expect(page.getByText('제품명', { exact: true })).toBeVisible();
    await expect(page.getByText('상태', { exact: true })).toBeVisible();

    // 상태 필터 버튼 4개 (전체 / 취급품목 / 프로모션 / 품절)
    for (const name of ['전체', '취급품목', '프로모션', '품절']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }

    // 하단 초기화 / 상세검색 버튼
    await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
    await expect(page.getByRole('button', { name: '상세검색' })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 6. 빈 상태 - totalElements 0 (docs 3-3 API 응답 0건)
  // --------------------------------------------------------------------------
  test('API 응답이 0건이면 "전체 : 0건"이 표시되고 테이블 바디가 비어 있다', async ({ page }) => {
    await stubProductListApi(page, EMPTY_PAGE);
    await page.goto(PRODUCTS_URL);

    await expect(page.getByText(/전체\s*:\s*0건/)).toBeVisible();

    // 테이블 바디에 데이터 행이 없음 (헤더 행만 존재)
    // TODO: verify selector - MedipandaTableRow 가 role=row 로 매핑되는지 확인
    const dataRows = page.locator('tbody tr');
    await expect(dataRows).toHaveCount(0);
  });

  // --------------------------------------------------------------------------
  // 7. 에러 상태 - API 500 시 alert + contents 0건 (fetchContents catch 블록)
  // --------------------------------------------------------------------------
  test('GET /v1/products 가 500 으로 실패하면 alert 이 발생하고 "전체 : 0건"으로 복구된다', async ({ page }) => {
    // window.alert 수신
    const alerts: string[] = [];
    page.on('dialog', async dialog => {
      alerts.push(dialog.message());
      await dialog.dismiss();
    });

    await page.route(API.productSummariesBase, async route => {
      if (/\/v1\/products\/\d+\/details/.test(route.request().url())) {
        return route.fallback();
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto(PRODUCTS_URL);

    // alert 메시지 확인 - "의약품 목록을 불러오는 중 오류가 발생했습니다."
    await expect.poll(() => alerts[0]).toContain('의약품 목록을 불러오는 중 오류가 발생했습니다');

    // 에러 후 UI 폴백
    await expect(page.getByText(/전체\s*:\s*0건/)).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 8. 제품 행 클릭 → 대체의약품 다이얼로그 오픈 + details API 호출 (docs 4-1~4-5)
  // --------------------------------------------------------------------------
  test('제품 행을 클릭하면 대체의약품 다이얼로그가 열리고 details API 가 호출된다', async ({ page }) => {
    await stubProductListApi(page, SAMPLE_PAGE);
    await stubProductDetailApi(page, SAMPLE_DETAIL);

    await page.goto(PRODUCTS_URL);

    const detailsRequest = page.waitForRequest(req => API.productDetails.test(req.url()));

    // 제품 행(제품명 셀) 클릭 - MedipandaTableRow onClick={() => setSelectedId(product.id)}
    // TODO: verify selector - 전체 <tr> 영역 클릭이 필요할 수 있음
    await page.getByText('아스피린프로텍트정').click();

    const req = await detailsRequest;
    expect(req.url()).toMatch(/\/v1\/products\/101\/details/);

    // MedipandaDialog 오픈 확인 (role=dialog)
    // TODO: verify selector - MedipandaDialog 가 MUI Dialog 기반이면 role=dialog 노출됨
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

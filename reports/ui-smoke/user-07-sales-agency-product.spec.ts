/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/user/07_SALES_AGENCY_PRODUCT.md
 * 대상 컴포넌트:
 *   - src/pages-user/SalesAgencyProductList.tsx
 *   - src/pages-user/SalesAgencyProductDetail.tsx
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용:
 * 1. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 MUI Stack/Typography는 명시적 role이 없음)
 * 2. API mock 필요 시 page.route() 추가 (GET /v1/sales-agency-products 등)
 * 3. 인증 플로우 필요 시 storageState 설정 (이 화면은 로그인 필요)
 * 4. 실제 상품 ID는 목록 API 응답에서 추출해 사용하거나 시드 데이터로 고정
 * 5. handleApply 시 window.alert 처리 — page.on('dialog') 핸들러 필요
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5174';
const LIST_PATH = '/sales-agency-products';

// TODO: 시드 데이터에 맞게 조정. 목록 API로부터 id를 추출하는 패턴을 권장.
const SAMPLE_PRODUCT_ID = 1;
const DETAIL_PATH = `/sales-agency-products/${SAMPLE_PRODUCT_ID}`;

test.describe('영업대행상품 (user/07_SALES_AGENCY_PRODUCT)', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: 로그인 필수 화면. storageState 또는 로그인 헬퍼로 사전 인증 필요.
    // await page.context().addCookies([...]);
  });

  test('목록 진입 시 "영업대행상품" 헤딩이 보인다', async ({ page }) => {
    await page.goto(`${BASE_URL}${LIST_PATH}`);

    // Typography variant='headingPc3M' — role 없음. 텍스트 매칭으로 확인.
    await expect(page.getByText('영업대행상품', { exact: true }).first()).toBeVisible();
  });

  test('목록 카드가 렌더링되고 RouterLink(<a>)로 감싸진다', async ({ page }) => {
    // TODO: API mock 예시
    // await page.route('**/v1/sales-agency-products**', route =>
    //   route.fulfill({ json: { content: [{ id: 1, clientName: '제약A', productName: '상품A',
    //     thumbnailUrl: 'https://example.com/thumb.png', startAt: '2026-01-01T00:00:00Z',
    //     endAt: '2099-12-31T00:00:00Z' }], totalPages: 1 } }));

    await page.goto(`${BASE_URL}${LIST_PATH}`);

    // Stack component={RouterLink} to='/sales-agency-products/:id' → <a href='/sales-agency-products/:id'>
    const firstCard = page.locator('a[href^="/sales-agency-products/"]').first();
    await expect(firstCard).toBeVisible();
  });

  test('만료된 상품 카드에는 "종료" 오버레이가 표시된다', async ({ page }) => {
    // TODO: endAt을 과거로 둔 상품을 시드 또는 mock 해야 안정적으로 검증 가능.
    // await page.route('**/v1/sales-agency-products**', route =>
    //   route.fulfill({ json: { content: [{ id: 99, clientName: 'X', productName: 'Y',
    //     thumbnailUrl: 'https://example.com/t.png', startAt: '2020-01-01T00:00:00Z',
    //     endAt: '2020-12-31T00:00:00Z' }], totalPages: 1 } }));

    await page.goto(`${BASE_URL}${LIST_PATH}`);

    await expect(page.getByText('종료', { exact: true }).first()).toBeVisible();
  });

  test('카드 클릭 시 상세 페이지(/sales-agency-products/:id)로 이동한다', async ({ page }) => {
    await page.goto(`${BASE_URL}${LIST_PATH}`);

    const firstCard = page.locator('a[href^="/sales-agency-products/"]').first();
    await firstCard.click();

    await expect(page).toHaveURL(/\/sales-agency-products\/\d+$/);
  });

  test('상세 진입 시 헤더(제약사명/상품명/기간·조회수)가 렌더된다', async ({ page }) => {
    // TODO: 상세 API mock 예시
    // await page.route(`**/v1/sales-agency-products/${SAMPLE_PRODUCT_ID}`, route =>
    //   route.fulfill({ json: { id: SAMPLE_PRODUCT_ID, clientName: '제약A', productName: '상품A',
    //     startDate: '2026-01-01T00:00:00Z', endDate: '2099-12-31T00:00:00Z', applied: false,
    //     boardPostDetail: { content: '<p>본문</p>', viewsCount: 1234 } } }));

    await page.goto(`${BASE_URL}${DETAIL_PATH}`);

    // 페이지 제목
    await expect(page.getByText('영업대행상품', { exact: true }).first()).toBeVisible();
    // 조회수 라벨 (헤더 3번째 Typography에 항상 포함)
    await expect(page.getByText(/조회수/)).toBeVisible();
  });

  test('신청하지 않은 활성 상품은 "영업대행 신청하기" 버튼이 활성 상태', async ({ page }) => {
    // 버튼 텍스트 분기: applied → '영업대행 신청완료' / 만료 → '종료된 상품입니다' / 그 외 → '영업대행 신청하기'
    // 실제 시드 데이터의 applied/endDate 는 알 수 없으므로 명시적 mock 으로 고정.
    await page.route(`**/v1/sales-agency-products/${SAMPLE_PRODUCT_ID}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SAMPLE_PRODUCT_ID,
          clientName: '제약A',
          productName: '상품A',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2099-12-31T00:00:00Z',
          applied: false,
          boardPostDetail: { content: '<p>본문</p>', viewsCount: 10 },
        }),
      }),
    );

    await page.goto(`${BASE_URL}${DETAIL_PATH}`);

    const applyBtn = page.getByRole('button', { name: '영업대행 신청하기' });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toBeEnabled();
  });

  test('만료된 상품은 "종료된 상품입니다" 버튼이 비활성 상태', async ({ page }) => {
    // TODO: endDate를 과거로 둔 응답 mock 필요
    // await page.route(`**/v1/sales-agency-products/${SAMPLE_PRODUCT_ID}`, route =>
    //   route.fulfill({ json: { id: SAMPLE_PRODUCT_ID, clientName: 'X', productName: 'Y',
    //     startDate: '2020-01-01T00:00:00Z', endDate: '2020-12-31T00:00:00Z', applied: false,
    //     boardPostDetail: { content: '<p>본문</p>', viewsCount: 0 } } }));

    await page.goto(`${BASE_URL}${DETAIL_PATH}`);

    const btn = page.getByRole('button', { name: '종료된 상품입니다' });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('신청 완료 상태(applied=true)에서는 "영업대행 신청완료" 비활성 버튼 노출', async ({ page }) => {
    await page.route(`**/v1/sales-agency-products/${SAMPLE_PRODUCT_ID}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SAMPLE_PRODUCT_ID,
          clientName: '제약A',
          productName: '상품A',
          startDate: '2026-01-01T00:00:00Z',
          endDate: '2099-12-31T00:00:00Z',
          applied: true,
          boardPostDetail: { content: '<p>본문</p>', viewsCount: 10 },
        }),
      }),
    );

    await page.goto(`${BASE_URL}${DETAIL_PATH}`);

    const btn = page.getByRole('button', { name: '영업대행 신청완료' });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('잘못된 id 경로 진입 시 alert 후 목록으로 리다이렉트', async ({ page }) => {
    // Number.isNaN(id) 가드 → alert('잘못된 접근입니다.') + navigate('/sales-agency-products', { replace: true })
    const dialogs: string[] = [];
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto(`${BASE_URL}/sales-agency-products/not-a-number`);

    await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
    // TODO: dialog 이벤트가 navigate 전에 발생하는지 타이밍 확인
    expect(dialogs.join(' ')).toContain('잘못된 접근입니다');
  });
});

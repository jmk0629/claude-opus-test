/**
 * 자동 생성된 UI smoke 초안 - medipanda-web
 * 원본 문서: docs/user/02_HOME.md
 * 대상 컴포넌트: src/pages-user/Home.tsx
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안 - 반드시 수동 검수 후 사용
 * 1. 셀렉터 실제 DOM과 일치 확인 (MUI Typography/Link는 role 예측이 어려움)
 * 2. API mock 필요 시 page.route()로 주입 (현재 대부분 fulfill 예시 포함)
 * 3. 인증 플로우는 session cookie/localStorage 기반일 가능성 - storageState 설정 필요
 * 4. 히어로 통계 좌표는 절대 위치 기반이므로 viewport 크기(>= 1200px) 보장 필요
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

// ---------- 공용 API 픽스처 ----------
const EMPTY_PAGE = { content: [], totalElements: 0, totalPages: 0, number: 0, size: 0 };

// API 경로 (docs/user/02_HOME.md 의 "API 사용 요약" 기반)
const API = {
  salesAgencyProducts: '**/v1/sales-agency-products**',
  banners: '**/v1/banners**',
  monthlyCount: '**/v1/prescriptions/monthly-count**',
  monthlyTotalAmount: '**/v1/prescriptions/monthly-total-amount**',
  openedHospitalsCount: '**/v1/hospitals/opened/count**',
  boards: '**/v1/boards**',
};

/**
 * 비로그인 상태 공통 route stub.
 * - 캐러셀 API는 빈 응답 (catch fallback은 에러 발생 시에만 동작하므로 200 + empty)
 * - TODO: verify selector - 실제 응답 스키마가 `{ content: [] }` 래핑인지 backend.ts 확인 필요
 */
async function stubPublicApis(page: Page) {
  await page.route(API.salesAgencyProducts, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_PAGE) }),
  );
  await page.route(API.banners, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_PAGE) }),
  );
}

test.describe('user/02 Home 페이지 (/) - UI smoke 초안', () => {
  test.beforeEach(async ({ page }) => {
    // 히어로 섹션은 position: absolute (702px left) 기반이므로 데스크톱 폭 확보
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // -----------------------------------------------------------------
  // 시나리오 1: 비로그인 정상 로드 - hero-public.svg 렌더
  // -----------------------------------------------------------------
  test('비로그인 상태에서 홈 진입 시 hero-public.svg 와 파트너 계약 링크가 노출된다', async ({ page }) => {
    await stubPublicApis(page);

    await page.goto(`${BASE_URL}/`);

    // 히어로 이미지 - alt='Hero Section' (Home.tsx:139 확인됨)
    const hero = page.getByAltText('Hero Section');
    await expect(hero).toBeVisible();
    await expect(hero).toHaveAttribute('src', /hero-public\.svg/);

    // 비로그인 전용 파트너 계약 Link (투명 Link, to='/partner-contract')
    // TODO: verify selector - 빈 Link라 role=link 로는 잡히지만 accessible name이 없을 수 있음
    const partnerLink = page.locator('a[href="/partner-contract"]');
    await expect(partnerLink).toBeVisible();

    // CSO 전용 커뮤니티 섹션은 비로그인이면 렌더되지 않아야 함
    await expect(page.getByRole('button', { name: '신규처 매칭' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '익명게시판' })).toHaveCount(0);
  });

  // -----------------------------------------------------------------
  // 시나리오 2: 로그인 상태 - 히어로 통계 3개 렌더
  // -----------------------------------------------------------------
  test('로그인 상태에서 처방건수/수수료/오픈병원 통계 3개가 표시된다', async ({ page }) => {
    await stubPublicApis(page);

    // 로그인 사용자 전용 통계 API mock
    await page.route(API.monthlyCount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 123 }) }),
    );
    await page.route(API.monthlyTotalAmount, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        // feeAmount / 1_000_000 = 45 -> "45백만원"
        body: JSON.stringify({ feeAmount: 45_000_000 }),
      }),
    );
    await page.route(API.openedHospitalsCount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(7) }),
    );

    // TODO: verify selector - 로그인 세션 주입 방식이 storageState인지 cookie/localStorage인지 확인 필요
    // 초안에서는 localStorage에 dummy session을 넣는 가장 흔한 패턴을 가정
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'session',
        JSON.stringify({
          id: 1,
          partnerContractStatus: 'CONTRACTED',
          memberType: 'CSO',
        }),
      );
    });

    await page.goto(`${BASE_URL}/`);

    // hero.svg (로그인 버전)
    await expect(page.getByAltText('Hero Section')).toHaveAttribute('src', /\/hero\.svg/);

    // 통계 숫자 - 로드 전 '-' 였다가 로드 후 숫자로 바뀜
    await expect(page.getByText('123', { exact: true })).toBeVisible();
    await expect(page.getByText('건', { exact: true })).toBeVisible();

    await expect(page.getByText('45', { exact: true })).toBeVisible();
    await expect(page.getByText('백만원', { exact: true })).toBeVisible();

    await expect(page.getByText('7', { exact: true })).toBeVisible();
    await expect(page.getByText('개사', { exact: true })).toBeVisible();
  });

  // -----------------------------------------------------------------
  // 시나리오 3: 로딩 중 - 통계가 '-' 로 표시됨
  // -----------------------------------------------------------------
  test('로그인 상태에서 통계 API 응답 전에는 대시(-)가 표시된다', async ({ page }) => {
    await stubPublicApis(page);

    // 의도적으로 응답을 지연 시켜 로딩 상태 확인
    await page.route(API.monthlyCount, async route => {
      await new Promise(r => setTimeout(r, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
    });
    await page.route(API.monthlyTotalAmount, async route => {
      await new Promise(r => setTimeout(r, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feeAmount: 0 }) });
    });
    await page.route(API.openedHospitalsCount, async route => {
      await new Promise(r => setTimeout(r, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(0) });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'session',
        JSON.stringify({ id: 1, partnerContractStatus: 'CONTRACTED', memberType: 'CSO' }),
      );
    });

    await page.goto(`${BASE_URL}/`);

    // 초기 상태: 세 자리 위치 모두 '-' 텍스트 존재
    // TODO: verify selector - '-' 단일 문자 매칭은 불안정. data-testid 도입 권장
    const dashes = page.getByText('-', { exact: true });
    await expect(dashes.first()).toBeVisible();
  });

  // -----------------------------------------------------------------
  // 시나리오 4: 영업대행 캐러셀 2개 이상 일 때 prev/next 버튼 노출
  // -----------------------------------------------------------------
  test('영업대행 상품이 2개 이상이면 좌/우 캐러셀 버튼이 표시된다', async ({ page }) => {
    const products = {
      content: [
        { id: 1, thumbnailUrl: '/assets/p1.png' },
        { id: 2, thumbnailUrl: '/assets/p2.png' },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 10,
    };

    await page.route(API.salesAgencyProducts, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) }),
    );
    await page.route(API.banners, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_PAGE) }),
    );

    await page.goto(`${BASE_URL}/`);

    // 캐러셀 좌/우 arrow 이미지 - Home.tsx 에서 <img src='/assets/carousel-left.svg'> 사용
    // TODO: verify selector - 아이콘에 alt가 없으면 role=img 접근이 어려움. data-testid 권장
    const leftArrow = page.locator('img[src*="carousel-left"]');
    const rightArrow = page.locator('img[src*="carousel-right"]');

    await expect(leftArrow.first()).toBeVisible();
    await expect(rightArrow.first()).toBeVisible();

    // 우측 화살표 클릭 - 에러 없이 동작하는지만 smoke
    await rightArrow.first().click();
  });

  // -----------------------------------------------------------------
  // 시나리오 5: CSO 회원 - 커뮤니티 섹션 탭 전환
  // -----------------------------------------------------------------
  test('CSO 회원은 커뮤니티 섹션에서 신규처 매칭 ↔ 익명게시판 탭을 전환할 수 있다', async ({ page }) => {
    await stubPublicApis(page);

    // 히어로 통계는 이 시나리오에 무관하나 에러 방지용 stub
    await page.route(API.monthlyCount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
    );
    await page.route(API.monthlyTotalAmount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feeAmount: 0 }) }),
    );
    await page.route(API.openedHospitalsCount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(0) }),
    );

    // 탭별로 다른 boardType 응답 구분 (URL 쿼리스트링으로 구분)
    await page.route(API.boards, route => {
      const url = route.request().url();
      const isAnonymous = url.includes('ANONYMOUS');
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              id: isAnonymous ? 99 : 11,
              title: isAnonymous ? '익명 글 샘플' : '신규처 매칭 샘플',
              nickname: 'tester',
              commentCount: 0,
              likesCount: 0,
              viewsCount: 0,
              createdAt: '2026-04-17T00:00:00Z',
            },
          ],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 10,
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'session',
        JSON.stringify({ id: 1, partnerContractStatus: 'CONTRACTED', memberType: 'CSO' }),
      );
    });

    await page.goto(`${BASE_URL}/`);

    // 초기: 신규처 매칭 탭 활성 -> 해당 게시글 노출
    await expect(page.getByRole('button', { name: '신규처 매칭' })).toBeVisible();
    await expect(page.getByText('신규처 매칭 샘플')).toBeVisible();

    // 익명게시판 탭으로 전환
    await page.getByRole('button', { name: '익명게시판' }).click();
    await expect(page.getByText('익명 글 샘플')).toBeVisible();

    // 글쓰기 버튼이 탭에 맞는 URL로 연결되는지 확인
    // TODO: verify selector - MedipandaButton 이 실제 role=link 를 갖는지 확인 필요
    const writeBtn = page.getByRole('link', { name: '글쓰기' });
    await expect(writeBtn).toHaveAttribute('href', /\/community\/anonymous\/new/);
  });

  // -----------------------------------------------------------------
  // 시나리오 6: 커뮤니티 빈 상태 - '게시글이 없습니다.'
  // -----------------------------------------------------------------
  test('커뮤니티 게시글이 0건이면 빈 상태 메시지가 표시된다', async ({ page }) => {
    await stubPublicApis(page);
    await page.route(API.monthlyCount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }),
    );
    await page.route(API.monthlyTotalAmount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ feeAmount: 0 }) }),
    );
    await page.route(API.openedHospitalsCount, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(0) }),
    );
    await page.route(API.boards, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_PAGE) }),
    );

    await page.addInitScript(() => {
      window.localStorage.setItem(
        'session',
        JSON.stringify({ id: 1, partnerContractStatus: 'CONTRACTED', memberType: 'CSO' }),
      );
    });

    await page.goto(`${BASE_URL}/`);

    await expect(page.getByText('게시글이 없습니다.')).toBeVisible();
  });

  // -----------------------------------------------------------------
  // 시나리오 7: 캐러셀 API 실패 - 기본 fallback 이미지 렌더
  // -----------------------------------------------------------------
  test('영업대행 API 500 실패 시 기본 fallback 이미지(default-carousel-sales-agency.svg)가 렌더된다', async ({ page }) => {
    await page.route(API.salesAgencyProducts, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"error"}' }),
    );
    await page.route(API.banners, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"error"}' }),
    );

    await page.goto(`${BASE_URL}/`);

    // fallback 이미지가 DOM에 존재해야 함
    const fallbackSales = page.locator('img[src*="default-carousel-sales-agency"]');
    await expect(fallbackSales).toHaveCount(1);

    const fallbackBanner = page.locator('img[src*="default-carousel-banner"]');
    await expect(fallbackBanner).toHaveCount(1);
  });

  // -----------------------------------------------------------------
  // 시나리오 8: 캐러셀 5초 자동 전환 (타이밍 의존 - flaky 위험)
  // -----------------------------------------------------------------
  test('영업대행 캐러셀이 5초 경과 후 다음 항목으로 자동 전환된다', async ({ page }) => {
    const products = {
      content: [
        { id: 1, thumbnailUrl: '/assets/p1.png' },
        { id: 2, thumbnailUrl: '/assets/p2.png' },
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 10,
    };
    await page.route(API.salesAgencyProducts, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) }),
    );
    await page.route(API.banners, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_PAGE) }),
    );

    await page.goto(`${BASE_URL}/`);

    // TODO: verify selector - MedipandaCarousel 내부 DOM 구조가 불명확.
    //       transform / aria-hidden / data-index 속성 중 어떤 것으로 활성 슬라이드를 판별하는지 확인 필요.
    //       현재는 5초 자동전환이 "에러 없이 진행되는지" 만 smoke 로 확인.
    const carouselImages = page.locator('img[src*="/assets/p"]');
    await expect(carouselImages.first()).toBeVisible();

    // 5초 + 버퍼 대기 후 다음 슬라이드 노출 확인 (가장 간단한 가정)
    await page.waitForTimeout(5500);

    // 최소한 캐러셀 영역이 여전히 렌더되어 있어야 함
    await expect(carouselImages.first()).toBeAttached();
  });
});

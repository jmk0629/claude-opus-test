/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/11_BANNER.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminBannerList.tsx  (/admin/banners)
 *   - src/pages-admin/MpAdminBannerEdit.tsx  (/admin/banners/new, /admin/banners/:bannerId/edit)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * 초안이므로 반드시 수동 검수 후 사용.
 *
 * 검수 체크리스트:
 * 1. Admin은 AdminGuard + 관리자 권한 필수 — beforeEach에 storageState 또는 세션 주입 필요
 *    (현재는 injectTestSession으로 localStorage mock만 설정. 쿠키 기반 세션이면 storageState로 교체)
 * 2. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 TODO: verify selector 표시 항목)
 * 3. API mock은 _fixtures의 EMPTY_PAGE/pageResponse 재사용 — 필드 스키마는 backend.ts로 검증
 * 4. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만 이후 재작성 필요
 * 5. 배너 Edit는 useMpModal 기반 커스텀 alert/modal 사용 — 일부 경로는 네이티브 window.alert이 아닐 수 있음
 *    (acceptNextDialog가 잡지 못하면 dialog role로 전환 필요)
 * 6. 이미지 업로드는 단일 파일 + multipart/form-data — 실제 createBanner 페이로드 구조는 backend.ts 확인 후 조정
 */

import { test, expect, type Route } from '@playwright/test';
import {
  BASE_URL_ADMIN,
  EMPTY_PAGE,
  pageResponse,
  api,
  expectMpModal,
  acceptMpModal,
} from './_fixtures';

// ────────────────────────────────────────────────────────────────
// 공용 헬퍼
// ────────────────────────────────────────────────────────────────

// query string 이 붙는 목록 endpoint 매칭용. api() 는 trailing `**` 을 붙이지 않으므로
// 여기서 명시적으로 정규식 사용. (/v1/banners 만 가로채고 /v1/banners/{id} 는 제외)
const BANNERS_LIST_RE = /\/v1\/banners(\?|$)/;
// 단건: /v1/banners/{id} — 하위 경로는 제외
const bannerByIdRe = (id: number | string): RegExp => new RegExp(`/v1/banners/${id}(\\?|$)`);

// 배너 상세 단건 응답 (수정 모드 로드용)
function bannerDetailFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 42,
    position: 'ALL',
    status: 'VISIBLE',
    scope: 'ENTIRE',
    title: '봄맞이 기획전',
    linkUrl: 'https://example.com/spring',
    imageUrl: 'https://cdn.example.com/banner-42.png',
    startAt: '2026-04-01T00:00:00',
    endAt: '2026-04-30T23:59:59',
    displayOrder: 1,
    viewCount: 1234,
    clickCount: 56,
    ctr: 4.5,
    ...overrides,
  };
}

// 배너 목록 단일 행 (pageResponse 에 래핑해서 사용)
function bannerListRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 42,
    position: 'HOME',
    title: '봄맞이 기획전',
    status: 'VISIBLE',
    scope: 'ENTIRE',
    startAt: '2026-04-01T00:00:00',
    endAt: '2026-04-30T23:59:59',
    displayOrder: 1,
    viewCount: 1234,
    clickCount: 56,
    ctr: 4.5,
    imageUrl: 'https://cdn.example.com/banner-42.png',
    linkUrl: 'https://example.com/spring',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────
// 테스트 본체
// ────────────────────────────────────────────────────────────────

test.describe('admin/11 BANNER — 배너관리 smoke', () => {
  // 세션은 admin project 의 storageState(.auth/admin.json) 로 이미 주입됨.
  // localStorage 기반 seedAdminSession 은 cookie 세션을 덮어쓰지 못하므로 제거.

  // ───────────── 배너 목록 (MpAdminBannerList) ─────────────
  test.describe('배너 목록 (/admin/banners)', () => {
    test('정상 로드: 제목 + 검색 필터 + 테이블 헤더 렌더', async ({ page }) => {
      await page.route(BANNERS_LIST_RE, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners`);

      await expect(page.getByRole('heading', { name: '배너관리' })).toBeVisible();

      // 검색 필터 버튼
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
      // '등록' 버튼은 RouterLink 기반이라 link role
      await expect(page.getByRole('link', { name: '등록' })).toBeVisible();

      // 테이블 헤더 컬럼 — 배너 전용 (노출수/클릭수/CTR)
      await expect(page.getByRole('columnheader', { name: '배너위치' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '배너제목' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '노출상태' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '노출범위' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '게시기간' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '노출수' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '클릭수' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'CTR' })).toBeVisible();
    });

    test('빈 상태: API 0건 응답 시 "검색 결과가 없습니다." 표시', async ({ page }) => {
      await page.route(BANNERS_LIST_RE, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners`);
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
      await expect(page.getByText(/검색결과:\s*0\s*건/)).toBeVisible();
    });

    test('목록 렌더: 배너제목 링크가 /admin/banners/:id/edit 를 가리키고 CTR 포맷 확인', async ({ page }) => {
      await page.route(BANNERS_LIST_RE, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              bannerListRow({
                id: 42,
                title: '봄맞이 기획전',
                viewCount: 1234,
                clickCount: 56,
                ctr: 4.5,
              }),
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners`);

      // 배너제목 링크 → /admin/banners/42/edit
      const titleLink = page.getByRole('link', { name: '봄맞이 기획전' });
      await expect(titleLink).toBeVisible();
      await expect(titleLink).toHaveAttribute('href', /\/admin\/banners\/42\/edit/);

      // 노출수/클릭수 천 단위 쉼표 + CTR % 포맷
      await expect(page.getByRole('cell', { name: '1,234' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '56' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '4.5%' })).toBeVisible();

      // 노출상태 Chip — "노출"
      await expect(page.getByText('노출').first()).toBeVisible();
    });

    test('에러 상태: 목록 API 500 실패 시 alertError 메시지 표시', async ({ page }) => {
      await page.route(BANNERS_LIST_RE, async (route: Route) => {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners`);
      await expectMpModal(page, '배너 목록을 불러오는 중 오류가 발생했습니다.');
      await acceptMpModal(page);
    });

    test('등록 버튼 클릭 시 /admin/banners/new 로 이동', async ({ page }) => {
      await page.route(BANNERS_LIST_RE, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners`);

      const registerBtn = page.getByRole('link', { name: '등록' });
      // 등록 버튼은 RouterLink 기반이라 href 가 있음
      await expect(registerBtn).toHaveAttribute('href', /\/admin\/banners\/new$/);
    });
  });

  // ───────────── 배너 등록 (MpAdminBannerEdit, isNew=true) ─────────────
  test.describe('배너 등록 (/admin/banners/new)', () => {
    test('정상 로드: 제목 + 필수 필드 라벨 + 저장/취소 버튼', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/banners/new`);

      // 제목
      await expect(page.getByRole('heading', { name: '배너등록' })).toBeVisible();

      // 필수 필드 라벨 — Typography component='label' 패턴이라 getByText 사용
      // TODO: verify selector — "*" 표시를 포함한 전체 텍스트로 매칭할지 별도 확인
      await expect(page.getByText('배너위치', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('노출순서', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('노출상태', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('노출범위', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('배너제목', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('배너이미지', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('배너링크', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('게시기간', { exact: false }).first()).toBeVisible();

      // 파일 선택 / 저장 / 취소 버튼
      await expect(page.getByRole('button', { name: '파일 선택' })).toBeVisible();
      await expect(page.getByRole('button', { name: '저장' })).toBeVisible();
      // 취소는 RouterLink 기반 -> link role
      await expect(page.getByRole('link', { name: '취소' })).toHaveAttribute('href', /\/admin\/banners$/);
    });

    test('유효성: 배너제목 빈 상태로 저장 시 "배너제목을 입력하세요." alert', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/banners/new`);

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '배너제목을 입력하세요.');
      await acceptMpModal(page);
    });

    test('유효성: 이미지 미선택 상태로 저장 시 "배너이미지를 선택하세요." alert', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/banners/new`);

      // 배너제목 TextField 는 라벨이 없음 → 첫 번째 textbox 로 접근
      const titleInput = page.getByRole('textbox').first();
      await titleInput.fill('테스트 배너');

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '배너이미지를 선택하세요.');
      await acceptMpModal(page);
    });
  });

  // ───────────── 배너 수정 (MpAdminBannerEdit, isNew=false) ─────────────
  test.describe('배너 수정 (/admin/banners/:bannerId/edit)', () => {
    test('정상 로드: 기존 배너 데이터로 폼 프리필 + 이미지 미리보기 노출', async ({ page }) => {
      await page.route(bannerByIdRe(42), async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(bannerDetailFixture()),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners/42/edit`);

      // 배너제목 프리필
      // TODO: verify selector — TextField 의 value 속성으로 조회
      await expect(page.locator('input[value="봄맞이 기획전"]')).toBeVisible();

      // 배너링크 프리필
      await expect(page.locator('input[value="https://example.com/spring"]')).toBeVisible();

      // 기존 이미지 미리보기 — <img alt="Banner preview" src={imageUrl} />
      const preview = page.getByAltText('Banner preview');
      await expect(preview).toBeVisible();
      await expect(preview).toHaveAttribute('src', 'https://cdn.example.com/banner-42.png');
    });

    test('에러 상태: 단건 조회 API 500 실패 시 alertError 메시지 표시', async ({ page }) => {
      await page.route(bannerByIdRe(42), async (route: Route) => {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners/42/edit`);
      await expectMpModal(page, '배너 정보를 불러오는데 실패했습니다.');
      await acceptMpModal(page);
    });

    test('잘못된 파라미터: bannerId가 NaN이면 "잘못된 접근" alert 후 목록으로 이동', async ({ page }) => {
      // 목록 이동 대상 API mock (잘못된 접근 → navigate('/admin/banners'))
      await page.route(BANNERS_LIST_RE, async (route: Route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_PAGE) });
      });

      await page.goto(`${BASE_URL_ADMIN}/banners/abc/edit`);
      await expectMpModal(page, '잘못된 접근');
      await acceptMpModal(page);

      await expect(page).toHaveURL(/\/admin\/banners(\?|$)/);
    });
  });
});

/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/09_CONTENT_MANAGEMENT.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminHospitalList.tsx   (/admin/hospitals)
 *   - src/pages-admin/MpAdminAtoZList.tsx       (/admin/atoz)
 *   - src/pages-admin/MpAdminAtoZDetail.tsx     (/admin/atoz/:boardId)
 *   - src/pages-admin/MpAdminAtoZEdit.tsx       (/admin/atoz/:boardId/edit, /admin/atoz/new)
 *   - src/pages-admin/MpAdminEventList.tsx      (/admin/events)
 *   - src/pages-admin/MpAdminEventDetail.tsx    (/admin/events/:eventId)
 *   - src/pages-admin/MpAdminEventEdit.tsx      (/admin/events/:eventId/edit, /admin/events/new)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용.
 *
 * 검수 체크리스트:
 * 1. Admin은 AdminGuard + 관리자 권한 필수 — beforeEach에 storageState 또는 세션 주입 필요
 *    (현재는 injectTestSession으로 localStorage mock만 설정. 쿠키 기반 세션이면 storageState로 교체)
 * 2. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 TODO: verify selector 표시 항목)
 *    — 개원병원은 시/도, 시/군/구 Select에 InputLabel만 있고 aria-label은 없음
 *    — CSO A to Z 목록은 'isExposed' Select의 label이 없어 combobox 식별자 부재
 *    — AtoZ/Event 편집 페이지의 RadioGroup은 value 문자열('true'/'false')에 의존
 * 3. API mock은 _fixtures의 EMPTY_PAGE/pageResponse 재사용 — 필드 스키마는 backend.ts로 검증
 * 4. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만 이후 재작성 필요
 * 5. 목록 페이지의 'filterDeleted: true' query param은 url wildcard 매칭으로 덮여있지만,
 *    상세 API는 query string이 달라질 수 있어 `/v1/boards/:id**` 패턴으로 매칭
 * 6. 에디터(Tiptap)는 useMedipandaEditor 훅이 동적 로드 → 본문 내용 검증은 생략
 * 7. Event 편집의 multipart 업로드는 FormData 검증 필요(드래프트에선 status 200만 반환)
 * 8. CSO A to Z 목록 테이블 헤더의 '노츌범위' 오타는 실제 코드에 있는 것 (`MpAdminAtoZList.tsx:273`)
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  BASE_URL_ADMIN,
  EMPTY_PAGE,
  pageResponse,
  api,
  acceptNextDialog,
  injectTestSession,
  SESSION_PRESETS,
} from './_fixtures';

// ────────────────────────────────────────────────────────────────
// 공용 helper — spec 내부에서만 사용
// ────────────────────────────────────────────────────────────────

// Admin 권한 주입. cookie 기반이면 test.use({ storageState })로 교체.
async function seedAdminSession(page: Page): Promise<void> {
  // TODO: storageState — 실제 관리자 세션 구조를 확인 후 교체
  await injectTestSession(page, {
    ...SESSION_PRESETS.csoApproved,
    role: 'ADMIN',
    userId: 'test-admin',
    name: '테스트관리자',
  });
}

/**
 * 지역 Select의 선행 API (개원병원 페이지 마운트 시 Promise.all로 호출).
 * 시도 2개 × 각 시군구 목록을 최소한으로 stub.
 */
async function installRegionMocks(page: Page): Promise<void> {
  await page.route(api('/v1/region-categories/sido'), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: '서울특별시' },
        { id: 2, name: '부산광역시' },
      ]),
    });
  });
  await page.route(api('/v1/region-categories/sido/1/sigungu'), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 11, name: '강남구' }]),
    });
  });
  await page.route(api('/v1/region-categories/sido/2/sigungu'), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 21, name: '해운대구' }]),
    });
  });
}

// ────────────────────────────────────────────────────────────────
// 테스트 본체
// ────────────────────────────────────────────────────────────────

test.describe('admin/09 CONTENT_MANAGEMENT — 콘텐츠 관리 smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
  });

  // ───────────── 개원병원 목록 (MpAdminHospitalList) ─────────────
  test.describe('개원병원페이지 (/admin/hospitals)', () => {
    test('정상 로드: 제목/검색 필터/테이블 헤더 렌더 + 삭제 버튼은 주석 처리되어 없음', async ({ page }) => {
      await installRegionMocks(page);
      await page.route(api('/v1/hospitals'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/hospitals`);

      await expect(page.getByRole('heading', { name: '개원병원페이지' })).toBeVisible();
      // 테이블 헤더 컬럼
      await expect(page.getByRole('columnheader', { name: '지역' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '병의원명' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '주소' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '허가예정일' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '분류' })).toBeVisible();

      // 삭제/엑셀 업로드 버튼은 JSX 주석 처리 → 존재하지 않아야 함
      await expect(page.getByRole('button', { name: '엑셀 업로드' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(0);

      // 검색 & 초기화 버튼은 노출
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
    });

    test('목록 렌더: 허가예정일 null인 병원은 "-" 표시', async ({ page }) => {
      await installRegionMocks(page);
      await page.route(api('/v1/hospitals'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 101,
                name: '서울개원의원',
                address: '서울특별시 강남구 역삼동 111',
                sido: '서울특별시',
                scheduledOpenDate: '2026-05-01T00:00:00',
                source: 'KIMS',
              },
              {
                id: 102,
                name: '부산개원의원',
                address: '부산광역시 해운대구 우동 222',
                sido: '부산광역시',
                scheduledOpenDate: null,
                source: 'MANUAL',
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/hospitals`);

      await expect(page.getByRole('cell', { name: '서울개원의원' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '부산개원의원' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '2026-05-01' })).toBeVisible();
      // scheduledOpenDate=null → '-'
      await expect(page.getByRole('cell', { name: '-', exact: true })).toBeVisible();
    });

    test('에러 상태: 목록 API 실패 시 alertError 모달 메시지 표시', async ({ page }) => {
      await installRegionMocks(page);
      await page.route(api('/v1/hospitals'), async (route: Route) => {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });

      // TODO: verify selector — useMpModal은 커스텀 모달. role이 alertdialog/dialog인지 검증 필요.
      await page.goto(`${BASE_URL_ADMIN}/hospitals`);
      await expect(page.getByText('개원병원 목록을 불러오는 중 오류가 발생했습니다.')).toBeVisible();
    });
  });

  // ───────────── CSO A to Z 목록 (MpAdminAtoZList) ─────────────
  test.describe('CSO A to Z 목록 (/admin/atoz)', () => {
    test('정상 로드: 제목/삭제(비활성)/등록 버튼 + 제목 헤더 렌더', async ({ page }) => {
      await page.route(api('/v1/boards'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/atoz`);

      await expect(page.getByRole('heading', { name: 'CSO A TO Z' })).toBeVisible();
      // 선택된 항목이 없으므로 삭제 버튼은 비활성화
      const deleteButton = page.getByRole('button', { name: '삭제' });
      await expect(deleteButton).toBeVisible();
      await expect(deleteButton).toBeDisabled();

      // 등록 버튼 — RouterLink로 /admin/atoz/new 이동
      const registerButton = page.getByRole('link', { name: '등록' });
      await expect(registerButton).toBeVisible();
      await expect(registerButton).toHaveAttribute('href', /\/admin\/atoz\/new$/);

      // 테이블 헤더 — 실제 코드에 '노츌범위' 오타가 있음 (문서 9-4 참조)
      await expect(page.getByRole('columnheader', { name: '제목' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '노츌범위' })).toBeVisible();
    });

    test('목록 렌더: 제목 클릭 시 /admin/atoz/{id} 로 이동하는 링크 존재', async ({ page }) => {
      await page.route(api('/v1/boards'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 77,
                title: '파트너 계약 안내',
                isExposed: true,
                exposureRange: 'ALL',
                viewsCount: 1234,
                createdAt: '2026-03-15T09:00:00Z',
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/atoz`);

      const titleLink = page.getByRole('link', { name: '파트너 계약 안내' });
      await expect(titleLink).toBeVisible();
      await expect(titleLink).toHaveAttribute('href', /\/admin\/atoz\/77$/);
      // 조회수 숫자 포맷(1,234)
      await expect(page.getByRole('cell', { name: '1,234' })).toBeVisible();
      // 노출 상태 Chip
      await expect(page.getByText('노출', { exact: true })).toBeVisible();
    });

    test('빈 상태: API 0건 응답 시 "검색 결과가 없습니다." 표시', async ({ page }) => {
      await page.route(api('/v1/boards'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/atoz`);
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('검색 필터: 검색어 입력 후 "검색" 클릭 시 URL에 searchKeyword 반영', async ({ page }) => {
      await page.route(api('/v1/boards'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/atoz`);

      await page.getByRole('textbox', { name: '검색어' }).fill('계약');
      await page.getByRole('button', { name: '검색' }).click();

      // setUrlParams는 navigate로 URL을 바꿈 — query string 검증
      await expect(page).toHaveURL(/searchKeyword=%EA%B3%84%EC%95%BD|searchKeyword=계약/);
    });
  });

  // ───────────── CSO A to Z 상세 (MpAdminAtoZDetail) ─────────────
  test.describe('CSO A to Z 상세 (/admin/atoz/:boardId)', () => {
    test('정상 로드: 제목/노출상태/수정 버튼 링크', async ({ page }) => {
      // 목록 API가 선행 호출되지 않도록, detail 전용 wildcard 매칭
      await page.route(api('/v1/boards/77**'), async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 77,
            title: '파트너 계약 안내',
            content: '<p>안녕하세요</p>',
            attachments: [],
            isExposed: true,
            exposureRange: 'ALL',
            viewsCount: 1234,
            createdAt: '2026-03-15T09:00:00Z',
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/atoz/77`);

      await expect(page.getByRole('heading', { name: 'CSO A TO Z 상세' })).toBeVisible();
      // Table key-value 구조: 제목 옆 셀에 값
      await expect(page.getByRole('cell', { name: '파트너 계약 안내' })).toBeVisible();

      // [취소] → /admin/atoz, [수정] → /admin/atoz/77/edit
      await expect(page.getByRole('link', { name: '취소' })).toHaveAttribute('href', /\/admin\/atoz$/);
      await expect(page.getByRole('link', { name: '수정' })).toHaveAttribute('href', /\/admin\/atoz\/77\/edit$/);
    });

    test('잘못된 URL: /admin/atoz/abc (NaN) 진입 시 alertError 후 /admin/atoz 로 이동', async ({ page }) => {
      // getBoardDetails가 호출되지 않도록 mock 불필요. alertError 후 navigate.
      // TODO: verify selector — useMpModal alertError 모달 내부 텍스트 매칭
      await page.goto(`${BASE_URL_ADMIN}/atoz/abc`);
      await expect(page.getByText('잘못된 접근입니다.')).toBeVisible();
    });
  });

  // ───────────── CSO A to Z 등록 (MpAdminAtoZEdit) ─────────────
  test.describe('CSO A to Z 등록/수정 (/admin/atoz/new, /admin/atoz/:boardId/edit)', () => {
    test('등록 모드: 빈 폼 렌더 + 파일첨부 버튼 + 노출/노출범위 라디오', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/atoz/new`);

      // 라디오 라벨 확인 — '노출' / '미노출' / '전체' / '계약' / '미계약'
      // TODO: verify selector — RadioGroup은 name='isExposed' / 'exposureRange' 각각.
      //       같은 '노출' 텍스트가 Chip 등에서 중복될 수 있어 radio role로 범위 좁힘.
      await expect(page.getByRole('radio', { name: '노출' })).toBeVisible();
      await expect(page.getByRole('radio', { name: '미노출' })).toBeVisible();
      await expect(page.getByRole('radio', { name: '전체' })).toBeVisible();
      await expect(page.getByRole('radio', { name: '계약' })).toBeVisible();
      await expect(page.getByRole('radio', { name: '미계약' })).toBeVisible();

      // 파일첨부 버튼
      await expect(page.getByRole('button', { name: '파일첨부' })).toBeVisible();
    });

    test('수정 모드: detail API 응답으로 폼이 form.reset — 제목 TextField에 값 노출', async ({ page }) => {
      await page.route(api('/v1/boards/77**'), async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 77,
            title: '수정 대상 제목',
            content: '<p>본문</p>',
            attachments: [],
            isExposed: false,
            exposureRange: 'CONTRACTED',
            viewsCount: 0,
            createdAt: '2026-03-15T09:00:00Z',
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/atoz/77/edit`);

      // form.reset으로 title TextField에 값이 들어와야 함
      // TODO: verify selector — MUI TextField input은 label 연결이 있으면 getByLabel 권장
      await expect(page.locator('input[value="수정 대상 제목"]')).toBeVisible();
      // exposureRange=CONTRACTED → '계약' 라디오 선택
      await expect(page.getByRole('radio', { name: '계약' })).toBeChecked();
    });
  });

  // ───────────── 이벤트 목록 (MpAdminEventList) ─────────────
  test.describe('이벤트관리 목록 (/admin/events)', () => {
    test('정상 로드: 제목/테이블 헤더/등록 버튼 링크', async ({ page }) => {
      await page.route(api('/v1/event-boards'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/events`);

      await expect(page.getByRole('heading', { name: '이벤트관리' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '이벤트 상태' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '썸네일' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '이벤트 기간' })).toBeVisible();

      await expect(page.getByRole('link', { name: '등록' })).toHaveAttribute('href', /\/admin\/events\/new$/);
    });

    test('목록 렌더: 썸네일 이미지 + 제목 링크 /admin/events/{id}', async ({ page }) => {
      await page.route(api('/v1/event-boards'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 55,
                title: '봄맞이 할인 이벤트',
                thumbnailUrl: 'https://example.com/thumb.png',
                eventStatus: 'IN_PROGRESS',
                isExposed: true,
                viewCount: 9999,
                createdDate: '2026-04-01T00:00:00Z',
                eventStartAt: '2026-04-01T00:00:00Z',
                eventEndAt: '2026-04-30T23:59:59Z',
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/events`);

      const titleLink = page.getByRole('link', { name: '봄맞이 할인 이벤트' });
      await expect(titleLink).toBeVisible();
      await expect(titleLink).toHaveAttribute('href', /\/admin\/events\/55$/);

      // 썸네일 img — alt 속성 미지정이라 src로 매칭
      // TODO: verify selector — 이미지 alt 추가 권장
      await expect(page.locator('img[src="https://example.com/thumb.png"]')).toBeVisible();

      // viewCount 9,999
      await expect(page.getByRole('cell', { name: '9,999' })).toBeVisible();
    });

    test('빈 상태 + 삭제 버튼 비활성화', async ({ page }) => {
      await page.route(api('/v1/event-boards'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/events`);
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();

      // 이벤트 목록은 disabled 속성을 버튼에 걸지 않고 runtime alert로 처리 (`handleDelete` 진입 후 alert)
      // 선택 없이 클릭하면 '삭제할 이벤트를 선택하세요.' alert
      await page.route(api('/v1/event-boards/**'), async (route: Route) => {
        // DELETE mock — 혹시라도 호출되면 캐치
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      // TODO: verify selector — useMpModal.alert 모달 내부 텍스트 매칭
      await page.getByRole('button', { name: '삭제' }).click();
      await expect(page.getByText('삭제할 이벤트를 선택하세요.')).toBeVisible();
    });

    test('에러 상태: 목록 API 실패 시 alertError 모달 메시지 표시', async ({ page }) => {
      await page.route(api('/v1/event-boards'), async (route: Route) => {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });

      await page.goto(`${BASE_URL_ADMIN}/events`);
      await expect(page.getByText('이벤트 목록을 불러오는 중 오류가 발생했습니다.')).toBeVisible();
    });
  });

  // ───────────── 이벤트 상세 (MpAdminEventDetail) ─────────────
  test.describe('이벤트 상세 (/admin/events/:eventId)', () => {
    test('정상 로드: 중첩 구조(boardPostDetail + 이벤트 전용 필드) 렌더', async ({ page }) => {
      await page.route(api('/v1/event-boards/55**'), async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            eventStartDate: '2026-04-01T00:00:00Z',
            eventEndDate: '2026-04-30T23:59:59Z',
            description: '봄맞이 특가',
            thumbnailUrl: null,
            videoUrl: null,
            note: null,
            boardPostDetail: {
              title: '봄맞이 할인 이벤트',
              content: '<p>이벤트 본문</p>',
              attachments: [],
              isExposed: true,
              exposureRange: 'ALL',
              viewsCount: 12,
            },
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/events/55`);

      await expect(page.getByRole('heading', { name: '이벤트 상세' })).toBeVisible();
      await expect(page.getByText('봄맞이 할인 이벤트')).toBeVisible();
      await expect(page.getByText('봄맞이 특가')).toBeVisible();

      // [수정] → /admin/events/55/edit
      await expect(page.getByRole('link', { name: '수정' })).toHaveAttribute('href', /\/admin\/events\/55\/edit$/);
    });
  });
});

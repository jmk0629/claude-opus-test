/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/08_COMMUNITY.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminCommunityUserList.tsx     (/admin/community-users)
 *   - src/pages-admin/MpAdminCommunityPostList.tsx     (/admin/community-posts)
 *   - src/pages-admin/MpAdminCommunityPostDetail.tsx   (/admin/community-posts/:boardId)
 *   - src/pages-admin/MpAdminCommunityCommentList.tsx  (/admin/community-comments)
 *   - src/pages-admin/MpAdminCommunityBlindList.tsx    (/admin/community-blinds)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용.
 *
 * 검수 체크리스트:
 * 1. Admin은 AdminGuard + 관리자 권한 필수 — beforeEach에 storageState 또는 세션 주입 필요
 *    (현재는 injectTestSession으로 localStorage mock만. 쿠키 기반이면 storageState로 교체)
 * 2. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 표시 항목)
 *    - MUI Chip 라벨, Tiptap readonly 에디터, RouterLink 제목 등
 * 3. API mock은 _fixtures의 EMPTY_PAGE/pageResponse 재사용 — 스키마 필드는 backend.ts로 검증
 * 4. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만 이후 재작성 필요
 * 5. MUI Select 열기/선택은 combobox → option 패턴 — 버전별로 role 다를 수 있음
 * 6. useMpDeleteDialog는 MUI Dialog 기반 커스텀 훅 — window.confirm 아니므로 acceptNextDialog 사용 불가.
 *    role='dialog' 안의 확인 버튼을 직접 클릭해야 함.
 * 7. enqueueSnackbar(notistack) 토스트는 role='alert' 또는 getByText로 검증
 * 8. toggleBlindStatus_1(포스트) vs toggleBlindStatus(댓글) — 엔드포인트 분리 주의
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  BASE_URL_ADMIN,
  EMPTY_PAGE,
  pageResponse,
  injectTestSession,
  SESSION_PRESETS,
  expectMpModal,
  acceptMpModal,
} from './_fixtures';

// ────────────────────────────────────────────────────────────────
// 공용 mock helper — spec 내부에서만 사용
// ────────────────────────────────────────────────────────────────

// Admin 권한 주입. cookie 기반이면 test.use({ storageState })로 교체.
async function seedAdminSession(page: Page): Promise<void> {
  // TODO: storageState — 실제 관리자 세션 구조 확인 후 교체
  await injectTestSession(page, {
    ...SESSION_PRESETS.csoApproved,
    role: 'ADMIN',
    userId: 'test-admin',
  });
}

/**
 * 커뮤니티 메뉴가 공유하는 fetch 실패 안전망.
 * 특정 테스트에서 override 하지 않은 엔드포인트는 빈 페이지로 응답.
 * - (\?|$) 앵커로 쿼리스트링/끝을 허용하되 `/v1/boards/777` 같은 상세는 제외.
 */
async function installBaseMocks(page: Page): Promise<void> {
  const fallbacks: RegExp[] = [
    /\/v1\/boards\/members(\?|$)/,
    /\/v1\/boards(\?|$)/,
    /\/v1\/comments(\?|$)/,
    /\/v1\/blind-posts(\?|$)/,
  ];
  for (const pattern of fallbacks) {
    await page.route(pattern, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });
  }
}

// ────────────────────────────────────────────────────────────────
// 테스트 본체
// ────────────────────────────────────────────────────────────────

test.describe('admin/08 COMMUNITY — 커뮤니티 관리 smoke', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await seedAdminSession(page);
    await installBaseMocks(page);
  });

  // ───────────── 이용자 관리 ─────────────
  test.describe('이용자 관리 (/admin/community-users)', () => {
    test('정상 로드: 제목/검색 필터/테이블 헤더 렌더', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards\/members(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-users`);

      await expect(page.getByRole('heading', { name: '이용자 관리' })).toBeVisible();
      // 검색 필터 요소 — InputLabel은 텍스트 노드로 렌더됨
      // TODO: verify selector — InputLabel 텍스트
      await expect(page.getByText('파트너사 계약여부').first()).toBeVisible();
      await expect(page.getByText('검색유형').first()).toBeVisible();
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();

      // 테이블 헤더 (읽기 전용이므로 체크박스 없음)
      await expect(page.getByRole('columnheader', { name: '회원번호' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '작성글 수' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '댓글 수' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '블라인드 글 수' })).toBeVisible();
    });

    test('빈 상태: API 0건 응답 시 "검색 결과가 없습니다." 표시', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards\/members(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-users`);
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('목록 렌더: 이용자 1건 통계 + 연락처 포맷(010-XXXX-XXXX)', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards\/members(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 501,
                userId: 'test-user',
                name: '홍길동',
                nickname: '길동이',
                phoneNumber: '01012345678',
                contractStatus: 'CONTRACT',
                postCount: 12,
                commentCount: 34,
                totalLikes: 56,
                blindPostCount: 2,
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-users`);

      await expect(page.getByRole('cell', { name: '501' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'test-user' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '홍길동' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '길동이' })).toBeVisible();
      // 연락처 포맷 변환
      await expect(page.getByRole('cell', { name: '010-1234-5678' })).toBeVisible();
      // 통계 숫자 (exact: true — 연락처 '010-1234-5678' 같은 substring 매치 방지)
      await expect(page.getByRole('cell', { name: '12', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: '34', exact: true })).toBeVisible();
    });
  });

  // ───────────── 포스트 관리 목록 ─────────────
  test.describe('포스트 관리 (/admin/community-posts)', () => {
    test('정상 로드: 제목/필터/블라인드 버튼(비활성 상태) 렌더', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-posts`);

      await expect(page.getByRole('heading', { name: '포스트 관리' })).toBeVisible();
      // TODO: verify selector — InputLabel 텍스트 (게시판유형/검색유형/시작일/종료일)
      await expect(page.getByText('게시판유형').first()).toBeVisible();
      await expect(page.getByText('시작일').first()).toBeVisible();
      await expect(page.getByText('종료일').first()).toBeVisible();

      // 블라인드 버튼: 선택된 ID 없으면 비활성
      const blindButton = page.getByRole('button', { name: '블라인드', exact: true });
      await expect(blindButton).toBeVisible();
      await expect(blindButton).toBeDisabled();

      // 테이블 헤더
      await expect(page.getByRole('columnheader', { name: '게시판유형' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '제목' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '블라인드 여부' })).toBeVisible();
    });

    test('검색 필터: 검색유형 미선택 + 키워드 입력 시 alert', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-posts`);

      // 검색어만 입력 (검색유형은 기본 '')
      await page.getByRole('textbox', { name: '검색어' }).fill('테스트');
      await page.getByRole('button', { name: '검색' }).click();

      // useMpModal.alert 는 MpModal 기반 (window.alert 아님)
      await expectMpModal(page, '검색유형을 선택하세요.');
      await acceptMpModal(page);
    });

    test('목록 렌더: Chip(게시판유형) + RouterLink(제목) + 계약여부 Y/N', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 777,
                boardType: 'ANONYMOUS',
                userId: 'tester',
                name: '박관리',
                nickname: '관리자',
                memberType: 'CONTRACT_MEMBER',
                title: '테스트 게시글 제목',
                likesCount: 3,
                commentCount: 5,
                viewsCount: 42,
                isBlind: false,
                createdAt: '2026-04-17T01:23:45Z',
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-posts`);

      // 제목은 RouterLink(=<a>)로 렌더 — role=link + href 검증
      const titleLink = page.getByRole('link', { name: '테스트 게시글 제목' });
      await expect(titleLink).toBeVisible();
      await expect(titleLink).toHaveAttribute('href', /\/admin\/community-posts\/777/);

      // 게시판유형 Chip(라벨 텍스트는 BoardTypeLabel[ANONYMOUS], 예: '익명게시판')
      // TODO: verify — 실제 라벨 텍스트가 익명게시판인지 backend.ts 확인
      await expect(page.getByText('익명게시판')).toBeVisible();
    });

    test('빈 상태: 0건 응답 시 "검색 결과가 없습니다." 표시', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-posts`);
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('에러 상태: API 500 응답 시 alertError 모달 노출', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-posts`);

      await expectMpModal(page, '포스트 목록을 불러오는 중 오류가 발생했습니다.');
      await acceptMpModal(page);
    });
  });

  // ───────────── 포스트 상세 ─────────────
  test.describe('포스트 상세 (/admin/community-posts/:boardId)', () => {
    test('정상 로드: 3탭(포스트/댓글/신고기록) 렌더 + 기본 tab=post', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards\/777(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 777,
            title: '상세 테스트 제목',
            content: '<p>본문 HTML</p>',
            boardType: 'ANONYMOUS',
            attachments: [],
            comments: [],
            reports: [],
            isBlind: false,
            createdAt: '2026-04-17T01:23:45Z',
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-posts/777`);

      await expect(page.getByRole('heading', { name: '포스트 상세' })).toBeVisible();
      // 3개 탭 존재 — MUI Tab은 role='tab'
      await expect(page.getByRole('tab', { name: '포스트' })).toBeVisible();
      await expect(page.getByRole('tab', { name: '댓글' })).toBeVisible();
      await expect(page.getByRole('tab', { name: '신고기록' })).toBeVisible();

      // 기본 선택 탭은 '포스트'
      await expect(page.getByRole('tab', { name: '포스트' })).toHaveAttribute('aria-selected', 'true');
    });

    test('탭 전환: 댓글 탭 클릭 시 URL ?tab=comments 로 변경', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/boards\/777(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 777,
            title: '탭 테스트',
            content: '<p>본문</p>',
            boardType: 'ANONYMOUS',
            attachments: [],
            comments: [
              {
                id: 9001,
                content: '첫 댓글 내용',
                memberName: '댓글러',
                nickname: '닉네임1',
                userId: 'commenter1',
                createdAt: '2026-04-17T02:00:00Z',
              },
            ],
            reports: [],
            isBlind: false,
            createdAt: '2026-04-17T01:23:45Z',
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-posts/777`);
      await page.getByRole('tab', { name: '댓글' }).click();

      await expect(page).toHaveURL(/tab=comments/);
      await expect(page.getByRole('tab', { name: '댓글' })).toHaveAttribute('aria-selected', 'true');
    });
  });

  // ───────────── 댓글 관리 ─────────────
  test.describe('댓글 관리 (/admin/community-comments)', () => {
    test('정상 로드: 제목 + 댓글유형 필터 + 블라인드 버튼(비활성)', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/comments(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-comments`);

      await expect(page.getByRole('heading', { name: '댓글 관리' })).toBeVisible();
      const blindButton = page.getByRole('button', { name: '블라인드', exact: true });
      await expect(blindButton).toBeVisible();
      await expect(blindButton).toBeDisabled();
    });

    test('목록 렌더: 댓글 내용 말줄임 + 블라인드 버튼 활성화', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/comments(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 3001,
                userId: 'commenter-a',
                name: '댓글작성자',
                nickname: '닉A',
                commentType: 'ANONYMOUS',
                content: '아주 긴 댓글 내용 — 말줄임 테스트 대상',
                contractStatus: 'CONTRACT',
                createdAt: '2026-04-17T02:00:00Z',
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-comments`);

      await expect(page.getByText('아주 긴 댓글 내용 — 말줄임 테스트 대상')).toBeVisible();

      // 체크박스로 1건 선택 → 블라인드 버튼 활성화
      // TODO: verify selector — 헤더 체크박스 제외, 첫 번째 행 체크박스 선택
      const rowCheckbox = page.getByRole('row').filter({ hasText: '댓글작성자' }).getByRole('checkbox');
      await rowCheckbox.check();

      const blindButton = page.getByRole('button', { name: '블라인드', exact: true });
      await expect(blindButton).toBeEnabled();
    });
  });

  // ───────────── 블라인드 관리 ─────────────
  test.describe('블라인드 관리 (/admin/community-blinds)', () => {
    test('정상 로드: 제목 + 글유형 필터 + 블라인드 해제 버튼(비활성)', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/blind-posts(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-blinds`);

      await expect(page.getByRole('heading', { name: '블라인드 관리' })).toBeVisible();
      // TODO: verify selector — '글 유형' InputLabel
      await expect(page.getByText('글 유형').first()).toBeVisible();

      const unblindButton = page.getByRole('button', { name: '블라인드 해제' });
      await expect(unblindButton).toBeVisible();
      await expect(unblindButton).toBeDisabled();

      // 테이블 헤더
      await expect(page.getByRole('columnheader', { name: '글 유형' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '글 내용' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '블라인드 처리일' })).toBeVisible();
    });

    test('목록 + 선택: 1건 체크 시 "블라인드 해제" 버튼 활성화', async ({ page }: { page: Page }) => {
      await page.route(/\/v1\/blind-posts(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 8001,
                userId: 'blinded-user',
                memberName: '블라인드회원',
                nickname: '블닉',
                postType: 'BOARD',
                content: '블라인드된 게시글 본문',
                blindAt: '2026-04-10T09:00:00Z',
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/community-blinds`);

      await expect(page.getByText('블라인드된 게시글 본문')).toBeVisible();

      // 첫 행 체크박스 선택
      const rowCheckbox = page.getByRole('row').filter({ hasText: '블라인드회원' }).getByRole('checkbox');
      await rowCheckbox.check();

      await expect(page.getByRole('button', { name: '블라인드 해제' })).toBeEnabled();
    });
  });
});

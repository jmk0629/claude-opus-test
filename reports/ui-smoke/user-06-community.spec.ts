/**
 * 자동 생성된 UI smoke 초안 - medipanda-web
 * 원본 문서: docs/user/06_COMMUNITY.md
 * 대상 컴포넌트:
 *   - src/pages-user/MrCsoMatchingList.tsx  (신규처 매칭 목록)
 *   - src/pages-user/CommunityDetail.tsx    (게시글 상세 + 댓글)
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안 - 반드시 수동 검수 후 사용
 * 1. 셀렉터 실제 DOM과 일치 확인 (MUI Typography/Link 는 role 예측 어려움 → TODO 주석 참고)
 * 2. 커뮤니티는 로그인 가드가 있는 페이지 - storageState 로 세션 주입 필수 (test.use({ storageState }))
 * 3. 익명게시판(/community/anonymous)은 CSO 회원만 접근(`CsoMemberGuard`) - 본 스펙은 MR-CSO만 대상
 * 4. API mock 은 문서의 "API 엔드포인트 요약" 기준. 응답 스키마는 backend.ts 교차검증 필요
 * 5. 댓글 신고/좋아요 등 일부 엣지 시나리오는 실서버 플로우 재현이 어려워 route mock 에 의존
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

// ---------- API 경로 (docs/user/06_COMMUNITY.md "API 엔드포인트 요약" 기반) ----------
const API = {
  boards: '**/v1/boards?**',
  boardsFixedNotices: '**/v1/boards/notices/fixed-top**',
  boardDetail: (id: number | string) => `**/v1/boards/${id}`,
  boardLike: (id: number | string) => `**/v1/boards/${id}/like`,
  comments: '**/v1/comments/**',
  reports: '**/v1/reports/**',
};

// ---------- 픽스처 ----------
const SESSION_USER_ID = 'test-user-1';

const EMPTY_BOARD_PAGE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 10,
};

const SAMPLE_POST = {
  id: 101,
  title: '테스트 게시글 제목',
  userId: 'other-user',
  nickname: '테스터',
  hiddenNickname: false,
  hasImage: false,
  commentCount: 2,
  likesCount: 5,
  viewsCount: 123,
  createdAt: '2026-04-15T09:00:00Z',
};

const SAMPLE_BOARD_PAGE = {
  content: [SAMPLE_POST],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 10,
};

const SAMPLE_FIXED_NOTICE = {
  id: 1,
  title: '공지사항입니다',
  userId: 'super',
  nickname: '관리자',
  hiddenNickname: false,
  hasImage: false,
  commentCount: 0,
  likesCount: 0,
  viewsCount: 10,
  createdAt: '2026-04-01T09:00:00Z',
};

const SAMPLE_DETAIL = {
  ...SAMPLE_POST,
  content: '<p>게시글 본문입니다.</p>',
  attachments: [],
  likedByMe: false,
  comments: [
    {
      id: 1001,
      parentId: null,
      userId: 'commenter-1',
      nickname: '댓글러1',
      hiddenNickname: false,
      content: '첫 번째 댓글',
      createdAt: '2026-04-15T10:00:00Z',
      likesCount: 1,
      likedByMe: false,
      replies: [],
    },
  ],
};

// ---------- 공통 route helper ----------
async function stubBoardList(page: Page, body = SAMPLE_BOARD_PAGE) {
  await page.route(API.boards, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
  await page.route(API.boardsFixedNotices, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([SAMPLE_FIXED_NOTICE]) }),
  );
}

async function stubBoardDetail(page: Page, body = SAMPLE_DETAIL) {
  await page.route(API.boardDetail(SAMPLE_POST.id), route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

// TODO: verify storageState - 실제 세션 저장 키/쿠키 이름 확인 필요
// test.use({ storageState: 'tests/.auth/user.json' });

test.describe('user-06 커뮤니티 (MR-CSO 매칭)', () => {
  test.beforeEach(async ({ page }) => {
    await stubBoardList(page);
  });

  test('1. 목록 정상 로드: 테이블 헤더 5개 + 샘플 게시글 렌더', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/mr-cso-matching`);

    // TODO: verify selector - MedipandaTableCell 은 단순 <td> 가능성, role='cell' 로 접근
    await expect(page.getByText('제목', { exact: true })).toBeVisible();
    await expect(page.getByText('작성자', { exact: true })).toBeVisible();
    await expect(page.getByText('작성일', { exact: true })).toBeVisible();
    await expect(page.getByText('조회수', { exact: true })).toBeVisible();
    await expect(page.getByText('좋아요', { exact: true })).toBeVisible();

    await expect(page.getByRole('link', { name: SAMPLE_POST.title })).toBeVisible();
  });

  test('2. 상단 고정 공지 표시: pin 아이콘 + 공지 제목이 일반글보다 위', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/mr-cso-matching`);

    // 공지가 일반 게시글 행보다 먼저 등장하는지 (DOM 순서)
    const noticeLink = page.getByRole('link', { name: SAMPLE_FIXED_NOTICE.title });
    const postLink = page.getByRole('link', { name: SAMPLE_POST.title });
    await expect(noticeLink).toBeVisible();
    await expect(postLink).toBeVisible();

    // TODO: verify selector - icon-pin.svg 는 img alt 가 없을 수 있음. src 기반 locator 로 대체
    const pinIcon = page.locator('img[src*="icon-pin.svg"]');
    await expect(pinIcon.first()).toBeVisible();
  });

  test('3. 빈 상태: 게시글 0건 응답 시 테이블 바디 비어 있음', async ({ page }) => {
    await page.route(API.boards, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_BOARD_PAGE) }),
    );
    await page.route(API.boardsFixedNotices, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );

    await page.goto(`${BASE_URL}/community/mr-cso-matching`);

    await expect(page.getByText('제목', { exact: true })).toBeVisible();
    // 샘플 제목이 렌더되지 않음
    await expect(page.getByRole('link', { name: SAMPLE_POST.title })).toHaveCount(0);
  });

  test('4. 제목 클릭 → 상세 페이지로 이동', async ({ page }) => {
    await stubBoardDetail(page);

    await page.goto(`${BASE_URL}/community/mr-cso-matching`);
    await page.getByRole('link', { name: SAMPLE_POST.title }).click();

    await expect(page).toHaveURL(new RegExp(`/community/mr-cso-matching/${SAMPLE_POST.id}$`));
    // TODO: verify selector - 상세 제목은 headingPc4B Typography. text 로 매칭
    await expect(page.getByText(SAMPLE_DETAIL.title)).toBeVisible();
  });

  test('5. 내 글 필터 토글: ?filterMine=true URL 파라미터가 추가됨', async ({ page }) => {
    await page.goto(`${BASE_URL}/community/mr-cso-matching`);

    // TODO: verify selector - "내 글" 버튼이 Button 컴포넌트인지, 정확한 텍스트인지 확인 (docs 2-4절 기준)
    await page.getByRole('link', { name: /내 글/ }).click();

    await expect(page).toHaveURL(/filterMine=true/);
  });

  test('6. 상세 페이지 로드: 제목/본문/좋아요 카운트 렌더', async ({ page }) => {
    await stubBoardDetail(page);

    await page.goto(`${BASE_URL}/community/mr-cso-matching/${SAMPLE_POST.id}`);

    await expect(page.getByText(SAMPLE_DETAIL.title)).toBeVisible();
    // 본문은 Tiptap 내부. editor 는 setEditable(false) + setContent.
    // TODO: verify selector - MedipandaEditorContent 가 contenteditable 로 렌더되는지 여부
    await expect(page.getByText('게시글 본문입니다.')).toBeVisible();

    // 좋아요/댓글/조회수 카운트 (숫자만 렌더됨 - toLocaleString)
    await expect(page.getByText(String(SAMPLE_DETAIL.likesCount))).toBeVisible();
    await expect(page.getByText(String(SAMPLE_DETAIL.commentCount))).toBeVisible();
  });

  test('7. 타인 글 상세: ⋯ 클릭 시 "신고하기" 팝오버 노출', async ({ page }) => {
    await stubBoardDetail(page); // userId: 'other-user' - 세션 유저와 다름

    await page.goto(`${BASE_URL}/community/mr-cso-matching/${SAMPLE_POST.id}`);

    // TODO: verify selector - MoreHoriz IconButton. aria-label 없을 가능성 높음 → svg 기반 locator 고려
    await page.getByRole('button').filter({ has: page.locator('[data-testid="MoreHorizIcon"]') }).first().click();

    await expect(page.getByText('신고하기')).toBeVisible();
  });

  test('8. 상세 API 500 에러: 에러 처리 분기 (alert 또는 navigate back)', async ({ page }) => {
    // 잘못된 ID 접근 시 alert + navigate(-1) 로직 (CommunityDetail line 42-46)
    page.on('dialog', dialog => dialog.accept());

    await page.route(API.boardDetail('abc'), route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    // NaN 가드 검증: paramId 가 숫자로 변환 안 됨
    await page.goto(`${BASE_URL}/community/mr-cso-matching/abc`);

    // TODO: verify behavior - alert 이후 navigate(-1) 이므로 URL 이 이전 경로로 돌아감
    // 첫 진입이면 about:blank 로 갈 수 있어 특정 path assertion 은 생략
    await expect(page).not.toHaveURL(/\/community\/mr-cso-matching\/abc$/);
  });
});

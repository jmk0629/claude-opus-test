/**
 * 자동 생성된 UI smoke 초안 - medipanda-web
 * 원본 문서: docs/user/08_EVENT.md
 * 대상 컴포넌트:
 *   - src/pages-user/EventList.tsx     (이벤트 목록 + 페이징 + 종료 오버레이)
 *   - src/pages-user/EventDetail.tsx   (이벤트 상세 + Tiptap + 프로모션 링크 인터셉트)
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안 - 반드시 수동 검수 후 사용
 * 1. 셀렉터 실제 DOM과 일치 확인 (MUI Typography 는 role 예측 불가 → text 기반 TODO 표시)
 * 2. `/events` 는 로그인 필요 페이지 - storageState 로 세션 주입 필수
 * 3. Tiptap 에디터는 ProseMirror DOM (contenteditable). 본문 텍스트는 page.locator('.ProseMirror') 기반 조회 권장
 * 4. 프로모션 URL 클릭 시나리오는 window.open / location.href 를 가로채야 함 (page.on('popup'), context.on('page'))
 * 5. DateUtils.isExpired 는 현재 시각 기준이라 종료 오버레이 테스트는 과거 날짜 픽스처 필요
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

// ---------- API 경로 (docs/user/08_EVENT.md "API 엔드포인트 요약" 기반) ----------
const API = {
  events: '**/v1/events?**',
  eventDetail: (id: number | string) => `**/v1/events/${id}`,
  promotionToken: '**/v1/auth/promotion-token',
};

// ---------- 픽스처 ----------
const ACTIVE_EVENT = {
  id: 101,
  title: '봄맞이 와인 프로모션',
  description: '20% 할인',
  thumbnailUrl: 'https://cdn.example.com/thumb-101.png',
  eventStartAt: '2026-04-01T00:00:00Z',
  eventEndAt: '2099-12-31T23:59:59Z', // 미래 - 종료 오버레이 없음
};

const EXPIRED_EVENT = {
  id: 102,
  title: '작년 겨울 이벤트',
  description: '이미 종료됨',
  thumbnailUrl: 'https://cdn.example.com/thumb-102.png',
  eventStartAt: '2025-01-01T00:00:00Z',
  eventEndAt: '2025-02-01T00:00:00Z', // 과거 - 종료 오버레이
};

const EVENT_LIST_PAGE = {
  content: [ACTIVE_EVENT, EXPIRED_EVENT],
  totalElements: 2,
  totalPages: 1,
  number: 0,
  size: 10,
};

const EMPTY_PAGE = {
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 10,
};

const EVENT_DETAIL = {
  boardPostDetail: {
    title: ACTIVE_EVENT.title,
    content:
      '<p>이벤트 본문입니다.</p>' +
      '<p><a href="https://medipanda.co.kr/event1.html">프로모션 바로가기</a></p>' +
      '<p><a href="https://example.com/external">외부 링크</a></p>',
    viewsCount: 1234,
  },
  description: ACTIVE_EVENT.description,
  eventStartDate: ACTIVE_EVENT.eventStartAt,
  eventEndDate: ACTIVE_EVENT.eventEndAt,
};

// ---------- 공통 route helper ----------
async function stubEventList(page: Page, body: object = EVENT_LIST_PAGE) {
  await page.route(API.events, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function stubEventDetail(page: Page, id: number | string = ACTIVE_EVENT.id, body: object = EVENT_DETAIL) {
  await page.route(API.eventDetail(id), route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function stubPromotionToken(page: Page, token = 'mock-promotion-token-xyz') {
  await page.route(API.promotionToken, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token }) }),
  );
}

// TODO: verify storageState - 실제 세션 키/쿠키 이름 확인 필요
// test.use({ storageState: 'tests/.auth/user.json' });

test.describe('user-08 이벤트', () => {
  test('1. 목록 정상 로드: 페이지 타이틀 + 이벤트 카드 2개 렌더', async ({ page }) => {
    await stubEventList(page);
    await page.goto(`${BASE_URL}/events`);

    // TODO: verify selector - Typography(headingPc3M) 는 role 없음. text 로 매칭
    await expect(page.getByText('이벤트', { exact: true }).first()).toBeVisible();

    // 카드는 <Stack component={RouterLink}> → 실제 DOM 은 <a href="/events/:id">
    await expect(page.getByRole('link', { name: new RegExp(ACTIVE_EVENT.title) })).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(EXPIRED_EVENT.title) })).toBeVisible();
  });

  test('2. 종료 이벤트 카드: "종료" 오버레이 노출 (opacity 0.8)', async ({ page }) => {
    await stubEventList(page);
    await page.goto(`${BASE_URL}/events`);

    // 만료된 카드 범위 내에서만 "종료" 텍스트 확인
    const expiredCard = page.getByRole('link', { name: new RegExp(EXPIRED_EVENT.title) });
    await expect(expiredCard.getByText('종료', { exact: true })).toBeVisible();

    // 진행중 카드에는 없어야 함
    const activeCard = page.getByRole('link', { name: new RegExp(ACTIVE_EVENT.title) });
    await expect(activeCard.getByText('종료', { exact: true })).toHaveCount(0);
  });

  test('3. 빈 상태: content 0건 응답 시 카드 링크 없음', async ({ page }) => {
    await stubEventList(page, EMPTY_PAGE);
    await page.goto(`${BASE_URL}/events`);

    // 이벤트 타이틀은 남되 카드는 없어야 함
    await expect(page.getByText('이벤트', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /봄맞이|겨울/ })).toHaveCount(0);
  });

  test('4. API 실패 → alert + 빈 목록 fallback', async ({ page }) => {
    // EventList.tsx:34 - alert('이벤트 목록을 불러오는 중 오류가 발생했습니다.')
    const dialogs: string[] = [];
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });

    await page.route(API.events, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );

    await page.goto(`${BASE_URL}/events`);

    // TODO: verify timing - alert 는 fetch 실패 직후 동기 호출. goto 반환 이후 잠깐 대기 필요할 수 있음
    await expect.poll(() => dialogs.join('\n')).toContain('이벤트 목록');
    await expect(page.getByRole('link', { name: new RegExp(ACTIVE_EVENT.title) })).toHaveCount(0);
  });

  test('5. 카드 클릭 → 상세 페이지로 이동', async ({ page }) => {
    await stubEventList(page);
    await stubEventDetail(page);

    await page.goto(`${BASE_URL}/events`);
    await page.getByRole('link', { name: new RegExp(ACTIVE_EVENT.title) }).click();

    await expect(page).toHaveURL(new RegExp(`/events/${ACTIVE_EVENT.id}$`));
    // 상세 제목 - headingPc4B Typography. text 기반 매칭
    await expect(page.getByText(EVENT_DETAIL.boardPostDetail.title)).toBeVisible();
  });

  test('6. 상세 페이지 로드: 제목 / 설명 / 조회수 / 본문 렌더', async ({ page }) => {
    await stubEventDetail(page);
    await page.goto(`${BASE_URL}/events/${ACTIVE_EVENT.id}`);

    await expect(page.getByText(EVENT_DETAIL.boardPostDetail.title)).toBeVisible();
    await expect(page.getByText(EVENT_DETAIL.description)).toBeVisible();

    // 조회수는 toLocaleString() - "1,234" 형식
    await expect(page.getByText(/조회수\s*1,234/)).toBeVisible();

    // TODO: verify selector - Tiptap 본문은 .ProseMirror contenteditable 내부.
    // getByText 로도 검출되지만 불안정하면 아래 locator 사용
    // await expect(page.locator('.ProseMirror')).toContainText('이벤트 본문입니다.');
    await expect(page.getByText('이벤트 본문입니다.')).toBeVisible();
  });

  test('7. 잘못된 URL(/events/abc): NaN 가드 → alert + /events 로 리다이렉트', async ({ page }) => {
    // EventDetail.tsx:67-71
    const dialogs: string[] = [];
    page.on('dialog', async dialog => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });

    await stubEventList(page); // 리다이렉트 후 목록 로드 대비

    await page.goto(`${BASE_URL}/events/abc`);

    await expect.poll(() => dialogs.join('\n')).toContain('잘못된 접근');
    await expect(page).toHaveURL(new RegExp('/events$'));
  });

  test('8. 본문 프로모션 링크 클릭: promotion-token 발급 후 새 창 오픈', async ({ page, context }) => {
    // EventDetail.tsx:34-57 - 데스크톱 경로: window.open(url, '_blank', 'width=600,height=800,...')
    await stubEventDetail(page);
    await stubPromotionToken(page, 'tok-abc-123');

    await page.goto(`${BASE_URL}/events/${ACTIVE_EVENT.id}`);

    // 에디터 초기화 완료 대기 - setEditable(false) + setContent 후 리스너 등록됨
    // TODO: verify selector - .ProseMirror 내부의 <a> 클릭
    const promotionLink = page.locator('.ProseMirror a[href*="medipanda.co.kr/event1.html"]');
    await expect(promotionLink).toBeVisible();

    const popupPromise = context.waitForEvent('page');
    await promotionLink.click();

    const popup = await popupPromise;
    // URL 에 ?data=토큰 포함 확인
    await expect(popup).toHaveURL(/event1\.html\?data=tok-abc-123/);
  });
});

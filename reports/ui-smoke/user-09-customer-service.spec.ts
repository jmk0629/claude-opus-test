/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/user/09_CUSTOMER_SERVICE.md
 * 대상 컴포넌트: NoticeList / FaqList / InquiryList / InquiryEdit (+ Detail 화면 참조)
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test)
 *
 * 초안이므로 반드시 수동 검수 후 사용:
 * 1. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 TODO 주석 붙은 부분)
 * 2. 고객센터 전체가 로그인 필수 — storageState 세팅 필요
 * 3. GET /v1/boards, /v1/boards/notices/fixed-top, POST /v1/boards 등은
 *    page.route()로 mock하거나 실데이터 fixture 준비 후 실행
 * 4. 한글 UI 텍스트 매칭 — i18n 도입 시 재작성 필요
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

test.describe('user/09 고객센터 (Customer Service) — smoke 초안', () => {
  // TODO: 로그인 storageState 세팅 또는 beforeEach에서 로그인 플로우 실행
  // test.use({ storageState: 'playwright/.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    // 고객센터는 로그인 필수. 테스트 준비 시 세션 쿠키/토큰 주입 필요.
  });

  test('1. 공지사항 목록 페이지 정상 로드 — 제목/검색창 렌더', async ({ page }) => {
    await page.goto(`${BASE_URL}/customer-service/notice`);

    // 제목은 <Typography variant='headingPc3M'> 로 렌더되므로 role=heading 이 아님.
    // 사이드바 링크 "공지사항" + 헤더 nav "공지사항" 과 충돌 → headingPc3M 클래스로 스코프.
    await expect(page.locator('span.MuiTypography-headingPc3M').filter({ hasText: '공지사항' })).toBeVisible();
    await expect(page.getByPlaceholder('제약사명 또는 제목을 검색해주세요')).toBeVisible();
    await expect(page.locator('table').first()).toBeVisible();
  });

  test('2. 공지사항 검색 제출 시 URL 쿼리가 갱신된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/customer-service/notice`);

    const keyword = '테스트공지';
    await page.getByPlaceholder('제약사명 또는 제목을 검색해주세요').fill(keyword);
    // 검색 아이콘 버튼(submit)
    // TODO: verify selector — IconButton 내부 Search 아이콘. role=button으로 접근 불가하면 locator 조정
    await page.locator('button[type="submit"]').first().click();

    await expect(page).toHaveURL(/searchKeyword=/);
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(keyword)));
  });

  test('3. 공지사항 상세 진입 — 제목 링크 클릭 시 /notice/:id 이동', async ({ page }) => {
    // 목록 mock: 공지 최소 1건
    await page.route('**/v1/boards?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            {
              id: 101,
              title: '스모크 공지',
              createdAt: new Date().toISOString(),
              noticeProperties: { drugCompany: '' },
            },
          ],
          totalPages: 1,
        }),
      }),
    );
    await page.route('**/v1/boards/notices/fixed-top*', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );

    await page.goto(`${BASE_URL}/customer-service/notice`);

    // TODO: verify selector — 제목 링크
    await page.getByRole('link', { name: /스모크 공지/ }).click();
    await expect(page).toHaveURL(/\/customer-service\/notice\/\d+/);
  });

  test('4. 고정 공지는 테이블 상단에 먼저 렌더된다 (핀 아이콘)', async ({ page }) => {
    await page.route('**/v1/boards/notices/fixed-top*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            title: '상단 고정 공지',
            createdAt: new Date().toISOString(),
            noticeProperties: { drugCompany: '' },
          },
        ]),
      }),
    );
    await page.route('**/v1/boards?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [], totalPages: 0 }),
      }),
    );

    await page.goto(`${BASE_URL}/customer-service/notice`);

    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toContainText('상단 고정 공지');
    // TODO: verify selector — icon-pin.svg 경로
    await expect(firstRow.locator('img[src*="icon-pin"]')).toBeVisible();
  });

  test('5. FAQ 목록 정상 로드 — 제목/검색창/아코디언 항목', async ({ page }) => {
    await page.goto(`${BASE_URL}/customer-service/faq`);

    // Typography variant='headingPc3M' — role=heading 아님
    await expect(page.locator('span.MuiTypography-headingPc3M').filter({ hasText: 'FAQ' })).toBeVisible();
    await expect(page.getByPlaceholder('궁금한 점을 검색해 보세요.')).toBeVisible();
  });

  test('6. FAQ 아코디언 펼침 — 데이터 로드 후 답변 본문 표시', async ({ page }) => {
    await page.route('**/v1/boards?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [{ id: 201, title: '자주 묻는 질문', createdAt: new Date().toISOString() }],
          totalPages: 1,
        }),
      }),
    );
    await page.route('**/v1/boards/201*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 201,
          title: '자주 묻는 질문',
          content: '<p>답변 내용</p>',
          attachments: [],
        }),
      }),
    );

    await page.goto(`${BASE_URL}/customer-service/faq`);

    // TODO: verify selector — AccordionSummary 클릭 (Q + 제목)
    await page.getByText('자주 묻는 질문').click();
    // 데이터 로드 전까지는 펼침이 지연된다(expandedDetail !== null 조건)
    await expect(page.locator('.MuiAccordionDetails-root').first()).toBeVisible();
  });

  test('7. 1:1 문의내역 목록 — 비어있을 때 "검색 결과가 없습니다." 노출', async ({ page }) => {
    await page.route('**/v1/boards?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [], totalPages: 0 }),
      }),
    );

    await page.goto(`${BASE_URL}/customer-service/inquiry`);

    // Typography variant='headingPc3M' — role=heading 아님 + 사이드바 "1:1 문의내역" 링크와 충돌
    await expect(page.locator('span.MuiTypography-headingPc3M').filter({ hasText: '1:1 문의내역' })).toBeVisible();
    await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
  });

  test('8. FAB 새 문의 작성 버튼 클릭 → /inquiry/new 이동 + 제목 필수 검증', async ({ page }) => {
    await page.route('**/v1/boards?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: [], totalPages: 0 }),
      }),
    );

    await page.goto(`${BASE_URL}/customer-service/inquiry`);

    // FAB은 fixed 위치. 링크 href로 찾기.
    // TODO: verify selector — Fab에 aria-label이 없다면 href 기반 locator 사용
    await page.locator('a[href="/customer-service/inquiry/new"]').first().click();
    await expect(page).toHaveURL(/\/customer-service\/inquiry\/new$/);

    // InquiryEdit 페이지는 상단 Typography "1:1 문의내역" + 탭 '문의하기' + 하단 submit 버튼 '문의하기'
    // 동일 텍스트가 tab/button 2개로 뜨므로 role=tab 으로 탭만 검증.
    await expect(page.getByRole('tab', { name: '문의하기' })).toBeVisible();
    await expect(page.getByPlaceholder('제목을 입력해주세요')).toBeVisible();

    // 제목 비워둔 채 제출 → alert('제목을 입력해주세요.')
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('제목을 입력해주세요');
      await dialog.dismiss();
    });
    // 제출 버튼 — type=submit 으로 탭과 구분
    await page.locator('button[type="submit"]').filter({ hasText: '문의하기' }).click();
  });
});

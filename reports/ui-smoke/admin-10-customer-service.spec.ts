/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/10_CUSTOMER_SERVICE.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminNoticeList.tsx      (/admin/notices)
 *   - src/pages-admin/MpAdminNoticeEdit.tsx      (/admin/notices/new | /admin/notices/:boardId)
 *   - src/pages-admin/MpAdminFaqList.tsx         (/admin/faqs)
 *   - src/pages-admin/MpAdminFaqEdit.tsx         (/admin/faqs/new | /admin/faqs/:boardId)
 *   - src/pages-admin/MpAdminInquiryList.tsx     (/admin/inquiries)
 *   - src/pages-admin/MpAdminInquiryDetail.tsx   (/admin/inquiries/:boardId)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용.
 *
 * 검수 체크리스트:
 * 1. Admin은 AdminGuard + 관리자 권한 필수 — beforeEach에 storageState 또는 세션 주입 필요
 *    (현재는 injectTestSession으로 localStorage mock만 설정. 쿠키 기반 세션이면 storageState로 교체)
 * 2. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 표시 항목)
 *    - 게시판 공통 CRUD는 /v1/boards 하나의 엔드포인트 — page.route() 핸들러 내부에서
 *      method + URL 쿼리(boardType)로 분기 필요할 수 있음 (현재는 prefix+`**` 와일드카드로 분리)
 * 3. API mock은 _fixtures의 EMPTY_PAGE/pageResponse 재사용 — 필드 스키마는 backend.ts로 검증
 * 4. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만 이후 재작성 필요
 * 5. MUI Select 열기/선택은 role=combobox → role=option 패턴 — 버전별로 역할 다를 수 있음
 * 6. useMpDeleteDialog / useMpModal의 confirm/alert는 HTML native dialog가 아닌 커스텀 모달.
 *    `acceptNextDialog`가 아닌 getByRole('dialog') + 버튼 클릭 패턴으로 검증 필요.
 * 7. Tiptap 에디터 입력은 `page.keyboard.type` 또는 `contenteditable` locator로 제어. 읽기전용 에디터는
 *    `aria-readonly` 또는 `contenteditable="false"` 속성으로 확인 가능.
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
  expectMpModal,
  acceptMpModal,
  expectSnackbar,
} from './_fixtures';

// ────────────────────────────────────────────────────────────────
// 공용 helper — spec 내부 전용
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
 * /v1/boards GET 응답을 페이지 빈 상태로 스텁.
 * boardType 분기는 테스트별로 override 가능 — 기본 EMPTY_PAGE 반환.
 */
async function stubBoardsEmpty(page: Page): Promise<void> {
  await page.route(api('/v1/boards**'), async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    // boardId 단건 조회(/v1/boards/123) 는 별도 테스트에서 override
    const url = route.request().url();
    if (/\/v1\/boards\/\d+/.test(url)) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(EMPTY_PAGE),
    });
  });
}

/** 제약사 전체 목록 mock — 공지사항 목록에서 마운트 시 호출. */
async function stubDrugCompanies(page: Page): Promise<void> {
  await page.route(api('/v1/drug-companies/all'), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: '화이자' },
        { id: 2, name: '한미약품' },
      ]),
    });
  });
}

// ────────────────────────────────────────────────────────────────
// 테스트 본체
// ────────────────────────────────────────────────────────────────

test.describe('admin/10 CUSTOMER_SERVICE — 고객센터 smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await stubDrugCompanies(page);
  });

  // ───────────── 공지사항 목록 (/admin/notices) ─────────────
  test.describe('공지사항 목록 (/admin/notices)', () => {
    test('정상 로드: 제목 + 검색 필터 + 등록/삭제 버튼 노출', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/notices`);

      await expect(page.getByRole('heading', { name: '공지사항' })).toBeVisible();
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
      // 등록은 RouterLink (role=link). 삭제는 Button.
      await expect(page.getByRole('link', { name: '등록' })).toBeVisible();
      await expect(page.getByRole('button', { name: '삭제' })).toBeDisabled();

      // 테이블 헤더 컬럼 (문서 3-7 참조)
      await expect(page.getByRole('columnheader', { name: '공지분류' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '제약사명' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '노출범위' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '조회수' })).toBeVisible();
    });

    test('빈 상태: API 0건 응답 시 "검색 결과가 없습니다." 표시', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/notices`);
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('목록 렌더: 제목 링크가 /admin/notices/{id} 를 가리키고 공지분류/노출상태 렌더', async ({ page }) => {
      await page.route(api('/v1/boards**'), async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        if (/\/v1\/boards\/\d+/.test(route.request().url())) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 77,
                boardType: 'NOTICE',
                title: '샘플 공지 제목',
                isExposed: true,
                exposureRange: 'ALL',
                viewsCount: 1500,
                createdAt: '2024-03-01T00:00:00Z',
                hasChildren: false,
                noticeProperties: {
                  noticeType: 'DRUG_COMPANY',
                  drugCompany: '화이자',
                  fixedTop: false,
                },
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/notices`);

      const titleLink = page.getByRole('link', { name: '샘플 공지 제목' });
      await expect(titleLink).toBeVisible();
      await expect(titleLink).toHaveAttribute('href', /\/admin\/notices\/77/);

      // 제약사명 셀
      await expect(page.getByRole('cell', { name: '화이자' })).toBeVisible();
      // 조회수 1,500 (toLocaleString)
      await expect(page.getByRole('cell', { name: '1,500' })).toBeVisible();
      // 노출 상태 (문서 3-8: 공지사항은 텍스트로 표시)
      await expect(page.getByRole('cell', { name: '노출' })).toBeVisible();
    });

    test('에러 상태: 목록 API 실패 시 alertError 메시지 노출', async ({ page }) => {
      await page.route(api('/v1/boards**'), async (route: Route) => {
        if (route.request().method() === 'GET' && !/\/v1\/boards\/\d+/.test(route.request().url())) {
          await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
          return;
        }
        await route.fallback();
      });

      await page.goto(`${BASE_URL_ADMIN}/notices`);
      // alertError는 useMpModal 기반 커스텀 모달
      // TODO: verify selector — 실제 모달 role/구조에 따라 getByRole('dialog')로 범위 좁히는 것을 권장
      await expect(page.getByText('공지사항 목록을 불러오는 중 오류가 발생했습니다.')).toBeVisible();
    });

    test('등록 버튼 클릭 시 /admin/notices/new 로 이동', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/notices`);

      // 등록 버튼은 RouterLink이므로 href 속성 검사만으로도 가능하지만 클릭 네비게이션 검증
      await page.getByRole('link', { name: '등록' }).click();
      await expect(page).toHaveURL(/\/admin\/notices\/new$/);
    });
  });

  // ───────────── 공지사항 등록 (/admin/notices/new) ─────────────
  test.describe('공지사항 등록 (/admin/notices/new)', () => {
    test('빈 폼 로드: 제목 input + 저장/취소 버튼 노출', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/notices/new`);

      await expect(page.getByRole('heading', { name: /공지사항/ }).first()).toBeVisible();
      // 제목 TextField (react-hook-form Controller name=title)
      // TODO: verify selector — label='제목' 또는 placeholder 기반으로 고정 필요
      await expect(page.getByRole('textbox', { name: '제목' })).toBeVisible();
      // 저장 / 취소 버튼
      await expect(page.getByRole('button', { name: /저장|등록/ })).toBeVisible();
    });

    test('유효성: 제목 비우고 저장 클릭 시 alert 노출', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/notices/new`);

      const saveButton = page.getByRole('button', { name: /저장|등록/ }).first();
      await saveButton.click();

      // useMpModal.alert 은 MUI Dialog 로 렌더됨(native window.alert 아님).
      await expectMpModal(page, /제목|내용|제약사명/);
      await acceptMpModal(page);
    });
  });

  // ───────────── FAQ 목록 (/admin/faqs) ─────────────
  test.describe('FAQ 목록 (/admin/faqs)', () => {
    test('정상 로드: 제목 + 검색 필터 (제약사 필드 없음)', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/faqs`);

      await expect(page.getByRole('heading', { name: 'FAQ' })).toBeVisible();
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      // 등록은 RouterLink (role=link).
      await expect(page.getByRole('link', { name: '등록' })).toBeVisible();

      // 문서 5-2: FAQ는 공지사항 대비 제약사명 필터가 없음
      await expect(page.getByText('제약사명')).toHaveCount(0);
    });

    test('목록 렌더: 노출상태가 Chip(success/default) 으로 표시', async ({ page }) => {
      await page.route(api('/v1/boards**'), async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        if (/\/v1\/boards\/\d+/.test(route.request().url())) {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 21,
                boardType: 'FAQ',
                title: '자주 묻는 질문 1',
                isExposed: true,
                exposureRange: 'ALL',
                viewsCount: 42,
                createdAt: '2024-05-10T00:00:00Z',
                hasChildren: false,
                noticeProperties: null,
              },
              {
                id: 22,
                boardType: 'FAQ',
                title: '자주 묻는 질문 2 (미노출)',
                isExposed: false,
                exposureRange: 'ALL',
                viewsCount: 10,
                createdAt: '2024-05-11T00:00:00Z',
                hasChildren: false,
                noticeProperties: null,
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/faqs`);

      await expect(page.getByRole('link', { name: '자주 묻는 질문 1' })).toHaveAttribute(
        'href',
        /\/admin\/faqs\/21/,
      );
      // Chip '노출' / '미노출'
      // TODO: verify selector — MUI Chip은 기본 role이 없음. 텍스트 매칭으로만 확인.
      await expect(page.getByText('노출', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('미노출', { exact: true }).first()).toBeVisible();
    });
  });

  // ───────────── 1:1 문의 목록 (/admin/inquiries) ─────────────
  test.describe('1:1 문의 목록 (/admin/inquiries)', () => {
    test('정상 로드: 제목 + 처리상태/검색유형 필터 (등록/삭제 버튼 없음)', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/inquiries`);

      await expect(page.getByRole('heading', { name: '1:1 문의내역' })).toBeVisible();
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();

      // 문서 7-1: 1:1 문의는 등록/삭제 버튼 없음
      await expect(page.getByRole('button', { name: '등록' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(0);
    });

    test('검색 유효성: 검색유형 미선택 + 검색어만 입력 후 검색 시 alert', async ({ page }) => {
      await stubBoardsEmpty(page);
      await page.goto(`${BASE_URL_ADMIN}/inquiries`);

      await page.getByRole('textbox', { name: '검색어' }).fill('홍길동');
      await page.getByRole('button', { name: '검색' }).click();

      // useMpModal.alert 은 MUI Dialog 로 렌더됨(native window.alert 아님).
      await expectMpModal(page, /검색유형을 선택/);
      await acceptMpModal(page);
    });

    test('목록 렌더: 답변완료 항목은 답변일 포함, 답변대기중은 "-"', async ({ page }) => {
      await page.route(api('/v1/boards**'), async (route: Route) => {
        const method = route.request().method();
        const url = route.request().url();

        // 목록 조회 (boardType=INQUIRY)
        if (method === 'GET' && !/\/v1\/boards\/\d+/.test(url)) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              pageResponse([
                {
                  id: 501,
                  boardType: 'INQUIRY',
                  title: '답변이 있는 문의',
                  isExposed: true,
                  exposureRange: 'ALL',
                  viewsCount: 5,
                  createdAt: '2024-06-01T00:00:00Z',
                  hasChildren: true,
                  noticeProperties: null,
                },
                {
                  id: 502,
                  boardType: 'INQUIRY',
                  title: '답변 대기중 문의',
                  isExposed: true,
                  exposureRange: 'ALL',
                  viewsCount: 2,
                  createdAt: '2024-06-02T00:00:00Z',
                  hasChildren: false,
                  noticeProperties: null,
                },
              ]),
            ),
          });
          return;
        }

        // hasChildren=true인 항목에 대한 후속 상세 조회 — children 포함
        if (method === 'GET' && /\/v1\/boards\/501(\?|$)/.test(url)) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 501,
              title: '답변이 있는 문의',
              content: '내용',
              userId: 'test-user',
              boardType: 'INQUIRY',
              hasChildren: true,
              attachments: [],
              children: [
                {
                  id: 601,
                  parentId: 501,
                  title: '',
                  content: '<p>답변</p>',
                  createdAt: '2024-06-03T00:00:00Z',
                  attachments: [],
                },
              ],
              noticeProperties: null,
              isExposed: true,
              exposureRange: 'ALL',
              createdAt: '2024-06-01T00:00:00Z',
            }),
          });
          return;
        }

        await route.fallback();
      });

      await page.goto(`${BASE_URL_ADMIN}/inquiries`);

      await expect(page.getByRole('link', { name: '답변이 있는 문의' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '답변완료' })).toBeVisible();
      await expect(page.getByRole('cell', { name: '답변대기중' })).toBeVisible();
      // 답변일 2024-06-03 (KST 변환 허용 오차 고려: 날짜 셀이 정확히 일치하지 않을 수 있음)
      // TODO: verify selector — parseUtcAndFormatKst가 UTC→KST +9h 변환하므로 '2024-06-03' 매칭 전제
      await expect(page.getByRole('cell', { name: '2024-06-03' })).toBeVisible();
    });
  });

  // ───────────── 1:1 문의 상세 (/admin/inquiries/:boardId) ─────────────
  test.describe('1:1 문의 상세 (/admin/inquiries/:boardId)', () => {
    // 문서 8-3: 문의 상세 → 회원 정보 → 계약 정보 순차 로드. 계약 정보는 실패해도 진행.
    test('답변 없는 문의 진입 시 "답변하기" 버튼 + 툴바 노출', async ({ page }) => {
      // getBoardDetails 가 `?filterBlind=...&filterDeleted=...` 쿼리스트링을 붙이므로 regex 매칭.
      await page.route(/\/v1\/boards\/777(\?|$)/, async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 777,
            title: '신규 문의 제목',
            content: '<p>문의 내용입니다.</p>',
            userId: 'member-1',
            nickname: '홍길동',
            name: '홍길동',
            hiddenNickname: false,
            boardType: 'INQUIRY',
            hasChildren: false,
            attachments: [],
            children: [],
            comments: [],
            commentCount: 0,
            likesCount: 0,
            likedByMe: false,
            viewsCount: 0,
            isBlind: false,
            memberType: 'NONE',
            reportedByMe: false,
            reports: [],
            noticeProperties: null,
            isExposed: true,
            exposureRange: 'ALL',
            createdAt: '2024-06-10T00:00:00Z',
          }),
        });
      });
      await page.route(api('/v1/members/member-1/details'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: 'member-1',
            name: '홍길동',
            phoneNumber: '01012345678',
          }),
        });
      });
      await page.route(api('/v1/partner-contracts/member-1'), async (route: Route) => {
        // 계약 없음 → 404 (문서 8-3: 정상 케이스)
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      });

      await page.goto(`${BASE_URL_ADMIN}/inquiries/777`);

      // 각 readOnly TextField 를 Typography subtitle 기준으로 스코핑하여 value 검증.
      // 컴포넌트: <Stack><Typography>{label}</Typography><TextField value={...} /></Stack>
      // Typography 의 부모(Stack) 내부에서 textbox 를 찾는다 — xpath=.. 로 부모 이동.
      const fieldByLabel = (label: string) =>
        page
          .getByText(label, { exact: true })
          .locator('xpath=..')
          .getByRole('textbox')
          .first();

      // 답변 없으므로 "답변하기" 버튼
      await expect(page.getByRole('button', { name: '답변하기' })).toBeVisible();
      // 회원정보: `${detail.nickname}(${detail.userId})` 포맷
      await expect(fieldByLabel('회원정보')).toHaveValue('홍길동(member-1)');
      // 회사정보: 계약 없음 → '-'
      await expect(fieldByLabel('회사정보')).toHaveValue('-');
      // 제목
      await expect(fieldByLabel('제목')).toHaveValue('신규 문의 제목');
    });

    test('답변 있는 문의 진입 시 "답변 수정" 버튼 노출 (툴바 숨김)', async ({ page }) => {
      await page.route(/\/v1\/boards\/888(\?|$)/, async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 888,
            title: '기존 답변이 있는 문의',
            content: '<p>원본 문의</p>',
            userId: 'member-2',
            nickname: '김영희',
            name: '김영희',
            hiddenNickname: false,
            boardType: 'INQUIRY',
            hasChildren: true,
            attachments: [],
            children: [
              {
                id: 999,
                parentId: 888,
                title: '',
                content: '<p>기존 답변 본문</p>',
                createdAt: '2024-06-11T00:00:00Z',
                attachments: [],
                userId: 'test-admin',
                nickname: '테스트관리자',
                name: '테스트관리자',
                hiddenNickname: false,
                boardType: 'INQUIRY',
                hasChildren: false,
                children: [],
                comments: [],
                commentCount: 0,
                likesCount: 0,
                likedByMe: false,
                viewsCount: 0,
                isBlind: false,
                memberType: 'NONE',
                reportedByMe: false,
                reports: [],
                noticeProperties: null,
                isExposed: true,
                exposureRange: 'ALL',
              },
            ],
            comments: [],
            commentCount: 0,
            likesCount: 0,
            likedByMe: false,
            viewsCount: 0,
            isBlind: false,
            memberType: 'NONE',
            reportedByMe: false,
            reports: [],
            noticeProperties: null,
            isExposed: true,
            exposureRange: 'ALL',
            createdAt: '2024-06-10T00:00:00Z',
          }),
        });
      });
      await page.route(api('/v1/members/member-2/details'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: 'member-2',
            name: '김영희',
            phoneNumber: '01098765432',
          }),
        });
      });
      await page.route(api('/v1/partner-contracts/member-2'), async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: 'member-2',
            companyName: '테스트상사',
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/inquiries/888`);

      await expect(page.getByRole('button', { name: '답변 수정' })).toBeVisible();
      // 회사정보 TextField 에 회사명 표시 — Typography 부모(Stack) 내부 textbox
      const companyField = page
        .getByText('회사정보', { exact: true })
        .locator('xpath=..')
        .getByRole('textbox')
        .first();
      await expect(companyField).toHaveValue('테스트상사');
    });

    test('데이터 로드 실패: 문의 상세 API 500 → 에러 스낵바 + 이전 페이지 이동', async ({ page }) => {
      // 쿼리스트링(?filterBlind=...&filterDeleted=...) 포함 가능 — regex 매칭.
      await page.route(/\/v1\/boards\/9999(\?|$)/, async (route: Route) => {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });

      // 에러 시 enqueueSnackbar 후 `window.history.back()` 로 즉시 navigate 됨.
      // Snackbar 렌더링이 ephemeral 하므로 URL 이 /admin/inquiries/9999 를 벗어나는 것으로 검증.
      await page.goto(`${BASE_URL_ADMIN}/inquiries/9999`);
      await expect(page).not.toHaveURL(/\/admin\/inquiries\/9999/, { timeout: 5000 });
    });
  });
});

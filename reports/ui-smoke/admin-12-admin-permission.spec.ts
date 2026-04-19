/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/12_ADMIN_PERMISSION.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminAdminList.tsx   (/admin/admins)
 *   - src/pages-admin/MpAdminAdminEdit.tsx   (/admin/admins/new, /admin/admins/:userId/edit)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용.
 *
 * 검수 체크리스트:
 * 1. Admin은 AdminGuard + 관리자 권한 필수 — beforeEach에 storageState 또는 세션 주입 필요
 *    (현재는 injectTestSession으로 localStorage mock만 설정. 쿠키 기반 세션이면 storageState로 교체)
 * 2. 수정 모드는 최고관리자(SUPER_ADMIN)만 접근 가능 — isSuperAdmin 검증은 세션 role 기반
 *    일반 ADMIN 세션으로 /edit 진입 시 alert + window.history.back() 이 발생함
 * 3. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 표시 항목)
 *    - MpAdminAdminEdit는 h4 타이틀이 '관리자 권한등록' 고정 (등록/수정 구분 없음)
 *    - MpAdminAdminList의 h4 타이틀은 '관리자 권한'
 * 4. API mock은 _fixtures의 EMPTY_PAGE/pageResponse 재사용 — 필드 스키마는 backend.ts로 검증
 * 5. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만 이후 재작성 필요
 * 6. normalizePhoneNumber 결과 포맷 확인 (예: '01012345678' → '010-1234-5678')
 * 7. window.history.back() 검증은 Playwright가 이전 페이지를 보유한 경우에만 유의미
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

type AdminRow = {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  accountStatus: 'ACTIVE' | 'INACTIVE';
  registrationDate: string;
};

const SAMPLE_ADMIN: AdminRow = {
  userId: 'admin01',
  name: '관리자홍길동',
  email: 'admin01@medipanda.co.kr',
  phoneNumber: '01012345678',
  role: 'ADMIN',
  accountStatus: 'ACTIVE',
  registrationDate: '2026-04-10T02:00:00Z',
};

const SAMPLE_SUPER_ADMIN: AdminRow = {
  userId: 'superadmin',
  name: '최고관리자',
  email: 'super@medipanda.co.kr',
  phoneNumber: '01099998888',
  role: 'SUPER_ADMIN',
  accountStatus: 'ACTIVE',
  registrationDate: '2026-01-01T00:00:00Z',
};

// Admin(일반) 권한 주입. cookie 기반이면 test.use({ storageState })로 교체.
async function seedAdminSession(page: Page): Promise<void> {
  // TODO: storageState — 실제 관리자 세션 구조를 확인 후 교체
  await injectTestSession(page, {
    ...SESSION_PRESETS.csoApproved,
    role: 'ADMIN',
    userId: 'test-admin',
  });
}

// SUPER_ADMIN 세션 주입 (수정 모드 접근 허용)
// useSession 은 서버의 whoAmI 응답으로 role 을 판단하므로 /v1/auth/me 를 mock 하여 SUPER_ADMIN 강제
async function seedSuperAdminSession(page: Page): Promise<void> {
  await injectTestSession(page, {
    ...SESSION_PRESETS.csoApproved,
    role: 'SUPER_ADMIN',
    userId: 'test-super-admin',
  });
  await page.route(/\/v1\/auth\/me(\?|$)/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'test-super-admin',
        name: '최고관리자',
        email: 'super@medipanda.co.kr',
        phoneNumber: '01099998888',
        role: 'SUPER_ADMIN',
        accountStatus: 'ACTIVE',
      }),
    });
  });
  // SUPER_ADMIN 본인의 permissions 조회도 가로채서 지연 방지
  await page.route(/\/v1\/members\/admins\/test-super-admin\/permissions(\?|$)/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ permissions: [] }),
    });
  });
}

/** 기본 GET mock 설치 — 각 테스트에서 page.route()로 override 가능 */
async function installListMocks(page: Page, rows: AdminRow[] = []): Promise<void> {
  await page.route(/\/v1\/members(\?|$)/, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows.length === 0 ? EMPTY_PAGE : pageResponse(rows)),
    });
  });
}

// ────────────────────────────────────────────────────────────────
// 테스트 본체
// ────────────────────────────────────────────────────────────────

test.describe('admin/12 ADMIN_PERMISSION — 권한관리 smoke', () => {
  // ───────────── 관리자 목록 (/admin/admins) ─────────────
  test.describe('관리자 목록 (/admin/admins)', () => {
    test.beforeEach(async ({ page }) => {
      await seedAdminSession(page);
    });

    test('정상 로드: 제목/검색 필터/테이블 헤더/등록 버튼 렌더', async ({ page }) => {
      await installListMocks(page, []);

      await page.goto(`${BASE_URL_ADMIN}/admins`);

      await expect(page.getByRole('heading', { name: '관리자 권한' })).toBeVisible();

      // TODO: verify selector — MpSearchFilterBar 내부 InputLabel '검색유형', TextField '검색어'
      await expect(page.getByText('검색유형').first()).toBeVisible();
      await expect(page.getByLabel('검색어')).toBeVisible();

      // 액션 버튼
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
      await expect(page.getByRole('link', { name: '등록' })).toBeVisible();

      // 테이블 헤더
      await expect(page.getByRole('columnheader', { name: 'No' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '아이디' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '관리자' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '이메일' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '연락처' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '권한' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '상태' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '등록일' })).toBeVisible();
    });

    test('빈 상태: API 0건 응답 시 "검색 결과가 없습니다." 표시', async ({ page }) => {
      await installListMocks(page, []);

      await page.goto(`${BASE_URL_ADMIN}/admins`);

      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
      await expect(page.getByText(/검색결과:\s*0\s*건/)).toBeVisible();
    });

    test('목록 렌더: 관리자 2건 표시 + 전화번호 포맷/역할 라벨 변환', async ({ page }) => {
      await installListMocks(page, [SAMPLE_ADMIN, SAMPLE_SUPER_ADMIN]);

      await page.goto(`${BASE_URL_ADMIN}/admins`);

      // 아이디 셀
      await expect(page.getByRole('cell', { name: 'admin01', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'superadmin', exact: true })).toBeVisible();

      // 관리자명 링크 (edit 링크 연결 확인)
      const editLink = page.getByRole('link', { name: '관리자홍길동' });
      await expect(editLink).toBeVisible();
      await expect(editLink).toHaveAttribute('href', /\/admin\/admins\/admin01\/edit$/);

      // 전화번호 normalize — '01012345678' → '010-1234-5678'
      // TODO: verify selector — normalizePhoneNumber 실제 출력 포맷을 확인
      await expect(page.getByRole('cell', { name: '010-1234-5678' })).toBeVisible();

      // Role 라벨 (RoleLabel[ADMIN] = '관리자', RoleLabel[SUPER_ADMIN] = '최고관리자')
      await expect(page.getByRole('cell', { name: '관리자', exact: true })).toBeVisible();
      await expect(page.getByRole('cell', { name: '최고관리자' })).toBeVisible();
    });

    test('검색 유효성: 검색유형 없이 검색어만 입력 시 alert', async ({ page }) => {
      await installListMocks(page, []);
      await page.goto(`${BASE_URL_ADMIN}/admins`);

      await page.getByLabel('검색어').fill('홍길동');
      await page.getByRole('button', { name: '검색' }).click();

      await expectMpModal(page, '검색유형을 선택하세요.');
      await acceptMpModal(page);
    });

    test('에러 처리: GET /v1/members 500 응답 시 alertError', async ({ page }) => {
      await page.route(/\/v1\/members(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/admins`);
      await expectMpModal(page, '관리자 목록을 불러오는 중 오류가 발생했습니다.');
      await acceptMpModal(page);
    });

    test('등록 버튼 → /admin/admins/new 라우팅', async ({ page }) => {
      await installListMocks(page, []);
      await page.goto(`${BASE_URL_ADMIN}/admins`);

      await page.getByRole('link', { name: '등록' }).click();
      await expect(page).toHaveURL(/\/admin\/admins\/new$/);
    });
  });

  // ───────────── 관리자 등록 (/admin/admins/new) ─────────────
  test.describe('관리자 등록 (/admin/admins/new)', () => {
    test.beforeEach(async ({ page }) => {
      await seedAdminSession(page);
    });

    test('정상 로드: 빈 폼 + 모든 권한 체크박스/저장 버튼 렌더', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/admins/new`);

      await expect(page.getByRole('heading', { name: '관리자 권한등록' })).toBeVisible();

      // 텍스트 필드 (label 기반)
      await expect(page.getByLabel('관리자 명')).toBeVisible();
      await expect(page.getByLabel('아이디')).toBeVisible();
      await expect(page.getByRole('textbox', { name: '패스워드', exact: true })).toBeVisible();
      await expect(page.getByLabel('패스워드 확인')).toBeVisible();
      await expect(page.getByLabel('이메일')).toBeVisible();
      // TODO: verify selector — 연락처 라벨은 '연락처*' (별표 포함)
      await expect(page.getByLabel('연락처*')).toBeVisible();

      // 등록 모드: 아이디 필드는 활성 (수정 모드에서만 disabled)
      await expect(page.getByLabel('아이디')).toBeEnabled();

      // 관리메뉴 12개 중 PERMISSION_MANAGEMENT는 UI에 없음 → 11개 체크박스 노출
      // 3x4 레이아웃의 마지막 칸은 빈 Box
      await expect(page.getByLabel('회원관리')).toBeVisible();
      await expect(page.getByLabel('제품관리')).toBeVisible();
      await expect(page.getByLabel('거래선관리')).toBeVisible();
      await expect(page.getByLabel('계약관리')).toBeVisible();
      await expect(page.getByLabel('처방관리')).toBeVisible();
      await expect(page.getByLabel('정산관리')).toBeVisible();
      await expect(page.getByLabel('지출보고관리')).toBeVisible();
      await expect(page.getByLabel('커뮤니티')).toBeVisible();
      await expect(page.getByLabel('콘텐츠관리')).toBeVisible();
      await expect(page.getByLabel('고객센터')).toBeVisible();
      await expect(page.getByLabel('배너관리')).toBeVisible();

      // 액션 버튼
      await expect(page.getByRole('link', { name: '취소' })).toBeVisible();
      await expect(page.getByRole('button', { name: '저장' })).toBeVisible();
    });

    test('유효성: 관리자 명 미입력 시 alert', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/admins/new`);

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '관리자 명은 필수입니다.');
      await acceptMpModal(page);
    });

    test('유효성: 패스워드 불일치 시 alert', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/admins/new`);

      await page.getByLabel('관리자 명').fill('신규관리자');
      await page.getByLabel('아이디').fill('newadmin');
      await page.getByRole('textbox', { name: '패스워드', exact: true }).fill('password123');
      await page.getByLabel('패스워드 확인').fill('password999');

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '패스워드가 일치하지 않습니다.');
      await acceptMpModal(page);
    });

    test('유효성: 이메일 형식 불일치 시 alert', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/admins/new`);

      await page.getByLabel('관리자 명').fill('신규관리자');
      await page.getByLabel('아이디').fill('newadmin');
      await page.getByRole('textbox', { name: '패스워드', exact: true }).fill('password123');
      await page.getByLabel('패스워드 확인').fill('password123');
      await page.getByLabel('이메일').fill('invalid-email');

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '올바른 이메일 형식이 아닙니다.');
      await acceptMpModal(page);
    });

    test('유효성: 권한 미선택 시 alert', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/admins/new`);

      await page.getByLabel('관리자 명').fill('신규관리자');
      await page.getByLabel('아이디').fill('newadmin');
      await page.getByRole('textbox', { name: '패스워드', exact: true }).fill('password123');
      await page.getByLabel('패스워드 확인').fill('password123');
      await page.getByLabel('이메일').fill('new@medipanda.co.kr');
      await page.getByLabel('연락처*').fill('01012345678');

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '최소 하나 이상의 권한을 선택하세요.');
      await acceptMpModal(page);
    });

    test('저장 성공: POST /v1/members/admins → 성공 alert + 목록 이동', async ({ page }) => {
      await installListMocks(page, []);
      let capturedBody: unknown = null;

      await page.route(/\/v1\/members\/admins(\?|$)/, async (route: Route) => {
        if (route.request().method() === 'POST') {
          capturedBody = JSON.parse(route.request().postData() ?? '{}');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          });
          return;
        }
        await route.fallback();
      });

      await page.goto(`${BASE_URL_ADMIN}/admins/new`);

      await page.getByLabel('관리자 명').fill('신규관리자');
      await page.getByLabel('아이디').fill('newadmin');
      await page.getByRole('textbox', { name: '패스워드', exact: true }).fill('password123');
      await page.getByLabel('패스워드 확인').fill('password123');
      await page.getByLabel('이메일').fill('new@medipanda.co.kr');
      await page.getByLabel('연락처*').fill('01012345678');
      await page.getByLabel('회원관리').check();

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '관리자가 등록되었습니다.');
      await acceptMpModal(page);

      // 목록으로 이동
      await expect(page).toHaveURL(/\/admin\/admins(\?|$)/);

      // PERMISSION_MANAGEMENT 가 payload 에 자동 추가되는지 검증
      const body = capturedBody as { permissions?: string[] } | null;
      expect(body?.permissions).toEqual(
        expect.arrayContaining(['MEMBER_MANAGEMENT', 'PERMISSION_MANAGEMENT']),
      );
    });

    test('저장 실패: 아이디 중복 시 alert("이미 사용중인 아이디입니다.")', async ({ page }) => {
      await page.route(/\/v1\/members\/admins(\?|$)/, async (route: Route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 400,
            contentType: 'text/plain',
            body: 'Bad request: user id already exists.',
          });
          return;
        }
        await route.fallback();
      });

      await page.goto(`${BASE_URL_ADMIN}/admins/new`);

      await page.getByLabel('관리자 명').fill('중복관리자');
      await page.getByLabel('아이디').fill('dupadmin');
      await page.getByRole('textbox', { name: '패스워드', exact: true }).fill('password123');
      await page.getByLabel('패스워드 확인').fill('password123');
      await page.getByLabel('이메일').fill('dup@medipanda.co.kr');
      await page.getByLabel('연락처*').fill('01011112222');
      await page.getByLabel('회원관리').check();

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '이미 사용중인 아이디입니다.');
      await acceptMpModal(page);
    });
  });

  // ───────────── 관리자 수정 (/admin/admins/:userId/edit) ─────────────
  test.describe('관리자 수정 (/admin/admins/:userId/edit)', () => {
    test('권한 분기: 일반 ADMIN 세션 진입 시 alert + 뒤로가기', async ({ page }) => {
      await seedAdminSession(page);

      // detail/permissions API는 접근 차단 전이므로 mock만 설치
      await page.route(/\/v1\/members\/admin01\/details(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: SAMPLE_ADMIN.userId,
            name: SAMPLE_ADMIN.name,
            email: SAMPLE_ADMIN.email,
            phoneNumber: SAMPLE_ADMIN.phoneNumber,
            role: SAMPLE_ADMIN.role,
          }),
        });
      });
      await page.route(/\/v1\/members\/admins\/admin01\/permissions(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ permissions: ['MEMBER_MANAGEMENT'] }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/admins/admin01/edit`);
      await expectMpModal(page, '최고관리자만 관리자 편집이 가능합니다.');
      await acceptMpModal(page);
      // NOTE: window.history.back() 동작은 테스트 러너가 이전 페이지를 보유한 경우에만 검증 가능
    });

    test('SUPER_ADMIN 정상 로드: 기존 데이터 폼 채움 + 아이디 disabled', async ({ page }) => {
      await seedSuperAdminSession(page);

      await page.route(/\/v1\/members\/admin01\/details(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            userId: SAMPLE_ADMIN.userId,
            name: SAMPLE_ADMIN.name,
            email: SAMPLE_ADMIN.email,
            phoneNumber: SAMPLE_ADMIN.phoneNumber,
            role: SAMPLE_ADMIN.role,
          }),
        });
      });
      await page.route(/\/v1\/members\/admins\/admin01\/permissions(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            permissions: ['MEMBER_MANAGEMENT', 'BANNER_MANAGEMENT', 'PERMISSION_MANAGEMENT'],
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/admins/admin01/edit`);

      // 기본 필드에 detail 값이 reset된 상태
      // TODO: verify selector — controlled input value 검증 방식 (locator + inputValue())
      await expect(page.getByLabel('관리자 명')).toHaveValue(SAMPLE_ADMIN.name);
      await expect(page.getByLabel('이메일')).toHaveValue(SAMPLE_ADMIN.email);
      // 전화번호는 normalizePhoneNumber 적용됨
      await expect(page.getByLabel('연락처*')).toHaveValue('010-1234-5678');

      // 아이디는 수정 모드에서 disabled
      await expect(page.getByLabel('아이디')).toBeDisabled();
      await expect(page.getByLabel('아이디')).toHaveValue(SAMPLE_ADMIN.userId);

      // 권한 체크박스: 서버 응답에 포함된 것은 체크
      await expect(page.getByLabel('회원관리')).toBeChecked();
      await expect(page.getByLabel('배너관리')).toBeChecked();
      // 미포함 권한은 미체크
      await expect(page.getByLabel('제품관리')).not.toBeChecked();
    });

    test('수정 저장: PATCH /v1/members/admins/{userId} 호출 + password null 처리', async ({ page }) => {
      await seedSuperAdminSession(page);
      await installListMocks(page, []);

      await page.route(/\/v1\/members\/admin01\/details(\?|$)/, async (route: Route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              userId: SAMPLE_ADMIN.userId,
              name: SAMPLE_ADMIN.name,
              email: SAMPLE_ADMIN.email,
              phoneNumber: SAMPLE_ADMIN.phoneNumber,
              role: SAMPLE_ADMIN.role,
            }),
          });
          return;
        }
        await route.fallback();
      });
      await page.route(/\/v1\/members\/admins\/admin01\/permissions(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ permissions: ['MEMBER_MANAGEMENT'] }),
        });
      });

      let capturedBody: unknown = null;
      await page.route(/\/v1\/members\/admins\/admin01(\?|$)/, async (route: Route) => {
        if (route.request().method() === 'PATCH') {
          capturedBody = JSON.parse(route.request().postData() ?? '{}');
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true }),
          });
          return;
        }
        await route.fallback();
      });

      await page.goto(`${BASE_URL_ADMIN}/admins/admin01/edit`);
      await expect(page.getByLabel('관리자 명')).toHaveValue(SAMPLE_ADMIN.name);

      // 권한 추가
      await page.getByLabel('제품관리').check();

      await page.getByRole('button', { name: '저장' }).click();
      await expectMpModal(page, '관리자 권한이 수정되었습니다.');
      await acceptMpModal(page);

      // 비밀번호 필드 비워둔 채 저장 → null 전송
      const body = capturedBody as
        | { password?: string | null; permissions?: string[]; phoneNumber?: string }
        | null;
      expect(body?.password).toBeNull();
      // 전화번호는 하이픈 제거되어 전송
      expect(body?.phoneNumber).toBe('01012345678');
      // PERMISSION_MANAGEMENT 자동 추가 + 기존/추가 권한 포함
      expect(body?.permissions).toEqual(
        expect.arrayContaining([
          'MEMBER_MANAGEMENT',
          'PRODUCT_MANAGEMENT',
          'PERMISSION_MANAGEMENT',
        ]),
      );

      // 목록으로 이동
      await expect(page).toHaveURL(/\/admin\/admins(\?|$)/);
    });
  });
});

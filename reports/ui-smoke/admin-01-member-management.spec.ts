/**
 * 자동 생성된 UI smoke 초안 — medipanda-web (admin)
 * 원본 문서: docs/admin/01_MEMBER_MANAGEMENT.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminMemberList.tsx  (/admin/members)
 *   - src/pages-admin/MpAdminMemberEdit.tsx  (/admin/members/:userId/edit)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용:
 * 1. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 항목)
 * 2. Admin 영역은 AdminGuard + 관리자 권한 필요
 *    → beforeEach에서 storageState 또는 인증 헤더 주입 필요
 *    → 현재는 API mock 기반으로 동작하지만, AdminGuard가 /login 리다이렉트 시
 *      모든 테스트가 깨지므로 storageState 세팅 필수
 * 3. API mock 전제로 작성: 실제 백엔드 없이 실행 가능하도록 모든 GET을 route로 스텁
 *    → 전화번호 중복 에러 / PATCH 응답 검증 케이스는 실제 동작 확인 전까지 초안
 * 4. alert / confirm 처리는 acceptNextDialog() 재사용
 * 5. 한글 텍스트 매칭은 i18n 도입 전이라 안정적. 이후 재작성 필요.
 * 6. 대상 레포(medipanda-web)는 수정 금지. 본 파일은 claude-opus-test에만 존재.
 *
 * 검수 체크리스트:
 *   [ ] MUI Select 동작: getByLabel + click + getByRole('option') 흐름 확인
 *   [ ] 테이블 행 셀렉터: tbody tr / TableRow key 기준
 *   [ ] Excel 버튼 href 와일드카드 매칭 패턴
 *   [ ] 검색 alert("검색유형을 선택하세요.") 한글 일치 확인
 *   [ ] 회원명 Link 클릭 시 /admin/members/:userId/edit 이동 여부
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import { BASE_URL_ADMIN, EMPTY_PAGE, pageResponse, api, expectMpModal, acceptMpModal, expectSnackbar, muiSelect } from './_fixtures';

// ────────────────────────────────────────────────────────────
// URL 상수
// ────────────────────────────────────────────────────────────
const MEMBERS_URL = `${BASE_URL_ADMIN}/members`;
const MEMBER_EDIT_URL = (userId: string): string => `${BASE_URL_ADMIN}/members/${userId}/edit`;

// ────────────────────────────────────────────────────────────
// 공용 mock payload — 실제 API 응답 스키마와 맞추어 수동 검수 필요
// MemberResponse / MemberDetailsResponse / PartnerContractDetailsResponse
// ────────────────────────────────────────────────────────────

interface MemberRow {
  id: number;
  userId: string;
  name: string;
  companyName: string | null;
  phoneNumber: string;
  email: string;
  partnerContractStatus: 'NONE' | 'CSO' | 'INDIVIDUAL' | 'ORGANIZATION';
  hasCsoCert: boolean;
  csoCertUrl: string | null;
  accountStatus: 'ACTIVATED' | 'DEACTIVATED' | 'DELETED';
  marketingConsent: boolean;
  registrationDate: string;
  lastLoginDate: string;
}

const SAMPLE_MEMBERS: MemberRow[] = [
  {
    id: 1001,
    userId: 'testuser1',
    name: '홍길동',
    companyName: '메디판다(주)',
    phoneNumber: '010-1234-5678',
    email: 'hong@example.com',
    partnerContractStatus: 'ORGANIZATION',
    hasCsoCert: true,
    csoCertUrl: 'https://s3.example.com/cso1.pdf',
    accountStatus: 'ACTIVATED',
    marketingConsent: true,
    registrationDate: '2026-01-10T00:00:00Z',
    lastLoginDate: '2026-04-16T05:00:00Z',
  },
  {
    id: 1002,
    userId: 'testuser2',
    name: '김영희',
    companyName: null,
    phoneNumber: '010-9876-5432',
    email: 'kim@example.com',
    partnerContractStatus: 'NONE',
    hasCsoCert: false,
    csoCertUrl: null,
    accountStatus: 'ACTIVATED',
    marketingConsent: false,
    registrationDate: '2026-02-20T00:00:00Z',
    lastLoginDate: '2026-04-15T08:30:00Z',
  },
];

interface MemberDetail {
  id: number;
  userId: string;
  name: string;
  phoneNumber: string;
  email: string;
  birthDate: string;
  gender: string;
  accountStatus: 'ACTIVATED' | 'DEACTIVATED' | 'DELETED';
  partnerContractStatus: 'NONE' | 'CSO' | 'INDIVIDUAL' | 'ORGANIZATION';
  hasCsoCert: boolean;
  csoCertUrl: string | null;
  referralCode: string;
  registrationDate: string;
  lastLoginDate: string;
  note: string | null;
  marketingAgreements: {
    sms: boolean;
    smsAgreedAt: string | null;
    email: boolean;
    emailAgreedAt: string | null;
    push: boolean;
    pushAgreedAt: string | null;
  };
}

const MEMBER_DETAIL: MemberDetail = {
  id: 1001,
  userId: 'testuser1',
  name: '홍길동',
  phoneNumber: '01012345678',
  email: 'hong@example.com',
  birthDate: '1990-01-01',
  gender: 'MALE',
  accountStatus: 'ACTIVATED',
  partnerContractStatus: 'NONE',
  hasCsoCert: false,
  csoCertUrl: null,
  referralCode: 'ABC123',
  registrationDate: '2026-01-10T00:00:00Z',
  lastLoginDate: '2026-04-16T05:00:00Z',
  note: null,
  marketingAgreements: {
    sms: true,
    smsAgreedAt: '2026-03-15T05:30:00Z',
    email: false,
    emailAgreedAt: null,
    push: false,
    pushAgreedAt: null,
  },
};

const DELETED_MEMBER_DETAIL: MemberDetail = {
  ...MEMBER_DETAIL,
  id: 1099,
  userId: 'deleteduser',
  name: '탈퇴회원',
  accountStatus: 'DELETED',
};

// ────────────────────────────────────────────────────────────
// mock helper
// ────────────────────────────────────────────────────────────

// GET /v1/members (목록만) - query string 포함. 하위 경로(/v1/members/admins/..., /v1/members/:id/details)는 제외.
const MEMBERS_LIST_RE = /\/v1\/members(\?|$)/;

async function mockMembersList(page: Page, body: unknown): Promise<void> {
  await page.route(MEMBERS_LIST_RE, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function mockMemberDetail(
  page: Page,
  userId: string,
  body: MemberDetail,
): Promise<void> {
  await page.route(api(`/v1/members/${userId}/details`), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

async function mockContractNotFound(page: Page, userId: string): Promise<void> {
  await page.route(api(`/v1/partner-contracts/${userId}`), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'not found' }),
    });
  });
}

async function mockMembersListError(page: Page): Promise<void> {
  await page.route(MEMBERS_LIST_RE, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'internal server error' }),
    });
  });
}

// ────────────────────────────────────────────────────────────
test.describe('admin/01 MEMBER_MANAGEMENT — 회원관리 smoke', () => {
  // TODO: storageState — AdminGuard 통과용 관리자 세션 세팅 필요
  // test.use({ storageState: AUTH_STATE_ADMIN });

  test.describe('MpAdminMemberList (/admin/members)', () => {
    test('정상 로드 — 헤딩/검색 필터/테이블 헤더/Excel 버튼 렌더', async ({ page }) => {
      await mockMembersList(page, pageResponse<MemberRow>(SAMPLE_MEMBERS, { page: 0, size: 20 }));

      await page.goto(MEMBERS_URL);

      await expect(page.getByRole('heading', { name: '회원관리' })).toBeVisible();

      // 검색 필터 라벨
      // MUI <InputLabel> 이 labelId 연결 없이 쓰이므로 combobox accessible name 이 비어있음
      // → muiSelect 헬퍼로 FormControl 컨테이너 스코프 사용
      await expect(muiSelect(page, '계약상태')).toBeVisible();
      await expect(muiSelect(page, '검색유형')).toBeVisible();
      // DatePicker 는 group+hidden input 두 요소 모두 매칭되므로 group 으로 좁힘
      await expect(page.getByRole('group', { name: '시작일' })).toBeVisible();
      await expect(page.getByRole('group', { name: '종료일' })).toBeVisible();
      await expect(page.getByLabel('검색어')).toBeVisible();

      // 액션 버튼
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Excel/ })).toBeVisible();

      // 테이블 헤더 (13개 컬럼)
      await expect(page.getByRole('columnheader', { name: '회원번호' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '아이디' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '회원명' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '파트너사 계약여부' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'CSO신고증 유무' })).toBeVisible();

      // 행 데이터 (샘플 2건)
      await expect(page.getByText('홍길동')).toBeVisible();
      await expect(page.getByText('testuser1')).toBeVisible();
      await expect(page.getByText('김영희')).toBeVisible();

      // 검색결과 카운트
      await expect(page.getByText(/검색결과:\s*2\s*건/)).toBeVisible();
    });

    test('빈 상태 — 검색 결과 0건일 때 "검색 결과가 없습니다." 표시', async ({ page }) => {
      await mockMembersList(page, EMPTY_PAGE);

      await page.goto(MEMBERS_URL);

      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
      await expect(page.getByText(/검색결과:\s*0\s*건/)).toBeVisible();
    });

    test('API 에러 — 목록 조회 500 시 alert 노출', async ({ page }) => {
      await mockMembersListError(page);

      await page.goto(MEMBERS_URL);

      await expectMpModal(page, '회원 목록을 불러오는 중 오류가 발생했습니다.');
      await acceptMpModal(page);
    });

    test('검색 유효성 — searchType 미선택 상태에서 검색어만 입력 후 검색 시 alert', async ({ page }) => {
      await mockMembersList(page, pageResponse<MemberRow>(SAMPLE_MEMBERS, { page: 0, size: 20 }));

      await page.goto(MEMBERS_URL);

      await page.getByLabel('검색어').fill('홍길동');
      await page.getByRole('button', { name: '검색' }).click();

      await expectMpModal(page, '검색유형을 선택하세요.');
      await acceptMpModal(page);
    });

    test('회원번호 숫자 검증 — searchType=회원번호 + 문자열 입력 시 alert', async ({ page }) => {
      await mockMembersList(page, pageResponse<MemberRow>(SAMPLE_MEMBERS, { page: 0, size: 20 }));

      await page.goto(MEMBERS_URL);

      await muiSelect(page, '검색유형').click();
      await page.getByRole('option', { name: '회원번호' }).click();

      await page.getByLabel('검색어').fill('abc');
      await page.getByRole('button', { name: '검색' }).click();

      await expectMpModal(page, '회원번호는 숫자만 입력할 수 있습니다.');
      await acceptMpModal(page);
    });

    test('회원명 링크 클릭 시 /admin/members/:userId/edit 이동', async ({ page }) => {
      await mockMembersList(page, pageResponse<MemberRow>(SAMPLE_MEMBERS, { page: 0, size: 20 }));
      await mockMemberDetail(page, 'testuser1', MEMBER_DETAIL);
      await mockContractNotFound(page, 'testuser1');

      await page.goto(MEMBERS_URL);
      await expect(page.getByText('홍길동')).toBeVisible();

      await page.getByRole('link', { name: '홍길동' }).click();

      await expect(page).toHaveURL(/\/admin\/members\/testuser1\/edit$/);
    });
  });

  test.describe('MpAdminMemberEdit (/admin/members/:userId/edit)', () => {
    test.beforeEach(async ({ page }) => {
      await mockMemberDetail(page, 'testuser1', MEMBER_DETAIL);
      await mockContractNotFound(page, 'testuser1');
    });

    test('정상 로드 — 회원 상세 폼 필드에 조회 데이터 반영', async ({ page }) => {
      await page.goto(MEMBER_EDIT_URL('testuser1'));

      // 연락처는 normalizePhoneNumber 로 하이픈 추가되어 표시
      // TODO: verify selector — 실제 라벨("연락처")이 TextField label prop인지 placeholder 인지 확인
      const phoneInput = page.getByRole('textbox', { name: /연락처/ });
      await expect(phoneInput).toHaveValue('010-1234-5678');

      const emailInput = page.getByRole('textbox', { name: /E-mail/ });
      await expect(emailInput).toHaveValue('hong@example.com');
    });

    test('이메일 형식 오류 — 잘못된 이메일로 저장 시 alert', async ({ page }) => {
      await page.goto(MEMBER_EDIT_URL('testuser1'));

      const emailInput = page.getByRole('textbox', { name: /E-mail/ });
      await emailInput.fill('not-an-email');

      await page.getByRole('button', { name: '저장' }).click();

      await expectMpModal(page, '올바른 이메일 형식이 아닙니다.');
      await acceptMpModal(page);
    });

    test('회원 상세 조회 실패 — 에러 snackbar 노출 후 히스토리 백', async ({ page }) => {
      await page.route(api('/v1/members/fail-user/details'), async (route: Route) => {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'server error' }),
        });
      });
      await page.route(api('/v1/partner-contracts/fail-user'), async (route: Route) => {
        return route.fulfill({ status: 404, body: '{}' });
      });

      // 실 코드는 enqueueSnackbar 직후 window.history.back() 을 호출 → 그대로 두면
      // 스낵바가 mount 되자마자 페이지가 이탈해 Playwright 가 잡지 못함.
      // history.back() 을 테스트에서만 지연시켜 스낵바 관찰 여유 확보.
      await page.addInitScript(() => {
        const original = window.history.back.bind(window.history);
        window.history.back = () => {
          setTimeout(original, 2000);
        };
      });

      await page.goto(MEMBER_EDIT_URL('fail-user'));

      // 실 코드(MpAdminMemberEdit.tsx:186)는 useSnackbar.enqueueSnackbar 사용
      await expectSnackbar(page, '회원 정보를 불러오는데 실패했습니다.');
    });

    test('탈퇴 회원 — DELETED 상태일 때 저장 버튼 숨김', async ({ page }) => {
      await mockMemberDetail(page, 'deleteduser', DELETED_MEMBER_DETAIL);
      await mockContractNotFound(page, 'deleteduser');

      await page.goto(MEMBER_EDIT_URL('deleteduser'));

      // 저장 버튼이 존재하지 않아야 함
      // TODO: verify — "뒤로" 또는 "목록" 버튼 텍스트 원본 확인
      await expect(page.getByRole('button', { name: '저장' })).toHaveCount(0);
    });
  });
});

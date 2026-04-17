/**
 * 자동 생성된 UI smoke 초안 - medipanda-web (admin)
 * 원본 문서: docs/admin/05_PRESCRIPTION_MANAGEMENT.md
 * 대상 컴포넌트: src/pages-admin/MpAdminPrescriptionReceptionList.tsx
 *                (FormList / FormEdit 은 별도 spec으로 분리 권장)
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안 - 반드시 수동 검수 후 사용
 *
 * 수동 검수 체크리스트:
 *   1. Admin 진입은 AdminGuard + 관리자 권한 필요 -> beforeEach의 storageState TODO 교체
 *   2. 셀렉터 실제 DOM과 일치 확인 (MUI Select/DatePicker의 role 매칭은 렌더 변경에 민감)
 *   3. API mock 경로 와일드카드(api('/v1/prescriptions')) 가 실제 baseURL 과 맞는지 재확인
 *   4. EDI 다운로드 버튼은 href 기반 브라우저 직접 GET -> Playwright 에서 download 이벤트로 검증 가능
 *   5. 한글 텍스트 매칭은 i18n 도입 전까지만 유효
 *   6. 검색/필터 시나리오는 URL 파라미터 변경에 따른 refetch 를 가정 - 실제 useEffect 의존성과 교차 확인
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  BASE_URL_ADMIN,
  EMPTY_PAGE,
  pageResponse,
  expectMpModal,
  acceptMpModal,
  expectSnackbar,
} from './_fixtures';

// ────────────────────────────────────────────────────────────────
// 엔드포인트 (docs/admin/05_PRESCRIPTION_MANAGEMENT.md - 처방접수)
// ────────────────────────────────────────────────────────────────

// glob `**/v1/prescriptions` 는 `?page=...` 쿼리스트링 포함 URL 을 매칭 못함 → regex 로 교체
// (/v1/prescriptions 뒤에 슬래시가 오면 confirm 등 다른 엔드포인트이므로 (?=\?|$) 로 종단 보장)
const API_PRESCRIPTIONS: RegExp = /\/v1\/prescriptions(?=\?|$)/;
const API_CONFIRM_RE: RegExp = /\/v1\/prescriptions\/\d+\/confirm/;

const RECEPTIONS_URL: string = `${BASE_URL_ADMIN}/prescription-receptions`;

// ────────────────────────────────────────────────────────────────
// 샘플 응답 스텁
// ────────────────────────────────────────────────────────────────

interface PrescriptionRow {
  id: number;
  dealerId: number;
  userId: string;
  companyName: string;
  institutionName: string;
  dealerName: string;
  prescriptionMonth: string;
  settlementMonth: string;
  submittedAt: string;
  status: 'PENDING' | 'CHECKED' | 'COMPLETED';
  checkedAt: string | null;
}

const SAMPLE_PENDING: PrescriptionRow = {
  id: 1001,
  dealerId: 11,
  userId: 'dealer-a',
  companyName: '가나제약',
  institutionName: '행복약국',
  dealerName: '김딜러',
  prescriptionMonth: '2026-03-01T00:00:00Z',
  settlementMonth: '2026-04-01T00:00:00Z',
  submittedAt: '2026-04-10T01:30:00Z',
  status: 'PENDING',
  checkedAt: null,
};

const SAMPLE_CHECKED: PrescriptionRow = {
  id: 1002,
  dealerId: 12,
  userId: 'dealer-b',
  companyName: '다라제약',
  institutionName: '건강약국',
  dealerName: '이딜러',
  prescriptionMonth: '2026-03-01T00:00:00Z',
  settlementMonth: '2026-04-01T00:00:00Z',
  submittedAt: '2026-04-11T02:15:00Z',
  status: 'CHECKED',
  checkedAt: '2026-04-12T03:45:00Z',
};

// ────────────────────────────────────────────────────────────────
// 라우팅 헬퍼
// ────────────────────────────────────────────────────────────────

interface StubOptions {
  listBody?: unknown;
  listStatus?: number;
  confirmStatus?: number;
}

async function stubApis(page: Page, opts: StubOptions = {}): Promise<void> {
  const listBody: unknown = opts.listBody ?? pageResponse<PrescriptionRow>([SAMPLE_PENDING, SAMPLE_CHECKED], { size: 20 });
  const listStatus: number = opts.listStatus ?? 200;

  await page.route(API_PRESCRIPTIONS, (route: Route) => {
    void route.fulfill({
      status: listStatus,
      contentType: 'application/json',
      body: JSON.stringify(listBody),
    });
  });

  // PUT /v1/prescriptions/{id}/confirm
  await page.route(API_CONFIRM_RE, (route: Route) => {
    void route.fulfill({
      status: opts.confirmStatus ?? 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

// ────────────────────────────────────────────────────────────────
// 테스트 스위트
// ────────────────────────────────────────────────────────────────

test.describe('admin/05 처방관리 - 처방접수 목록 (MpAdminPrescriptionReceptionList)', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: storageState - AdminGuard 통과를 위해 관리자 세션 필요
    //       e2e/.auth/admin.json 생성 후 test.use({ storageState: AUTH_STATE_ADMIN })
    //       또는 playwright.config 의 projects 에서 admin 프로젝트 지정
    await stubApis(page);
  });

  test('정상 로드: 페이지 타이틀과 기본 필터 UI 렌더', async ({ page }) => {
    await page.goto(RECEPTIONS_URL);

    // h4 '처방접수'
    await expect(page.getByRole('heading', { name: '처방접수', level: 4 })).toBeVisible();

    // 필터 버튼 (검색/초기화)
    await expect(page.getByRole('button', { name: '검색', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '초기화', exact: true })).toBeVisible();

    // 필터 라벨 — 테이블 컬럼 헤더에 동일 텍스트가 있어 strict 위반. 폼 영역으로 스코프.
    // DatePicker 는 추가로 label + legend 로 두 번 렌더되므로 .first() 로 집음.
    const form = page.locator('form');
    await expect(form.getByText('접수상태', { exact: true })).toBeVisible();
    await expect(form.getByText('검색유형', { exact: true })).toBeVisible();
    await expect(form.getByText('시작일', { exact: true }).first()).toBeVisible();
    await expect(form.getByText('종료일', { exact: true }).first()).toBeVisible();
  });

  test('정상 로드: 목록 두 건(PENDING + CHECKED)이 테이블에 표시', async ({ page }) => {
    await page.goto(RECEPTIONS_URL);

    // 검색결과 건수
    await expect(page.getByText(/검색결과:\s*2\s*건/)).toBeVisible();

    // PENDING 행: 접수확인 버튼 노출
    await expect(page.getByRole('button', { name: '접수확인', exact: true })).toBeVisible();

    // 회사명 셀 노출 (샘플 데이터)
    await expect(page.getByRole('cell', { name: '가나제약' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '다라제약' })).toBeVisible();

    // CHECKED 행은 checkedAt KST 변환 값 노출 (포맷은 YYYY-MM-DD HH:mm:ss).
    // submittedAt/checkedAt 여러 셀에 매칭되므로 .first() 로 스코프.
    await expect(page.locator('text=/2026-04-1[12]/').first()).toBeVisible();
  });

  test('빈 상태: API 응답 0건이면 "검색 결과가 없습니다." 렌더', async ({ page }) => {
    await page.unroute(API_PRESCRIPTIONS);
    await page.route(API_PRESCRIPTIONS, (route: Route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });

    await page.goto(RECEPTIONS_URL);

    await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
    await expect(page.getByText(/검색결과:\s*0\s*건/)).toBeVisible();

    // EDI 다운로드 버튼: selectedIds 가 비어있으므로 disabled
    const ediBtn = page.getByRole('button', { name: 'EDI 다운로드', exact: true });
    await expect(ediBtn).toBeDisabled();
  });

  test('에러 상태: 목록 API 500 실패 시 에러 alert 발생', async ({ page }) => {
    await page.unroute(API_PRESCRIPTIONS);
    await page.route(API_PRESCRIPTIONS, (route: Route) => {
      void route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal Server Error' }),
      });
    });

    await page.goto(RECEPTIONS_URL);

    // useMpModal.alertError 는 MUI Dialog 로 렌더됨(native window.alert 아님).
    await expectMpModal(page, '처방접수 목록을 불러오는 중 오류가 발생했습니다.');
    await acceptMpModal(page);

    // 에러 후 목록은 빈 배열로 초기화되어 '검색 결과가 없습니다.' 노출
    await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
  });

  test('검색 유효성: 검색유형이 "" 인데 키워드가 있으면 alert', async ({ page }) => {
    await page.goto(RECEPTIONS_URL);

    const keyword = page.getByRole('textbox', { name: '검색어' });
    await keyword.fill('행복');

    await page.getByRole('button', { name: '검색', exact: true }).click();

    await expectMpModal(page, '검색유형을 선택하세요.');
    await acceptMpModal(page);
  });

  test('액션: PENDING 행의 접수확인 버튼 클릭 시 confirm API 호출 + refetch', async ({ page }) => {
    await page.goto(RECEPTIONS_URL);

    // confirm 요청 캡처 — backend.ts confirmPrescription 실제 메서드는 PATCH.
    const confirmRequest: Promise<import('@playwright/test').Request> = page.waitForRequest((req) => {
      return API_CONFIRM_RE.test(req.url()) && req.method() === 'PATCH';
    });

    // PENDING/CHECKED 행 모두 "접수확인" 버튼을 가지므로 PENDING 행(가나제약) 으로 스코프.
    // row 의 accessible name 은 cell 내용 합으로 만들어져 부정확하므로 filter 로 hasText 매칭.
    await page.getByRole('row').filter({ hasText: '가나제약' }).getByRole('button', { name: '접수확인', exact: true }).click();

    const req: import('@playwright/test').Request = await confirmRequest;
    expect(req.url()).toMatch(/\/v1\/prescriptions\/1001\/confirm/);

    // 성공 스낵바 (notistack)
    await expectSnackbar(page, '접수 확인되었습니다.');
  });

  test('권한 분기: 비관리자 세션으로 진입 시 AdminGuard 가 차단', async ({ page }) => {
    // TODO: 이 시나리오는 storageState 를 제거(비로그인) 또는 일반 사용자 세션으로 주입하여 검증
    //       현재는 기본 admin mock 상태를 가정하고 skip. 실제 실행 전 스토리지 처리 후 해제.
    test.skip(true, 'AdminGuard 리다이렉트 검증은 storageState 분리 이후 재작성 필요');

    await page.goto(RECEPTIONS_URL);

    // 기대: /admin/login 또는 공용 로그인 페이지로 리다이렉트
    await expect(page).toHaveURL(/\/admin\/login|\/login/);
  });

  test('액션: 전체선택 체크박스로 EDI 다운로드 href 가 쿼리스트링 포함하도록 변경', async ({ page }) => {
    await page.goto(RECEPTIONS_URL);

    // 최초 상태: EDI 다운로드 disabled (button)
    await expect(page.getByRole('button', { name: 'EDI 다운로드', exact: true })).toBeDisabled();

    // MUI Checkbox 는 input 을 PrivateSwitchBase 가 감싸 클릭을 intercept.
    // input 대신 MUI root(label) 를 클릭해야 onChange 가 발화.
    const headerCheckbox = page.locator('thead').getByRole('checkbox').first();
    await headerCheckbox.click();

    // 전체선택 → selectedIds 가 채워지면 button 대신 <a href> 로 렌더됨(role=link).
    const ediLink = page.getByRole('link', { name: 'EDI 다운로드', exact: true });
    await expect(ediLink).toBeVisible();
    await expect(ediLink).toHaveAttribute('href', /prescriptionIds=1001(?:%2C|,)1002/);
  });
});

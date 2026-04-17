/**
 * 자동 생성된 UI smoke 초안 - medipanda-web
 * 원본 문서: docs/user/04_PRESCRIPTION_MANAGEMENT.md
 * 대상 컴포넌트: src/pages-user/PrescriptionList.tsx (주요 1개)
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안 - 반드시 수동 검수 후 사용
 * 1. 셀렉터 실제 DOM과 일치 확인 (MedipandaTable / MedipandaDatePicker 등 래퍼 컴포넌트는 role 예측이 불안정)
 * 2. 인증 + 파트너 계약 필요 (ContractMemberGuard) -> storageState로 로그인 세션 주입 필수
 * 3. API mock 전략: 각 시나리오에서 page.route()로 선-등록한 뒤 goto() 호출
 * 4. 파일 업로드/날짜 선택 시나리오는 실제 DOM 상호작용이 커스텀 컴포넌트에 의존하므로 TODO 남김
 * 5. 한글 텍스트 매칭 허용 (i18n 도입 전)
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';
const PRESCRIPTIONS_URL = `${BASE_URL}/prescriptions`;

// ---------- API 엔드포인트 (docs 04_PRESCRIPTION_MANAGEMENT.md 기준) ----------
const API = {
  list: '**/v1/prescriptions/partners?**',
  listBase: '**/v1/prescriptions/partners**',
  detail: (id: number | string) => `**/v1/prescriptions/partners/${id}`,
  upload: '**/v1/prescriptions/partner-files',
  update: '**/v1/prescriptions/partner-files/update',
  delete: (id: number | string) => `**/v1/prescriptions/partners/${id}`,
  dealers: '**/v1/dealers**',
};

// ---------- 픽스처 ----------
const EMPTY_PAGE = { content: [], totalElements: 0, totalPages: 0, number: 0, size: 10 };

const SAMPLE_ITEM = {
  id: 1001,
  dealerId: 11,
  dealerName: '김딜러',
  drugCompany: '가제약',
  drugCompanyId: 1,
  partnerId: 201,
  institutionName: '행복약국',
  businessNumber: '123-45-67890',
  companyName: '행복약국(주)',
  prescriptionMonth: '2026-03-01T00:00:00Z',
  settlementMonth: '2026-04-01T00:00:00Z',
  status: 'PENDING',
  ediFiles: [] as Array<{ s3fileId: number; fileUrl: string; originalFileName: string }>,
};

const SAMPLE_PAGE = {
  content: [SAMPLE_ITEM],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 10,
};

/**
 * 공용 라우팅 스텁 - 목록 + 상세 응답을 기본으로 제공.
 * 각 test에서 page.route() 호출 전에 stubApis(page)로 초기화한 뒤
 * 필요 시 page.unroute() + page.route()로 덮어쓴다.
 */
async function stubApis(page: Page, overrides?: { list?: unknown; detail?: unknown }) {
  await page.route(API.listBase, (route: Route) => {
    const body = overrides?.list ?? SAMPLE_PAGE;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route(API.detail(SAMPLE_ITEM.id), (route: Route) => {
    const body = overrides?.detail ?? SAMPLE_ITEM;
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  // 딜러 목록: 딜러 선택 다이얼로그용 (선택 시나리오에서만 실사용)
  await page.route(API.dealers, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
}

test.describe('user/04 실적관리 (PrescriptionList)', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: verify - ContractMemberGuard 통과용 storageState 또는 auth setup 필요
    // 현재는 mock API로만 커버. 실제 실행 시 playwright.config.ts 에 storageState 지정.
    await stubApis(page);
  });

  test('1) 정상 로드: 페이지 진입 시 현재 연/월 헤더 + 검색 UI + 목록 테이블 렌더', async ({ page }) => {
    await page.goto(PRESCRIPTIONS_URL);

    // 헤더: 오늘 기준 YYYY년 MM월 (format: DATEFORMAT_YYYY년_MM월)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    await expect(page.getByText(`${yyyy}년 ${mm}월`)).toBeVisible();

    // 검색 placeholder (기본 searchType=institutionName)
    await expect(page.getByPlaceholder('거래처명을 검색하세요.')).toBeVisible();

    // 테이블 헤더 4개
    for (const header of ['딜러명', '거래처명', '처방월', '등록처리']) {
      await expect(page.getByText(header, { exact: true }).first()).toBeVisible();
    }

    // 샘플 행 거래처명 노출
    await expect(page.getByText(SAMPLE_ITEM.institutionName)).toBeVisible();
  });

  test('2) 빈 상태: 처방 목록이 0건일 때 테이블 본문 비어 있음', async ({ page }) => {
    await page.unroute(API.listBase);
    await page.route(API.listBase, (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_PAGE) }),
    );

    await page.goto(PRESCRIPTIONS_URL);

    await expect(page.getByPlaceholder('거래처명을 검색하세요.')).toBeVisible();
    // 샘플 거래처명이 노출되면 안 됨
    await expect(page.getByText(SAMPLE_ITEM.institutionName)).toHaveCount(0);
    // TODO: verify selector - MedipandaTable 의 빈 상태 문구(예: "데이터 없음")가 있다면 여기에 추가
  });

  test('3) 에러 상태: 목록 API 실패 시 alert 발생 + 테이블 비어있음', async ({ page }) => {
    await page.unroute(API.listBase);
    await page.route(API.listBase, (route: Route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
    );

    // PrescriptionList는 실패 시 window.alert 호출
    const alertMessages: string[] = [];
    page.on('dialog', async dialog => {
      alertMessages.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto(PRESCRIPTIONS_URL);

    // alert 호출 대기 (네트워크 실패 후)
    await expect.poll(() => alertMessages.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(alertMessages.some(m => m.includes('처방내역 목록을 불러오는 중 오류'))).toBeTruthy();
  });

  test('4) 검색 타입 전환: 드롭다운 "딜러명" 선택 시 placeholder/검색 동작', async ({ page }) => {
    await page.goto(PRESCRIPTIONS_URL);

    // MUI Select: role=combobox 로 접근 가능 (initial label="거래처명")
    // TODO: verify selector - MUI Select의 실제 role/name
    const selectTrigger = page.getByRole('combobox').first();
    await selectTrigger.click();
    await page.getByRole('option', { name: '딜러명' }).click();

    // 검색 폼 제출: TextField placeholder는 institutionName 기준 고정 문구였으므로
    // 실제로는 searchType 전환 후에도 placeholder는 동일할 가능성 높음 (소스 상 고정)
    const input = page.getByPlaceholder('거래처명을 검색하세요.');
    await input.fill('김딜러');
    await input.press('Enter');

    // URL 파라미터 반영 (setUrlParams 기반)
    await expect(page).toHaveURL(/searchType=dealerName/);
    await expect(page).toHaveURL(/searchKeyword=/);
  });

  test('5) 액션: 거래처명 클릭 시 상세 API 호출 + 우측 오버레이 전환', async ({ page }) => {
    let detailCalled = false;
    await page.unroute(API.detail(SAMPLE_ITEM.id));
    await page.route(API.detail(SAMPLE_ITEM.id), (route: Route) => {
      detailCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_ITEM) });
    });

    await page.goto(PRESCRIPTIONS_URL);

    // 거래처명(밑줄+underline 스타일)을 클릭
    const institutionCell = page.getByText(SAMPLE_ITEM.institutionName);
    await institutionCell.click();

    // 상세 API 호출 확인
    await expect.poll(() => detailCalled).toBe(true);

    // 오버레이 열리면 폼에 기존 값(거래처명 businessNumber 등)이 표시됨
    // TODO: verify selector - MedipandaOutlinedInput의 실제 label/aria-label
    await expect(page.locator(`input[value="${SAMPLE_ITEM.institutionName}"]`)).toBeVisible();
  });

  test('6) 권한/상태 분기: status=PENDING 일 때 "수정"/"삭제" 버튼, 아니면 "닫기"만', async ({ page }) => {
    // 먼저 PENDING 케이스
    await page.goto(PRESCRIPTIONS_URL);
    await page.getByText(SAMPLE_ITEM.institutionName).click();

    await expect(page.getByRole('button', { name: '수정' })).toBeVisible();
    await expect(page.getByRole('button', { name: '삭제' })).toBeVisible();

    // 닫기 후 COMPLETED 케이스로 재진입
    // TODO: verify selector - 오버레이 close 트리거가 별도 X 버튼인지 "닫기" 버튼인지 확인 필요
    await page.unroute(API.detail(SAMPLE_ITEM.id));
    await page.route(API.detail(SAMPLE_ITEM.id), (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...SAMPLE_ITEM, status: 'COMPLETED' }),
      }),
    );

    await page.reload();
    await page.getByText(SAMPLE_ITEM.institutionName).click();

    await expect(page.getByRole('button', { name: '닫기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '수정' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(0);
  });

  test('7) 액션: 삭제 플로우 - confirm 승인 시 DELETE API 호출', async ({ page }) => {
    let deleteCalled = false;
    // ⚠️ DELETE 와 GET 이 같은 URL(/v1/prescriptions/partners/:id) 을 공유하므로
    // DELETE 가 아닌 요청은 route.fallback() 으로 beforeEach 의 GET 스텁에 넘겨야 한다.
    // route.continue() 를 쓰면 네트워크로 나가서 401 → detail 로드 실패 → 삭제 버튼이 안 뜸.
    await page.route(API.delete(SAMPLE_ITEM.id), (route: Route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });

    // window.confirm 자동 수락
    page.on('dialog', async dialog => {
      if (dialog.type() === 'confirm') await dialog.accept();
      else await dialog.dismiss();
    });

    await page.goto(PRESCRIPTIONS_URL);
    await page.getByText(SAMPLE_ITEM.institutionName).click();
    await page.getByRole('button', { name: '삭제' }).click();

    await expect.poll(() => deleteCalled, { timeout: 5000 }).toBe(true);
  });

  test('8) 페이지네이션 URL 파라미터 반영 확인', async ({ page }) => {
    await page.unroute(API.listBase);
    await page.route(API.listBase, (route: Route) => {
      // 2페이지 이상 응답
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...SAMPLE_PAGE, totalPages: 3, totalElements: 25 }),
      });
    });

    await page.goto(`${PRESCRIPTIONS_URL}?page=2`);

    // 테이블은 동일 샘플 렌더하지만 URL page=2 유지 확인
    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByText(SAMPLE_ITEM.institutionName)).toBeVisible();
    // TODO: verify selector - MedipandaPagination 활성 페이지 버튼 (aria-current="page" 혹은 class)
  });
});

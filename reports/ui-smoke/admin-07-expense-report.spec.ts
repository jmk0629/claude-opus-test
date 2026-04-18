/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/07_EXPENSE_REPORT.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminExpenseReportList.tsx  (/admin/expense-reports)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * 초안이므로 반드시 수동 검수 후 사용.
 *
 * 검수 체크리스트:
 * 1. Admin은 AdminGuard + 관리자 권한 필수 — beforeEach에 storageState 또는 세션 주입 필요
 *    (현재는 injectTestSession으로 localStorage mock만 설정. 쿠키 기반 세션이면 storageState로 교체)
 * 2. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 TODO 표시 항목)
 * 3. API mock은 _fixtures의 EMPTY_PAGE/pageResponse 재사용 — 필드 스키마는 backend.ts로 검증
 *    (특히 ExpenseReportResponse: reportId / userId / companyName / reportType / productName /
 *     productCode / eventStartAt / eventEndAt / supportAmount / status / id)
 * 4. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만 이후 재작성 필요
 * 5. MUI Select 열기/선택은 role=combobox → role=option 패턴 — 버전별로 역할 다를 수 있음
 * 6. 첨부파일 다운로드는 <Link component={RouterLink} to='/v1/...'> 방식 — href가 SPA 경로처럼
 *    렌더되므로 실제 브라우저 동작(새 탭 GET)을 검증하려면 별도 전략 필요
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  BASE_URL_ADMIN,
  EMPTY_PAGE,
  pageResponse,
  api,
  injectTestSession,
  SESSION_PRESETS,
  expectMpModal,
  acceptMpModal,
} from './_fixtures';

// ────────────────────────────────────────────────────────────────
// 공용 mock helper — spec 내부에서만 사용
// ────────────────────────────────────────────────────────────────

interface ExpenseReportItem {
  id: number;
  reportId: number;
  userId: string;
  companyName: string;
  reportType: string;
  productName: string;
  productCode: string;
  eventStartAt: string | null;
  eventEndAt: string | null;
  supportAmount: number;
  status: string;
}

/**
 * Excel 다운로드 라우트는 브라우저가 새 탭 GET으로 처리.
 * Playwright에서는 200 빈 응답으로 가로채 다운로드 팝업 대기 로직을 피한다.
 */
async function stubExcelDownload(page: Page): Promise<void> {
  await page.route(api('/v1/expense-reports/excel**'), async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      body: '',
    });
  });
}

// Admin 권한 주입. cookie 기반이면 test.use({ storageState })로 교체.
async function seedAdminSession(page: Page): Promise<void> {
  // TODO: storageState — 실제 관리자 세션 구조를 확인 후 교체
  await injectTestSession(page, {
    ...SESSION_PRESETS.csoApproved,
    role: 'ADMIN',
    userId: 'test-admin',
  });
}

// ────────────────────────────────────────────────────────────────
// 테스트 본체
// ────────────────────────────────────────────────────────────────

test.describe('admin/07 EXPENSE_REPORT — 지출보고관리 smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await stubExcelDownload(page);
  });

  test('정상 로드: 제목/검색 필터/테이블 헤더/Excel 버튼 렌더', async ({ page }) => {
    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });

    await page.goto(`${BASE_URL_ADMIN}/expense-reports`);

    await expect(page.getByRole('heading', { name: '지출보고관리' })).toBeVisible();

    // 검색 필터 — InputLabel 텍스트
    // TODO: verify selector — MUI InputLabel은 텍스트 label + 숨겨진 legend가 동시 렌더될 수 있음
    await expect(page.getByText('신고상태').first()).toBeVisible();
    await expect(page.getByText('검색유형').first()).toBeVisible();
    await expect(page.getByText('유형').first()).toBeVisible();
    // MUI DatePicker 는 role=group 이 라벨을 가짐 (input 과 group 두 개에 매칭되므로 role 로 스코프)
    await expect(page.getByRole('group', { name: '시작일' })).toBeVisible();
    await expect(page.getByRole('group', { name: '종료일' })).toBeVisible();
    await expect(page.getByLabel('검색어')).toBeVisible();

    // 액션 버튼
    await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
    await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
    // MUI <Button href target='_blank'> 는 <a role=link> 로 렌더
    await expect(page.getByRole('link', { name: 'Excel' })).toBeVisible();

    // 테이블 헤더 (총 10개 컬럼)
    await expect(page.getByRole('columnheader', { name: 'No' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '아이디' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '회사명' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '유형' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '제품명' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '제품코드' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '시행일시' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '지원금액' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '신고상태' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '첨부파일' })).toBeVisible();
  });

  test('빈 상태: API 0건 응답 시 "검색 결과가 없습니다." 표시 + 검색결과 0건', async ({ page }) => {
    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });

    await page.goto(`${BASE_URL_ADMIN}/expense-reports`);

    await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    await expect(page.getByText(/검색결과:\s*0\s*건/)).toBeVisible();
  });

  test('목록 렌더: 1행의 유형/신고상태 한글 레이블 + 지원금액 포맷 + 시행일시 범위', async ({ page }) => {
    const items: ExpenseReportItem[] = [
      {
        id: 1,
        reportId: 1001,
        userId: 'cso001',
        companyName: '화이자',
        reportType: 'SAMPLE_PROVIDE',
        productName: '타이레놀',
        productCode: 'P-001',
        // UTC 기준 — parseUtcAndFormatKst가 KST로 변환 (UTC+9)
        eventStartAt: '2024-02-29T15:00:00Z', // KST 2024-03-01
        eventEndAt: '2024-03-30T15:00:00Z', // KST 2024-03-31
        supportAmount: 150000,
        status: 'COMPLETED',
      },
    ];

    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pageResponse(items)),
      });
    });

    await page.goto(`${BASE_URL_ADMIN}/expense-reports`);

    await expect(page.getByRole('cell', { name: 'cso001' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '화이자' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '타이레놀' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'P-001' })).toBeVisible();

    // ExpenseReportTypeLabel['SAMPLE_PROVIDE'] = '견본품제공' (backend-helper.ts)
    await expect(page.getByRole('cell', { name: '견본품제공' })).toBeVisible();

    // ExpenseReportStatusLabel['COMPLETED'] = '진행완료' (APPROVED 는 enum 에 없음)
    await expect(page.getByRole('cell', { name: '진행완료' })).toBeVisible();

    // 지원금액: 150000 → "150,000원"
    await expect(page.getByRole('cell', { name: '150,000원' })).toBeVisible();

    // 시행일시 범위: "2024-03-01 ~ 2024-03-31"
    await expect(page.getByRole('cell', { name: '2024-03-01 ~ 2024-03-31' })).toBeVisible();

    // 첨부파일 다운로드 링크 — RouterLink to="/v1/expense-reports/1001/files/download"
    const downloadLink = page.getByRole('link', { name: '다운로드' });
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute('href', /\/v1\/expense-reports\/1001\/files\/download/);
  });

  test('시행일시 null 처리: eventStartAt/eventEndAt이 null이면 "- ~ -" 표시', async ({ page }) => {
    const items: ExpenseReportItem[] = [
      {
        id: 2,
        reportId: 1002,
        userId: 'cso002',
        companyName: '한미약품',
        reportType: 'SAMPLE_PROVIDE',
        productName: '아스피린',
        productCode: 'P-002',
        eventStartAt: null,
        eventEndAt: null,
        supportAmount: 0,
        status: 'PENDING',
      },
    ];

    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pageResponse(items)),
      });
    });

    await page.goto(`${BASE_URL_ADMIN}/expense-reports`);

    await expect(page.getByRole('cell', { name: '- ~ -' })).toBeVisible();
    // ExpenseReportStatusLabel['PENDING'] = '미진행' (backend-helper.ts)
    await expect(page.getByRole('cell', { name: '미진행' })).toBeVisible();
    // 0원 표기
    await expect(page.getByRole('cell', { name: '0원' })).toBeVisible();
  });

  test('에러 상태: 목록 API 실패 시 alertError 메시지 표시 + 빈 테이블 유지', async ({ page }) => {
    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    // alertError 는 useMpModal(MUI Dialog). await alertError(...) 가 해소돼야
    // 후속 setContents([]) 가 실행되어 '검색 결과가 없습니다.' 가 렌더됨.
    await page.goto(`${BASE_URL_ADMIN}/expense-reports`);
    await expectMpModal(page, '지출보고 목록을 불러오는 중 오류가 발생했습니다.');
    await acceptMpModal(page);
    await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
  });

  test('검색 제출: 검색어 입력 후 검색 버튼 클릭 시 URL 쿼리스트링에 반영', async ({ page }) => {
    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });

    await page.goto(`${BASE_URL_ADMIN}/expense-reports`);

    // searchType 기본값은 'companyName'이므로 별도 선택 없이 검색어만 입력
    await page.getByLabel('검색어').fill('화이자');
    await page.getByRole('button', { name: '검색' }).click();

    // setUrlParams는 기본값과 다른 필드만 URL에 포함
    await expect(page).toHaveURL(/searchKeyword=%ED%99%94%EC%9D%B4%EC%9E%90|searchKeyword=화이자/);
  });

  test('초기화 버튼: 검색 조건이 있는 상태에서 초기화 시 URL 파라미터 제거', async ({ page }) => {
    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });

    // 초기 URL에 검색 조건 포함
    await page.goto(`${BASE_URL_ADMIN}/expense-reports?searchKeyword=화이자&status=APPROVED`);

    // 초기화 클릭 — navigate('') 로 쿼리스트링 제거
    await page.getByRole('button', { name: '초기화' }).click();

    // URL이 /admin/expense-reports 로 정리되는지 확인 (쿼리 없음)
    await expect(page).toHaveURL(/\/admin\/expense-reports(\?)?$/);
  });

  test('Excel 다운로드 버튼: href가 /v1/expense-reports/excel 을 가리키고 target=_blank', async ({ page }) => {
    await page.route(api('/v1/expense-reports**'), async (route: Route) => {
      if (route.request().url().includes('/excel')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_PAGE),
      });
    });

    await page.goto(`${BASE_URL_ADMIN}/expense-reports`);

    // MUI <Button href target='_blank'> 는 <a role=link> 로 렌더
    const excelLink = page.getByRole('link', { name: 'Excel' });
    await expect(excelLink).toBeVisible();

    // 실제 backend helper 는 /v1/expense-reports/excel-download 경로 사용
    await expect(excelLink).toHaveAttribute('href', /\/v1\/expense-reports\/excel-download/);
    await expect(excelLink).toHaveAttribute('target', '_blank');
    // size=2^31-1 이 쿼리스트링에 포함되는지 확인
    await expect(excelLink).toHaveAttribute('href', /size=2147483647/);
  });
});

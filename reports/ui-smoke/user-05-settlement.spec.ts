/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/user/05_SETTLEMENT.md
 * 대상 컴포넌트:
 *   - src/pages-user/SettlementDrugCompany.tsx  (/settlement-drug-company)
 *   - src/pages-user/SettlementList.tsx         (/settlement-list)
 *   - src/pages-user/SalesStatistic.tsx         (/sales-statistic)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용:
 * 1. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 항목)
 * 2. 접근 권한: 로그인 + ContractMemberGuard (파트너 계약) 필요
 *    → storageState / beforeEach에서 인증 세팅 필요
 * 3. API mock 필요 (정산 API는 실데이터가 없으면 빈 상태)
 *    → page.route('**\/v1/settlements*', ...)로 응답 고정
 * 4. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만, 이후 재작성 필요
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

// TODO: 인증이 필요한 페이지이므로 실제 실행 전 storageState 로 세팅하거나
//       beforeEach에서 로그인 플로우를 수행해야 한다.
// 예시:
// test.use({ storageState: 'playwright/.auth/user.json' });

test.describe('user/05 SETTLEMENT — 정산 smoke', () => {
  test.describe('제약사별 정산내역 (/settlement-drug-company)', () => {
    test('페이지 진입 시 월 헤더 + 제약사명 검색 폼 렌더', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-drug-company`);

      // 월 네비게이션: 현재 월이 "YYYY년 MM월" 포맷으로 표시됨
      // TODO: verify selector — 날짜 기반이라 정규식으로 매칭
      await expect(page.getByText(/\d{4}년\s*\d{1,2}월/)).toBeVisible();

      // 검색 타입(Select)은 disabled 상태로 "제약사명"으로 고정
      await expect(page.getByText('제약사명')).toBeVisible();

      // 검색 입력 placeholder
      await expect(page.getByPlaceholder('제약사명을 검색하세요.')).toBeVisible();
    });

    test('월 이전/다음 화살표 클릭 시 URL 파라미터 settlementMonth 변경', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-drug-company`);

      // 이전 달 화살표 (KeyboardArrowLeft) — IconButton
      // TODO: verify selector — aria-label이 없을 수 있어 nth-of-type 가정
      const prevBtn = page.getByRole('button').filter({ has: page.locator('svg[data-testid="KeyboardArrowLeftIcon"]') }).first();
      await prevBtn.click();

      await expect(page).toHaveURL(/settlementMonth=\d{4}-\d{2}/);
    });

    test('검색어 입력 후 submit 시 searchKeyword URL 파라미터 반영', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-drug-company`);

      const input = page.getByPlaceholder('제약사명을 검색하세요.');
      await input.fill('한미약품');
      await input.press('Enter');

      await expect(page).toHaveURL(/searchKeyword=%ED%95%9C%EB%AF%B8%EC%95%BD%ED%92%88|searchKeyword=한미약품/);
    });

    test('정산 목록 테이블 컬럼 헤더 렌더 (제약사명/처방금액/수수료금액 등)', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-drug-company`);

      // 테이블 헤더 컬럼 — 메뉴 문서 3-4절 기준
      // TODO: verify selector — 첫 번째 "제약사명"은 Select label과 겹칠 수 있어 헤더 셀 범위로 좁힐 것
      await expect(page.locator('th, td').filter({ hasText: '제약사명' }).first()).toBeVisible();
      await expect(page.getByText('처방금액')).toBeVisible();
      await expect(page.getByText('수수료금액')).toBeVisible();
      await expect(page.getByText('합계금액').first()).toBeVisible();
    });
  });

  test.describe('딜러별 정산내역 (/settlement-list)', () => {
    test('페이지 진입 시 좌측 목록 + 우측 상세 placeholder 렌더', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-list`);

      // 좌측: 합계금액 라벨
      await expect(page.getByText(/합계금액/)).toBeVisible();

      // 우측: 딜러 미선택 시 안내 문구 (코드 line 471)
      await expect(page.getByText('내역을 확인하실 딜러를 선택해주세요.')).toBeVisible();
    });

    test('검색타입 Select에 제약사명/딜러명 선택지 존재', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-list`);

      // MUI Select 여는 방식이 버전에 따라 다름
      // TODO: verify selector — role=combobox 또는 role=button으로 접근
      const select = page.getByRole('combobox').first();
      await select.click();

      await expect(page.getByRole('option', { name: '제약사명' })).toBeVisible();
      await expect(page.getByRole('option', { name: '딜러명' })).toBeVisible();
    });

    test('딜러 미선택 상태로 정산요청 클릭 시 alert 발생', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-list`);

      // alert를 dialog 핸들러로 캡처 (코드 line 138-141)
      const alertPromise = new Promise<string>(resolve => {
        page.once('dialog', async dialog => {
          const msg = dialog.message();
          await dialog.accept();
          resolve(msg);
        });
      });

      await page.getByRole('button', { name: '정산요청' }).click();

      const msg = await alertPromise;
      expect(msg).toContain('정산요청할 딜러를 선택해주세요.');
    });

    test('파일다운로드 버튼이 /v1/settlements/export-zip URL을 새 탭으로 열도록 설정', async ({ page }) => {
      await page.goto(`${BASE_URL}/settlement-list`);

      // RouterLink의 to prop으로 /v1/settlements/export-zip URL 생성 (코드 line 263-272)
      // TODO: verify selector — role=link로 접근 가능한지 확인
      const downloadLink = page.getByRole('link', { name: '파일다운로드' });
      await expect(downloadLink).toHaveAttribute('href', /\/v1\/settlements\/export-zip/);
      await expect(downloadLink).toHaveAttribute('target', '_blank');
    });
  });

  test.describe('매출통계 (/sales-statistic)', () => {
    test('페이지 진입 시 전체매출/거래처매출 탭 버튼 렌더', async ({ page }) => {
      await page.goto(`${BASE_URL}/sales-statistic`);

      await expect(page.getByRole('link', { name: '전체매출' })).toBeVisible();
      await expect(page.getByRole('link', { name: '거래처매출' })).toBeVisible();
    });

    test('기간 미입력 상태에서 안내 메시지 렌더', async ({ page }) => {
      await page.goto(`${BASE_URL}/sales-statistic`);

      // TotalSalesStatistic 3단 분기 중 "기간 미입력" (코드 line 529-530)
      await expect(page.getByText('조회하고 싶은 기간을 입력해주세요.')).toBeVisible();
    });

    test('거래처매출 탭 클릭 시 ?tab=INDIVIDUAL 로 URL 변경', async ({ page }) => {
      await page.goto(`${BASE_URL}/sales-statistic`);

      await page.getByRole('link', { name: '거래처매출' }).click();

      await expect(page).toHaveURL(/\?tab=INDIVIDUAL/);
    });
  });
});

/**
 * ─────────────────────────────────────────────
 * 수동 검수 체크리스트
 * ─────────────────────────────────────────────
 * [ ] ContractMemberGuard 통과를 위한 로그인/계약 상태 세팅
 *     (미로그인 상태면 /auth/sign-in 으로 리다이렉트되어 전체 실패)
 * [ ] 월 네비게이션 IconButton의 aria-label/data-testid 확인
 * [ ] MUI Select 열기 방식 (role=combobox vs role=button) 버전별 검증
 * [ ] "정산요청" 미선택 alert: window.alert 기반 → dialog 이벤트 핸들러 타이밍 확인
 * [ ] 빈 상태/에러 상태는 page.route() mock 추가 후 별도 케이스로 확장
 * [ ] 한글 URL 인코딩 매칭 (searchKeyword=한미약품) — 인코딩/디코딩 둘 다 허용 정규식 사용 중
 */

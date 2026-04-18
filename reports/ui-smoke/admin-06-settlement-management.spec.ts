/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/06_SETTLEMENT_MANAGEMENT.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminSettlementMemberMonthlyList.tsx  (/admin/settlements-member-monthly)
 *   - src/pages-admin/MpAdminSettlementList.tsx               (/admin/settlements)
 *   - src/pages-admin/MpAdminSettlementDetail.tsx             (/admin/settlements/:settlementId)
 *   - src/pages-admin/MpAdminSettlementPartnerDetail.tsx      (/admin/settlements/:settlementId/partners/:settlementPartnerId)
 *   - src/pages-admin/MpAdminStatisticsList.tsx               (/admin/settlement-statistics)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용.
 *
 * 검수 체크리스트:
 * 1. Admin은 AdminGuard + 관리자 권한 필수 — beforeEach에 storageState 또는 세션 주입 필요
 *    (현재는 injectTestSession으로 localStorage mock만 설정. 쿠키 기반 세션이면 storageState로 교체)
 * 2. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 표시 항목)
 * 3. API mock은 _fixtures의 EMPTY_PAGE/pageResponse 재사용 — 필드 스키마는 backend.ts로 검증
 * 4. 한글 텍스트 매칭은 i18n 도입 전이라 안정적이지만 이후 재작성 필요
 * 5. MUI Select 열기/선택은 role=combobox → role=option 패턴 — 버전별로 역할 다를 수 있음
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

/**
 * 정산관리의 모든 GET API에 대한 기본 mock 설치.
 * 각 테스트는 이 위에 page.route()로 override 가능.
 */
async function installBaseMocks(page: Page): Promise<void> {
  // 제약사 목록 (MemberMonthlyList의 Select 옵션)
  await page.route(/\/v1\/drug-companies(\?|$)/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: '화이자' },
        { id: 2, name: '한미약품' },
      ]),
    });
  });

  // 총 처방금액 — SettlementList / StatisticsList 공유
  await page.route(/\/v1\/settlements\/total(\?|$)/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(0),
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

test.describe('admin/06 SETTLEMENT_MANAGEMENT — 정산관리 smoke', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await installBaseMocks(page);
  });

  // ───────────── 추가수수료 금액 (MemberMonthlyList) ─────────────
  test.describe('추가수수료 금액 (/admin/settlements-member-monthly)', () => {
    test('정상 로드: 제목/검색 필터/테이블 헤더 렌더', async ({ page }) => {
      await page.route(/\/v1\/settlements-member-monthly(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements-member-monthly`);

      await expect(page.getByRole('heading', { name: '회원별 정산' })).toBeVisible();
      // TODO: verify selector — 제약사명은 InputLabel, 정산월은 DatePicker label
      await expect(page.getByText('제약사명').first()).toBeVisible();
      await expect(page.getByText('정산월').first()).toBeVisible();

      // 테이블 헤더 컬럼
      await expect(page.getByRole('columnheader', { name: '추가수수료금액' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '공급가액' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '비고' })).toBeVisible();
    });

    test('빈 상태: API 0건 응답 시 "검색 결과가 없습니다." 표시', async ({ page }) => {
      await page.route(/\/v1\/settlements-member-monthly(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements-member-monthly`);
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('목록 렌더: 합계 금액 및 공급가액(합계/1.1 내림) 계산 확인', async ({ page }) => {
      // baseFee 90_000 + extraFee 20_000 = 110_000 → supply = floor(110000/1.1) = 99999 (JS float)
      await page.route(/\/v1\/settlements-member-monthly(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 101,
                drugCompanyName: '화이자',
                companyName: '테스트상사',
                settlementMonth: 202403,
                prescriptionAmount: 1_000_000,
                baseFeeAmount: 90_000,
                extraFeeAmount: 20_000,
                note: null,
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements-member-monthly`);

      // 정산월 포맷 변환: 202403 → "2024-03"
      await expect(page.getByRole('cell', { name: '2024-03' })).toBeVisible();
      // 공급가액 99,999 (JS float: 110000/1.1 = 99999.999...)
      await expect(page.getByRole('cell', { name: '99,999' }).first()).toBeVisible();
      // 합계 요약 영역 — 총 합계금액 110,000
      await expect(page.getByText(/총 합계금액:\s*110,000원/)).toBeVisible();
    });

    test('인라인 편집: 추가수수료 입력 시 debounce(500ms) 후 PUT 호출', async ({ page }) => {
      await page.route(/\/v1\/settlements-member-monthly(\?|$)/, async (route: Route) => {
        const method = route.request().method();
        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              pageResponse([
                {
                  id: 101,
                  drugCompanyName: '화이자',
                  companyName: '테스트상사',
                  settlementMonth: 202403,
                  prescriptionAmount: 1_000_000,
                  baseFeeAmount: 90_000,
                  extraFeeAmount: null,
                  note: null,
                },
              ]),
            ),
          });
          return;
        }
        await route.fallback();
      });

      // PUT 캡처
      let putCalled = false;
      let putBody: string | null = null;
      await page.route(/\/v1\/settlements-member-monthly\/101(\?|$)/, async (route: Route) => {
        if (route.request().method() === 'PUT') {
          putCalled = true;
          putBody = route.request().postData();
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 101, extraFeeAmount: 5000, note: null }),
          });
          return;
        }
        await route.fallback();
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements-member-monthly`);

      // 추가수수료 TextField (type=number, 행 내부) — 첫 행 첫 숫자 입력
      // TODO: verify selector — 행 범위를 좁히려면 getByRole('row')로 감싸는 것을 권장
      const extraFeeInput = page.locator('input[type="number"]').first();
      await extraFeeInput.fill('5000');

      // debounce 500ms + 네트워크 지연 감안
      await page.waitForTimeout(800);
      expect(putCalled).toBe(true);
      expect(putBody ?? '').toContain('"extraFeeAmount":5000');
    });
  });

  // ───────────── 정산내역 목록 (SettlementList) ─────────────
  test.describe('정산내역 (/admin/settlements)', () => {
    test('정상 로드: 제목 + 검색 필터 + 파일 업로드 버튼 노출', async ({ page }) => {
      await page.route(/\/v1\/settlements(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements`);

      await expect(page.getByRole('heading', { name: '정산내역' })).toBeVisible();
      // MUI <Button href target='_blank'> 는 role=link 로 렌더
      await expect(page.getByRole('link', { name: 'Excel' })).toBeVisible();
      await expect(page.getByRole('button', { name: '파일 업로드' })).toBeVisible();
      await expect(page.getByRole('button', { name: '검색' })).toBeVisible();
      await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
    });

    test('검색 필터: 딜러번호에 숫자가 아닌 값 입력 후 검색 시 alert', async ({ page }) => {
      await page.route(/\/v1\/settlements(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements`);

      // 검색유형을 "딜러번호"로 변경 — InputLabel 이 labelId 연결 안 됨 → FormControl 스코프 필요
      await page.locator('.MuiFormControl-root').filter({ hasText: '검색유형' }).locator('[role="combobox"]').click();
      await page.getByRole('option', { name: '딜러번호' }).click();

      // 검색어에 문자 입력
      await page.getByRole('textbox', { name: '검색어' }).fill('abc');

      await page.getByRole('button', { name: '검색' }).click();

      // alert 은 MpModal (MUI Dialog)
      await expectMpModal(page, /딜러번호는 숫자만/);
      await acceptMpModal(page);
    });

    test('목록 렌더: 딜러명 링크가 /admin/settlements/{id} 를 가리킴', async ({ page }) => {
      await page.route(/\/v1\/settlements(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                id: 7,
                dealerId: 100,
                dealerName: '홍길동딜러',
                companyName: '테스트상사',
                settlementMonth: '2024-03-01',
                prescriptionAmount: 1_000_000,
                supplyAmount: 900_000,
                taxAmount: 90_000,
                totalAmount: 990_000,
                status: 'REQUEST',
              },
            ]),
          ),
        });
      });
      // 총 처방금액은 baseMocks로 0 응답 유지

      await page.goto(`${BASE_URL_ADMIN}/settlements`);

      const dealerLink = page.getByRole('link', { name: '홍길동딜러' });
      await expect(dealerLink).toBeVisible();
      await expect(dealerLink).toHaveAttribute('href', /\/admin\/settlements\/7/);
      // SettlementStatusLabel['REQUEST'] = '정산요청'
      await expect(page.getByRole('cell', { name: '정산요청' })).toBeVisible();
    });

    test('에러 상태: 목록 API 실패 시 alertError 모달 메시지 표시', async ({ page }) => {
      await page.route(/\/v1\/settlements(\?|$)/, async (route: Route) => {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      });

      // alertError 는 useMpModal (MUI Dialog)
      await page.goto(`${BASE_URL_ADMIN}/settlements`);
      await expectMpModal(page, '정산내역 목록을 불러오는 중 오류가 발생했습니다.');
      await acceptMpModal(page);
    });

    test('파일 업로드 버튼 클릭 시 업로드 모달 오픈', async ({ page }) => {
      await page.route(/\/v1\/settlements(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements`);
      await page.getByRole('button', { name: '파일 업로드' }).click();

      // MpSettlementUploadModal — react-dropzone 기반
      // TODO: verify selector — 모달 내부 텍스트/role은 MpSettlementUploadModal.tsx 검수 필요
      await expect(page.getByRole('dialog')).toBeVisible();
    });
  });

  // ───────────── 정산상세 (SettlementDetail) ─────────────
  test.describe('정산상세 (/admin/settlements/:settlementId)', () => {
    test('거래처 요약 렌더 + 거래처명 링크가 partners/:id 경로를 가리킴', async ({ page }) => {
      // getSettlementPartnerSummary → GET /v1/settlements/partners?settlementId=42
      await page.route(/\/v1\/settlements\/partners(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            pageResponse([
              {
                settlementPartnerId: 999,
                institutionName: '서울의원',
                businessNumber: '1234567890',
                institutionCode: 'H001',
                prescriptionAmount: 500_000,
                companyName: '테스트상사',
                dealerName: '홍길동딜러',
                supplyAmount: 450_000,
                taxAmount: 45_000,
                totalAmount: 495_000,
              },
            ]),
          ),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements/42`);

      // 뒤로가기 IconButton(RouterLink) — logout 제외하고 href 로 직접 매칭
      await expect(page.locator('main a[href="/admin/settlements"]').first()).toBeVisible();

      // 거래처명 링크 → /admin/settlements/42/partners/999
      const partnerLink = page.getByRole('link', { name: '서울의원' });
      await expect(partnerLink).toBeVisible();
      await expect(partnerLink).toHaveAttribute('href', /\/admin\/settlements\/42\/partners\/999/);

      // 사업자등록번호 포맷: "1234567890" → "123-45-67890"
      await expect(page.getByText('123-45-67890')).toBeVisible();
    });
  });

  // ───────────── 거래처별 제품상세 (PartnerDetail) ─────────────
  test.describe('거래처별 제품상세 (/admin/settlements/:settlementId/partners/:settlementPartnerId)', () => {
    test('Promise.all 3개 API 성공 시 정산/거래처/제품 정보 렌더', async ({ page }) => {
      await page.route(/\/v1\/settlements\/42(\?|$)/, async (route: Route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 42,
            dealerName: '홍길동딜러',
            settlementMonth: '2024-03-01',
          }),
        });
      });
      // getSettlementPartnerProducts → GET /v1/settlements/partners/999/products
      await page.route(/\/v1\/settlements\/partners\/999\/products(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 1, productName: '타이레놀', prescriptionAmount: 250_000, feeRate: 0.125 },
            { id: 2, productName: '아스피린', prescriptionAmount: 250_000, feeRate: null },
          ]),
        });
      });
      // getSettlementPartner → GET /v1/settlements/partners/999 (regex excludes /products)
      await page.route(/\/v1\/settlements\/partners\/999(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 999,
            institutionName: '서울의원',
            businessNumber: '1234567890',
            dealerName: '홍길동딜러',
            institutionCode: 'H001',
          }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements/42/partners/999`);

      // 거래처명 = TextField label='거래처명' value='서울의원' (controlled readOnly input)
      await expect(page.getByLabel('거래처명')).toHaveValue('서울의원');
      // 제품명은 테이블 plain text 셀
      await expect(page.getByText('타이레놀')).toBeVisible();
      await expect(page.getByText('아스피린')).toBeVisible();

      // 처방금액 합계 = 250000 + 250000 = 500000 → TextField(readOnly)
      await expect(page.getByLabel('처방금액')).toHaveValue('500,000');
    });

    test('잘못된 파라미터: settlementPartnerId가 NaN이면 alert 후 목록으로 이동', async ({ page }) => {
      // settlementId는 유효, partnerId는 abc (NaN)
      await page.route(/\/v1\/settlements\/42(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 42, settlementMonth: '2024-03-01' }),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlements/42/partners/abc`);

      // alertError 는 MpModal — 확인 눌러야 navigate 실행됨
      await expectMpModal(page, /잘못된 접근/);
      await acceptMpModal(page);

      // 목록(/admin/settlements)로 navigate 되는지 확인
      await expect(page).toHaveURL(/\/admin\/settlements(\?|$)/);
    });
  });

  // ───────────── 실적통계 (StatisticsList) ─────────────
  test.describe('실적통계 (/admin/settlement-statistics)', () => {
    test('정상 로드: 제목 + 빈 상태 메시지 + Excel 버튼', async ({ page }) => {
      await page.route(/\/v1\/settlements\/performance(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlement-statistics`);

      await expect(page.getByRole('heading', { name: '실적통계' })).toBeVisible();
      // <Button href> → role=link
      await expect(page.getByRole('link', { name: 'Excel' })).toBeVisible();
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('검색유형 미선택 상태로 검색어 입력 후 검색 시 alert', async ({ page }) => {
      await page.route(/\/v1\/settlements\/performance(\?|$)/, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(EMPTY_PAGE),
        });
      });

      await page.goto(`${BASE_URL_ADMIN}/settlement-statistics`);

      await page.getByRole('textbox', { name: '검색어' }).fill('한미');

      await page.getByRole('button', { name: '검색' }).click();
      // alert 은 MpModal
      await expectMpModal(page, /검색유형을 선택/);
      await acceptMpModal(page);
    });
  });
});

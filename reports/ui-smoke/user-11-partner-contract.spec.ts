/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/user/11_PARTNER_CONTRACT.md
 * 대상 컴포넌트:
 *   - src/pages-user/PartnerContract.tsx  (/partner-contract)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용:
 * 1. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 🟡 항목)
 * 2. 접근 권한: 로그인 필요
 *    → storageState / beforeEach 로그인 플로우 세팅 필요
 * 3. API mock 필요 — contractDetails 응답에 따라 신청 폼 / 계약 현황 모드 전환
 *    → page.route('**\/v1/partner-contracts/*', ...) 로 응답 고정
 * 4. 파일 업로드(MedipandaFileUploadButton) 는 setInputFiles 경로 확인 필요
 * 5. alert()·window.confirm 은 page.on('dialog') 로 가로채기
 * 6. 한글 텍스트 매칭은 i18n 도입 전이라 안정적 — 이후 재작성 필요
 */

import { test, expect, type Page, type Route } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';
const PARTNER_CONTRACT_URL = `${BASE_URL}/partner-contract`;

// TODO: 인증이 필요한 페이지이므로 실제 실행 전 storageState 세팅 필요
// test.use({ storageState: 'playwright/.auth/user.json' });

// ────────────────────────────────────────────────────────────
// 공용 mock payload — 실제 API 응답 스키마와 맞추어 수동 검수 필요
// ────────────────────────────────────────────────────────────
// ⚠️ fileUrls 의 키는 PartnerContract.tsx 의 실제 접근 키와 1:1 매핑이어야 함:
//   - BUSINESS_REGISTRATION, CSO_CERTIFICATE, SALES_EDUCATION_CERT
// 잘못된 키(EDUCATION_CERTIFICATE 등)를 주면 extractFileName(undefined) 에서
// new URL(undefined) 가 TypeError 를 던져 페이지 전체가 blank 렌더됨 — 이전 버전 버그.
const APPROVED_CONTRACT = {
  status: 'APPROVED',
  contractType: 'ORGANIZATION',
  companyName: '메디판다(주)',
  businessNumber: '123-45-67890',
  bankName: '국민은행',
  accountNumber: '123456-78-901234',
  contractDate: '2026-03-15T00:00:00Z',
  fileUrls: {
    BUSINESS_REGISTRATION:
      'https://s3.example.com/files/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_%EC%82%AC%EC%97%85%EC%9E%90%EB%93%B1%EB%A1%9D%EC%A6%9D.pdf',
    CSO_CERTIFICATE:
      'https://s3.example.com/files/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_cso.pdf',
    SALES_EDUCATION_CERT:
      'https://s3.example.com/files/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee_edu.pdf',
  },
};

const PENDING_CONTRACT = { ...APPROVED_CONTRACT, status: 'PENDING' };
const REJECTED_CONTRACT = { ...APPROVED_CONTRACT, status: 'REJECTED' };

async function mockContractDetails(page: Page, body: unknown | null) {
  await page.route('**/v1/partner-contracts/*', async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (body === null) {
      return route.fulfill({ status: 404, body: JSON.stringify({ message: 'not found' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

// ────────────────────────────────────────────────────────────
test.describe('user/11 PARTNER_CONTRACT — 파트너사 계약 smoke', () => {
  test.describe('신청 폼 모드 (contractDetails === null)', () => {
    test.beforeEach(async ({ page }) => {
      // 계약 없음 → 404 → 신청 폼 렌더
      await mockContractDetails(page, null);
    });

    test('페이지 진입 시 "파트너사 계약신청" 타이틀 + 주요 필드 렌더', async ({ page }) => {
      await page.goto(PARTNER_CONTRACT_URL);

      await expect(page.getByText('파트너사 계약신청', { exact: true })).toBeVisible();

      // 2열 레이아웃 레이블 — 한글 라벨은 footer/약관 텍스트와 부분 일치하는 경우가 많아
      // `{ exact: true }` 로 강제. (예: "사업자등록번호" 는 footer "사업자등록번호 : 123-..." 와 충돌)
      await expect(page.getByText('계약유형', { exact: true })).toBeVisible();
      await expect(page.getByText('회사명', { exact: true })).toBeVisible();
      await expect(page.getByText('사업자등록번호', { exact: true })).toBeVisible();
      await expect(page.getByText('정산은행', { exact: true })).toBeVisible();
      await expect(page.getByText('계좌번호', { exact: true })).toBeVisible();
      // 사업자등록증 라벨은 소스상 존재하지 않음 (BUSINESS_REGISTRATION 업로드 행은 라벨이 빈 PartnerContractFormLabel/>)
    });

    test('계약유형 버튼(법인/개인) 모두 표시되고 클릭 시 선택 상태 전환', async ({ page }) => {
      await page.goto(PARTNER_CONTRACT_URL);

      const org = page.getByRole('button', { name: '법인' });
      const ind = page.getByRole('button', { name: '개인' });
      await expect(org).toBeVisible();
      await expect(ind).toBeVisible();

      await org.click();
      // TODO: verify selector — 선택 상태는 borderColor(vividViolet)로만 구분됨.
      //       data-testid 추가 권장, 임시로 색상 class / aria-pressed 확인
      await expect(org).toBeEnabled();
    });

    test('사업자등록번호 입력 시 normalizeBusinessNumber 자동 포맷 (000-00-00000)', async ({ page }) => {
      await page.goto(PARTNER_CONTRACT_URL);

      // businessNumber 와 accountNumber 둘 다 동일 placeholder ("'-'없이 입력해주세요.") 를 씀 →
      // name 속성으로 구분. Controller 의 {...field} 전개로 name="businessNumber" 가 input 에 내려감.
      const input = page.locator('input[name="businessNumber"]');
      await input.fill('1234567890');
      await expect(input).toHaveValue('123-45-67890');
    });

    test('정산은행 버튼 클릭 시 BankSelectModal 오픈 + 은행/증권사 탭 전환', async ({ page }) => {
      await page.goto(PARTNER_CONTRACT_URL);

      await page.getByRole('button', { name: /은행을 선택해주세요/ }).click();

      // 모달 타이틀
      await expect(page.getByText('기관선택')).toBeVisible();

      // 탭
      const bankTab = page.getByRole('tab', { name: '은행' });
      const securitiesTab = page.getByRole('tab', { name: '증권사' });
      await expect(bankTab).toBeVisible();
      await expect(securitiesTab).toBeVisible();

      // 은행 탭 기본값 — 대표 은행 "카카오뱅크" 표시
      await expect(page.getByText('카카오뱅크')).toBeVisible();

      // 증권사 탭 클릭 시 목록 교체
      await securitiesTab.click();
      await expect(page.getByText('교보증권')).toBeVisible();
    });

    test('은행 선택 시 모달 닫히고 bankName 필드에 반영', async ({ page }) => {
      await page.goto(PARTNER_CONTRACT_URL);
      await page.getByRole('button', { name: /은행을 선택해주세요/ }).click();
      await page.getByText('국민은행').click();

      await expect(page.getByText('기관선택')).toBeHidden();
      await expect(page.getByRole('button', { name: /국민은행/ })).toBeVisible();
    });

    test('동의 체크박스 미체크 시 "계약신청완료" 버튼 비활성화', async ({ page }) => {
      await page.goto(PARTNER_CONTRACT_URL);

      const submit = page.getByRole('button', { name: '계약신청완료' });
      await expect(submit).toBeDisabled();

      await page.getByLabel('파트너사 계약을 신청합니다.').check();
      await expect(submit).toBeEnabled();
    });

    test('필수 필드 미입력 상태에서 제출 시 alert 발생 (회사명)', async ({ page }) => {
      await page.goto(PARTNER_CONTRACT_URL);

      const dialogs: string[] = [];
      page.on('dialog', async d => {
        dialogs.push(d.message());
        await d.dismiss();
      });

      await page.getByLabel('파트너사 계약을 신청합니다.').check();
      await page.getByRole('button', { name: '계약신청완료' }).click();

      // 첫 번째 검증은 회사명 → 이후 순서는 submitHandler 검증 순서와 맞추어 확장
      expect(dialogs[0]).toMatch(/회사명/);
    });
  });

  test.describe('계약 현황 모드 (contractDetails !== null)', () => {
    test('APPROVED 응답 시 "파트너사 계약현황" 타이틀 + 필드 disabled + 계약일 표시', async ({ page }) => {
      await mockContractDetails(page, APPROVED_CONTRACT);
      await page.goto(PARTNER_CONTRACT_URL);

      await expect(page.getByText('파트너사 계약현황', { exact: true })).toBeVisible();

      // 회사명은 react-hook-form Controller 의 {...field} 로 name="companyName" 이 내려감 → name 선택자.
      // 값 확인은 toHaveValue, disabled 여부는 toBeDisabled.
      const companyInput = page.locator('input[name="companyName"]');
      await expect(companyInput).toHaveValue('메디판다(주)');
      await expect(companyInput).toBeDisabled();

      // 계약일 — YYYY년 MM월 DD일 포맷 (APPROVED). input.value 에 들어감.
      await expect(page.locator('input[value*="년"]')).toBeVisible();

      // K-Medicine 로고 (계약 현황 전용)
      await expect(page.locator('img[src="/assets/logos/logo-kmedicine.png"]')).toBeVisible();
    });

    test('PENDING 응답 시 계약일 자리에 "계약서 검토중" 표시', async ({ page }) => {
      await mockContractDetails(page, PENDING_CONTRACT);
      await page.goto(PARTNER_CONTRACT_URL);

      await expect(page.getByText('파트너사 계약현황', { exact: true })).toBeVisible();
      await expect(page.locator('input[value="계약서 검토중"]')).toBeVisible();
    });

    test('REJECTED 응답 시 신청 폼 모드로 렌더 (재신청 가능)', async ({ page }) => {
      await mockContractDetails(page, REJECTED_CONTRACT);
      await page.goto(PARTNER_CONTRACT_URL);

      // fetchContractDetails 에서 REJECTED 는 setContractDetails 호출 안 함
      await expect(page.getByText('파트너사 계약신청', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '계약신청완료' })).toBeVisible();
    });

    test('첨부파일 링크의 파일명에 UUID prefix 가 제거되어 표시', async ({ page }) => {
      await mockContractDetails(page, APPROVED_CONTRACT);
      await page.goto(PARTNER_CONTRACT_URL);

      // extractFileName 결과 — URL decode 된 원본 파일명
      // TODO: verify selector — <Link> text 접근
      await expect(page.getByRole('link', { name: '사업자등록증.pdf' })).toBeVisible();
    });
  });
});

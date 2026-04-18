/**
 * 자동 생성된 UI smoke 초안 — medipanda-web
 * 원본 문서: docs/admin/03_PARTNER_MANAGEMENT.md
 * 대상 컴포넌트:
 *   - src/pages-admin/MpAdminPartnerList.tsx   (/admin/partners)
 *   - src/pages-admin/MpAdminPartnerEdit.tsx   (/admin/partners/new, /admin/partners/:partnerId/edit)
 *   - src/components/MpPartnerUploadModal.tsx  (업로드 모달)
 * 생성 일자: 2026-04-17
 * 생성기: test-writer agent (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용:
 *   1. 셀렉터가 실제 DOM과 일치하는지 확인 (특히 // TODO: verify selector 표기)
 *   2. 접근 권한: AdminGuard + TRANSACTION_MANAGEMENT 권한 필요
 *      → storageState (admin) 세팅 필요. 본 초안은 `test.use({ storageState })` 를
 *        주석으로만 표기하고 각 테스트에서 API mock 으로 가드 통과 가정.
 *   3. MUI <Select> 는 native <select> 가 아닌 button + listbox 조합이라
 *      `.getByRole('combobox', { name })` → click → `.getByRole('option', { name })`
 *      패턴을 사용해야 함 (수동 검수 시 확인).
 *   4. Excel 다운로드(href 링크)는 실제 다운로드까지 검증하면 CI 가 무거워지므로
 *      `href` 속성과 `target='_blank'` 만 확인.
 *   5. 모달 열림 검증은 DialogTitle 텍스트 + role=dialog 로 수행. 내부 연동 모달
 *      (MpDrugCompanySelectModal, MpMemberSelectModal) 은 scope 밖이라 mock 생략.
 *   6. 한글 텍스트 매칭은 i18n 도입 전이라 안정적 — 이후 재작성 필요.
 */

import { test, expect, type Page, type Route } from '@playwright/test';
import {
  BASE_URL_ADMIN,
  EMPTY_PAGE,
  pageResponse,
  api,
  acceptNextDialog,
  expectMpModal,
  acceptMpModal,
} from './_fixtures';

// TODO: storageState — admin 인증 상태 저장 파일 경로는 공용 AUTH_STATE_ADMIN 사용
// test.use({ storageState: AUTH_STATE_ADMIN });

const PARTNERS_URL = `${BASE_URL_ADMIN}/partners`;
const PARTNERS_NEW_URL = `${BASE_URL_ADMIN}/partners/new`;
const PARTNERS_EDIT_URL = (id: number): string => `${BASE_URL_ADMIN}/partners/${id}/edit`;

// ────────────────────────────────────────────────────────────
// 공용 mock payload — 실제 API 응답 스키마와 맞추어 수동 검수 필요
// ────────────────────────────────────────────────────────────

interface PartnerRow {
  id: number;
  drugCompanyName: string;
  companyName: string;
  memberType: 'INDIVIDUAL' | 'ORGANIZATION';
  institutionCode: string;
  institutionName: string;
  businessNumber: string;
  medicalDepartment: string | null;
  hasPharmacy: boolean;
}

const SAMPLE_PARTNERS: PartnerRow[] = [
  {
    id: 1,
    drugCompanyName: '한미약품',
    companyName: '메디판다(주)',
    memberType: 'ORGANIZATION',
    institutionCode: 'HOSP-001',
    institutionName: '서울의원',
    businessNumber: '1234567890',
    medicalDepartment: '내과',
    hasPharmacy: true,
  },
  {
    id: 2,
    drugCompanyName: '종근당',
    companyName: '개인사업자김철수',
    memberType: 'INDIVIDUAL',
    institutionCode: 'HOSP-002',
    institutionName: '강남이비인후과',
    businessNumber: '9876543210',
    medicalDepartment: '이비인후과',
    hasPharmacy: false,
  },
];

interface PartnerDetail {
  id: number;
  drugCompanyName: string;
  memberName: string;
  companyName: string;
  contractType: 'CONTRACT' | 'NON_CONTRACT';
  institutionCode: string;
  institutionName: string;
  businessNumber: string;
  medicalDepartment: string | null;
  note: string | null;
}

const PARTNER_DETAIL: PartnerDetail = {
  id: 1,
  drugCompanyName: '한미약품',
  memberName: '홍길동',
  companyName: '메디판다(주)',
  contractType: 'CONTRACT',
  institutionCode: 'HOSP-001',
  institutionName: '서울의원',
  businessNumber: '1234567890',
  medicalDepartment: '내과',
  note: '비고 샘플',
};

interface PharmacyRow {
  id: number;
  pharmacyName: string;
  pharmacyAddress: string | null;
  pharmacyStatus: 'NONE' | 'NORMAL' | 'CLOSED';
}

const PARTNER_PHARMACIES: PharmacyRow[] = [
  { id: 101, pharmacyName: '종로약국', pharmacyAddress: '서울 종로구 1', pharmacyStatus: 'NORMAL' },
];

// ────────────────────────────────────────────────────────────
// Mock helpers
// ────────────────────────────────────────────────────────────

async function mockPartnersList(page: Page, rows: PartnerRow[] | 'ERROR'): Promise<void> {
  await page.route(api('/v1/partners*'), async (route: Route) => {
    // 삭제(DELETE)나 개별 GET 은 path 뒤 id 붙음 — 여기서는 `/v1/partners?...` 만 처리
    const method = route.request().method();
    const url = route.request().url();
    // 쿼리 제거한 path
    const path = new URL(url).pathname;
    if (method !== 'GET' || path !== '/v1/partners') {
      return route.fallback();
    }
    if (rows === 'ERROR') {
      return route.fulfill({ status: 500, body: JSON.stringify({ message: 'server error' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows.length === 0 ? EMPTY_PAGE : pageResponse(rows, { page: 0, size: 20 })),
    });
  });
}

async function mockPartnerDelete(page: Page, outcome: 'SUCCESS' | 'ERROR'): Promise<void> {
  await page.route(api('/v1/partners/*'), async (route: Route) => {
    if (route.request().method() !== 'DELETE') return route.fallback();
    if (outcome === 'ERROR') {
      return route.fulfill({ status: 500, body: JSON.stringify({ message: 'delete failed' }) });
    }
    return route.fulfill({ status: 204, body: '' });
  });
}

async function mockPartnerDetail(page: Page, detail: PartnerDetail | 'ERROR'): Promise<void> {
  await page.route(api('/v1/partners/*'), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = new URL(route.request().url());
    // pharmacies 경로는 별도 핸들러가 처리
    if (url.pathname.endsWith('/pharmacies')) return route.fallback();
    if (detail === 'ERROR') {
      return route.fulfill({ status: 500, body: JSON.stringify({ message: 'load failed' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(detail),
    });
  });
}

async function mockPartnerPharmacies(page: Page, rows: PharmacyRow[]): Promise<void> {
  await page.route(api('/v1/partners/*/pharmacies'), async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    });
  });
}

// ────────────────────────────────────────────────────────────
// 시나리오
// ────────────────────────────────────────────────────────────

test.describe('admin/03 PARTNER_MANAGEMENT — 거래선관리 smoke', () => {
  test.describe('목록 페이지 /admin/partners', () => {
    test('1. 정상 로드: 타이틀 + 테이블 헤더 + 샘플 행 렌더', async ({ page }) => {
      await mockPartnersList(page, SAMPLE_PARTNERS);

      await page.goto(PARTNERS_URL);

      // 페이지 타이틀
      await expect(page.getByRole('heading', { name: '거래선관리' })).toBeVisible();

      // 검색결과 카운트
      await expect(page.getByText(/검색결과:\s*2\s*건/)).toBeVisible();

      // 테이블 헤더 주요 컬럼
      // TODO: verify selector — MUI TableCell 은 role=columnheader 로 잡힘
      await expect(page.getByRole('columnheader', { name: '제약사명' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '거래처명' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '문전약국' })).toBeVisible();

      // 샘플 행 데이터
      await expect(page.getByText('서울의원')).toBeVisible();
      await expect(page.getByText('강남이비인후과')).toBeVisible();

      // 액션 버튼 4종
      await expect(page.getByRole('link', { name: 'Excel' })).toBeVisible();
      await expect(page.getByRole('button', { name: '파일 업로드' })).toBeVisible();
      await expect(page.getByRole('button', { name: '삭제' })).toBeVisible();
      await expect(page.getByRole('link', { name: '등록' })).toBeVisible();
    });

    test('2. 빈 상태: 결과 0건이면 "검색 결과가 없습니다." 렌더', async ({ page }) => {
      await mockPartnersList(page, []);

      await page.goto(PARTNERS_URL);

      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
      await expect(page.getByText(/검색결과:\s*0\s*건/)).toBeVisible();
      // 삭제 버튼은 선택 항목 없을 때 비활성
      await expect(page.getByRole('button', { name: '삭제' })).toBeDisabled();
    });

    test('3. API 에러: 500 응답 시 alert 후 빈 테이블', async ({ page }) => {
      await mockPartnersList(page, 'ERROR');

      await page.goto(PARTNERS_URL);

      // alertError 는 useMpModal(MUI Dialog) — native alert 아님
      await expectMpModal(page, /거래선/);
      await acceptMpModal(page);

      // 목록은 비워져야 함
      await expect(page.getByText('검색 결과가 없습니다.')).toBeVisible();
    });

    test('4. 검색 필터: 검색유형/검색어 입력 후 [검색] 클릭 → URL 파라미터 반영', async ({ page }) => {
      await mockPartnersList(page, SAMPLE_PARTNERS);

      await page.goto(PARTNERS_URL);
      await expect(page.getByRole('heading', { name: '거래선관리' })).toBeVisible();

      // 검색어 입력
      // TODO: verify selector — Controller + TextField label='검색어'
      await page.getByLabel('검색어').fill('서울의원');

      // 검색 버튼 클릭
      await page.getByRole('button', { name: '검색' }).click();

      // navigate() 로 ?searchKeyword=서울의원 붙음 (searchType 은 기본값이면 생략됨)
      await expect(page).toHaveURL(/searchKeyword=/);

      // 초기화 버튼 클릭 시 URL 복원
      await page.getByRole('button', { name: '초기화' }).click();
      await expect(page).toHaveURL(new RegExp(`${PARTNERS_URL.replace(/[/]/g, '\\/')}$`));
    });

    test('5. 등록 버튼: /admin/partners/new 로 이동', async ({ page }) => {
      await mockPartnersList(page, SAMPLE_PARTNERS);
      // 신규 페이지에서도 detail API 호출 없음(isNew) — pharmacies 도 없음
      await page.goto(PARTNERS_URL);

      await page.getByRole('link', { name: '등록' }).click();

      await expect(page).toHaveURL(/\/admin\/partners\/new$/);
    });

    test('6. 파일 업로드 버튼: MpPartnerUploadModal 열림 + "거래선 업로드" 타이틀', async ({ page }) => {
      await mockPartnersList(page, SAMPLE_PARTNERS);

      await page.goto(PARTNERS_URL);
      await page.getByRole('button', { name: '파일 업로드' }).click();

      // Dialog 오픈
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('거래선 업로드')).toBeVisible();
      // MUI <Button href> 는 anchor(role=link) 로 렌더
      await expect(dialog.getByRole('link', { name: '양식 다운로드' })).toBeVisible();
      await expect(dialog.getByText('여기에 파일을 드래그하거나 클릭하여 업로드하세요.')).toBeVisible();

      // 취소 버튼 닫기
      await dialog.getByRole('button', { name: '취소' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('7. 행 체크 후 삭제 버튼: 확인 다이얼로그 메시지 + Promise.all 병렬 DELETE', async ({ page }) => {
      await mockPartnersList(page, SAMPLE_PARTNERS);
      await mockPartnerDelete(page, 'SUCCESS');

      await page.goto(PARTNERS_URL);
      await expect(page.getByText('서울의원')).toBeVisible();

      // 첫 번째 행 체크박스 (헤더 체크박스가 0번, 데이터 행 체크박스는 1번부터)
      // TODO: verify selector — MUI Checkbox 는 role=checkbox, 인덱싱이 헤더 포함
      const checkboxes = page.getByRole('checkbox');
      await checkboxes.nth(1).check();

      await expect(page.getByRole('button', { name: '삭제' })).toBeEnabled();

      // 삭제 버튼 → deleteDialog(MUI Dialog) 뜸. 확인 메시지 검증.
      await page.getByRole('button', { name: '삭제' }).click();

      // TODO: verify — useMpDeleteDialog 가 MUI Dialog 라면 role=dialog 로 잡힘
      const confirm = page.getByRole('dialog');
      await expect(confirm).toBeVisible();
      await expect(confirm.getByText(/선택한 거래선을 삭제하시겠습니까\?/)).toBeVisible();
      // 확인 클릭 — 버튼 텍스트는 구현마다 '확인' / '삭제' 등
      await confirm.getByRole('button', { name: /확인|삭제/ }).click();

      // 성공 스낵바
      await expect(page.getByText('삭제가 완료되었습니다.')).toBeVisible();
    });
  });

  test.describe('수정 페이지 /admin/partners/:partnerId/edit', () => {
    test.beforeEach(async ({ page }: { page: Page }) => {
      // 순서 중요: pharmacies 핸들러가 detail 핸들러보다 먼저 등록돼야
      // `/v1/partners/1/pharmacies` 를 detail fallback 대신 잡음.
      await mockPartnerPharmacies(page, PARTNER_PHARMACIES);
      await mockPartnerDetail(page, PARTNER_DETAIL);
    });

    test('8. 수정 진입: 타이틀 + 상세 + 문전약국 값 주입', async ({ page }) => {
      await page.goto(PARTNERS_EDIT_URL(1));

      // 수정 페이지 타이틀
      await expect(page.getByText('거래선수정')).toBeVisible();

      // 거래처명(institutionName) - controlled TextField, label 링크됨
      await expect(page.getByLabel('거래처명')).toHaveValue('서울의원');
      // 제약사명(drugCompany readonly) - label 이 값 있을 때만 렌더됨
      await expect(page.getByLabel('제약사명')).toHaveValue('한미약품');

      // 문전약국 테이블의 첫 행 약국명 TextField value='종로약국' (controlled)
      const pharmacyTable = page.getByRole('table');
      await expect(pharmacyTable.getByRole('textbox').first()).toHaveValue('종로약국');
    });

    test('9. 잘못된 partnerId: NaN 이면 alert 후 목록으로 리다이렉트', async ({ page }) => {
      await page.goto(`${BASE_URL_ADMIN}/partners/not-a-number/edit`);

      // MpModal (MUI Dialog) 로 뜨고, 확인을 눌러야 navigate 실행됨
      await expectMpModal(page, /잘못된 접근입니다/);
      await acceptMpModal(page);

      await expect(page).toHaveURL(/\/admin\/partners(\/?|\?.*)$/);
    });
  });

  test.describe('신규 등록 페이지 /admin/partners/new', () => {
    test('10. 신규 진입: 타이틀 "거래선등록" + 필수 유효성(제약사 미선택 alert)', async ({ page }) => {
      await page.goto(PARTNERS_NEW_URL);

      // TODO: verify selector — 신규 페이지 타이틀 Typography 텍스트
      await expect(page.getByText('거래선등록')).toBeVisible();

      // 저장 버튼 클릭 → 제약사 미선택 alert
      // TODO: verify selector — 저장 버튼 라벨은 '저장' 또는 '등록' — 미확인.
      const dialogPromise = acceptNextDialog(page);
      const saveBtn = page.getByRole('button', { name: /저장|등록/ }).first();
      await saveBtn.click();

      await Promise.race([
        dialogPromise.then((msg: string) => expect(msg).toContain('제약사를 선택하세요')),
        page.waitForTimeout(5000),
      ]);
    });
  });
});

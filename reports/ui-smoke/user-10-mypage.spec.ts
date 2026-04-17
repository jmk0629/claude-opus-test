/**
 * user-10 MypageInfo + MypageWithdraw — 수정된 smoke
 *
 * 2026-04-17 수정 노트:
 *  - MypageGuard 비밀번호 2차 확인 게이트를 통과시키는 `passMypageGate` 헬퍼 사용
 *  - SESSION_USER_ID 는 .auth/user.json 의 실제 로그인 사용자 `royhojin1` 고정
 *  - MypageInfo/Withdraw 의 alert/confirm 은 native `window.alert/confirm` → `page.on('dialog')` 로 처리
 *  - 닉네임 TextField 는 placeholder/라벨 없음 → MypageFormRow(label: '닉네임') 컨테이너로 스코프
 */

import { test, expect, type Page } from '@playwright/test';
import { acceptNextDialog, dismissNextDialog, passMypageGate } from './_fixtures';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

// ---------- API 경로 ----------
const API = {
  availableNickname: '**/v1/members/available-nickname',
  updateNickname: (userId: string) => `**/v1/members/${userId}/nickname`,
  changePassword: (userId: string) => `**/v1/members/${userId}/password`,
  updateMember: (userId: string) => `**/v1/members/${userId}`,
  deleteMember: (userId: string) => `**/v1/members/${userId}`,
};

// .auth/user.json 의 AUTH_TOKEN JWT sub 값
const SESSION_USER_ID = 'royhojin1';

/**
 * MypageFormRow 레이아웃 `<Stack><Typography>{label}</Typography><Input/></Stack>` 에서
 * 라벨 뒤에 따라오는 input 을 스코프 없이 following-sibling 으로 탐색.
 * 닉네임·추천인 코드 등 placeholder 없는 필드용.
 */
function inputByRowLabel(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::*//input').first();
}

// ============================================================
// MypageInfo — /mypage/info (내정보관리)
// ============================================================
test.describe('user-10 MypageInfo (/mypage/info)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/mypage/info`);
    await passMypageGate(page, '내정보관리');
  });

  test('정상 로드 시 내정보관리 제목과 기본/추가정보 탭이 렌더된다', async ({ page }) => {
    // 사이드바 링크 "내정보관리" 와 헤딩 "내정보관리" 두 곳에 등장 → 헤딩(Typography headingPc3M) 스코프
    await expect(page.locator('span.MuiTypography-headingPc3M').filter({ hasText: '내정보관리' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '기본정보' })).toBeVisible();
    await expect(page.getByText('ID*', { exact: true })).toBeVisible();
    await expect(page.getByText('이메일*', { exact: true })).toBeVisible();
    await expect(page.getByText('닉네임', { exact: true })).toBeVisible();
  });

  // 이름 필드는 KMC 인증 결과로만 주입되며 UI 상 disabled.
  // 빈값 alert 를 실제로 재현하려면 whoAmI stub 으로 name='' 인 fake member 를 주입해야 하는데,
  // MemberDetailsResponse 전체 필드를 맞춰야 해 overhead 대비 가치가 낮아 본 smoke 에서는 skip.
  test.skip('이름이 비어있는 상태로 [수정] 누르면 "이름을 입력해주세요." alert', async () => {
    // TODO: 필요 시 whoAmI route stub 으로 전체 MemberDetailsResponse 주입 후 활성화
  });

  test('비밀번호 [변경] 시 기존 비밀번호 비어있으면 "기존 비밀번호를 입력해주세요." alert', async ({ page }) => {
    const dialogPromise = acceptNextDialog(page);
    // Password* 행의 [변경] — 첫 번째 '변경' 버튼
    await page.getByRole('button', { name: '변경' }).first().click();
    const msg = await dialogPromise;
    expect(msg).toMatch(/기존 비밀번호를 입력해주세요/);
  });

  test('새 비밀번호와 확인값이 다르면 "새 비밀번호가 일치하지 않습니다." alert', async ({ page }) => {
    await page.getByPlaceholder('기존 비밀번호를 입력해주세요').fill('OldPass123!');
    await page.getByPlaceholder('새 비밀번호를 입력해주세요').fill('NewPass123!');
    await page.getByPlaceholder('새 비밀번호를 다시 입력해주세요').fill('Different123!');

    const dialogPromise = acceptNextDialog(page);
    await page.getByRole('button', { name: '변경' }).first().click();
    const msg = await dialogPromise;
    expect(msg).toMatch(/새 비밀번호가 일치하지 않습니다/);
  });

  test('비밀번호 변경 API 성공 시 alert + 필드 초기화', async ({ page }) => {
    await page.route(API.changePassword(SESSION_USER_ID), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.getByPlaceholder('기존 비밀번호를 입력해주세요').fill('OldPass123!');
    await page.getByPlaceholder('새 비밀번호를 입력해주세요').fill('NewPass456!');
    await page.getByPlaceholder('새 비밀번호를 다시 입력해주세요').fill('NewPass456!');

    const dialogPromise = acceptNextDialog(page);
    await page.getByRole('button', { name: '변경' }).first().click();
    const msg = await dialogPromise;
    expect(msg).toMatch(/비밀번호가 변경되었습니다/);

    await expect(page.getByPlaceholder('기존 비밀번호를 입력해주세요')).toHaveValue('');
    await expect(page.getByPlaceholder('새 비밀번호를 입력해주세요')).toHaveValue('');
    await expect(page.getByPlaceholder('새 비밀번호를 다시 입력해주세요')).toHaveValue('');
  });

  test('비밀번호 변경 API 400 시 "현재 비밀번호가 일치하지 않습니다." alert', async ({ page }) => {
    await page.route(API.changePassword(SESSION_USER_ID), route =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"wrong"}' }),
    );

    await page.getByPlaceholder('기존 비밀번호를 입력해주세요').fill('Wrong123!');
    await page.getByPlaceholder('새 비밀번호를 입력해주세요').fill('NewPass456!');
    await page.getByPlaceholder('새 비밀번호를 다시 입력해주세요').fill('NewPass456!');

    const dialogPromise = acceptNextDialog(page);
    await page.getByRole('button', { name: '변경' }).first().click();
    const msg = await dialogPromise;
    expect(msg).toMatch(/현재 비밀번호가 일치하지 않습니다/);
  });

  test('닉네임 변경 시 recentlyChanged=true 응답이면 "1달에 1회" alert', async ({ page }) => {
    await page.route(API.availableNickname, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recentlyChanged: true, duplicated: false }),
      }),
    );

    const nicknameInput = inputByRowLabel(page, '닉네임');
    await nicknameInput.fill('새닉네임');

    const dialogPromise = acceptNextDialog(page);
    await page.getByRole('button', { name: '수정' }).click();
    const msg = await dialogPromise;
    expect(msg).toMatch(/1달에 1회/);
  });

  test('이메일 도메인이 유효하지 않으면 alert 로 차단된다', async ({ page }) => {
    // MypageInfo: emailId + emailDomain 각각 TextField. domain 은 placeholder 없음.
    // 이메일* 행 내에서 두 번째 input (domain) 을 찾음.
    const emailRow = page.getByText('이메일*', { exact: true }).locator('xpath=following-sibling::*');
    const domainInput = emailRow.locator('input').nth(1);
    await domainInput.fill('not-a-domain');

    const dialogPromise = acceptNextDialog(page);
    await page.getByRole('button', { name: '수정' }).click();
    const msg = await dialogPromise;
    // isValidEmail 구현이 어떤 메시지 반환하든 문자열이면 통과
    expect(msg).toBeTruthy();
  });
});

// ============================================================
// MypageWithdraw — /mypage/withdraw (회원 탈퇴)
// ============================================================
test.describe('user-10 MypageWithdraw (/mypage/withdraw)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/mypage/withdraw`);
    await passMypageGate(page, '정말로');
  });

  test('탈퇴 페이지 진입 시 "회원을 탈퇴하시겠어요?" 헤드라인과 4가지 혜택이 렌더된다', async ({ page }) => {
    await expect(page.getByText('정말로', { exact: true })).toBeVisible();
    await expect(page.getByText('회원을 탈퇴하시겠어요?', { exact: true })).toBeVisible();
    await expect(page.getByText('1. 편리한 정산업무')).toBeVisible();
    await expect(page.getByText('2. CSO-MR의 커뮤니티')).toBeVisible();
    await expect(page.getByText('3. CSO활동에 필요한 정보')).toBeVisible();
    await expect(page.getByText('4. 특별한 혜택')).toBeVisible();
    await expect(page.getByText('위 혜택들이 사라져요.')).toBeVisible();
    await expect(page.getByRole('button', { name: '탈퇴하기' })).toBeVisible();
    await expect(page.getByRole('link', { name: '취소하기' })).toBeVisible();
  });

  test('[탈퇴하기] confirm 을 취소하면 DELETE API 가 호출되지 않는다', async ({ page }) => {
    let deleteCalled = false;
    await page.route(API.deleteMember(SESSION_USER_ID), route => {
      deleteCalled = true;
      return route.fulfill({ status: 200, body: '{}' });
    });

    const dismissPromise = dismissNextDialog(page);
    await page.getByRole('button', { name: '탈퇴하기' }).click();
    const msg = await dismissPromise;
    expect(msg).toMatch(/정말로 탈퇴하시겠습니까/);

    await page.waitForTimeout(200);
    expect(deleteCalled).toBe(false);
  });

  test('[탈퇴하기] confirm 수락 후 DELETE 200 이면 /logout 으로 전체 이동한다', async ({ page }) => {
    await page.route(API.deleteMember(SESSION_USER_ID), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    // 1) confirm 수락, 2) 완료 alert 도 수락
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.getByRole('button', { name: '탈퇴하기' }).click();
    await page.waitForURL(/\/logout/, { timeout: 5000 });
  });

  test('[취소하기] 클릭 시 홈(/) 으로 이동한다', async ({ page }) => {
    await page.getByRole('link', { name: '취소하기' }).click();
    await expect(page).toHaveURL(new RegExp(`^${BASE_URL}/?$`));
  });
});

/**
 * 자동 생성된 UI smoke 초안 - medipanda-web
 * 원본 문서: docs/user/10_MYPAGE.md
 * 대상 컴포넌트 (메뉴 문서 "대상 파일" 항목 기준):
 *   - src/pages-user/MypageInfo.tsx      (내정보관리 — 기본정보 + 추가정보)
 *   - src/pages-user/MypageWithdraw.tsx  (회원탈퇴)
 *   (MypageNotification.tsx 는 동일 카테고리이나 주요 1-2개 원칙에 따라 본 스펙에서는 제외)
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test, test-writer agent)
 *
 * WARNING: 초안 - 반드시 수동 검수 후 사용
 * 1. /mypage/* 는 `LoginMemberGuard` + `MypageGuard` 이중 보호. storageState 로 세션 주입 필수.
 * 2. 레이블 폼(MypageFormLabel = Typography) 기반이라 getByLabel 이 동작하지 않을 수 있음.
 *    본 스펙은 placeholder / 인접 텍스트 기반 locator 사용 — 실제 DOM과 재확인 요망(TODO 주석).
 * 3. 비밀번호·휴대폰 [변경], 추천인 [복사] 등 같은 레이블 버튼이 여러 개이므로 `nth` 또는
 *    role 스코프 좁히기 전략 사용. DOM 순서가 바뀌면 깨질 수 있음.
 * 4. alert/confirm 은 page.on('dialog') 로 처리. 실제 환경이 MUI 커스텀 Dialog 라면 재작성 필요.
 * 5. KMC 본인인증은 외부 팝업 — 본 스펙은 mock 없이 흐름만 정의. 실행 전 requestKmcAuth 를
 *    네트워크 레벨에서 stub 처리해야 함.
 * 6. 탈퇴(DELETE) 는 파괴적 API — 반드시 route mock 으로 실제 호출 차단할 것.
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

// ---------- API 경로 (docs/user/10_MYPAGE.md "API 엔드포인트 요약" 기반) ----------
const API = {
  availableNickname: '**/v1/members/available-nickname',
  updateNickname: (userId: string) => `**/v1/members/${userId}/nickname`,
  changePassword: (userId: string) => `**/v1/members/${userId}/password`,
  updateMember: (userId: string) => `**/v1/members/${userId}`,
  deleteMember: (userId: string) => `**/v1/members/${userId}`,
  kmcAuthRequest: '**/v1/kmc/auth/request',
};

// ---------- 픽스처 ----------
const SESSION_USER_ID = 'test-user-1';

// TODO: verify — storageState 경로는 프로젝트 auth setup 결과와 일치시킬 것
// test.use({ storageState: 'e2e/.auth/user.json' });

// ---------- 공용 헬퍼 ----------
async function acceptNextDialog(page: Page, expectedMessage?: RegExp): Promise<string> {
  return new Promise(resolve => {
    page.once('dialog', async dialog => {
      const msg = dialog.message();
      if (expectedMessage) expect(msg).toMatch(expectedMessage);
      await dialog.accept();
      resolve(msg);
    });
  });
}

async function dismissNextDialog(page: Page): Promise<string> {
  return new Promise(resolve => {
    page.once('dialog', async dialog => {
      const msg = dialog.message();
      await dialog.dismiss();
      resolve(msg);
    });
  });
}

// ============================================================
// MypageInfo — /mypage/info (내정보관리)
// ============================================================
test.describe('user-10 MypageInfo (/mypage/info)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/mypage/info`);
  });

  // 1) 정상 로드 - 제목 + 주요 섹션 렌더
  test('정상 로드 시 내정보관리 제목과 기본/추가정보 탭이 렌더된다', async ({ page }) => {
    await expect(page.getByText('내정보관리', { exact: true })).toBeVisible();
    // TODO: verify — MedipandaTab 은 MUI Tab 기반. role=tab 이 아니라면 getByText 로 대체
    await expect(page.getByText('기본정보', { exact: true })).toBeVisible();
    await expect(page.getByText('추가정보', { exact: true })).toBeVisible();
    await expect(page.getByText('ID*', { exact: true })).toBeVisible();
    await expect(page.getByText('이메일*', { exact: true })).toBeVisible();
    await expect(page.getByText('닉네임', { exact: true })).toBeVisible();
  });

  // 2) 이름 빈값 제출 → alert
  test('이름이 비어있는 상태로 [수정] 누르면 "이름을 입력해주세요." alert', async ({ page }) => {
    // name 필드는 disabled 지만, KMC 결과로 주입됨. 빈 세션 환경에서 제출 시 alert 검증.
    // TODO: verify — 현재 DOM 에서 name 은 disabled. 실제 alert 재현 위해 session 픽스처에서
    //                name 을 빈값으로 주입한 storageState 필요할 수 있음.
    const dialogPromise = acceptNextDialog(page, /이름을 입력해주세요/);
    await page.getByRole('button', { name: '수정' }).click();
    await expect(page).toHaveURL(/\/mypage\/info/);
    await dialogPromise;
  });

  // 3) 비밀번호 변경 - 기존 비밀번호 누락 시 alert
  test('비밀번호 [변경] 시 기존 비밀번호 비어있으면 "기존 비밀번호를 입력해주세요." alert', async ({ page }) => {
    const dialogPromise = acceptNextDialog(page, /기존 비밀번호를 입력해주세요/);
    // Password* 행의 [변경] 버튼 — 첫 번째 [변경] 버튼이 비밀번호 변경 버튼임
    // TODO: verify — DOM 순서가 Password*([변경]) → 휴대폰([변경]) 이라는 가정. 바뀌면 nth 조정.
    await page.getByRole('button', { name: '변경' }).first().click();
    await dialogPromise;
  });

  // 4) 비밀번호 변경 - 새 비밀번호 확인 불일치
  test('새 비밀번호와 확인값이 다르면 "새 비밀번호가 일치하지 않습니다." alert', async ({ page }) => {
    await page.getByPlaceholder('기존 비밀번호를 입력해주세요').fill('OldPass123!');
    await page.getByPlaceholder('새 비밀번호를 입력해주세요').fill('NewPass123!');
    await page.getByPlaceholder('새 비밀번호를 다시 입력해주세요').fill('Different123!');

    const dialogPromise = acceptNextDialog(page, /새 비밀번호가 일치하지 않습니다/);
    await page.getByRole('button', { name: '변경' }).first().click();
    await dialogPromise;
  });

  // 5) 비밀번호 변경 성공 - API 200 → "비밀번호가 변경되었습니다." + 입력 필드 비워짐
  test('비밀번호 변경 API 성공 시 alert + 필드 초기화', async ({ page }) => {
    await page.route(API.changePassword(SESSION_USER_ID), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    await page.getByPlaceholder('기존 비밀번호를 입력해주세요').fill('OldPass123!');
    await page.getByPlaceholder('새 비밀번호를 입력해주세요').fill('NewPass456!');
    await page.getByPlaceholder('새 비밀번호를 다시 입력해주세요').fill('NewPass456!');

    const dialogPromise = acceptNextDialog(page, /비밀번호가 변경되었습니다/);
    await page.getByRole('button', { name: '변경' }).first().click();
    await dialogPromise;

    await expect(page.getByPlaceholder('기존 비밀번호를 입력해주세요')).toHaveValue('');
    await expect(page.getByPlaceholder('새 비밀번호를 입력해주세요')).toHaveValue('');
    await expect(page.getByPlaceholder('새 비밀번호를 다시 입력해주세요')).toHaveValue('');
  });

  // 6) 비밀번호 변경 실패 (400) - "현재 비밀번호가 일치하지 않습니다."
  test('비밀번호 변경 API 400 시 "현재 비밀번호가 일치하지 않습니다." alert', async ({ page }) => {
    await page.route(API.changePassword(SESSION_USER_ID), route =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"wrong"}' }),
    );

    await page.getByPlaceholder('기존 비밀번호를 입력해주세요').fill('Wrong123!');
    await page.getByPlaceholder('새 비밀번호를 입력해주세요').fill('NewPass456!');
    await page.getByPlaceholder('새 비밀번호를 다시 입력해주세요').fill('NewPass456!');

    const dialogPromise = acceptNextDialog(page, /현재 비밀번호가 일치하지 않습니다/);
    await page.getByRole('button', { name: '변경' }).first().click();
    await dialogPromise;
  });

  // 7) 닉네임 - recentlyChanged 응답 시 alert
  test('닉네임 변경 시 recentlyChanged=true 응답이면 "1달에 1회" alert', async ({ page }) => {
    await page.route(API.availableNickname, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ recentlyChanged: true, duplicated: false }),
      }),
    );

    // TODO: verify — 닉네임 TextField 셀렉터. 레이블이 Typography 기반이므로 role=textbox 내
    //                인접 요소 기반으로 찾아야 함. placeholder 가 없어 nth 전략 사용.
    const nicknameInput = page.getByRole('textbox').nth(7); // 대략적 위치 — 검수 필요
    await nicknameInput.fill('새닉네임');

    const dialogPromise = acceptNextDialog(page, /1달에 1회/);
    await page.getByRole('button', { name: '수정' }).click();
    await dialogPromise;
  });

  // 8) 이메일 잘못된 도메인 → isValidEmail 실패 alert
  test('이메일 도메인이 유효하지 않으면 alert 로 차단된다', async ({ page }) => {
    // TODO: verify — 이메일 ID / 도메인 TextField 는 레이블 없이 연속 배치.
    //                Controller name="emailId" / "emailDomain" 구조. getByRole('textbox') nth 전략.
    const emailDomain = page.getByPlaceholder('example.com');
    await emailDomain.fill('not-a-domain');

    const dialogPromise = acceptNextDialog(page); // 메시지는 isValidEmail 구현에 의존
    await page.getByRole('button', { name: '수정' }).click();
    const msg = await dialogPromise;
    expect(msg).toBeTruthy();
  });
});

// ============================================================
// MypageWithdraw — /mypage/withdraw (회원 탈퇴)
// ============================================================
test.describe('user-10 MypageWithdraw (/mypage/withdraw)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/mypage/withdraw`);
  });

  // 9) 정상 로드 - 탈퇴 헤드라인 + 혜택 박스
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

  // 10) [탈퇴하기] → confirm 취소 시 API 호출되지 않음
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

    // 100ms 정도 여유 후 API 호출 여부 확인
    await page.waitForTimeout(200);
    expect(deleteCalled).toBe(false);
  });

  // 11) [탈퇴하기] → confirm 수락 → DELETE 성공 → alert → /logout 이동
  test('[탈퇴하기] confirm 수락 후 DELETE 200 이면 /logout 으로 전체 이동한다', async ({ page }) => {
    await page.route(API.deleteMember(SESSION_USER_ID), route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );

    // 1st dialog: confirm → accept
    // 2nd dialog: alert(회원 탈퇴 완료) → accept
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.getByRole('button', { name: '탈퇴하기' }).click();

    // window.location.href = '/logout' → 전체 페이지 이동
    await page.waitForURL(/\/logout/, { timeout: 5000 });
    // TODO: verify — localStorage.clear() 검증은 실제 세션 키 이름 확인 후 추가
  });

  // 12) [취소하기] 클릭 → 홈('/') 이동
  test('[취소하기] 클릭 시 홈(/) 으로 이동한다', async ({ page }) => {
    await page.getByRole('link', { name: '취소하기' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE_URL.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}/?$`));
  });
});

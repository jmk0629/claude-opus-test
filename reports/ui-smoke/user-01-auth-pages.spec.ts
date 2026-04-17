/**
 * 자동 생성된 UI smoke 초안 — medipanda-web (user/01 AUTH_PAGES)
 * 원본 문서: docs/user/01_AUTH_PAGES.md
 * 대상 컴포넌트:
 *   - src/pages-user/Login.tsx
 *   - src/pages-user/Signup.tsx
 *   - src/pages-user/FindAccount.tsx
 *   - src/pages-user/FindPassword.tsx
 * 생성 일자: 2026-04-17
 * 생성기: /ui-smoke (claude-opus-test)
 *
 * ⚠️ 초안이므로 반드시 수동 검수 후 사용:
 * 1. 셀렉터 실제 DOM과 일치 확인 (특히 MedipandaOutlinedInput 렌더 결과)
 * 2. API mock 필요 시 page.route() 추가 — 현재 초안은 프런트 UI 동작만 검증
 * 3. KMC 본인인증 팝업(requestKmcAuth)은 외부 window 의존 — signup 플로우는 mock 필수
 * 4. localStorage('autoLogin') 사전 초기화 필요 (beforeEach에 포함)
 */

import { test, expect } from '@playwright/test';
import { UNAUTHENTICATED_STATE } from './_fixtures';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5174';

test.describe('user/01 AUTH_PAGES — 인증 페이지 smoke', () => {
  // 인증 페이지는 **비로그인 상태**를 전제로 동작.
  // 기본 project storageState(.auth/user.json) 를 쓰면 `/login` 이 `/` 로 즉시 redirect 되어
  // ID/Password input 이 존재하지 않음 → 모든 Login smoke 가 placeholder not found 로 실패.
  // UNAUTHENTICATED_STATE 로 쿠키/localStorage 를 비워 익명 세션을 강제한다.
  test.use(UNAUTHENTICATED_STATE);

  test.beforeEach(async ({ page }) => {
    // 자동 로그인 localStorage 잔여물 제거 (Login.tsx useEffect 2에서 읽음)
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('autoLogin');
      } catch {
        /* noop */
      }
    });
  });

  test('1. /login 진입 시 로고·ID·Password 입력·Login 버튼이 렌더된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // 로고 이미지 (Login.tsx L128: <img src='/assets/logo.svg' alt='medipanda' />)
    await expect(page.getByRole('img', { name: 'medipanda' })).toBeVisible();

    // ID / Password placeholder (Login.tsx L136, L166)
    await expect(page.getByPlaceholder('ID')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();

    // Login 버튼 (빈 입력 상태 → disabled)
    const loginButton = page.getByRole('button', { name: 'Login' });
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toBeDisabled();
  });

  test('2. ID·Password 입력 시 Login 버튼이 활성화된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.getByPlaceholder('ID').fill('testuser');
    await page.getByPlaceholder('Password').fill('Test1234!');

    const loginButton = page.getByRole('button', { name: 'Login' });
    await expect(loginButton).toBeEnabled();
  });

  test('3. 잘못된 자격증명으로 로그인 시 에러 메시지가 표시된다', async ({ page }) => {
    // POST /v1/auth/login → 401 mock
    await page.route('**/v1/auth/login', route =>
      route.fulfill({ status: 401, body: 'Unauthorized' }),
    );

    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('ID').fill('wronguser');
    await page.getByPlaceholder('Password').fill('wrongpass');
    await page.getByRole('button', { name: 'Login' }).click();

    // FormHelperText (Login.tsx L200) — 한글 텍스트 매칭
    await expect(
      page.getByText('아이디 또는 비밀번호가 올바르지 않습니다.'),
    ).toBeVisible();
  });

  test('4. 비밀번호 표시 토글 아이콘 클릭 시 input type이 text로 바뀐다', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    const passwordInput = page.getByPlaceholder('Password');
    await passwordInput.fill('secret');
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // TODO: verify selector — IconButton에 aria-label이 없어 toggle 버튼 지목이 애매
    // 현재는 Password input 바로 옆 IconButton을 locator로 잡음
    const toggleButton = passwordInput.locator('..').locator('button').first();
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });

  test('5. /find-account 진입 시 탭·전화번호 입력·인증번호 발송 버튼이 렌더된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/find-account`);

    // 탭 링크 2개 (FindAccount.tsx L120, L141)
    await expect(page.getByRole('link', { name: '아이디 찾기' })).toBeVisible();
    await expect(page.getByRole('link', { name: '비밀번호 찾기' })).toBeVisible();

    // 안내 문구 (L154)
    await expect(
      page.getByText('회원정보에 등록된 정보로 아이디를 찾을 수 있습니다.'),
    ).toBeVisible();

    // 전화번호 placeholder (L170)
    await expect(page.getByPlaceholder("'-' 없이 입력")).toBeVisible();

    // 인증번호 발송 버튼 — 전화번호 비어있으면 disabled
    const sendButton = page.getByRole('button', { name: '인증번호 발송' });
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeDisabled();
  });

  test('6. /find-account에서 전화번호 미입력 시 인증번호 발송 버튼이 비활성화된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/find-account`);

    const sendButton = page.getByRole('button', { name: '인증번호 발송' });
    await expect(sendButton).toBeDisabled();

    // 전화번호 숫자 입력 → 포맷팅 (normalizePhoneNumber) → 버튼 활성화
    await page.getByPlaceholder("'-' 없이 입력").fill('01012345678');
    await expect(sendButton).toBeEnabled();
  });

  test('7. /find-password 진입 시 아이디·전화번호 필드가 함께 렌더된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/find-password`);

    // 안내 문구 (FindPassword.tsx L192)
    await expect(
      page.getByText('회원정보에 등록된 정보로 비밀번호를 찾을 수 있습니다.'),
    ).toBeVisible();

    // 아이디 라벨 + 전화번호 placeholder 모두 존재
    await expect(page.getByText('아이디', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("'-' 없이 입력")).toBeVisible();

    // 인증번호 발송 버튼
    await expect(page.getByRole('button', { name: '인증번호 발송' })).toBeVisible();
  });

  test('8. /signup 진입 시 아이디 중복확인·인증요청·가입완료 버튼이 렌더된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/signup`);

    // TODO: verify selector — 실제 버튼 라벨 DOM 확인 필요
    // 메뉴 문서 기준 주요 액션 버튼들
    await expect(page.getByRole('button', { name: '중복확인' })).toBeVisible();
    await expect(page.getByRole('button', { name: '인증요청' })).toBeVisible();
    await expect(page.getByRole('button', { name: '가입완료' })).toBeVisible();

    // 가입완료 버튼 — 필수 입력 전이므로 disabled
    await expect(page.getByRole('button', { name: '가입완료' })).toBeDisabled();
  });
});

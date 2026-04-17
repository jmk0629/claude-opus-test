import { defineConfig, devices } from '@playwright/test';

/**
 * claude-opus-test 격리 Playwright 러너.
 *
 * 스펙은 ../reports/ui-smoke/ 에 있고 이 config가 testDir로 참조.
 * 실제 medipanda-web 레포는 건드리지 않음(package.json, e2e/ 추가 없음).
 *
 * 실행 전제:
 *   - medipanda-web dev 서버 기동 중 (localhost:5173/admin, localhost:5174)
 *   - .auth/user.json / .auth/admin.json 생성됨 (npm run auth:user / auth:admin)
 */
export default defineConfig({
  testDir: '../reports/ui-smoke',
  testMatch: /.*\.spec\.ts$/,

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'user',
      testMatch: /user-.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5174',
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'admin',
      testMatch: /admin-.*\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173/admin',
        storageState: '.auth/admin.json',
      },
    },
  ],
});

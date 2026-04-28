import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /debug-.*\.spec\.ts/,
  projects: [
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5173/admin',
        storageState: '.auth/admin.json',
      },
    },
  ],
  reporter: 'list',
  workers: 1,
});

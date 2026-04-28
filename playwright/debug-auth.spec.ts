import { test } from '@playwright/test';

test('debug admin auth', async ({ page, context }) => {
  // storageState 복원 후 쿠키 상태 확인
  const cookies = await context.cookies();
  console.log('Cookies count:', cookies.length);
  cookies.forEach(c => console.log(`  ${c.name}=${c.value.substring(0, 30)}... domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly}`));

  // 실제 admin 페이지 진입
  const response = await page.goto('http://localhost:5173/admin/members', { waitUntil: 'domcontentloaded' });
  console.log('Response status:', response?.status(), 'URL:', page.url());

  // whoAmI 네트워크 요청 관찰
  page.on('request', req => {
    if (req.url().includes('/v1/auth/me') || req.url().includes('/v1/members')) {
      console.log('REQUEST:', req.method(), req.url());
      const cookie = req.headers()['cookie'];
      console.log('  Cookie header:', cookie?.substring(0, 100) ?? 'NONE');
    }
  });
  page.on('response', res => {
    if (res.url().includes('/v1/auth/me') || res.url().includes('/v1/members')) {
      console.log('RESPONSE:', res.status(), res.url());
    }
  });

  await page.waitForTimeout(5000);
  console.log('Final URL:', page.url());
});

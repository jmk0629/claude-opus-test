/**
 * JWT 자동 갱신 — .auth/admin.json / .auth/user.json 수명 연장
 *
 * 동작:
 * 1. 기존 storageState 로드 → cookie(AUTH_TOKEN) + localStorage(refreshToken) 복원
 * 2. /v1/auth/me 로 현재 access token 유효성 확인
 *    - 200: token 아직 살아있음 → refresh 호출로 만료시간 연장 후 storageState 저장
 *    - 401: access token 만료 → 바로 /v1/auth/token/refresh 로 재발급 (refreshToken은 14일)
 *    - 그 외: refresh 불가 → npm run auth:admin 으로 재로그인 안내
 * 3. 성공 시 새 storageState 저장
 *
 * 사용:
 *   npm run auth:refresh:admin
 *   npm run auth:refresh:user
 *
 * CI / 장시간 로컬 세션에서 admin 토큰(30분)이 만료되기 전에 주기적으로 실행.
 */

import { chromium, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Target = 'admin' | 'user';

interface Config {
  statePath: string;
  baseUrl: string;
}

const CONFIGS: Record<Target, Config> = {
  admin: { statePath: '.auth/admin.json', baseUrl: 'http://localhost:5173' },
  user: { statePath: '.auth/user.json', baseUrl: 'http://localhost:5174' },
};

async function refreshTarget(target: Target): Promise<void> {
  const config = CONFIGS[target];
  const absPath = path.resolve(__dirname, config.statePath);

  if (!fs.existsSync(absPath)) {
    console.error(`[${target}] storageState not found: ${absPath}`);
    console.error(`  → npm run auth:${target} 로 먼저 로그인`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: absPath });

  try {
    // context.storageState() 는 현재 브라우저 상태를 반환하므로, page 방문 전에는
    // 파일에서 로드된 cookies 를 볼 수 없음. userId 추출용으로는 파일을 직접 읽음.
    const fileState = JSON.parse(fs.readFileSync(absPath, 'utf8')) as {
      cookies: Array<{ name: string; value: string }>;
      origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
    };
    const origin = fileState.origins.find(o => o.origin === config.baseUrl);
    const refreshTokenEntry = origin?.localStorage.find(x => x.name === 'refreshToken');

    if (!refreshTokenEntry) {
      throw new Error(`refreshToken not found in localStorage for ${config.baseUrl}`);
    }

    // 1. userId 확보 — whoAmI(200 경우) 또는 AUTH_TOKEN JWT payload 디코드(401 경우)
    //    AUTH_TOKEN 이 만료됐어도 JWT payload 의 sub 는 그대로 읽을 수 있으므로
    //    refreshToken 이 살아있는 한 재발급 가능.
    const whoAmIUserId = await tryWhoAmI(context, config.baseUrl);
    const cookieUserId = extractUserIdFromCookie(fileState.cookies);
    const userId = whoAmIUserId ?? cookieUserId;

    if (!userId) {
      throw new Error(
        `userId 를 얻을 수 없음 (whoAmI=${whoAmIUserId ?? 'null'}, cookieDecode=${cookieUserId ?? 'null'})`,
      );
    }

    // 2. refresh 호출로 새 access token + refresh token 발급
    const refreshResp = await context.request.post(`${config.baseUrl}/v1/auth/token/refresh`, {
      data: { userId, refreshToken: refreshTokenEntry.value },
    });

    if (!refreshResp.ok()) {
      throw new Error(`refresh failed: ${refreshResp.status()} ${await refreshResp.text()}`);
    }

    const refreshed = (await refreshResp.json()) as { refreshToken: string; accessToken?: string };

    // 3. 새 refreshToken 을 localStorage 에 반영
    //    (AUTH_TOKEN 쿠키는 Set-Cookie 로 자동 갱신되어 context 에 반영됨)
    //    localStorage 는 page 에만 바인딩되므로 page.goto 후 evaluate 로 주입.
    const page = await context.newPage();
    await page.goto(`${config.baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => localStorage.setItem('refreshToken', t), refreshed.refreshToken);
    await page.close();

    await context.storageState({ path: absPath });
    console.log(`[${target}] ✓ refreshed at ${new Date().toISOString()} (userId=${userId})`);
  } catch (err) {
    console.error(`[${target}] ✗ refresh failed:`, (err as Error).message);
    console.error(`  → refresh token 도 만료됐을 가능성. npm run auth:${target} 로 재로그인 필요.`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

async function tryWhoAmI(context: BrowserContext, baseUrl: string): Promise<string | null> {
  const resp = await context.request.get(`${baseUrl}/v1/auth/me`);
  if (!resp.ok()) return null;
  const body = (await resp.json()) as { userId: string };
  return body.userId;
}

function extractUserIdFromCookie(cookies: Array<{ name: string; value: string }>): string | null {
  const auth = cookies.find(c => c.name === 'AUTH_TOKEN');
  if (!auth) return null;
  const parts = auth.value.split('.');
  if (parts.length < 2) return null;
  try {
    const pad = '='.repeat((4 - (parts[1].length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(parts[1] + pad, 'base64url').toString('utf8')) as {
      sub?: string;
      userId?: string;
    };
    return payload.sub ?? payload.userId ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const arg = process.argv[2];
  if (arg !== 'admin' && arg !== 'user') {
    console.error('Usage: tsx refresh-auth.ts <admin|user>');
    process.exit(2);
  }
  await refreshTarget(arg);
}

void main();

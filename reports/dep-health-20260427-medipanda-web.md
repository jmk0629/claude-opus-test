# /dep-health 리포트 — 2026-04-27 (medipanda-web)

> 대상: `/Users/jmk0629/keymedi/medipanda-web` (`package.json` v0.0.0, name `medipanda-web`)
> npm 11.12.1 / Node v25.9.0
> 생성: by /dep-health (dep-health-analyzer)
> 컨텍스트: 외주 인수 직후 첫 점검, 분기 1회 베이스라인

## 0. 한 장 요약

- 총 의존성: 직접 prod 51개 / 직접 dev 19개 (트랜지티브 포함 prod 271 / dev 350 / total 622)
- 신선도: 최신 14 / 패치-마이너 밀림 약 38 / 메이저 밀림 18 (latest 기준 outdated 56건)
- 보안: critical 0 / high 11 / moderate 6 / low 0 (총 17건, 모두 fixAvailable)
- 위험 등급 분포: CRIT 0 / HIGH 5 / MED 14 / LOW 37
- 즉시 조치 필요 (CRIT): 없음

핵심 메시지: critical CVE/EOL 라이브러리는 없음. 다만 직접 의존하는 5개 패키지(axios, lodash, react-router, react-router-dom, vite)가 high CVE에 노출 → 다음 스프린트 시작 시 `npm audit fix` 1회로 대부분 정리 가능. MUI 7→9, x-charts/x-date-pickers 8→9, react-router 6→7, eslint 9→10 등 메이저 점프는 별도 PR로 분리 권장.

## 1. CRIT — 즉시 조치

현재 CRIT 등급 패키지 없음.

## 2. HIGH — 다음 스프린트

| # | 패키지 | current | latest | 메이저 거리 | CVE | fixAvailable |
|---|---|---|---|---|---|---|
| 1 | axios | 1.13.2 | 1.15.2 | 0 (마이너) | high (DoS via __proto__ in mergeConfig) + moderate (NO_PROXY SSRF, header injection) | true → 1.15.2 |
| 2 | lodash | 4.17.21 | 4.18.1 | 0 (마이너) | high (Code Injection via `_.template`) + moderate ×2 (Prototype Pollution `_.unset`/`_.omit`) | true → 4.18.1 |
| 3 | react-router | 6.30.2 | 7.14.2 | 1 (6→7) | high (XSS via Open Redirects, GHSA-2w69-qvjg-hvjx, transitively `@remix-run/router`) | true (6.30.3 패치 존재) |
| 4 | react-router-dom | 6.30.2 | 7.14.2 | 1 (6→7) | high (react-router 경유 동일 CVE) | true (6.30.3 패치 존재) |
| 5 | vite | 7.2.6 | 8.0.10 | 1 (7→8) | high ×2 (`server.fs.deny` bypass, dev-server WebSocket 임의 파일 읽기) + moderate (Optimized Deps `.map` Path Traversal) | true (7.3.2 패치 존재) |

비고: react-router 6.x는 장기 LTS는 없고 7.x 가 권장 라인이지만, audit 차원에서는 `6.30.3` 패치만 적용해도 CVE는 해소됨. 7 마이그레이션은 별도 PR.

## 3. MED — 백로그

메이저 1개 밀림 또는 마이너 10개+ 밀림 패키지(상위 14개):

| # | 패키지 | current | latest | type | 비고 |
|---|---|---|---|---|---|
| 1 | @mui/material | 7.3.6 | 9.0.0 | dependencies | 메이저 2개 → 사실은 HIGH 후보지만 CVE 없어 MED. v8 → v9 점프 별도 PR 필요 |
| 2 | @mui/icons-material | 7.3.6 | 9.0.0 | dependencies | 메이저 2개, MUI 본체와 함께 묶기 |
| 3 | @mui/x-charts | 8.21.0 | 9.0.2 | dependencies | 메이저 1 |
| 4 | @mui/x-date-pickers | 8.21.0 | 9.0.2 | dependencies | 메이저 1 |
| 5 | eslint | 9.39.1 | 10.2.1 | devDependencies | 메이저 1, configs 영향 |
| 6 | @eslint/js | 9.39.1 | 10.0.1 | devDependencies | 메이저 1, eslint와 함께 |
| 7 | eslint-plugin-react-hooks | 5.2.0 | 7.1.1 | devDependencies | 메이저 2, react-hooks 새 룰 도입 검토 |
| 8 | @vitejs/plugin-react | 5.1.1 | 6.0.1 | devDependencies | 메이저 1, vite 8 동반 |
| 9 | typescript | 5.8.3 | 6.0.3 | devDependencies | 메이저 1, ts-eslint 호환 확인 |
| 10 | vite-tsconfig-paths | 5.1.4 | 6.1.1 | devDependencies | 메이저 1 |
| 11 | react-dropzone | 14.3.8 | 15.0.0 | dependencies | 메이저 1 |
| 12 | @types/node | 24.10.1 | 25.6.0 | devDependencies | 메이저 1 (Node 25 타입) |
| 13 | globals | 16.5.0 | 17.5.0 | devDependencies | 메이저 1 |
| 14 | eslint-plugin-react-refresh | 0.4.24 | 0.5.2 | devDependencies | 0.x 마이너 격차 (실효 메이저) |

이외 MED 분류 없음. 나머지 outdated 항목(약 37건)은 모두 LOW(부록 참고).

## 4. 보안 취약점 상세 (npm audit)

총 17건 (critical 0 / high 11 / moderate 6). 모두 `fixAvailable: true`.

high 11건:

| 패키지 | severity | via | effects | fixAvailable |
|---|---|---|---|---|
| axios | high | direct: GHSA-43fc-jf86-j433 (DoS via __proto__) | — | true |
| lodash | high | direct: GHSA-r5fr-rjxr-66jc (`_.template` Code Injection) | — | true |
| react-router | high | @remix-run/router | react-router-dom | true |
| react-router-dom | high | @remix-run/router, react-router | — | true |
| @remix-run/router | high | direct: GHSA-2w69-qvjg-hvjx (XSS via Open Redirects) | react-router, react-router-dom | true |
| vite | high | GHSA-v2wj-q39q-566r (`server.fs.deny` bypass), GHSA-p9ff-h696-f583 (WebSocket arbitrary file read) | — | true |
| rollup | high | GHSA-mw96-cpmx-2vgc (Arbitrary File Write via Path Traversal, vite 경유) | — | true |
| flatted | high | GHSA-25h7-pfq9-p65f (unbounded recursion DoS), GHSA-rf6f-7fwh-wjgh (Prototype Pollution) | — | true |
| immutable | high | GHSA-wf6x-7x77-mvgw (Prototype Pollution, sass-embedded 경유 추정) | — | true |
| minimatch | high | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 (ReDoS ×3) | — | true |
| picomatch | high | GHSA-c2c7-rcm5-vvqj (ReDoS via extglob) | — | true |

moderate 6건 (카운트만): `ajv`, `brace-expansion`, `follow-redirects`, `markdown-it`, `postcss`, `yaml`. 모두 fixAvailable.

## 5. 추천 업그레이드 명령

```bash
cd /Users/jmk0629/keymedi/medipanda-web

# 1) 자동 fix — 메이저 변경 없는 범위에서 audit 대부분 해소 (axios, lodash, react-router 6.30.3, vite 7.3.2 등)
npm audit fix

# 2) 단순 마이너/패치 일괄 (위험도 낮음, 빌드만 확인)
npm install \
  @floating-ui/react@latest \
  react@latest react-dom@latest \
  react-hook-form@latest react-hotkeys-hook@latest \
  swr@latest tiptap-extension-resizable-image@latest \
  date-fns@latest notistack@latest \
  '@tiptap/starter-kit@latest' '@tiptap/pm@latest' '@tiptap/react@latest' \
  '@tiptap/extensions@latest' \
  '@tiptap/extension-blockquote@latest' '@tiptap/extension-bold@latest' \
  '@tiptap/extension-code@latest' '@tiptap/extension-code-block@latest' \
  '@tiptap/extension-document@latest' '@tiptap/extension-file-handler@latest' \
  '@tiptap/extension-hard-break@latest' '@tiptap/extension-heading@latest' \
  '@tiptap/extension-highlight@latest' '@tiptap/extension-horizontal-rule@latest' \
  '@tiptap/extension-image@latest' '@tiptap/extension-italic@latest' \
  '@tiptap/extension-link@latest' '@tiptap/extension-list@latest' \
  '@tiptap/extension-paragraph@latest' '@tiptap/extension-strike@latest' \
  '@tiptap/extension-subscript@latest' '@tiptap/extension-superscript@latest' \
  '@tiptap/extension-table@latest' '@tiptap/extension-text@latest' \
  '@tiptap/extension-text-align@latest' '@tiptap/extension-text-style@latest' \
  '@tiptap/extension-typography@latest' '@tiptap/extension-underline@latest' \
  '@tiptap/extension-youtube@latest'

# 3) 메이저 업그레이드는 별도 PR — 묶어서 진행
# (a) Vite/React-plugin 라인
npm install -D vite@latest @vitejs/plugin-react@latest vite-tsconfig-paths@latest
# (b) ESLint 9→10 라인
npm install -D eslint@latest @eslint/js@latest eslint-plugin-react-hooks@latest eslint-plugin-react-refresh@latest typescript-eslint@latest globals@latest
# (c) MUI 7→9 라인 (가장 위험, breaking change 사전 검토 필수)
npm install @mui/material@latest @mui/icons-material@latest @mui/x-charts@latest @mui/x-date-pickers@latest
# (d) react-router 6→7 (audit fix 후에 별도 진행)
npm install react-router@latest react-router-dom@latest
# (e) TypeScript 5→6 (ts-eslint와 호환성 먼저)
npm install -D typescript@latest
# (f) 기타
npm install react-dropzone@latest
npm install -D @types/node@latest type-fest@latest
```

## 6. 부록 — LOW + 최신

LOW (37건, wanted 만 밀리거나 patch/minor 소폭):

- 14 tiptap/extension-* + extensions/pm/react/starter-kit (3.13.0 → 3.22.4) — minor
- @types/lodash, @types/react, @types/lodash.throttle류 — patch/minor
- eslint-plugin-prettier 5.5.4 → 5.5.5 (patch)
- typescript-eslint 8.48.1 → 8.59.0 (minor)
- sass-embedded 1.93.3 → 1.99.0 (minor)
- type-fest 5.3.0 → 5.6.0 (minor)
- 기타 wanted-only (eslint-plugin-react-hooks, globals, vite-tsconfig-paths, typescript의 wanted 동결분)

최신 (변경 불필요): @emotion/react, @emotion/styled, @radix-ui/react-dropdown-menu, @radix-ui/react-popover, @tanstack/react-table, eslint-plugin-react, iconsax-reactjs, lodash.throttle, notistack, @types/react-router, 기타 outdated 미보고 패키지.

EOL 휴리스틱(request, node-sass, gulp@3, moment) 매칭 없음 — `lodash`는 high CVE는 있으나 EOL 분류 아님(상위 maintainer 활동 중).

## 7. 참조 + 다음 점검

- 입력: `/Users/jmk0629/keymedi/medipanda-web/package.json`
- 원본 데이터: `/tmp/outdated.json`, `/tmp/audit.json` (재현용, 임시)
- 다음 자동 점검: 분기말(2026-07월말경) 권장 (`/dep-health` 재실행)
- 우선순위 흐름: ① `npm audit fix` (PR 1) → ② Vite 8 + ESLint 10 라인 (PR 2) → ③ MUI 9 마이그레이션 (PR 3, 가장 큰 작업) → ④ react-router 7 + TS 6 (PR 4)

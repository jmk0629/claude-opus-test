# /ui-smoke 품질 가드 리포트 — 2026-04-17

user 배치(11개 spec) 생성 직후, admin 배치로 넘어가기 **전에** `/ui-smoke` 산출물 품질을 강제하기 위한 가드를 설치했다. 이 리포트는 그 가드가 무엇이고, 실제로 무엇을 잡았는지 기록한다.

## 1. 설치한 것

### 1.1 TypeScript 검증 루프

- **`tsconfig.ui-smoke.json`**: `strict: true`, `moduleResolution: Bundler`, `@playwright/test` + `node` 타입만 로드. 대상은 `reports/ui-smoke/**/*.ts`.
- **`package.json`**: `"typecheck:ui-smoke": "tsc --noEmit -p tsconfig.ui-smoke.json"` 스크립트.
- **devDependencies**: `@playwright/test ^1.48`, `@types/node ^25.6`, `typescript ^5.5`.
- 실행: `npm run typecheck:ui-smoke` → user 11개 spec 전원 통과(`TSC CLEAN`).

### 1.2 공용 픽스처 (`reports/ui-smoke/_fixtures.ts`)

11개 spec을 훑어본 결과 반복 패턴이 5종류 있어서 한 파일로 수렴:

| 섹션 | 내용 |
|------|------|
| 1. 환경 상수 | `BASE_URL_USER`, `BASE_URL_ADMIN`, `AUTH_STATE_USER`, `AUTH_STATE_ADMIN` |
| 2. API 응답 스텁 | `EMPTY_PAGE` 상수 + `pageResponse<T>(items, opts)` 빌더 (Spring Page) |
| 3. Dialog 헬퍼 | `acceptNextDialog`, `dismissNextDialog`, `autoAcceptDialogs` |
| 4. API 경로 빌더 | `api(path)` 와일드카드 매처 + `API_V1` 프리셋 |
| 5. 세션 주입 | `injectTestSession(page, session)` + `SESSION_PRESETS`(CSO 승인/대기/일반회원) |

**기존 11개 spec은 리팩터하지 않음** — 초안 상태에서 한 번 더 건드리면 검수 히스토리가 꼬이므로, Playwright 도입 디데이에 일괄 치환. **신규 생성(admin 배치 등)은 이 파일을 import하도록** `test-writer`/`ui-smoke` 문서에 강제 주입.

### 1.3 문서 업데이트

- `agents/test-writer.md`: "공용 픽스처 import 필수" 섹션 + `getByDisplayValue` Page 미지원 경고 + "tsc 통과 필수" 지침 추가.
- `commands/ui-smoke.md`: Phase 3.5 "TypeScript 검증 루프" 단계 삽입. 배치 모드에서 전체 spec 통과 전까지 다음 단계 금지.

## 2. 가드가 실제로 잡은 것

### 2.1 `page.getByDisplayValue` 오용 (user-04, 실제 버그)

**증상**: `reports/ui-smoke/user-04-prescription-management.spec.ts:180`에서 `expect(page.getByDisplayValue(...))`. Playwright v1.48 기준 `getByDisplayValue`는 **`Locator` 전용 메서드**이며 `Page`에는 없다. TS strict 컴파일에서 `Property 'getByDisplayValue' does not exist on type 'Page'` 발생.

**수정**: `page.locator(\`input[value="${SAMPLE_ITEM.institutionName}"]\`)`로 교체. 의도(폼 입력값 존재 확인)는 유지하면서 Page에서도 유효한 셀렉터.

**의의**: 가드가 없었으면 이 spec은 "초안 상태"에서 실제 Playwright 도입 시점까지 살아남았다가, 디데이에 `tsc` 또는 런타임에서 처음 터졌을 버그. **자동 생성물에 strict tsc를 적용하는 가치**를 구체적으로 입증.

### 2.2 잡지 못한 것(한계)

- 셀렉터가 **실제 DOM과 일치하는지**는 여전히 실 브라우저 실행 없이는 확인 불가. 모든 spec 상단 "⚠️ 초안" 주석이 이걸 명시.
- MUI Select의 `role=combobox`, `MedipandaTable`의 role 구조 등 래퍼 컴포넌트 동작은 TS 타입 수준에선 못 잡음 → Playwright 도입 후 `--ui` 모드 수동 검증 필요.
- 한글 텍스트 매칭(`getByText('딜러명')`)은 i18n 도입 시 일괄 재작성해야 함.

## 3. 진행 정책

**admin 배치(9개)부터 적용**:

1. `test-writer` 호출 시 공용 픽스처 import 지침 전달됨(agent 문서에 명시).
2. 9개 spec Write 완료 → 즉시 `npm run typecheck:ui-smoke`.
3. 실패 spec은 해당 파일만 수정 후 재검증. 전원 통과까지 다음 단계 금지.
4. 통과 후에만 배치 리포트(`reports/ui-smoke-batch-admin-YYYYMMDD.md`) 작성.

## 4. 누적 산출물 상태

| 항목 | 수치 |
|------|------|
| user spec 초안 | 11개 (99 시나리오, 2,437 lines) |
| admin spec 초안 | 0개 (예정) |
| 공용 픽스처 | 1개 파일 (~130 lines, 5 섹션) |
| tsc 통과 상태 | ✅ user 11/11 |
| 실제 잡은 버그 | 1건 (user-04 `getByDisplayValue`) |

---

**다음 행동**: admin 9개 메뉴 배치 생성 (`/ui-smoke admin` 등가) → tsc 게이트 통과 → 배치 리포트.

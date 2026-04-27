# medipanda-web 하네스 자동화 계획

> 대상 프로젝트: `/Users/jmk0629/keymedi/medipanda-web`
> 기반 패턴: `claude-opus-test/agents/` + `claude-opus-test/commands/` (서브에이전트 병렬/위임)
> 작성일: 2026-04-16

---

## 0. 전제 (이미 있는 것)

medipanda-web 쪽에는 이미 꽤 잘 갖춰진 자산이 있어서, **아래 자산을 "입력"으로 활용**하는 자동화만 새로 만드는 게 효율적.

- `docs/ARCHITECTURE.md`, `docs/BACKEND_INTEGRATION.md` — 아키텍처/연동 가이드
- `docs/API_ENDPOINTS.md`, `docs/API_USAGE_STATS.md` — API 전수 목록/통계
- `docs/admin/01~12_*.md`, `docs/user/01~11_*.md` — 메뉴/페이지별 소스 분석
- `docs/admin/analysis/*.md`, `docs/user/analysis/*.md` — 메뉴별 DB 분석
- `docs/INTERNALIZATION_PLAYBOOK.md` — 외주 백엔드 내재화 로드맵
- `src/backend/backend.ts` — OpenAPI 자동 생성 (4,500+ 줄, 수동 수정 금지)
- `generate-backend.cjs` — backend.ts 재생성 스크립트
- `menus.ts`, `routes-admin.tsx`, `routes-user.tsx`, `guards/` — 권한/라우팅
- claude-opus-test 쪽: 튜토리얼 4인방(planner/developer/tester/reviewer) + 실전 `/ingest-backend`(Spring Boot 6-에이전트 병렬 분석)

**이미 되어 있으니 재발명하지 말 것**: 메뉴/API/DB 문서, 백엔드 인수 분석(`/ingest-backend` 재사용).

---

## 1. 왜 자동화가 더 필요한가 (빈틈 진단)

현재 문서는 **사람이 시점별로 작성한 스냅샷**이어서, 코드와 시간이 흐르면 드리프트가 발생함. 특히:

| 빈틈 | 증상 |
|------|------|
| **문서 ↔ 코드 드리프트** | `API_ENDPOINTS.md`의 경로·파라미터가 `backend.ts` 재생성 후 달라져도 아무도 모름 |
| **프론트 ↔ 백엔드 계약 불일치** | 외주사 백엔드가 OpenAPI 스펙을 바꿨을 때 어느 화면이 깨지는지 추적 불가 |
| **메뉴 ↔ 라우트 ↔ 권한 정합성** | `menus.ts`에 있는데 `routes-admin.tsx`에 없는 페이지, guard 누락된 페이지 탐지 없음 |
| **화면 ↔ API ↔ DB 역추적** | 개별 문서는 있지만 "이 DB 컬럼이 바뀌면 어느 화면이 영향?" 질의 불가 |
| **내재화 실행 집행력** | `INTERNALIZATION_PLAYBOOK.md`는 계획만 있고, 항목을 실제로 "이번 주 진행 상태"로 잇는 루프가 없음 |
| **PR 리뷰 컨텍스트 부족** | 변경된 파일만 봐서는 "그 화면이 호출하는 API / DB 테이블"까지 자동 제시되지 않음 |

---

## 2. 제안 자동화 카탈로그 (우선순위 순)

각 항목은 **에이전트(agents/*.md) + 커맨드(commands/*.md)** 조합으로 구현. 번호가 낮을수록 즉효·고ROI.

### P0 — 즉효, 드리프트 방어

#### A1. `/sync-api-docs` — OpenAPI 재생성 + 문서 자동 갱신
- **트리거**: 수동 실행 또는 `generate-backend` 후 훅
- **흐름**:
  1. `backend.ts` 이전/이후 diff 파싱 (엔드포인트 추가/삭제/시그니처 변경)
  2. `api-doc-writer` 에이전트 → `API_ENDPOINTS.md`, `API_USAGE_STATS.md`를 갱신안으로 생성
  3. `impact-scanner` 에이전트 → 삭제·변경된 엔드포인트를 호출하는 `pages-user/`, `pages-admin/` 파일 목록 출력
  4. 사람이 머지 전에 리포트만 확인
- **필요 에이전트**: `api-doc-writer`(Read/Grep/Edit), `impact-scanner`(Read/Grep)
- **기대효과**: 외주사가 API 바꿔도 "어느 화면이 깨지는지" 5분 내 파악

#### A2. `/verify-frontend-contract` — 프론트 호출 ↔ OpenAPI 스펙 계약 검증
- **흐름**:
  1. `pages-*` 에서 `backend.ts`에 없는 함수 호출 있는지 탐색 (삭제된 API)
  2. `backend.ts`의 함수 시그니처와 호출부 인자 타입 일치 여부 검사
  3. 불일치 시 파일:라인 리포트
- **필요 에이전트**: `contract-checker` (Grep 위주, haiku 모델로도 충분)
- **실행 시점**: PR 훅 또는 주 1회 배치

#### A3. `/audit-menu-routes` — menus.ts ↔ routes ↔ guards 정합성
- **흐름**:
  1. `menus.ts`의 모든 menuKey 추출
  2. `routes-admin.tsx`, `routes-user.tsx`에 대응 route 존재 여부
  3. `guards/` 가 해당 route에 적용됐는지, 권한 체크 누락 없는지
  4. 고아 route (메뉴 없이 접근 가능), 고아 메뉴 (라우트 없음) 리스트
- **필요 에이전트**: `route-auditor`
- **가치**: 보안 구멍(권한 미적용) 자동 탐지

### P1 — 인수인계 가속

#### B1. `/ingest-medipanda-backend` — 기존 `/ingest-backend` 재활용
- **흐름**: 외주사에서 백엔드 소스를 받는 날, `/ingest-backend`를 그 저장소에 돌려서 controller/service/domain/repository/config/security 6개 분석 리포트를 `docs/backend-ingestion/` 아래에 산출
- **변형 포인트**: 기존 6-에이전트 결과를 **medipanda-web 쪽 문서와 크로스 레퍼런스** 하는 후처리 에이전트 1개만 추가
  - `cross-ref-writer`: "프론트 `docs/admin/05_PRESCRIPTION_MANAGEMENT.md`가 호출하는 API가 백엔드 어느 컨트롤러·서비스에 있는지" 표로 연결
- **산출물**: `docs/bridge/05_PRESCRIPTION_FULLSTACK.md` 같은 풀스택 지도

#### B2. `/playbook-status` — 내재화 플레이북 체크리스트 진단
- **입력**: `docs/INTERNALIZATION_PLAYBOOK.md`의 P0/P1 항목
- **흐름**:
  1. 각 항목을 "확인 가능한 증거"로 치환 (예: `build.gradle.kts` 존재 여부, `.env.example` 여부)
  2. 증거 수집 에이전트 병렬 실행 → 체크리스트에 ✅/⬜ 자동 기입
  3. 주 1회 리포트로 미팅 전 상태 자동 요약
- **필요 에이전트**: `evidence-collector` (fs 스캔 + 패턴 검사)

### P2 — 리뷰/릴리즈 품질

#### C1. `/pr-context` — PR 변경 파일로부터 "영향 지도" 자동 생성
- **입력**: `git diff` 또는 파일 목록
- **흐름** (병렬 3에이전트):
  - `screen-mapper`: 변경 파일이 어느 메뉴/페이지에 속하는지 (`docs/admin|user/*.md` 인덱스로)
  - `api-mapper`: 그 화면이 호출하는 API 리스트
  - `db-mapper`: 그 API가 만지는 테이블 리스트 (`docs/*/analysis/*.md` 인덱스로)
- **출력**: PR 코멘트용 마크다운 (영향 화면 / API / 테이블 / 권한)
- **효과**: 리뷰어가 "이 변경이 무엇을 건드리는지" 30초 안에 파악

#### C2. `/ui-smoke` — 메뉴 문서 기반 Playwright 시나리오 생성
- **흐름**: `docs/user/02_HOME.md` 같은 페이지 문서를 입력 → `test-writer` 에이전트가 주요 시나리오(정상/엣지) Playwright 스크립트 초안 작성
- **주의**: 생성 후 사람이 검수. "자동 생성된 테스트를 바로 머지"는 금물
- **우선순위 이유**: P2인 이유는 medipanda-web에 아직 E2E가 얇기 때문. 먼저 인수부터 끝내고.

### P3 — 탐색적, 낮은 우선순위

- `D1. /db-impact` — DB 마이그레이션 SQL 입력 → 영향 화면 역추적 (백엔드 인수 후 유용)
- `D2. /i18n-extract` — 하드코딩된 한글 문자열을 i18n 키로 추출 (국제화 페이즈에서)
- `D3. /dep-health` — package.json 취약점/노후 의존성 주간 리포트

---

## 3. 에이전트 카탈로그 (신설 필요)

기존 튜토리얼 4인방(planner/developer/tester/reviewer) + `/ingest-backend` 6인방은 **그대로 유지**하고, 아래만 medipanda 전용으로 신설:

| 에이전트 | 역할 | tools | model |
|---------|------|-------|-------|
| `api-doc-writer` | backend.ts diff → 문서 갱신안 | Read, Grep, Edit | sonnet |
| `impact-scanner` | 변경 API를 호출하는 호출부 탐색 | Read, Grep, Glob | haiku |
| `contract-checker` | 프론트 호출 ↔ OpenAPI 계약 검증 | Read, Grep, Glob | haiku |
| `route-auditor` | menus ↔ routes ↔ guards 정합성 | Read, Grep | sonnet |
| `cross-ref-writer` | 프론트 문서 ↔ 백엔드 분석 크로스링크 | Read, Grep, Write | sonnet |
| `evidence-collector` | 플레이북 증거 수집 | Read, Glob, Bash | haiku |
| `screen-mapper` / `api-mapper` / `db-mapper` | PR 영향 지도 3종 | Read, Grep | haiku |
| `test-writer` | 문서 기반 Playwright 초안 | Read, Write | sonnet |

**모델 전략**: 탐색/매핑은 haiku, 문서 작성은 sonnet, 설계(planner류)만 opus. 토큰 예산 방어.

---

## 4. 커맨드 카탈로그 (신설)

```
commands/
├── sync-api-docs.md          (A1)
├── verify-frontend-contract.md (A2)
├── audit-menu-routes.md      (A3)
├── ingest-medipanda-backend.md (B1, /ingest-backend 래퍼 + cross-ref)
├── playbook-status.md        (B2)
├── pr-context.md             (C1)
└── ui-smoke.md               (C2)
```

각 커맨드는 기존 `build-feature.md` 스타일(Phase 나누기 + 병렬 에이전트 실행 + 사용자 승인 게이트)을 따름.

---

## 5. 구현 순서 (권장 로드맵)

1. **Week 1**: A3 `audit-menu-routes` — 가장 작고 즉시 보안 가치. 에이전트 1개로 끝남. 이걸로 패턴 검증.
2. **Week 2**: A1 `sync-api-docs` + A2 `verify-frontend-contract` — 드리프트 방어 핵심 2종.
3. **Week 3**: C1 `pr-context` — 일상 개발 루프에 붙어 체감 가치 큼.
4. **Week 4 (백엔드 인수 시점)**: B1 `ingest-medipanda-backend` + B2 `playbook-status` — 인수 디데이에 맞춰.
5. **그 이후**: C2, D1~D3는 수요 생기면.

### 진행 상태 (2026-04-17 기준)

| 항목 | 상태 | PR | 리포트 |
|------|------|----|-------|
| A3 `/audit-menu-routes` | ✅ merged | #2 | `reports/audit-menu-routes-20260416.md` |
| A2 `/verify-frontend-contract` | ✅ merged | #4 | `reports/verify-frontend-contract-20260416.md` |
| A1 `/sync-api-docs` | ✅ merged | #3 | `reports/sync-api-docs-20260416.md` |
| C1 `/pr-context` | ✅ merged | #6 | `reports/pr-context-20260417.md` |
| B2 `/playbook-status` | ✅ merged | #7 | `reports/playbook-status-20260417.md` |
| C2 `/ui-smoke` (user 02) | ✅ main 직접 커밋 | — | `reports/ui-smoke-20260417.md` + `reports/ui-smoke/user-02-home.spec.ts` |
| C2 `/ui-smoke user` 배치 | ✅ main 직접 커밋 | — | `reports/ui-smoke-batch-user-20260417.md` (11 spec, 99 scenarios) |
| C2 품질 가드 (tsc + 픽스처) | ✅ main 직접 커밋 | — | `reports/ui-smoke-quality-gate-20260417.md` (`tsconfig.ui-smoke.json`, `_fixtures.ts`) |
| C2 `/ui-smoke admin` 배치 | ✅ main 직접 커밋 | — | `reports/ui-smoke-batch-admin-20260417.md` (12 spec, 132 scenarios, tsc 12/12) |
| B1 `/ingest-medipanda-backend` | ✅ main 직접 커밋 | — | `reports/ingest-medipanda-backend-20260427.md` (Phase 1 6-agent + Phase 2 **23/23 메뉴 풀스택 지도**) |
| D1 `/db-impact` | ✅ main 직접 커밋 | — | `reports/db-impact-20260427-V1_5__add_audit_columns_to_partner_tables.md` (test fixture: V1_5 audit columns, CRIT 1·HIGH 2 검출) |
| D3 `/dep-health` | ✅ main 직접 커밋 | — | `reports/dep-health-20260427-medipanda-web.md` (medipanda-web baseline: prod 51/dev 19, CRIT 0·HIGH 5·MED 14·LOW 37, high CVE 11 모두 fixAvailable) |
| D2 `/i18n-extract` | ⏭️ 스킵 (보류) | — | medipanda-web 은 i18n 라이브러리/API/사전 파일 모두 0건 (한국어 단일 SaaS). 향후 다국어 도입 시 설계 |
| 발견 사항 백로그 | ✅ main 직접 커밋 | — | `reports/findings-backlog-20260427.md` (23 bridge §5 + ingest §0 통합, 198건: P0 8 / P1 34 / P2 41 / P3 57+ / P4 3, 묶음 PR 4종 + Linear 라벨 가이드) |

---

## 6. 성공 지표 (운영 후 측정)

- 문서-코드 드리프트 이슈 `0` (A1이 주 1회 돌면)
- PR 리뷰 시간 단축 (C1으로 리뷰어 파악 시간 ↓)
- 외주 백엔드 인수 후 "이 화면이 어느 백엔드 코드에 연결?" 질의에 에이전트 없이도 문서로 답 가능 (B1)
- 신규 입사자가 플레이북 진행 상태를 묻지 않고 리포트로 파악 (B2)

---

## 7. 열린 결정 사항 (사용자 확인 필요)

1. **실행 위치**: 자동화를 medipanda-web 레포 안(`./.claude/`)에 둘지, claude-opus-test에 둘지?
   - 권장: medipanda-web 레포 안 (팀이 공유 가능). claude-opus-test는 개인 실험실로 유지.
2. **훅 자동화 수준**: `pre-commit`/`post-generate-backend` 훅까지 깔지, `/명령어` 수동만 할지?
   - 권장: 초기엔 수동만. 안정화 후 훅으로 승격.
3. **backend 인수 시점**: 실제 소스 받는 날짜가 픽스되면 B1 우선순위 상향.

---

## 다음 단계 제안

- P0/P1/P2 1라운드 완료 (A1/A2/A3/B1/B2/C1/C2). 잔여 메뉴 20개 cross-ref 는 `/ingest-medipanda-backend |admin/...,user/...` 필터 호출로 점증.
- B1 결과의 HIGH 리스크 5건(`reports/ingest-medipanda-backend-20260427.md` §0)은 외주사 인계 즉시 협의 후 PR 트리거 필요.

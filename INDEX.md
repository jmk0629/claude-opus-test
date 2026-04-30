# INDEX — claude-opus-test 하네스 산출물 색인

이 레포에서 지금까지 만든 **모든 md 문서**를 한 곳에서 찾기 위한 색인. 2026-04-17 기준.

구성 축은 두 가지:
1. **자동화 묶음별** (A1~C2) — agent + command + reports가 한 세트
2. **기타** — 계획서·README·튜토리얼·PR 템플릿·자동 생성 spec

각 줄은 `파일 경로 — 한 줄 요약` 형식.

---

## 0. 먼저 읽을 것

| 문서 | 설명 |
|------|------|
| [`AUTOMATION_PLAN.md`](AUTOMATION_PLAN.md) | 전체 자동화 로드맵 (A1~C2, P0~P3) + 현재 진행표 |
| [`README.md`](README.md) | 레포 전반, 로컬 설치(심볼릭 링크), 사용 예시 |
| [`INDEX.md`](INDEX.md) | **이 문서** — 모든 산출물 한눈에 보기 |
| [`reports/medipanda-architecture-20260416.md`](reports/medipanda-architecture-20260416.md) | 2026-04-16 외주사 인수인계 미팅 기반 **전체 시스템 아키텍처** (원본 HTML 인포그래픽을 검색 가능한 md로 변환 + 하네스 연계 포인트) |

---

## 1. 자동화 모듈별 산출물

각 모듈은 `agents/`(에이전트 정의) + `commands/`(슬래시 커맨드) + `reports/`(실행 리포트) 3단 구성.

### A1. `/sync-api-docs` — OpenAPI 재생성 + 문서 자동 갱신

외주사가 API 바꿨을 때 어느 화면이 깨지는지 5분 내 파악.

- [`agents/api-doc-writer.md`](agents/api-doc-writer.md) — `backend.ts` diff → `API_ENDPOINTS.md` 갱신안 작성
- [`agents/impact-scanner.md`](agents/impact-scanner.md) — 변경 API를 호출하는 `pages-*` 파일 목록 출력
- [`commands/sync-api-docs.md`](commands/sync-api-docs.md) — 2-에이전트 오케스트레이션 커맨드
- [`reports/sync-api-docs-20260416.md`](reports/sync-api-docs-20260416.md) — 첫 실행 리포트

### A2. `/verify-frontend-contract` — 프론트 호출 ↔ OpenAPI 스펙 검증

삭제된 API 호출, 파라미터 개수 불일치, axios 직접 호출 우회, 하드코딩 URL 탐지.

- [`agents/contract-checker.md`](agents/contract-checker.md) — 계약 검증 전문 에이전트
- [`commands/verify-frontend-contract.md`](commands/verify-frontend-contract.md) — 커맨드 정의
- [`reports/verify-frontend-contract-20260416.md`](reports/verify-frontend-contract-20260416.md) — 첫 실행 리포트

### A3. `/audit-menu-routes` — menus ↔ routes ↔ guards 정합성

고아 메뉴/라우트, 가드 누락, 권한 불일치 자동 탐지.

- [`agents/route-auditor.md`](agents/route-auditor.md) — 감사 전문 에이전트
- [`commands/audit-menu-routes.md`](commands/audit-menu-routes.md) — 커맨드 정의
- [`reports/audit-menu-routes-20260416.md`](reports/audit-menu-routes-20260416.md) — 첫 실행 리포트

### B1. `/ingest-medipanda-backend` — 외주 백엔드 인수

⬜ **대기 중** — 외주사에서 백엔드 소스 수령 후 착수. `/ingest-backend` 6-에이전트 래퍼 + cross-ref 1건 추가 예정.

### B2. `/playbook-status` — 내재화 플레이북 진행도 체크

`INTERNALIZATION_PLAYBOOK.md` 항목을 파일시스템 증거로 ✅/⚠️/⬜/❓ 자동 매핑.

- [`agents/evidence-collector.md`](agents/evidence-collector.md) — 증거 수집 전문 에이전트
- [`commands/playbook-status.md`](commands/playbook-status.md) — 3-병렬 (P0/P1/P2) 디스패치
- [`reports/playbook-status-20260417.md`](reports/playbook-status-20260417.md) — 18개 중 2개 충족(11%), 미팅 질문 16개 자동 생성

### C1. `/pr-context` — PR 영향 지도 자동 생성

변경 파일 → 영향 메뉴/API/DB 테이블을 3-병렬 에이전트가 30초 내 매핑.

- [`agents/screen-mapper.md`](agents/screen-mapper.md) — 변경 파일 → 메뉴/페이지
- [`agents/api-mapper.md`](agents/api-mapper.md) — 변경 파일 → API 엔드포인트
- [`agents/db-mapper.md`](agents/db-mapper.md) — 변경 파일 → DB 테이블 (간접)
- [`commands/pr-context.md`](commands/pr-context.md) — 3-에이전트 병렬 오케스트레이션
- [`reports/pr-context-20260417.md`](reports/pr-context-20260417.md) — HEAD~2..HEAD 실제 3-파일 테스트(→ 3메뉴 / 9API / 16테이블)

### C2. `/ui-smoke` — 메뉴 문서 기반 Playwright 초안 생성

`docs/user|admin/NN_*.md` 문서 → `.spec.ts` 초안. 단일 메뉴 또는 배치(user/admin/all) 모드.

- [`agents/test-writer.md`](agents/test-writer.md) — 초안 생성 에이전트 (sonnet)
- [`commands/ui-smoke.md`](commands/ui-smoke.md) — 배치 모드 + tsc 게이트 Phase 포함
- [`reports/ui-smoke-20260417.md`](reports/ui-smoke-20260417.md) — 단일 메뉴 첫 실행 (user/02 홈)
- [`reports/ui-smoke-batch-user-20260417.md`](reports/ui-smoke-batch-user-20260417.md) — **user 배치**: 11 spec / 99 시나리오 / 2,437 lines
- [`reports/ui-smoke-quality-gate-20260417.md`](reports/ui-smoke-quality-gate-20260417.md) — **품질 가드**: `tsconfig.ui-smoke.json` + `_fixtures.ts` 설치 + 1건 버그 캐치
- [`reports/ui-smoke-batch-admin-20260417.md`](reports/ui-smoke-batch-admin-20260417.md) — **admin 배치**: 12 spec / 132 시나리오 / 4,887 lines / tsc 12/12 clean
- [`reports/ui-smoke-runtime-20260417.md`](reports/ui-smoke-runtime-20260417.md) — **실제 dev 서버 실행**: admin-01/11 완주 + **user 배치 98 passed / 1 skip / 0 fail** (§9.9). JWT 만료 2차 incident 프로토콜(§9.10), MpModal vs notistack 구분, `route.fallback()`/regex URL/`span.MuiTypography-*` 스코프 등 패턴 누적
- [`playwright/`](playwright/) — 격리 Playwright 러너 (config/auth/testDir 지정, 부모 `@playwright/test` 재사용)

### D1. `/db-impact` — DB 마이그레이션 SQL → 영향 메뉴 역추적

DDL `.sql` → bridge 인덱스로 영향 테이블·메뉴·EP·Repository 한 페이지 사전 점검. 마이그레이션 적용 전 단계.

- [`agents/migration-impact-analyzer.md`](agents/migration-impact-analyzer.md) — 5단계 SQL 파싱·매핑 에이전트 (sonnet)
- [`commands/db-impact.md`](commands/db-impact.md) — Phase 0 사전점검 + Phase 1 analyzer 1회 호출
- [`reports/db-impact-fixtures/V1_5__add_audit_columns_to_partner_tables.sql`](reports/db-impact-fixtures/) — 첫 테스트 픽스처 (BaseEntity 보강)
- [`reports/db-impact-20260427-V1_5__add_audit_columns_to_partner_tables.md`](reports/db-impact-20260427-V1_5__add_audit_columns_to_partner_tables.md) — 첫 실행: 영향 테이블 3 / 영향 메뉴 7, **CRIT 1·HIGH 2·MED 3·LOW 2** 검출 (file_kind 컬럼명 drift 사전 발견)

### D3. `/dep-health` — npm/Gradle 의존성 신선도 + CVE 분기 점검

빌드 도구 자동 감지: `package.json` → npm 경로(`npm outdated` + `npm audit`), `gradle/libs.versions.toml` → Gradle 경로(정적 파싱). `|deep` 플래그 시 deps.dev API 로 transitive CVE 트리까지 조회.

- [`agents/dep-health-analyzer.md`](agents/dep-health-analyzer.md) — npm 경로 5단계 outdated/audit 합치는 에이전트 (sonnet)
- [`commands/dep-health.md`](commands/dep-health.md) — Phase 0 빌드 도구 감지 + npm/gradle 분기 + `|deep` 플래그
- [`scripts/gradle-dep-health.sh`](scripts/gradle-dep-health.sh) — Gradle Version Catalog 정적 파싱 (직접 의존성, EOL 휴리스틱)
- [`scripts/gradle-deps-transitive.sh`](scripts/gradle-deps-transitive.sh) — deps.dev API 로 transitive 트리 + GHSA/CVE 매핑 + CVSS 등급 분류 (캐시 `reports/cache/deps.dev/`)
- [`reports/dep-health-20260427-medipanda-web.md`](reports/dep-health-20260427-medipanda-web.md) — npm 첫 베이스라인 (medipanda-web): 직접 prod 51/dev 19, **CRIT 0·HIGH 5·MED 14·LOW 37**, 보안 critical 0 / high 11 (모두 fixAvailable)
- [`reports/dep-health-gradle-transitive-20260429-medipanda-api.md`](reports/dep-health-gradle-transitive-20260429-medipanda-api.md) — Gradle transitive 첫 베이스라인 (medipanda-api): 직접 38 / 고유 transitive 397, **CRIT 2 / HIGH 5 / MED 8 / LOW 4** (Spring4Shell, Netty smuggling, SnakeYAML RCE 발견)

### Auxiliary. `/regression-diff` — 리포트 N→N+1 회귀 자동 감지 + macOS 알림

7개 커맨드 산출물의 직전 대비 신규/해소/유지 카운트 자동 산출. **결정적 bash 파싱, LLM 미호출** — 매번 동일 입력 → 동일 출력, 토큰 비용 0. 신규 ≥ 1 시 `scripts/notify-local.sh` 자동 호출 (§1 CRIT 신규는 `crit` 음성 동반).

- [`commands/regression-diff.md`](commands/regression-diff.md) — 단일 커맨드 (agent 없음). `extract_a1/a2/d3/d3_transitive/b1/bridge/ui_smoke` 행 키 추출 → set diff.
- 지원: `command-name ∈ {sync-api-docs, verify-frontend-contract, dep-health, dep-health-gradle-transitive, ui-smoke, ingest-medipanda-backend, bridge}`
- 산출: `reports/<command>-diff-YYYYMMDD.md`. 베이스라인 부재 시 안내 후 종료.
- 알림 통합: `TOTAL_ADDED > 0` → warn, `§1 CRIT 신규 ≥ 1` → crit 격상 (음성).
- 신규 추가 시 `extract_<cmd>` 함수 + `case` 분기만 추가하면 됨.

### B3. `/findings-backlog` — bridge §5 + ingest §0 → 발견 사항 백로그 자동 추출

수동 통합 1~2시간을 자동 5분으로 단축. B1 분기 재실행 직후마다 호출하여 신규/해소/등급 변경 추적.

- [`agents/findings-extractor.md`](agents/findings-extractor.md) — 23 bridge §5 + ingest §0/§2/§3 추출 + 키워드 fallback 등급 + 횡단 패턴 묶음 (sonnet)
- [`commands/findings-backlog.md`](commands/findings-backlog.md) — Phase 0 사전점검 (bridge 23 + ingest 존재) + Phase 1 extractor 호출 + Phase 2 인용 무결성 검증
- [`reports/findings-backlog-20260427.md`](reports/findings-backlog-20260427.md) — 수동 baseline (198건)
- [`reports/findings-backlog-20260428-auto-validation.md`](reports/findings-backlog-20260428-auto-validation.md) — 자동 도구 검증 리포트 (재현 +9건/4.5%, 횡단 7종 100% 일치, 메뉴 매핑 drift 1건 발견·수정)

> **D2 `/i18n-extract`**: 보류. medipanda-web 은 i18n 라이브러리/API/사전 모두 0건 (한국어 단일 SaaS).

---

## 2. 누적 지표 (2026-04-30 기준)

| 항목 | 값 |
|------|----|
| 자동화 모듈 완성 | **10개 + 보조 1** (A1/A2/A3 + B1/B2/B3 + C1/C2 + D1/D3 + Aux `/regression-diff`) — D2 보류 |
| 에이전트 정의 (`agents/*.md`) | **13개** (route-auditor, api-doc-writer, impact-scanner, contract-checker, screen/api/db-mapper, cross-ref-writer, test-writer, migration-impact-analyzer, dep-health-analyzer, findings-extractor 외) |
| 슬래시 커맨드 정의 (`commands/*.md`) | **11개** (10 모듈 + `/regression-diff`) |
| 실행 리포트 (`reports/*.md`) | **17+개** (B1 23 bridge + ingest summary + findings-backlog 2종 + D1·D3 npm·D3 gradle transitive + ui-smoke 외) |
| Bridge 풀스택 지도 (`reports/bridge/`) | **23개** (admin 12 + user 11) |
| 발견 사항 백로그 통합 | **198건 (수동) / 207건 (자동, +4.5%)** — P0 8/15 · P1 34/51 · P2 41/65 · P3 57/70 · P4 3/6 |
| 실제 런타임 실행 (user 배치) | 11 spec / 98 passed / 1 skip / 0 fail (3.2분) |
| 실제 런타임 실행 (admin 배치) | 12 spec / **138/139** 그린 |
| Playwright spec 초안 (참고용, `.ts`) | 23개 / 237 시나리오 / 7,324+ lines |
| tsc strict 통과 상태 | ✅ 23/23 clean |
| D3 Gradle transitive (medipanda-api) | 직접 38 / 고유 transitive 397 / advisory **CRIT 2 · HIGH 5 · MED 8 · LOW 4** (deps.dev API) |
| 운영 보조 스크립트 | 5종 (lint-harness, bridge-snapshot, gradle-dep-health, gradle-deps-transitive, notify-local) |
| 알림 인프라 | `scripts/notify-local.sh` (osascript, 신규 회귀 ≥ 1 자동, §1 CRIT → 음성) |
| CI 자기 검증 (`scripts/lint-harness.sh`) | ✅ frontmatter + 문서 drift + cross-ref + report presence |

---

## 3. 기타 문서

### 3.0 미팅 인텔리전스 (외주사 인수인계)

- [`reports/medipanda-architecture-20260416.md`](reports/medipanda-architecture-20260416.md) — 2026-04-16 미팅 기반 전체 아키텍처 (클라이언트/백엔드/추론·외부/데이터/CI·CD/EDI/배치/DNS/개선/인수인계). 원본 HTML(`~/Downloads/Keymedi 업무/20260417 메디판다 회의 AI 정리본/`) → md 변환 + 하네스 연계 포인트 8절.

### 3.1 튜토리얼 (레퍼런스)

초기 Claude Code 학습용으로 작성한 4-에이전트 SDLC 튜토리얼. 실 자동화가 아니고 **패턴 학습용 예제**.

- [`test/README.md`](test/README.md) — 튜토리얼 개요
- [`test/CONCEPTS.md`](test/CONCEPTS.md) — 에이전트/커맨드/permission 기본 개념
- [`test/agents/planner.md`](test/agents/planner.md) — 설계 에이전트 (opus)
- [`test/agents/developer.md`](test/agents/developer.md) — 구현 에이전트 (sonnet)
- [`test/agents/tester.md`](test/agents/tester.md) — 테스트 에이전트 (sonnet)
- [`test/agents/reviewer.md`](test/agents/reviewer.md) — 리뷰 에이전트 (sonnet)
- [`test/commands/build-feature.md`](test/commands/build-feature.md) — 4-에이전트 순차 파이프라인
- [`test/commands/quick-review.md`](test/commands/quick-review.md) — 단일 에이전트 빠른 리뷰
- [`test/examples/token-savings-demo.md`](test/examples/token-savings-demo.md) — 토큰 절감 실측 예제

### 3.2 인프라

- [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) — PR 체크리스트 (symlink/report/frontmatter)
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — push/PR 시 `lint-harness` + frontmatter 자동 검증
- [`scripts/lint-harness.sh`](scripts/lint-harness.sh) — frontmatter 스키마 + 문서 drift + cross-ref + report presence 4-Job
- [`scripts/bridge-snapshot.sh`](scripts/bridge-snapshot.sh) — B1 재실행 직전 `reports/bridge/` → `reports/bridge-snapshot-YYYYMMDD/` 보존 (회귀 베이스라인)
- [`scripts/gradle-dep-health.sh`](scripts/gradle-dep-health.sh) — D3 Gradle 직접 의존성 정적 파싱
- [`scripts/gradle-deps-transitive.sh`](scripts/gradle-deps-transitive.sh) — D3 deps.dev API transitive CVE (`|deep` 플래그)
- [`scripts/notify-local.sh`](scripts/notify-local.sh) — macOS osascript 알림 + `reports/notifications.log` (`/regression-diff` 자동 호출, `NOTIFY_DISABLE=1` 묵음)

### 3.3 Playwright spec 초안 (참고, md 아님)

리포트 섹션의 배치 결과물. Playwright 도입 디데이에 `e2e/` 하위로 복사해 쓸 예정.

```
reports/ui-smoke/
├── _fixtures.ts                              공용 픽스처 (env/API/dialog/session)
├── user-01-auth-pages.spec.ts           ~11
├── ...
├── user-11-partner-contract.spec.ts         11개 user 메뉴
├── admin-01-member-management.spec.ts    ~12
├── ...
└── admin-12-admin-permission.spec.ts        12개 admin 메뉴
```

전량 `npm run typecheck:ui-smoke`로 strict TypeScript 컴파일 통과 확인됨.

---

## 4. 읽는 순서 추천

**처음 접하는 사람**:
1. [`README.md`](README.md) → [`AUTOMATION_PLAN.md`](AUTOMATION_PLAN.md) (5분)
2. 관심 모듈 1개 골라서 `agent → command → report` 순 3파일 읽기 (10분)
3. 실제 실행하려면 README의 "로컬 설치" 따라 심볼릭 링크 걸기

**리뷰어**:
1. `reports/*.md` 먼저 — 실행 결과와 실제 잡힌 이슈가 여기 있음
2. 품질 가드는 [`reports/ui-smoke-quality-gate-20260417.md`](reports/ui-smoke-quality-gate-20260417.md) 먼저

**회의 전**:
- [`reports/playbook-status-20260417.md`](reports/playbook-status-20260417.md) — 16개 미팅 질문 자동 생성됨
- [`reports/ui-smoke-batch-admin-20260417.md`](reports/ui-smoke-batch-admin-20260417.md) 5절 "공통 이슈 테이블" — 검수 디데이 일괄 해결 후보

---

## 5. 파일 추가 시 체크리스트

신규 자동화를 만들면 이 색인에도 반드시 추가:

- [ ] 해당 모듈 섹션(1절) 또는 새 모듈 섹션 추가
- [ ] "자세한 목적 한 줄 + 경로 링크" 형식 유지
- [ ] 2절 누적 지표 업데이트
- [ ] [`AUTOMATION_PLAN.md`](AUTOMATION_PLAN.md) 진행표도 같이 갱신

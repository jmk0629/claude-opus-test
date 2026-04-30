# 하네스 운영 가이드

> 10 커맨드 × 트리거 × 주기 × 담당. 신규 입사자는 본 문서 → `INDEX.md` → `AUTOMATION_PLAN.md` 순으로 읽으면 됨.

---

## 0. 이 문서의 목적

`AUTOMATION_PLAN.md` 가 **왜·무엇** 이라면, 본 문서는 **언제·누가·어떻게** 다.

도구만 있고 운영 루틴이 없으면 한두 달 뒤 stale. 10 커맨드를 어떤 트리거에 어떤 주기로 누가 돌릴지 한 페이지에 고정한다.

---

## 1. 커맨드 운영 매트릭스

| # | 커맨드 | 트리거 | 주기 | 담당 | 입력 | 출력 | 다음 액션 |
|---|--------|-------|------|------|------|------|----------|
| **A1** | `/sync-api-docs` | backend.ts 재생성 | PR 시점 + 주 1회 | FE 리드 | `src/backend/backend.ts` diff | `reports/sync-api-docs-*.md` | API_ENDPOINTS.md 업데이트 PR |
| **A2** | `/verify-frontend-contract` | backend.ts 재생성 + PR 시점 | PR 시점 + 주 1회 | FE 리드 | `backend.ts` ↔ `pages-*/components/` | `reports/verify-frontend-contract-*.md` | orphan call/arity 픽스 |
| **A3** | `/audit-menu-routes` | menus.ts 또는 routes-*.tsx 변경 PR | PR 시점 + 스프린트 1회 | FE 리드 | `menus.ts` + `routes-{admin,user}.tsx` + `guards/` | `reports/audit-menu-routes-*.md` | guard 누락/orphan 메뉴 픽스 |
| **B1** | `/ingest-medipanda-backend` | 외주 백엔드 인계 직후 + 분기 1회 | 분기 + 인계 시 | 백엔드 리드 | `medipanda-api/` 전체 | `reports/backend-ingestion-*/` 6개 + `reports/bridge/*.md` 23개 + `reports/ingest-medipanda-backend-*.md` | findings-backlog 재추출 |
| **B2** | `/playbook-status` | INTERNALIZATION_PLAYBOOK.md 변경 시 | 주 1회 | 팀 리드 | `INTERNALIZATION_PLAYBOOK.md` | `reports/playbook-status-*.md` | 미진행 항목 담당 배정 |
| **B3** | `/findings-backlog` | B1 재실행 직후 + 분기 1회 | 분기 + B1 직후 | 팀 리드 | `reports/bridge/*.md` 23 + `reports/ingest-medipanda-backend-*.md` | `reports/findings-backlog-*.md` | P0 외주사 즉시 통보 + P1 묶음 PR 4종 배정 |
| **C1** | `/pr-context` | PR 생성 시 (자동) | PR 시점 | PR 작성자 | PR diff (변경 파일 목록) | PR 코멘트 또는 `reports/pr-context-*.md` | 리뷰어 영향 메뉴/EP/DB 파악 후 리뷰 |
| **C2** | `/ui-smoke` | 야간 + PR 시점 + 메뉴별 변경 시 | 야간 자동 + PR | QA / FE | 메뉴 문서(`docs/admin\|user/NN_*.md`) + 로그인 픽스처 | `reports/ui-smoke-*.md` + `reports/ui-smoke/*.spec.ts` | 실패 spec 픽스 또는 픽스처 갱신 |
| **D1** | `/db-impact` | 마이그레이션 SQL 작성 직후 (적용 전) | 마이그레이션마다 | 백엔드 리드 | DDL `.sql` 파일 | `reports/db-impact-*.md` | CRIT/HIGH 메뉴 백엔드/프론트 코드 동기화 PR |
| **D3** | `/dep-health` | 분기말 + 외주 인수 직후 | 분기 + 인계 시 | 백엔드/FE 공동 | `package.json` + `node_modules` | `reports/dep-health-*.md` | `npm audit fix` PR + 메이저 점프 별도 PR |

> **D2 `/i18n-extract`**: 보류. medipanda-web 은 i18n 미사용 (한국어 단일 SaaS). 향후 다국어 도입 시 라이브러리 선택과 함께 설계.

---

## 2. 트리거별 체크리스트

### 2.1 PR 생성 시 (작성자 책임)

```
□ /pr-context  ─ 영향 메뉴/EP/DB 한 페이지로 리뷰어에게 제공
□ A2 변경 영향이면 /verify-frontend-contract  ─ orphan call 차단
□ menus.ts/routes-*.tsx 변경이면 /audit-menu-routes  ─ guard 누락 차단
□ DB DDL 동반이면 /db-impact  ─ 영향 메뉴 사전 점검
```

### 2.2 주간 (FE 리드, 매주 월요일)

```
□ /sync-api-docs                ─ backend.ts ↔ docs 드리프트 0 유지
  └─ /regression-diff sync-api-docs           ─ 직전 실행 대비 신규/해소 자동 카운트
□ /verify-frontend-contract     ─ 베이스라인 회귀 0 유지
  └─ /regression-diff verify-frontend-contract  ─ 회귀 자동 감지
□ /playbook-status              ─ 진행 정체 항목 식별
  └─ /regression-diff playbook-status  ─ 18 항목 상태 변동 자동 카운트 (신규 0 = 정체)
```

### 2.3 스프린트 (팀, 격주 종료 시)

```
□ /audit-menu-routes  ─ 신규 메뉴/가드 정합성 재확인
□ findings-backlog 진행 추적  ─ P1 묶음 PR 진척도 검토
```

### 2.4 분기말 (백엔드/FE 공동)

```
□ /dep-health                            ─ CVE/EOL/메이저 격차 베이스라인 갱신 (npm/gradle 자동 감지)
  └─ /regression-diff dep-health         ─ 직전 분기 대비 신규 CVE / 해소 자동 카운트
□ /dep-health <api경로> |deep             ─ medipanda-api 한정 transitive CVE (deps.dev API, 2~5분)
  └─ /regression-diff dep-health-gradle-transitive  ─ transitive 신규 CRIT → say 음성 알림
□ bash scripts/bridge-snapshot.sh         ─ 다음 B1 직전, 현재 reports/bridge/ 보존 (회귀 베이스라인)
□ /ingest-medipanda-backend              ─ 백엔드 풀스택 지도 재생성 (reports/bridge/ 덮어쓰기)
  ├─ /regression-diff ingest-medipanda-backend  ─ §0 백엔드 규모 + 즉시 대응 Top N 자동 회귀
  └─ /regression-diff bridge                    ─ 23 bridge §5 R-items 행 단위 자동 회귀
□ /findings-backlog                       ─ bridge 갱신본에서 신규/해소 자동 추출
  └─ /regression-diff findings-backlog    ─ P0/P1 분기 대비 신규 자동 카운트 (P0 신규 → crit 음성, 외주사 즉시 통보 트리거)
```

### 2.5 외주 백엔드 인계 직후 (즉시)

```
□ /ingest-medipanda-backend                                   ─ 첫 풀스택 지도 (Phase 1+2)
□ /dep-health                                                  ─ 의존성 신선도 베이스라인
□ /findings-backlog                                            ─ P0 항목 자동 추출 → 외주사 즉시 통보
□ /sync-api-docs + /verify-frontend-contract + /audit-menu-routes  ─ 드리프트 0 검증
```

### 2.6 야간 자동 (CI/cron)

```
□ /ui-smoke (admin 12 + user 11 = 23 spec, 237 시나리오)
   - 사전: JWT refresh (`npx tsx refresh-auth.ts`) — access token 30분 만료
   - 결과: 베이스라인 회귀 알림 (Slack 또는 이메일)
□ /regression-diff ui-smoke  ─ admin/user 배치 N→N+1 spec/시나리오/tsc 변동 자동 감지
```

---

## 3. 의존 관계

```
B1 /ingest-medipanda-backend  ─┐
                                ├─→ B3 /findings-backlog  (bridge §5 + ingest §0 자동 추출)
                                │
                                ├─→ C1 /pr-context  (영향 메뉴 매핑 인덱스)
                                │
                                └─→ D1 /db-impact   (테이블 ↔ 메뉴 인덱스)

A1 /sync-api-docs  ─→ backend.ts 재생성 ─→ A2 /verify-frontend-contract
                                          ↘ A3 /audit-menu-routes (라우트 영향 시)

C2 /ui-smoke  ←  메뉴 문서 (`docs/{admin,user}/NN_*.md`)
              ←  /generate-backend (backend.ts 픽스처)
```

핵심: **B1 이 베이스라인** — 23 bridge 가 stale 되면 C1·D1·findings-backlog 모두 stale. 분기 1회 재실행이 거의 필수.

---

## 4. 첫 실행 시 권장 순서 (신규 프로젝트 적용)

새 프로젝트에 본 하네스를 적용한다면:

1. **B1** `/ingest-medipanda-backend` — 베이스라인 풀스택 지도 (가장 무거움, 1회당 3~6시간)
2. **D3** `/dep-health` — 의존성 신선도 (5~10분)
3. **A1·A2·A3** — 프론트 측 드리프트 3종 (각 5~15분)
4. **B3** `/findings-backlog` — B1 결과 자동 통합 (자동, 5분)
5. **C1** `/pr-context` — 다음 PR 부터 자동 적용
6. **C2** `/ui-smoke` — 메뉴 문서가 정비된 후 (메뉴별 spec 작성, 메뉴당 30~60분)
7. **B2** `/playbook-status` — INTERNALIZATION_PLAYBOOK.md 작성 후
8. **D1** `/db-impact` — 첫 마이그레이션 작성 시점에

---

## 5. 정착 상태 체크리스트 (월별 자가 점검)

매월 1일 본 표로 자가 점검. 한 항목이라도 ❌ 면 해당 트리거 다시 잡기.

| 항목 | 이번 달 실행? | 베이스라인 vs diff | 비고 |
|------|--------------|-------------------|------|
| /sync-api-docs (주 1회 × 4) | □ | drift 0 유지 | A1 |
| /verify-frontend-contract (주 1회 × 4) | □ | 회귀 0 | A2 |
| /audit-menu-routes (스프린트 × 2) | □ | guard 누락 0 | A3 |
| /pr-context (모든 PR) | □ | 100% 적용률 | C1 |
| /ui-smoke 야간 (월 ~30회) | □ | 그린 비율 95%+ | C2 |
| /playbook-status (주 1회 × 4) | □ | 정체 항목 알림 | B2 |
| /db-impact (마이그레이션마다) | □ | CRIT/HIGH 사전 차단 | D1 |
| /dep-health (분기말 1회) | □ | high CVE 카운트 ↓ | D3 |
| /findings-backlog (B1 직후 + 월 1회 리뷰) | □ | P0 → 0, P1 ↓ | B3 |
| B1 재실행 (분기 1회) | □ | bridge 갱신 | B1 |

---

## 6. 미정착 / 향후 확장

운영 루프에 아직 못 잇은 항목 (P3 후보):

| 항목 | 현황 | 다음 단계 |
|------|------|----------|
| **CI 통합 (claude-opus-test 측)** | ✅ `.github/workflows/ci.yml` — `lint-harness` + frontmatter validate (push/PR) | — |
| **CI 통합 (medipanda-web 측)** | 미연동 — 외부 레포 룰상 본 하네스에서 직접 워크플로우 추가 불가 | medipanda-web 측 PR 자동 트리거는 사용자가 별도 결정/실행 |
| **D3 gradle 지원** | ✅ `scripts/gradle-dep-health.sh` (정적, 직접 의존성) + `scripts/gradle-deps-transitive.sh` (deps.dev API, transitive CVE, `|deep` 플래그) | — |
| **회귀 베이스라인 비교** | ✅ `/regression-diff` (Aux) — A1/A2/D3/C2/B1 §0 + bridge §5 + D3 transitive CVE 결정적 bash 파싱 (`scripts/bridge-snapshot.sh` 로 스냅샷 디렉토리 보존) | — |
| **D2 `/i18n-extract`** | 보류 | 다국어 도입 시 |
| **알림 채널 통합** | ✅ `scripts/notify-local.sh` — macOS osascript 알림센터 + `reports/notifications.log` (`/regression-diff` 신규 ≥ 1 시 warn 자동 발사). `NOTIFY_DISABLE=1` 로 야간 배치 묵음 | Slack/이메일 통합은 외부 webhook 결정 필요 시 추가 |

---

## 7. 핵심 메모리 (이 레포 작업 시 필수)

`~/.claude/projects/.../memory/` 의 핵심 메모리. 본 레포에서 작업하는 Claude Code 세션은 자동 로드.

- **branch_strategy**: 모든 변경 main 직접 커밋 + push, PR/브랜치 생성 금지
- **multi_agent_confirmation**: subagent 병렬 호출은 토큰 부담 — 1건씩 사용자 컨펌 (단, "쭉 진행해" 명시 시 해제)
- **claude_registry**: 새 agent/command 는 `~/.claude/{agents,commands}/` 에 symlink 필수
- **jwt_refresh_before_batch**: ui-smoke 배치 전 `npx tsx refresh-auth.ts` 선행 (access token 30분 만료)
- **ui_smoke_baseline**: 2026-04-20 기준 admin 138/139 + user 98/99 그린

---

## 8. 참조

- 산출물 색인: [`INDEX.md`](INDEX.md)
- 자동화 로드맵 + 진행 상태: [`AUTOMATION_PLAN.md`](AUTOMATION_PLAN.md) §5
- 발견 사항 백로그: [`reports/findings-backlog-20260427.md`](reports/findings-backlog-20260427.md)
- 시스템 아키텍처: [`reports/medipanda-architecture-20260416.md`](reports/medipanda-architecture-20260416.md)
- 외주 인수 풀스택 지도: [`reports/ingest-medipanda-backend-20260427.md`](reports/ingest-medipanda-backend-20260427.md) + `reports/bridge/`

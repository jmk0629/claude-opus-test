# claude-opus-test

Claude Code 서브에이전트 기반 **하네스 엔지니어링(harness engineering) 실험실**.
[medipanda-web](https://github.com/) 프론트엔드에서 반복되는 **드리프트·계약 위반·보안 구멍 탐지**를 슬래시 커맨드 한 줄로 자동화하는 것이 목표.

> **운영 루틴 (먼저 읽기)**: [`OPERATIONS_GUIDE.md`](OPERATIONS_GUIDE.md) — 9 커맨드 × 트리거 × 주기 × 담당.
> **산출물 한눈에 보기**: [`INDEX.md`](INDEX.md) — 지금까지 만든 agents/commands/reports 전체 색인.
> **시스템 아키텍처**: [`reports/medipanda-architecture-20260416.md`](reports/medipanda-architecture-20260416.md) — 2026-04-16 외주사 인수인계 미팅 기반 전체 구조.
> **발견 사항 백로그**: [`reports/findings-backlog-20260427.md`](reports/findings-backlog-20260427.md) — B1 23 메뉴 풀스택 지도 통합 198건.

---

## 구조

```
claude-opus-test/
├── INDEX.md                산출물 전수 색인
├── OPERATIONS_GUIDE.md     9 커맨드 운영 루틴 (트리거·주기·담당)
├── AUTOMATION_PLAN.md      전체 자동화 로드맵 (A1~D3, P0~P3)
├── agents/                 서브에이전트 정의 (cross-ref/migration-impact/dep-health 등)
├── commands/               슬래시 커맨드 정의 (11개: A1/A2/A3 + B1/B2/B3 + C1/C2 + D1/D3 + `/regression-diff`)
├── reports/                실제 실행 결과 아카이브
│   └── ui-smoke/           Playwright spec 초안 23개 + _fixtures.ts
├── tsconfig.ui-smoke.json  spec strict tsc 게이트 (`npm run typecheck:ui-smoke`)
├── test/                   튜토리얼 4인방(planner/developer/tester/reviewer)
└── .github/PULL_REQUEST_TEMPLATE.md
```

---

## 현재 진행 상태 (2026-04-27)

| # | 이름 | 목적 | 상태 |
|---|------|------|------|
| **A1** | `/sync-api-docs` | `backend.ts` ↔ API 문서 드리프트 탐지 | ✅ main |
| **A2** | `/verify-frontend-contract` | orphan call / arity mismatch / axios bypass / hardcoded URL | ✅ main |
| **A3** | `/audit-menu-routes` | menus ↔ routes ↔ guards 정합성 (보안 구멍 탐지) | ✅ main |
| **B1** | `/ingest-medipanda-backend` | 외주 백엔드 인수 6-agent + 23 메뉴 풀스택 지도 + cross-ref | ✅ main |
| **B2** | `/playbook-status` | `INTERNALIZATION_PLAYBOOK.md` 진행도 자동 체크 | ✅ main |
| **B3** | `/findings-backlog` | bridge §5 + ingest §0 → 발견 사항 백로그 자동 추출 (수동 1~2h → 자동 5분) | ✅ main |
| **C1** | `/pr-context` | PR 변경 파일 → 영향 화면/API/DB 지도 | ✅ main |
| **C2** | `/ui-smoke` | 메뉴 문서 기반 Playwright 시나리오 (user 11 + admin 12 배치 완료, tsc 게이트 포함) | ✅ main |
| **D1** | `/db-impact` | DB 마이그레이션 SQL → 영향 메뉴/EP/Repository 역추적 | ✅ main |
| **D3** | `/dep-health` | npm outdated + audit 합쳐 위험 등급 매기는 분기 점검 | ✅ main |
| Aux | `/regression-diff` | A1/A2/D3 리포트 N→N+1 회귀 자동 감지 (결정적 bash 파싱, LLM 미호출) | ✅ main |
| D2 | `/i18n-extract` | 다국어 키 누락 탐지 | ⏭️ 보류 (medipanda-web i18n 미사용) |

운영 루틴(언제·누가·어떤 트리거)은 [`OPERATIONS_GUIDE.md`](OPERATIONS_GUIDE.md), 설계·우선순위 근거는 [`AUTOMATION_PLAN.md`](AUTOMATION_PLAN.md), 산출물 전수 색인은 [`INDEX.md`](INDEX.md) 참조.

---

## 로컬 설치 (슬래시 커맨드 활성화)

이 레포에 파일만 있어도 Claude Code는 인식하지 못함. `~/.claude/{agents,commands}/`에 **심볼릭 링크**를 걸어야 `/audit-menu-routes` 같은 슬래시 커맨드가 동작.

```bash
REPO=/Users/jmk0629/Downloads/homework/claude-opus-test

# agents·commands 일괄 (각 디렉토리 내 모든 .md 파일)
for f in $REPO/agents/*.md;   do ln -sf "$f" ~/.claude/agents/$(basename "$f");   done
for f in $REPO/commands/*.md; do ln -sf "$f" ~/.claude/commands/$(basename "$f"); done
```

심볼릭 링크이므로 레포에서 수정하면 즉시 반영됨.

---

## 사용 예시

```
# 기본 (대상: /Users/jmk0629/keymedi/medipanda-web)
/audit-menu-routes
/sync-api-docs
/verify-frontend-contract

# 다른 레포에 적용
/audit-menu-routes /path/to/other-repo
```

실행 결과는 [`reports/<command>-YYYYMMDD.md`](reports/)에 저장.

---

## 로컬 검증 URL

medipanda-web은 **admin / user 듀얼 앱**이라 포트가 분리돼 있음.

- Admin: `http://localhost:5173/admin/...`
- User: `http://localhost:5174/...`

리포트의 "수동 검증 권장 항목"은 이 구분을 따름.

---

## 기여 워크플로

1. 신규 자동화 = feature 브랜치 (`feature/<id>-<slug>`)
2. `agents/` · `commands/` · `reports/` 업데이트
3. `~/.claude/`에 심볼릭 링크 등록 후 실제 실행
4. PR 생성 → CI(`.github/workflows/ci.yml`)가 frontmatter 검증
5. 머지 후 `AUTOMATION_PLAN.md`의 진행 상태 업데이트

---

## 모델 전략

| 작업 | 모델 |
|------|------|
| 탐색·매핑(Grep 많음) | haiku |
| 문서 작성·감사 | sonnet |
| 설계(planner류) | opus |

토큰 예산 방어가 필수 — agent frontmatter의 `model:` 필드로 명시.

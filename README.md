# claude-opus-test

Claude Code 서브에이전트 기반 **하네스 엔지니어링(harness engineering) 실험실**.
[medipanda-web](https://github.com/) 프론트엔드에서 반복되는 **드리프트·계약 위반·보안 구멍 탐지**를 슬래시 커맨드 한 줄로 자동화하는 것이 목표.

---

## 구조

```
claude-opus-test/
├── AUTOMATION_PLAN.md      전체 자동화 로드맵 (A1~C2, P0~P3)
├── agents/                 서브에이전트 정의 (frontmatter + 지시문)
│   ├── route-auditor.md
│   ├── api-doc-writer.md        (feature/a1 PR)
│   ├── impact-scanner.md        (feature/a1 PR)
│   └── contract-checker.md      (feature/a2 PR)
├── commands/               슬래시 커맨드 정의
│   ├── audit-menu-routes.md
│   ├── sync-api-docs.md         (feature/a1 PR)
│   └── verify-frontend-contract.md  (feature/a2 PR)
├── reports/                실제 실행 결과 아카이브
├── test/                   튜토리얼 4인방(planner/developer/tester/reviewer)
└── .github/
    ├── workflows/ci.yml    agent/command frontmatter 검증
    └── PULL_REQUEST_TEMPLATE.md
```

---

## 현재 진행 상태 (2026-04-17)

| # | 이름 | 목적 | 상태 |
|---|------|------|------|
| **A3** | `/audit-menu-routes` | menus ↔ routes ↔ guards 정합성 (보안 구멍 탐지) | **merged** |
| **A1** | `/sync-api-docs` | `backend.ts` ↔ API 문서 드리프트 탐지 | PR open |
| **A2** | `/verify-frontend-contract` | orphan call / arity mismatch / axios bypass / hardcoded URL | PR open |
| B1 | `/ingest-medipanda-backend` | 외주 백엔드 인수 시 `/ingest-backend` 래퍼 + cross-ref | 예정 |
| B2 | `/playbook-status` | `INTERNALIZATION_PLAYBOOK.md` 진행도 자동 체크 | 예정 |
| C1 | `/pr-context` | PR 변경 파일 → 영향 화면/API/DB 지도 | 예정 |
| C2 | `/ui-smoke` | 메뉴 문서 기반 Playwright 시나리오 생성 | 예정 |

자세한 설계·우선순위 근거는 [`AUTOMATION_PLAN.md`](AUTOMATION_PLAN.md) 참조.

---

## 로컬 설치 (슬래시 커맨드 활성화)

이 레포에 파일만 있어도 Claude Code는 인식하지 못함. `~/.claude/{agents,commands}/`에 **심볼릭 링크**를 걸어야 `/audit-menu-routes` 같은 슬래시 커맨드가 동작.

```bash
REPO=/Users/jmk0629/Downloads/homework/claude-opus-test

# agents
ln -s $REPO/agents/route-auditor.md       ~/.claude/agents/route-auditor.md
ln -s $REPO/agents/api-doc-writer.md      ~/.claude/agents/api-doc-writer.md
ln -s $REPO/agents/impact-scanner.md      ~/.claude/agents/impact-scanner.md
ln -s $REPO/agents/contract-checker.md    ~/.claude/agents/contract-checker.md

# commands
ln -s $REPO/commands/audit-menu-routes.md       ~/.claude/commands/audit-menu-routes.md
ln -s $REPO/commands/sync-api-docs.md           ~/.claude/commands/sync-api-docs.md
ln -s $REPO/commands/verify-frontend-contract.md ~/.claude/commands/verify-frontend-contract.md
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

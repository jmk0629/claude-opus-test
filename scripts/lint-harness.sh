#!/usr/bin/env bash
# lint-harness.sh — 하네스 자가 검증
# 사용: bash scripts/lint-harness.sh
# CI 와 로컬 둘 다 실행. fail = 드리프트 있음.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAIL=0
note() { printf '\033[1;36m[lint]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok:\033[0m  %s\n' "$*"; }
err()  { printf '\033[1;31m  err:\033[0m %s\n' "$*"; FAIL=1; }
warn() { printf '\033[1;33m  warn:\033[0m %s\n' "$*"; }

# ============================================================
# Job 1: agent/command frontmatter schema (strict)
# ============================================================
note "Job 1: agent/command frontmatter schema"

check_frontmatter() {
  local file="$1" type="$2"
  local required keys
  if [ "$type" = agent ]; then
    required=(name description tools model)
  else
    required=(description)
  fi
  if ! head -1 "$file" | grep -q '^---$'; then
    err "$file: missing frontmatter"
    return
  fi
  local fm
  fm=$(awk '/^---$/{c++; next} c==1' "$file")
  for key in "${required[@]}"; do
    if ! printf '%s\n' "$fm" | grep -q "^$key:"; then
      err "$file: missing '$key'"
    fi
  done
  if [ "$type" = agent ]; then
    local name_field
    name_field=$(printf '%s\n' "$fm" | awk -F': *' '/^name:/{print $2; exit}')
    local basename_no_ext
    basename_no_ext=$(basename "$file" .md)
    if [ "$name_field" != "$basename_no_ext" ]; then
      err "$file: name field '$name_field' != filename '$basename_no_ext'"
    fi
  fi
}

shopt -s nullglob
for f in agents/*.md test/agents/*.md; do
  [ -f "$f" ] || continue
  check_frontmatter "$f" agent
done
for f in commands/*.md test/commands/*.md; do
  [ -f "$f" ] || continue
  check_frontmatter "$f" command
done
[ "$FAIL" = 0 ] && ok "frontmatter schema clean"

# ============================================================
# Job 2: documentation drift (commands ↔ INDEX/README/PLAN/GUIDE)
# ============================================================
note "Job 2: documentation drift"

# 활성 commands (D2 처럼 보류된 건 commands/ 에 파일 없음)
mapfile -t CMDS < <(ls commands/*.md 2>/dev/null | xargs -n1 basename | sed 's/\.md$//' | sort)
ACTIVE_COUNT=${#CMDS[@]}
note "  활성 커맨드 ${ACTIVE_COUNT}개: ${CMDS[*]}"

check_doc_lists_command() {
  local doc="$1" pattern="$2" label="$3"
  for c in "${CMDS[@]}"; do
    # /command-name 또는 `command-name` 형태로 적어도 한 번 등장해야 함
    if ! grep -qE "(/$c\b|\`$c\`|\`/$c\`)" "$doc"; then
      err "$doc: $label 에 '/$c' 언급 없음"
    fi
  done
}

[ -f INDEX.md ]            && check_doc_lists_command INDEX.md            "" "INDEX"
[ -f README.md ]           && check_doc_lists_command README.md           "" "README"
[ -f AUTOMATION_PLAN.md ]  && check_doc_lists_command AUTOMATION_PLAN.md  "" "AUTOMATION_PLAN"
[ -f OPERATIONS_GUIDE.md ] && check_doc_lists_command OPERATIONS_GUIDE.md "" "OPERATIONS_GUIDE"

# ============================================================
# Job 3: cross-reference integrity (bridge·findings 인용 파일 실재 검증)
# ============================================================
note "Job 3: cross-reference integrity"

# 3a. bridge 파일 23개 존재 확인 (medipanda B1 산출물)
if [ -d reports/bridge ]; then
  bridge_count=$(ls reports/bridge/*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$bridge_count" -ne 23 ]; then
    warn "reports/bridge/*.md 가 ${bridge_count}개 (기대 23, B1 메뉴 수)"
  else
    ok "bridge 파일 23개"
  fi
fi

# 3b. findings-backlog 가 인용한 bridge 파일 모두 실재
latest_findings=$(ls -t reports/findings-backlog-*.md 2>/dev/null | head -1)
if [ -n "$latest_findings" ]; then
  # `bridge/<name>` 패턴 추출
  missing=$(grep -oE 'bridge/[a-z0-9-]+\.md' "$latest_findings" | sort -u | while read -r ref; do
    [ -f "reports/$ref" ] || echo "$ref"
  done)
  if [ -n "$missing" ]; then
    err "$latest_findings 인용 누락 bridge:"
    while read -r m; do
      [ -n "$m" ] && err "  - $m"
    done <<< "$missing"
  else
    ok "findings-backlog 인용 무결"
  fi
fi

# 3c. ingest summary 인용한 bridge 파일 실재
ingest_summary=$(ls -t reports/ingest-medipanda-backend-*.md 2>/dev/null | head -1)
if [ -n "$ingest_summary" ]; then
  missing=$(grep -oE 'bridge/[a-z0-9-]+\.md' "$ingest_summary" | sort -u | while read -r ref; do
    [ -f "reports/$ref" ] || echo "$ref"
  done)
  if [ -n "$missing" ]; then
    err "$ingest_summary 인용 누락 bridge:"
    while read -r m; do
      [ -n "$m" ] && err "  - $m"
    done <<< "$missing"
  else
    ok "ingest summary 인용 무결"
  fi
fi

# ============================================================
# Job 4: report presence (커맨드별 리포트 1건 이상)
# ============================================================
note "Job 4: report presence"

# Job 1 에서 켠 nullglob 가 살아있으면 매치 0건일 때 ls 가 CWD 를 리스트 → 검증 무력화.
shopt -u nullglob

for c in "${CMDS[@]}"; do
  # 리포트 파일명은 보통 <command>-YYYYMMDD*.md 또는 <command-base>-YYYYMMDD*.md
  base=${c%-*}  # 예: dep-health-fix → dep-health
  if compgen -G "reports/${c}-*.md" > /dev/null; then
    : # match
  elif compgen -G "reports/${base}-*.md" > /dev/null; then
    : # base match (예: ui-smoke → ui-smoke-batch-* 등)
  else
    warn "/$c: reports/ 에 리포트 없음 (한 번도 안 돌렸거나 명명 규칙 변경)"
  fi
done

# ============================================================
# 결과
# ============================================================
echo
if [ "$FAIL" = 0 ]; then
  printf '\033[1;32m✅ lint-harness PASS\033[0m\n'
  exit 0
else
  printf '\033[1;31m❌ lint-harness FAIL\033[0m — drift 발견. 위 err 라인 수정 후 재실행.\n'
  exit 1
fi

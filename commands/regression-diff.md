---
description: A1/A2/D3/C2/B1/B2/B3 리포트 + B1 bridge 스냅샷 + D3 transitive CVE 의 행 단위 diff (신규/해소/변경). 결정적 bash 파싱, LLM 미호출. 베이스라인 회귀 자동 감지.
argument-hint: <command-name> [|prev_report] [|curr_report]
---

# /regression-diff

`sync-api-docs` / `verify-frontend-contract` / `dep-health` / `dep-health-gradle-transitive` / `ui-smoke` / `ingest-medipanda-backend` / `bridge` / `playbook-status` / `findings-backlog` 의 N→N+1 행 단위 비교. **결정적 bash 파싱, LLM 미호출**.

A1/A2/D3/C2/B1/B2/B3 두 번째 실행마다 자동으로 직전 실행 대비 신규/해소/변경 카운트가 나오게 하는 게 목적. 매번 수동 비교 불필요. `playbook-status` 는 **정체 감지** (18 항목 상태 변동 0 = 한 주 진척 없음). `findings-backlog` 는 **P0/P1 SLA 추적** (P0 신규 = 외주사 즉시 통보 트리거, §1 자동 crit 격상).

`bridge` 는 ingest-medipanda-backend 와 다른 데이터 소스: `reports/bridge-snapshot-YYYYMMDD/` 디렉토리 2개를 비교하여 23 bridge × §5 R-items 의 신규/해소를 추적. 사전에 `bash scripts/bridge-snapshot.sh` 로 스냅샷 떠둬야 함.

`dep-health-gradle-transitive` 는 D3 deep 모드(`scripts/gradle-deps-transitive.sh`) 산출물 비교 — transitive 의존성에 새 CRIT/HIGH CVE 가 등장하거나 해소된 경우 자동 카운트. 키: `CVE::module:version`.

`$ARGUMENTS`:
- 1st: `command-name` ∈ `{sync-api-docs, verify-frontend-contract, dep-health, dep-health-gradle-transitive, ui-smoke, ingest-medipanda-backend, bridge, playbook-status, findings-backlog}` (필수)
- 2nd (선택): `prev_report` 절대경로. 미지정 시 자동으로 두 번째 최신. (ui-smoke / bridge 는 무시 — 자동 picking)
- 3rd (선택): `curr_report` 절대경로. 미지정 시 자동으로 가장 최신.

---

## Phase 0. 사전점검

```bash
CMD="${1:?command-name 필수: sync-api-docs|verify-frontend-contract|dep-health}"
ROOT=/Users/jmk0629/Downloads/homework/claude-opus-test
cd "$ROOT"

# 한글 키가 섞여 있고 bridge 추출은 100-byte 절단이라 멀티바이트 중간 절단 가능 →
# sort/comm 가 "illegal byte sequence" 로 죽음. LC_ALL=C 로 byte 정렬 강제.
# 같은 입력은 같은 byte 열을 만들므로 결정적 diff 는 유지.
export LC_ALL=C

case "$CMD" in
  sync-api-docs|verify-frontend-contract|dep-health|dep-health-gradle-transitive|ui-smoke|ingest-medipanda-backend|bridge|playbook-status|findings-backlog) ;;
  *) echo "❌ 지원 command: sync-api-docs|verify-frontend-contract|dep-health|dep-health-gradle-transitive|ui-smoke|ingest-medipanda-backend|bridge|playbook-status|findings-backlog"; exit 1 ;;
esac

# 리포트 후보 — ui-smoke / bridge 는 별도 데이터 소스이므로 Phase 3 에서 직접 처리.
if [ "$CMD" != "ui-smoke" ] && [ "$CMD" != "bridge" ]; then
  # `-diff-` 접미사 (본 커맨드 출력) 는 후보에서 제외.
  # findings-backlog 는 `-auto-validation` 변종 (다른 포맷) 도 제외.
  mapfile -t reports < <(ls -t reports/${CMD}-*.md 2>/dev/null | grep -v -- '-diff-' | grep -v -- '-auto-validation')
  if [ "${#reports[@]}" -lt 2 ]; then
    echo "ℹ️  ${CMD} 리포트가 ${#reports[@]}건 — 베이스라인 부재. 다음 실행 시 본 커맨드 호출하여 회귀 비교 시작."
    exit 0
  fi

  CURR="${3:-${reports[0]}}"
  PREV="${2:-${reports[1]}}"
  [ -f "$CURR" ] && [ -f "$PREV" ] || { echo "❌ 입력 파일 없음 prev=$PREV curr=$CURR"; exit 1; }
  echo "비교: prev=$PREV  ↔  curr=$CURR"
fi
```

---

## Phase 1. 행 키 추출 (command 별)

각 command 의 표 구조에 맞춘 키 추출 함수.

### sync-api-docs (A1)

리포트 §M1·M2·M3 표의 첫 컬럼 (함수명) 을 키로 사용.

```bash
extract_a1() {
  local file="$1" section="$2"  # section ∈ M1|M2|M3
  awk -v sec="^## $section\\." '
    $0 ~ sec { in_sec=1; next }
    /^## / { in_sec=0 }
    in_sec && /^\| / && !/^\| -/ && !/함수명/ {
      # 첫 컬럼 추출
      gsub(/^\| /, "")
      sub(/ \|.*$/, "")
      print
    }
  ' "$file" | sort -u
}
```

### verify-frontend-contract (A2)

§C1·C2·C3·C4 표. 키는 `함수명/경로 + 파일:라인` 조합.

```bash
extract_a2() {
  local file="$1" section="$2"  # section ∈ C1|C2|C3|C4
  awk -v sec="^## $section\\." '
    $0 ~ sec { in_sec=1; next }
    /^## / { in_sec=0 }
    in_sec && /^\| / && !/^\| -/ && !/함수명|호출 함수명|HTTP method|파일:라인/ {
      gsub(/^\| /, "")
      # 첫 2 컬럼 join (보통 함수+위치 또는 method+path)
      n = split($0, a, " \\| ")
      print a[1] "::" a[2]
    }
  ' "$file" | sort -u
}
```

### dep-health (D3)

§1·2·3 표 (CRIT/HIGH/MED 패키지 목록) + §4 (npm audit). 키는 `패키지 + severity`.

```bash
extract_d3() {
  local file="$1" section="$2"  # section ∈ 1|2|3|4
  awk -v sec="^## $section\\." -v sec_num="$section" '
    $0 ~ sec { in_sec=1; next }
    /^## / { in_sec=0 }
    in_sec && /^\| / && !/^\| -/ && !/패키지|^\| #/ {
      gsub(/^\| /, "")
      n = split($0, a, " \\| ")
      # §1~3: a[2]=패키지 / §4: a[1]=패키지 + a[2]=severity
      if (sec_num == "4") print a[1] "::" a[2]
      else print a[2]
    }
  ' "$file" | sort -u
}
```

### dep-health-gradle-transitive (D3 deep)

`reports/dep-health-gradle-transitive-YYYYMMDD-<basename>.md` 의 §1·2·3·4 (CRIT/HIGH/MED/LOW) CVE 표. 키: `CVE::module:version` — 같은 transitive 가 같은 CVE 로 다시 보이면 유지, 새 CVE 또는 새 모듈로 등장하면 신규.

```bash
extract_d3_transitive() {
  local file="$1" section="$2"  # section ∈ 1|2|3|4
  awk -v sec="^## $section\\." '
    $0 ~ sec { in_sec=1; next }
    /^## / { in_sec=0 }
    in_sec && /^\| / && !/^\| -/ && !/^\| CVSS/ {
      gsub(/^\| /, "")
      gsub(/ \|$/, "")
      n = split($0, a, " \\| ")
      # a[1]=CVSS a[2]=CVE a[3]=`module:ver` a[4]=`via:ver` a[5]=summary
      cve = a[2]; mod = a[3]
      gsub(/`/, "", cve); gsub(/`/, "", mod)
      gsub(/^[ \t]+/, "", cve); gsub(/[ \t]+$/, "", cve)
      gsub(/^[ \t]+/, "", mod); gsub(/[ \t]+$/, "", mod)
      if (cve != "" && mod != "") print cve "::" mod
    }
  ' "$file" | sort -u
}
```

### findings-backlog (B3)

`reports/findings-backlog-YYYYMMDD.md` 의 §1 P0 + §2 P1 표 (`| ID | 메뉴 | 항목 | 근거 | 액션 |`) 를 우선순위별로 추출. ID 번호는 회차마다 재번호되지만 **항목 첫 80자** 가 안정 키. 키: `<P0|P1>::메뉴::항목 첫 80자`.

§3 P2 부터는 ID 컬럼 부재 + 메뉴 그룹화 → 키 안정성 떨어져 **본 커맨드는 P0/P1 만 추적** (외주사 즉시 통보 + 이번 스프린트 actionable tier). P2/P3/P4 는 분기 1회 사람 검토.

P0 신규 등장 시 출력 §1 라벨이 `### §1 P0` 으로 시작하므로 기존 `### §1` trigger 가 자동 crit 격상 (외주사 즉시 통보). dep-health §1 CRIT 와 동일 트리거 재사용.

```bash
extract_findings() {
  local file="$1" priority="$2"  # priority ∈ P0|P1
  awk -v pri="$priority" '
    {
      pat = "^\\| " pri "-[0-9]+ \\|"
      if ($0 ~ pat) {
        gsub(/^\| /, "")
        gsub(/ \|$/, "")
        n = split($0, a, " \\| ")
        for (i=1; i<=n; i++) { gsub(/^[ \t]+/, "", a[i]); gsub(/[ \t]+$/, "", a[i]) }
        # a[1]=ID(P0-N) a[2]=메뉴 a[3]=항목 a[4]=근거 a[5]=액션
        menu = a[2]; item = a[3]
        gsub(/`/, "", item)
        gsub(/\*\*/, "", item)
        if (length(item) > 80) item = substr(item, 1, 80)
        if (item != "") print pri "::" menu "::" item
      }
    }
  ' "$file" | sort -u
}
```

### playbook-status (B2)

`reports/playbook-status-YYYYMMDD.md` 의 §섹션별 체크리스트 표 — `| ID | 항목 | 상태 | 증거 | 비고 |` 구조에서 ID + 상태(✅/⚠️/⬜/❓)를 키로 사용. 키: `ID::상태`.

상태가 한 주만에 같으면 prev/curr 양쪽에 같은 키 → `유지`. 상태 바뀌면 prev 의 옛 키는 `해소`, curr 의 새 키는 `신규`. 따라서 신규 합계 = 그 주에 상태 변경된 항목 수, `유지` = 변동 없는 항목 수. **신규 0 = 정체** (한 주 진척 없음 신호).

```bash
extract_playbook() {
  local file="$1"
  awk '
    /^\| (P[012]-[0-9]+) \|/ {
      gsub(/^\| /, "")
      gsub(/ \|$/, "")
      n = split($0, a, " \\| ")
      for (i=1; i<=n; i++) { gsub(/^[ \t]+/, "", a[i]); gsub(/[ \t]+$/, "", a[i]) }
      # | ID | 항목 | 상태 | 증거 | 비고 | — a[1]=ID a[3]=상태
      if (a[1] != "" && a[3] != "") print a[1] "::" a[3]
    }
  ' "$file" | sort -u
}
```

### ingest-medipanda-backend (B1)

`reports/ingest-medipanda-backend-YYYYMMDD.md` 의 §0 한 장 요약 안에 있는 두 표를 키로 사용.

- **§0 ### 백엔드 규모**: `Controller / 엔드포인트 / @Service / Repository / @Entity / Enum / Aggregate` 카운트 — 스케일 변동 (외주가 새 모듈을 추가했는지 등) 감지. 키: `항목::수치`.
- **§0 ### 즉시 대응 필요 Top N**: 보안/리스크 항목 — 신규 발견 / 해소된 항목을 자동 카운트. 키: `<제목 (— 앞 부분)>::<심각도>`.

bridge §5 (RN. 항목) 의 행 단위 diff 는 별도 스냅샷 디렉토리(`reports/bridge-snapshot-YYYYMMDD/`)가 있어야 가능 — 현 버전은 ingest summary 만 처리. 분기 B1 재실행 직전 `cp -r reports/bridge reports/bridge-snapshot-$(date +%Y%m%d)` 로 스냅샷을 떠두면 다음 회 확장에서 활용.

```bash
extract_b1() {
  local file="$1" subsection="$2"  # subsection ∈ "scale" | "top"
  # NOTE: awk var 명에 `sub` 사용 금지 — gsub/sub 빌트인과 충돌. `mode` 사용.
  awk -v mode="$subsection" '
    /^## 0\./ { in_zero=1; next }
    /^## / && !/^## 0\./ { in_zero=0; in_sec=0 }
    in_zero && /^### 백엔드 규모/   { in_sec = (mode=="scale" ? 1 : 0); next }
    in_zero && /^### 즉시 대응/      { in_sec = (mode=="top"   ? 1 : 0); next }
    in_zero && /^### / { in_sec=0 }
    in_sec && /^\| / && !/^\| -/ && !/^\| 항목|^\| 순위/ {
      gsub(/^\| /, "")
      gsub(/ \|$/, "")
      n = split($0, a, " \\| ")
      for (i=1; i<=n; i++) { gsub(/^[ \t]+/, "", a[i]); gsub(/[ \t]+$/, "", a[i]) }
      if (mode == "scale") {
        # | 항목 | 수치 | 출처 |
        print a[1] "::" a[2]
      } else {
        # | 순위 | 항목 | 심각도 | 출처 |  →  항목 첫 절 (` — ` 앞) + 심각도
        title = a[2]
        idx = index(title, " — ")
        if (idx > 0) title = substr(title, 1, idx-1)
        gsub(/\*\*/, "", title)
        print title "::" a[3]
      }
    }
  ' "$file" | sort -u
}
```

### bridge (B1 §5 행 단위)

`reports/bridge-snapshot-YYYYMMDD/` 디렉토리 2개를 비교. 각 bridge 의 §5 리스크 / 후속 액션 항목을 행으로 추출. 키: `bridge_basename::항목 첫 100자`.

bridge 작성자별 §5 포맷이 일관되지 않음 (`- R1. ...`, `- **R1**: ...`, `| R1 | ... |`, `1. **label**: ...` 등) — permissive 패턴으로 bullet / numbered / table 행 모두 잡고, backtick·`**` 마크다운 노이즈 제거 후 100자 절단해 안정 키 생성. 표 separator(`| --- |`)는 제외. 다소 noisy 하지만 false-negative(놓침)보다는 conservative.

```bash
extract_bridge() {
  local snapshot_dir="$1"
  shopt -u nullglob
  for f in "$snapshot_dir"/*.md; do
    [ -f "$f" ] || continue
    local bridge
    bridge=$(basename "$f" .md)
    awk -v bridge="$bridge" '
      /^## 5\./ { in_sec=1; next }
      /^## / { in_sec=0 }
      # bullet, numbered list, table row (separator 제외)
      in_sec && (/^- / || /^[0-9]+\. / || (/^\| / && !/^\| -/)) {
        line = $0
        gsub(/[`*]/, "", line)
        gsub(/[ \t]+$/, "", line); gsub(/^[ \t]+/, "", line)
        if (length(line) > 100) line = substr(line, 1, 100)
        if (line != "") print bridge "::" line
      }
    ' "$f"
  done | sort -u
  # NOTE: 100-byte 절단으로 멀티바이트 중간이 잘릴 수 있음 — Phase 0 의 LC_ALL=C 가 byte-sort 보장.
}
```

### ui-smoke (C2)

`reports/ui-smoke-batch-{admin,user}-YYYYMMDD.md` 의 산출물 인벤토리 표. 키는 `spec명::시나리오수::tsc상태` — 메뉴 추가/삭제, 시나리오 증감, tsc 통과 여부 변동을 한 번에 감지.

admin 배치는 `## 2. 산출물 인벤토리` + tsc 컬럼, user 배치는 `## 생성 요약` + tsc 컬럼 없음 — 두 포맷을 한 awk 로 적응형 처리. spec 컬럼 패턴(`(admin|user)-NN-`)으로 spec 찾고, 그 다음 첫 숫자 컬럼이 시나리오, ✅/❌ 셀이 있으면 tsc 로 채택. `.spec.ts` 접미사는 정규화 위해 제거.

```bash
extract_ui_smoke() {
  local file="$1"
  awk '
    /^## (2\. 산출물|생성 요약)/ { in_sec=1; next }
    /^## / { in_sec=0 }
    in_sec && /^\| / && !/^\| -/ && !/메뉴|^\| #|합계/ {
      gsub(/^\| /, "")
      gsub(/ \|$/, "")
      n = split($0, a, " \\| ")
      spec=""; sc=""; tsc=""
      for (i=1; i<=n; i++) {
        gsub(/^[ \t]+/, "", a[i]); gsub(/[ \t]+$/, "", a[i])
        if (a[i] ~ /^(admin|user)-[0-9]+-/) {
          spec = a[i]
          sub(/\.spec\.ts$/, "", spec)
        }
        else if (a[i] ~ /^[0-9]+$/ && spec != "" && sc == "") sc = a[i]
        else if (a[i] ~ /^(✅|❌)/) tsc = a[i]
      }
      if (spec != "") {
        if (tsc == "") tsc = "?"
        print spec "::scenarios=" sc "::tsc=" tsc
      }
    }
  ' "$file" | sort -u
}
```

---

## Phase 2. set diff (신규 / 해소 / 공통)

```bash
diff_section() {
  local label="$1" prev_keys="$2" curr_keys="$3"
  local added removed common
  added=$(comm -13 <(echo "$prev_keys") <(echo "$curr_keys"))
  removed=$(comm -23 <(echo "$prev_keys") <(echo "$curr_keys"))
  common=$(comm -12 <(echo "$prev_keys") <(echo "$curr_keys"))

  local n_add n_rem n_com
  n_add=$(echo "$added" | grep -c '^[^[:space:]]')
  n_rem=$(echo "$removed" | grep -c '^[^[:space:]]')
  n_com=$(echo "$common" | grep -c '^[^[:space:]]')

  echo "### $label"
  echo "- 신규 **$n_add** / 해소 **$n_rem** / 유지 **$n_com**"
  if [ "$n_add" -gt 0 ]; then
    echo
    echo "**신규:**"
    echo "$added" | sed 's/^/- /'
  fi
  if [ "$n_rem" -gt 0 ]; then
    echo
    echo "**해소:**"
    echo "$removed" | sed 's/^/- /'
  fi
}
```

---

## Phase 3. 출력

```bash
DATE=$(date +%Y%m%d)
OUT="reports/${CMD}-diff-${DATE}.md"

{
  echo "# ${CMD} 회귀 비교 — $DATE"
  echo
  if [ "$CMD" != "ui-smoke" ]; then
    echo "> prev: \`$(basename "$PREV")\`"
    echo "> curr: \`$(basename "$CURR")\`"
  fi
  echo "> 결정적 bash 파싱 (LLM 미호출), 행 단위 set diff"
  echo

  case "$CMD" in
    sync-api-docs)
      for sec in M1 M2 M3; do
        prev=$(extract_a1 "$PREV" "$sec")
        curr=$(extract_a1 "$CURR" "$sec")
        diff_section "$sec" "$prev" "$curr"
        echo
      done
      ;;
    verify-frontend-contract)
      for sec in C1 C2 C3 C4; do
        prev=$(extract_a2 "$PREV" "$sec")
        curr=$(extract_a2 "$CURR" "$sec")
        diff_section "$sec" "$prev" "$curr"
        echo
      done
      ;;
    dep-health)
      for sec in 1 2 3 4; do
        prev=$(extract_d3 "$PREV" "$sec")
        curr=$(extract_d3 "$CURR" "$sec")
        case "$sec" in
          1) label="§1 CRIT" ;;
          2) label="§2 HIGH" ;;
          3) label="§3 MED" ;;
          4) label="§4 npm audit" ;;
        esac
        diff_section "$label" "$prev" "$curr"
        echo
      done
      ;;
    dep-health-gradle-transitive)
      for sec in 1 2 3 4; do
        prev=$(extract_d3_transitive "$PREV" "$sec")
        curr=$(extract_d3_transitive "$CURR" "$sec")
        case "$sec" in
          1) label="§1 CRIT (CVE::module:version)" ;;
          2) label="§2 HIGH (CVE::module:version)" ;;
          3) label="§3 MED (CVE::module:version)" ;;
          4) label="§4 LOW (CVE::module:version)" ;;
        esac
        diff_section "$label" "$prev" "$curr"
        echo
      done
      ;;
    bridge)
      # 의미론 고정: reports/bridge/ = curr (최신 B1 산출물), 가장 최신 snapshot = prev.
      # mtime 정렬 못 씀 — `cp -r` 로 막 만든 snapshot 의 mtime 이 live 보다 크기 쉬움.
      # snapshot 폴더명에 박힌 YYYYMMDD 를 키로 sort -r 해서 prev 결정.
      CURR_DIR=reports/bridge
      mapfile -t snaps < <(ls -d reports/bridge-snapshot-*/ 2>/dev/null | sort -r)
      if [ ! -d "$CURR_DIR" ]; then
        echo "_\`reports/bridge/\` 없음 — B1(/ingest-medipanda-backend) 미실행. 먼저 B1 부터._"
        echo
      elif [ "${#snaps[@]}" -lt 1 ]; then
        echo "_bridge snapshot 0건 — 베이스라인 부재. \`bash scripts/bridge-snapshot.sh\` 로 현재 \`reports/bridge/\` 를 보존 → 다음 B1 재실행 후 본 커맨드 호출._"
        echo
      else
        PREV_DIR="${snaps[0]%/}"
        echo "> prev: \`$(basename "$PREV_DIR")\` (snapshot)"
        echo "> curr: \`$(basename "$CURR_DIR")\` (live)"
        echo
        prev=$(extract_bridge "$PREV_DIR")
        curr=$(extract_bridge "$CURR_DIR")
        diff_section "23 bridge §5 R-items (bridge::항목)" "$prev" "$curr"
        echo
      fi
      ;;
    playbook-status)
      prev=$(extract_playbook "$PREV")
      curr=$(extract_playbook "$CURR")
      diff_section "B2 플레이북 18 항목 (ID::상태)" "$prev" "$curr"
      echo
      ;;
    findings-backlog)
      for pri in P0 P1; do
        case "$pri" in
          P0) label="§1 P0 (메뉴::항목)" ;;
          P1) label="§2 P1 (메뉴::항목)" ;;
        esac
        prev=$(extract_findings "$PREV" "$pri")
        curr=$(extract_findings "$CURR" "$pri")
        diff_section "$label" "$prev" "$curr"
        echo
      done
      ;;
    ingest-medipanda-backend)
      for sub in scale top; do
        prev=$(extract_b1 "$PREV" "$sub")
        curr=$(extract_b1 "$CURR" "$sub")
        case "$sub" in
          scale) label="§0 백엔드 규모 (항목::수치)" ;;
          top)   label="§0 즉시 대응 Top N (제목::심각도)" ;;
        esac
        diff_section "$label" "$prev" "$curr"
        echo
      done
      ;;
    ui-smoke)
      # admin / user 배치 각각 별도 회귀 추적
      for scope in admin user; do
        mapfile -t scope_reports < <(ls -t reports/ui-smoke-batch-${scope}-*.md 2>/dev/null | grep -v -- '-diff-')
        echo "## ${scope} 배치"
        if [ "${#scope_reports[@]}" -lt 2 ]; then
          echo "_${scope} 배치 리포트 ${#scope_reports[@]}건 — 베이스라인 부재._"
          echo
          continue
        fi
        echo "> prev: \`$(basename "${scope_reports[1]}")\`"
        echo "> curr: \`$(basename "${scope_reports[0]}")\`"
        echo
        prev=$(extract_ui_smoke "${scope_reports[1]}")
        curr=$(extract_ui_smoke "${scope_reports[0]}")
        diff_section "산출물 인벤토리 (spec::scenarios::tsc)" "$prev" "$curr"
        echo
      done
      ;;
  esac

  echo "## 결론"
  echo
  echo "- 신규 항목 0건이면 회귀 위험 0, 해소만 있으면 개선."
  echo "- 신규 ≥ 1건 시 PR 또는 운영 트리거 원인 추적."
  echo "- 다음 실행 시 본 diff 가 기준선 — 매 실행마다 자동으로 N+1 비교 누적."
} > "$OUT"

echo "✅ $OUT 생성 완료"

# 신규 회귀 합계 → 0 초과 시 macOS 로컬 알림 (osascript). 헬퍼가 mac 외 환경 폴백 처리.
# severity 격상: §1 CRIT 섹션(dep-health/dep-health-gradle-transitive 한정)에 신규 ≥ 1 → crit (음성).
TOTAL_ADDED=$(grep -oE '신규 \*\*[0-9]+\*\*' "$OUT" | grep -oE '[0-9]+' | awk '{s+=$1} END {print s+0}')
CRIT_ADDED=$(awk '
  /^### §1/ { in_crit=1; next }
  /^### /   { in_crit=0 }
  in_crit && /신규/ { print; exit }
' "$OUT" | grep -oE '신규 \*\*[0-9]+\*\*' | grep -oE '[0-9]+')
CRIT_ADDED=${CRIT_ADDED:-0}

if [ -x scripts/notify-local.sh ]; then
  if [ "$CRIT_ADDED" -gt 0 ]; then
    bash scripts/notify-local.sh "/regression-diff ${CMD}" "🔴 CRIT 신규 ${CRIT_ADDED}건 (전체 ${TOTAL_ADDED}) — $(basename "$OUT")" crit
  elif [ "${TOTAL_ADDED:-0}" -gt 0 ]; then
    bash scripts/notify-local.sh "/regression-diff ${CMD}" "신규 회귀 ${TOTAL_ADDED}건 — $(basename "$OUT")" warn
  fi
fi
```

---

## 사용 예시

```
# 가장 최근 2건 자동 비교
/regression-diff dep-health

# 특정 2건 명시
/regression-diff sync-api-docs reports/sync-api-docs-20260416.md reports/sync-api-docs-20260427.md

# A1/A2/D3 직후 권장 호출 (OPERATIONS_GUIDE §2.2)
/sync-api-docs && /regression-diff sync-api-docs
/verify-frontend-contract && /regression-diff verify-frontend-contract
/dep-health && /regression-diff dep-health

# ui-smoke 야간 배치 N→N+1 비교 (admin/user 배치 동시)
/regression-diff ui-smoke

# B1 분기 재실행 후 §0 백엔드 규모 + Top N 회귀 비교
/regression-diff ingest-medipanda-backend

# B1 bridge §5 R-items 행 단위 회귀 (사전: bash scripts/bridge-snapshot.sh)
/regression-diff bridge
```

---

## 설계 메모

- **LLM 미호출**: 파싱이 결정적이고 bash 만으로 충분. 매번 동일 입력 → 동일 출력 보장. 토큰 비용 0.
- **확장**: 새 command 추가 시 `extract_<cmd>` 함수 + `case` 분기 추가. 행 키 전략만 정의하면 됨.
- **한계**: 표 컬럼 순서/이름이 변하면 awk 파서 깨짐 — 리포트 포맷 변경 시 본 커맨드도 함께 갱신 필요. lint-harness Job 1 이 frontmatter 만 검증하므로 포맷 회귀는 본 커맨드 첫 실행 실패로 발견.

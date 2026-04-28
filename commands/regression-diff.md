---
description: A1/A2/D3 리포트 2건의 행 단위 diff (신규/해소/변경). 결정적 bash 파싱, LLM 미호출. 베이스라인 회귀 자동 감지.
argument-hint: <command-name> [|prev_report] [|curr_report]
---

# /regression-diff

`sync-api-docs` / `verify-frontend-contract` / `dep-health` 리포트 2건을 행 단위로 비교하여 회귀 여부를 한 페이지로 보여준다. **결정적 bash 파싱, LLM 미호출** — 빠르고 재현 가능.

A1/A2/D3 두 번째 실행마다 자동으로 직전 실행 대비 신규/해소/변경 카운트가 나오게 하는 게 목적. 매번 수동 비교 불필요.

`$ARGUMENTS`:
- 1st: `command-name` ∈ `{sync-api-docs, verify-frontend-contract, dep-health}` (필수)
- 2nd (선택): `prev_report` 절대경로. 미지정 시 자동으로 두 번째 최신.
- 3rd (선택): `curr_report` 절대경로. 미지정 시 자동으로 가장 최신.

---

## Phase 0. 사전점검

```bash
CMD="${1:?command-name 필수: sync-api-docs|verify-frontend-contract|dep-health}"
ROOT=/Users/jmk0629/Downloads/homework/claude-opus-test
cd "$ROOT"

case "$CMD" in
  sync-api-docs|verify-frontend-contract|dep-health) ;;
  *) echo "❌ 지원 command: sync-api-docs|verify-frontend-contract|dep-health"; exit 1 ;;
esac

# 리포트 후보
mapfile -t reports < <(ls -t reports/${CMD}-*.md 2>/dev/null)
if [ "${#reports[@]}" -lt 2 ]; then
  echo "ℹ️  ${CMD} 리포트가 ${#reports[@]}건 — 베이스라인 부재. 다음 실행 시 본 커맨드 호출하여 회귀 비교 시작."
  exit 0
fi

CURR="${3:-${reports[0]}}"
PREV="${2:-${reports[1]}}"
[ -f "$CURR" ] && [ -f "$PREV" ] || { echo "❌ 입력 파일 없음 prev=$PREV curr=$CURR"; exit 1; }
echo "비교: prev=$PREV  ↔  curr=$CURR"
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
  echo "> prev: \`$(basename "$PREV")\`"
  echo "> curr: \`$(basename "$CURR")\`"
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
  esac

  echo "## 결론"
  echo
  echo "- 신규 항목 0건이면 회귀 위험 0, 해소만 있으면 개선."
  echo "- 신규 ≥ 1건 시 PR 또는 운영 트리거 원인 추적."
  echo "- 다음 실행 시 본 diff 가 기준선 — 매 실행마다 자동으로 N+1 비교 누적."
} > "$OUT"

echo "✅ $OUT 생성 완료"
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
```

---

## 설계 메모

- **LLM 미호출**: 파싱이 결정적이고 bash 만으로 충분. 매번 동일 입력 → 동일 출력 보장. 토큰 비용 0.
- **확장**: 새 command 추가 시 `extract_<cmd>` 함수 + `case` 분기 추가. 행 키 전략만 정의하면 됨.
- **한계**: 표 컬럼 순서/이름이 변하면 awk 파서 깨짐 — 리포트 포맷 변경 시 본 커맨드도 함께 갱신 필요. lint-harness Job 1 이 frontmatter 만 검증하므로 포맷 회귀는 본 커맨드 첫 실행 실패로 발견.

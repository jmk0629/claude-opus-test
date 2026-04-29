#!/usr/bin/env bash
# gradle-deps-transitive.sh — Gradle 직접 의존성으로부터 transitive 트리 + CVE 를 deps.dev API 로 조회.
# 사용: bash scripts/gradle-deps-transitive.sh <gradle_root> [output_path]
# 입력: <gradle_root>/gradle/libs.versions.toml ([libraries] explicit version 만)
# 출력: dep-health-gradle-transitive-YYYYMMDD-<basename>.md
# 외부: HTTPS api.deps.dev 호출 (네트워크 필수). medipanda-* 디렉토리 read-only.
# 캐시: reports/cache/deps.dev/maven/<group>__<artifact>__<version>.json
#       및 advisory 별 reports/cache/deps.dev/advisory/<id>.json
# 결정적: 같은 deps.dev 응답 → 같은 리포트. 응답 변동 시 캐시 삭제 후 재실행.

set -uo pipefail
export LC_ALL=C

ROOT_TARGET="${1:?target_root 필수}"
DATE=$(date +%Y%m%d)
BASENAME=$(basename "$ROOT_TARGET")
HARNESS_ROOT=/Users/jmk0629/Downloads/homework/claude-opus-test
OUT="${2:-$HARNESS_ROOT/reports/dep-health-gradle-transitive-${DATE}-${BASENAME}.md}"
CACHE_DIR="$HARNESS_ROOT/reports/cache/deps.dev"
mkdir -p "$CACHE_DIR/maven" "$CACHE_DIR/advisory"

TOML="$ROOT_TARGET/gradle/libs.versions.toml"
[ -f "$TOML" ] || { echo "❌ $TOML 없음"; exit 1; }
command -v jq >/dev/null   || { echo "❌ jq 필수 (brew install jq)"; exit 1; }
command -v curl >/dev/null || { echo "❌ curl 필수"; exit 1; }

API=https://api.deps.dev/v3

# ============================================================
# Phase 0: libs.versions.toml [libraries] 의 explicit version 만 추출
# ============================================================
# [versions] 의 alias 도 따라가야 함: { module = "g:a", version.ref = "kotlin" }
# v1: 단순화 — version.ref 는 [versions] 에서 lookup, version = "X" 직접도 처리.
#   출력 line: "g:a|version"
parse_direct_deps() {
  awk '
    /^\[versions\]/ { sec="V"; next }
    /^\[libraries\]/ { sec="L"; next }
    /^\[/ && !/^\[versions\]/ && !/^\[libraries\]/ { sec=""; next }
    sec=="V" && /=/ {
      gsub(/[ \t"]/, ""); split($0, a, "=")
      if (a[1] != "" && a[2] != "") versions[a[1]] = a[2]
    }
    sec=="L" && /=/ {
      mod=""; ver=""; ref=""
      if (match($0, /module *= *"[^"]+"/)) {
        s=substr($0, RSTART, RLENGTH); gsub(/^module *= *"/, "", s); gsub(/"$/, "", s); mod=s
      }
      if (match($0, /version *= *"[^"]+"/)) {
        s=substr($0, RSTART, RLENGTH); gsub(/^version *= *"/, "", s); gsub(/"$/, "", s); ver=s
      }
      if (match($0, /version\.ref *= *"[^"]+"/)) {
        s=substr($0, RSTART, RLENGTH); gsub(/^version\.ref *= *"/, "", s); gsub(/"$/, "", s); ref=s
      }
      if (mod != "") {
        if (ver == "" && ref != "" && (ref in versions)) ver = versions[ref]
        if (ver != "") print mod "|" ver
      }
    }
  ' "$TOML" | sort -u
}

# ============================================================
# Phase 1: 직접 의존성마다 transitive 노드 수집 (캐시)
# ============================================================
url_encode_module() {
  # group:artifact → group%3Aartifact
  echo "$1" | sed 's/:/%3A/g'
}

fetch_deps() {
  local mod="$1" ver="$2"
  local enc cache
  enc=$(url_encode_module "$mod")
  cache="$CACHE_DIR/maven/${mod//:/__}__${ver}.deps.json"
  if [ ! -s "$cache" ]; then
    curl -sS --fail-with-body "$API/systems/MAVEN/packages/$enc/versions/$ver:dependencies" -o "$cache" 2>&1 || {
      echo "{\"nodes\":[],\"error\":\"fetch_failed\"}" > "$cache"
    }
    sleep 0.05  # 요청 간격 (api.deps.dev 부담 최소화)
  fi
  cat "$cache"
}

fetch_version() {
  local mod="$1" ver="$2"
  local enc cache
  enc=$(url_encode_module "$mod")
  cache="$CACHE_DIR/maven/${mod//:/__}__${ver}.ver.json"
  if [ ! -s "$cache" ]; then
    curl -sS --fail-with-body "$API/systems/MAVEN/packages/$enc/versions/$ver" -o "$cache" 2>&1 || {
      echo "{\"advisoryKeys\":[],\"error\":\"fetch_failed\"}" > "$cache"
    }
    sleep 0.05
  fi
  cat "$cache"
}

fetch_advisory() {
  local id="$1"
  local cache="$CACHE_DIR/advisory/${id}.json"
  if [ ! -s "$cache" ]; then
    curl -sS --fail-with-body "$API/advisories/$id" -o "$cache" 2>&1 || {
      echo "{\"advisoryKey\":{\"id\":\"$id\"},\"title\":\"(fetch_failed)\",\"cvss3Score\":0}" > "$cache"
    }
    sleep 0.05
  fi
  cat "$cache"
}

# ============================================================
# Phase 2: 메인 — 직접 deps 순회 → transitive 수집 → 중복 제거 → version + advisory 조회
# ============================================================
echo "[gradle-deps-transitive] 직접 의존성 추출 중..."
DIRECT_DEPS_FILE=$(mktemp)
parse_direct_deps > "$DIRECT_DEPS_FILE"
N_DIRECT=$(wc -l < "$DIRECT_DEPS_FILE" | tr -d ' ')
echo "[gradle-deps-transitive] 직접 의존성 ${N_DIRECT}건"

ALL_NODES_FILE=$(mktemp)  # group:artifact|version|via_direct_dep
i=0
while IFS='|' read -r mod ver; do
  i=$((i+1))
  echo "[gradle-deps-transitive] ($i/$N_DIRECT) deps: $mod:$ver"
  fetch_deps "$mod" "$ver" \
    | jq -r --arg via "$mod:$ver" '
        .nodes // [] |
        map(.versionKey | "\(.name)|\(.version)|\($via)") | .[]' \
    >> "$ALL_NODES_FILE" 2>/dev/null || true
done < "$DIRECT_DEPS_FILE"

# 중복 제거 (mod:ver 키, via 는 첫 만남 보존)
UNIQUE_NODES_FILE=$(mktemp)
awk -F'|' '!seen[$1"|"$2]++ {print}' "$ALL_NODES_FILE" > "$UNIQUE_NODES_FILE"
N_UNIQUE=$(wc -l < "$UNIQUE_NODES_FILE" | tr -d ' ')
echo "[gradle-deps-transitive] 고유 transitive 노드 ${N_UNIQUE}건 — advisory 조회 시작"

# 각 노드 advisoryKeys 조회 → CVE 리스트 작성
ADVISORY_HITS=$(mktemp)  # severity|cvss|cve|title|module:version|via
j=0
while IFS='|' read -r mod ver via; do
  j=$((j+1))
  if [ $((j % 25)) -eq 0 ]; then
    echo "[gradle-deps-transitive] advisory 조회 ($j/$N_UNIQUE)"
  fi
  ver_json=$(fetch_version "$mod" "$ver")
  ids=$(echo "$ver_json" | jq -r '.advisoryKeys // [] | .[].id' 2>/dev/null)
  [ -z "$ids" ] && continue
  while IFS= read -r aid; do
    [ -z "$aid" ] && continue
    adv=$(fetch_advisory "$aid")
    cvss=$(echo "$adv" | jq -r '.cvss3Score // 0' 2>/dev/null)
    title=$(echo "$adv" | jq -r '.title // "(no title)"' 2>/dev/null | tr '|' '/')
    cve=$(echo "$adv" | jq -r '.aliases // [] | map(select(startswith("CVE-"))) | .[0] // .advisoryKey.id // ""' 2>/dev/null)
    sev=LOW
    awk_in=$(echo "$cvss" | awk '{ if ($1 >= 9) print "CRIT"; else if ($1 >= 7) print "HIGH"; else if ($1 >= 4) print "MED"; else print "LOW" }')
    sev="$awk_in"
    echo "${sev}|${cvss}|${cve}|${title}|${mod}:${ver}|${via}" >> "$ADVISORY_HITS"
  done <<< "$ids"
done < "$UNIQUE_NODES_FILE"

# severity 별 카운트
N_CRIT=$(grep -c '^CRIT|' "$ADVISORY_HITS" 2>/dev/null || echo 0)
N_HIGH=$(grep -c '^HIGH|' "$ADVISORY_HITS" 2>/dev/null || echo 0)
N_MED=$(grep -c '^MED|'  "$ADVISORY_HITS" 2>/dev/null || echo 0)
N_LOW=$(grep -c '^LOW|'  "$ADVISORY_HITS" 2>/dev/null || echo 0)

# ============================================================
# Phase 3: 리포트
# ============================================================
emit_section() {
  local sev="$1" label="$2"
  local rows
  rows=$(grep "^${sev}|" "$ADVISORY_HITS" 2>/dev/null | sort -t'|' -k2,2nr -u)
  echo "## $label"
  echo
  if [ -z "$rows" ]; then
    echo "_없음._"
  else
    echo "| CVSS | CVE | 모듈 | via | 요약 |"
    echo "|------|-----|------|-----|------|"
    while IFS='|' read -r _ cvss cve title mod_ver via; do
      [ -z "$cvss" ] && continue
      echo "| $cvss | $cve | \`$mod_ver\` | \`$via\` | $title |"
    done <<< "$rows"
  fi
  echo
}

{
  echo "# /dep-health (gradle transitive) 리포트 — $(date +%Y-%m-%d) ($BASENAME)"
  echo
  echo "> 대상: \`$ROOT_TARGET\` (Gradle Version Catalog 기반)"
  echo "> 입력: \`gradle/libs.versions.toml\` [libraries] 의 explicit version → deps.dev API 로 transitive + advisory 조회"
  echo "> 외부: api.deps.dev (Google Open Source Insights). 캐시: \`reports/cache/deps.dev/\`"
  echo "> 생성: by scripts/gradle-deps-transitive.sh — 결정적 (캐시 hit 시 동일 출력)"
  echo
  echo "## 0. 한 장 요약"
  echo
  echo "- 직접 의존성: ${N_DIRECT}건 (Version Catalog [libraries] explicit version)"
  echo "- 고유 transitive 노드: ${N_UNIQUE}건 (직접 + 간접 합산, group:artifact:version dedupe)"
  echo "- Advisory: CRIT ${N_CRIT} / HIGH ${N_HIGH} / MED ${N_MED} / LOW ${N_LOW}"
  echo
  if [ "$N_CRIT" -gt 0 ]; then
    echo "**즉시 조치 필요 (CRIT):**"
    grep '^CRIT|' "$ADVISORY_HITS" | sort -t'|' -k2,2nr -u | head -10 | while IFS='|' read -r _ cvss cve _ mod_ver via; do
      echo "- \`$mod_ver\` (via \`$via\`) — $cve (CVSS $cvss)"
    done
    echo
  fi
  emit_section CRIT "1. CRIT (CVSS ≥ 9.0)"
  emit_section HIGH "2. HIGH (7.0 ≤ CVSS < 9.0)"
  emit_section MED  "3. MED (4.0 ≤ CVSS < 7.0)"
  emit_section LOW  "4. LOW (CVSS < 4.0)"

  echo "## 5. 직접 의존성 인벤토리 (조회 대상)"
  echo
  echo "| 모듈 | 버전 |"
  echo "|------|------|"
  while IFS='|' read -r mod ver; do
    echo "| \`$mod\` | $ver |"
  done < "$DIRECT_DEPS_FILE"
  echo
  echo "## 6. 메모"
  echo
  echo "- deps.dev 는 **공식 Maven Central published 버전** 만 인덱싱. inline jar (예: \`libs/KmcCrypto.jar\`) / 자체 빌드 / SNAPSHOT 은 누락."
  echo "- transitive 트리는 deps.dev 가 메이븐 메타데이터에서 해석한 **선언 의존성** (런타임 충돌 해소 결과 ≠ Gradle 최종 classpath)."
  echo "- 정확도가 중요하면 \`./gradlew :application:dependencies --configuration runtimeClasspath\` 결과 + OWASP Dependency-Check 권장."
  echo "- 캐시 갱신: \`rm -rf reports/cache/deps.dev\` 후 재실행."
} > "$OUT"

rm -f "$DIRECT_DEPS_FILE" "$ALL_NODES_FILE" "$UNIQUE_NODES_FILE" "$ADVISORY_HITS"
echo "✅ $OUT"
echo "   (CRIT $N_CRIT / HIGH $N_HIGH / MED $N_MED / LOW $N_LOW; 직접 $N_DIRECT, transitive $N_UNIQUE)"

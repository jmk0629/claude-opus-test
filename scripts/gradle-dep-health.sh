#!/usr/bin/env bash
# gradle-dep-health.sh — Spring Boot + Kotlin DSL 의존성 신선도 점검 (정적 파싱, 결정적, LLM 미호출)
# 사용: bash scripts/gradle-dep-health.sh <gradle_root> [output_path]
# 입력: <gradle_root>/gradle/libs.versions.toml + */build.gradle.kts
# 출력: dep-health 와 같은 모양 (§0~§5) Markdown 리포트

set -uo pipefail

ROOT_TARGET="${1:?target_root 필수 (Spring Boot Gradle 프로젝트 루트)}"
DATE=$(date +%Y%m%d)
BASENAME=$(basename "$ROOT_TARGET")
OUT="${2:-/Users/jmk0629/Downloads/homework/claude-opus-test/reports/dep-health-gradle-${DATE}-${BASENAME}.md}"

if [ ! -d "$ROOT_TARGET" ]; then
  echo "❌ target_root 디렉토리 없음: $ROOT_TARGET"; exit 1
fi
TOML="$ROOT_TARGET/gradle/libs.versions.toml"
if [ ! -f "$TOML" ]; then
  echo "❌ $TOML 없음 — Gradle Version Catalog (libs.versions.toml) 사용 안 함."
  echo "   v1 은 catalog 기반 프로젝트만 지원. inline 버전 직접 파싱은 향후 확장."
  exit 1
fi

# ============================================================
# 헤더 EOL/CVE 휴리스틱 표 — 보수적, 확정된 것만.
# 형식: pattern_key|severity|message
# ============================================================
HEUR_VERSIONS=(
  "spring-boot-gradle-plugin|3.0|CRIT|Spring Boot 3.0 EOL — 3.3 LTS 이상 권장"
  "spring-boot-gradle-plugin|2.7|HIGH|Spring Boot 2.7 OSS 지원 종료, 상용 지원만 — 3.x 마이그레이션"
  "spring-boot-gradle-plugin|2.6|CRIT|Spring Boot 2.6 EOL — 즉시 마이그레이션"
  "spring-boot-gradle-plugin|3.1|MED|Spring Boot 3.1 OSS 지원 종료(2024-05) — 3.3 LTS 권장"
  "spring-boot-gradle-plugin|3.2|LOW|Spring Boot 3.2 OSS 지원 종료(2024-11) — 3.3+ 권장"
  "kotlin|1.7|CRIT|Kotlin 1.7 EOL"
  "kotlin|1.8|HIGH|Kotlin 1.8 outdated — 1.9+ 권장"
  "kotlin|1.9|MED|Kotlin 1.9 — 2.0+ 점진 검토 (마이너 영향 미미)"
  "kotest|5.6|MED|Kotest 5.6+ minor 격차"
  "kotest|5.7|LOW|Kotest 5.7 — 5.9+ 사용 권장"
)

HEUR_ARTIFACTS=(
  "org.bouncycastle:bcprov-jdk15on|HIGH|bcprov-jdk15on deprecated — bcprov-jdk18on (Java 15+) 마이그레이션 필수"
  "io.github.microutils:kotlin-logging-jvm|LOW|kotlin-logging-jvm (microutils) deprecated — io.github.oshai:kotlin-logging 으로 이전"
  "log4j:log4j|CRIT|log4j 1.x EOL + Log4Shell 영향 가능 — log4j2 이상 또는 logback"
  "org.apache.logging.log4j:log4j-core<2.17|CRIT|Log4Shell (CVE-2021-44228) — 2.17+ 필수"
)

# ============================================================
# Phase 1: libs.versions.toml 파싱
# ============================================================
parse_versions() {
  awk '
    /^\[versions\]/ { in_v=1; in_l=0; next }
    /^\[libraries\]/ { in_l=1; in_v=0; next }
    /^\[/ && !/^\[versions\]/ && !/^\[libraries\]/ { in_v=0; in_l=0; next }
    in_v && /=/ {
      gsub(/[ \t"]/, "")
      split($0, a, "=")
      if (a[1] != "" && a[2] != "") print "VERSION|" a[1] "|" a[2]
    }
    in_l && /version *= *"/ {
      # name = { module = "g:a", version = "X.Y.Z" }
      line=$0
      if (match(line, /^[^ \t=]+/)) {
        nm=substr(line, RSTART, RLENGTH)
      } else nm="?"
      mod=""; ver=""
      if (match(line, /module *= *"[^"]+"/)) {
        m=substr(line, RSTART, RLENGTH); gsub(/^module *= *"/, "", m); gsub(/"$/, "", m); mod=m
      }
      if (match(line, /version *= *"[^"]+"/)) {
        v=substr(line, RSTART, RLENGTH); gsub(/^version *= *"/, "", v); gsub(/"$/, "", v); ver=v
      }
      if (mod != "" && ver != "") print "ARTIFACT|" nm "|" mod "|" ver
    }
  ' "$TOML"
}

# ============================================================
# Phase 2: build.gradle.kts 들에서 inline `"g:a:v"` 추출
# ============================================================
parse_inline_deps() {
  shopt -u nullglob
  while IFS= read -r f; do
    awk -v file="$f" '
      /implementation\(|api\(|testImplementation\(|runtimeOnly\(|compileOnly\(|annotationProcessor\(/ {
        if (match($0, /"[a-zA-Z0-9._\-]+:[a-zA-Z0-9._\-]+:[a-zA-Z0-9._\-]+"/)) {
          s=substr($0, RSTART+1, RLENGTH-2)
          n=split(s, p, ":")
          if (n == 3) print "INLINE|" p[1] ":" p[2] "|" p[3] "|" file
        }
      }
    ' "$f"
  done < <(find "$ROOT_TARGET" -maxdepth 3 -name 'build.gradle.kts' 2>/dev/null)
}

# ============================================================
# Phase 3: 휴리스틱 매칭
# ============================================================
match_version() {
  local key="$1" val="$2"
  for entry in "${HEUR_VERSIONS[@]}"; do
    IFS='|' read -r pattern_key prefix sev msg <<< "$entry"
    if [ "$pattern_key" = "$key" ] && [[ "$val" == ${prefix}.* ]]; then
      echo "${sev}|${msg} (현재 ${val})"
      return
    fi
  done
}

match_artifact() {
  local mod="$1" ver="$2"
  for entry in "${HEUR_ARTIFACTS[@]}"; do
    IFS='|' read -r pat sev msg <<< "$entry"
    # 단순 모듈 매치 (버전 비교는 v1 미지원, 이름만)
    if [ "$mod" = "$pat" ]; then
      echo "${sev}|${msg} (현재 ${ver})"
      return
    fi
  done
}

# ============================================================
# Phase 4: 분석 + 등급 분류
# ============================================================
TMP_PARSE=$(mktemp)
parse_versions  > "$TMP_PARSE"
parse_inline_deps >> "$TMP_PARSE"

CRIT_LIST=()
HIGH_LIST=()
MED_LIST=()
LOW_LIST=()
INVENTORY=()

while IFS='|' read -r kind k1 k2 k3; do
  case "$kind" in
    VERSION)
      # k1=key, k2=val
      INVENTORY+=("VERSION|$k1|$k2")
      hit=$(match_version "$k1" "$k2")
      if [ -n "$hit" ]; then
        sev="${hit%%|*}"; msg="${hit#*|}"
        case "$sev" in
          CRIT) CRIT_LIST+=("$k1=$k2 — $msg") ;;
          HIGH) HIGH_LIST+=("$k1=$k2 — $msg") ;;
          MED)  MED_LIST+=("$k1=$k2 — $msg") ;;
          LOW)  LOW_LIST+=("$k1=$k2 — $msg") ;;
        esac
      fi
      ;;
    ARTIFACT)
      # k1=alias, k2=module, k3=version
      INVENTORY+=("ARTIFACT|$k1|$k2|$k3")
      hit=$(match_artifact "$k2" "$k3")
      if [ -n "$hit" ]; then
        sev="${hit%%|*}"; msg="${hit#*|}"
        case "$sev" in
          CRIT) CRIT_LIST+=("$k2:$k3 — $msg") ;;
          HIGH) HIGH_LIST+=("$k2:$k3 — $msg") ;;
          MED)  MED_LIST+=("$k2:$k3 — $msg") ;;
          LOW)  LOW_LIST+=("$k2:$k3 — $msg") ;;
        esac
      fi
      ;;
    INLINE)
      # k1=module, k2=version, k3=file
      INVENTORY+=("INLINE|$k1|$k2|$k3")
      hit=$(match_artifact "$k1" "$k2")
      if [ -n "$hit" ]; then
        sev="${hit%%|*}"; msg="${hit#*|}"
        case "$sev" in
          CRIT) CRIT_LIST+=("$k1:$k2 — $msg") ;;
          HIGH) HIGH_LIST+=("$k1:$k2 — $msg") ;;
          MED)  MED_LIST+=("$k1:$k2 — $msg") ;;
          LOW)  LOW_LIST+=("$k1:$k2 — $msg") ;;
        esac
      fi
      ;;
  esac
done < "$TMP_PARSE"

n_v=$(grep -c '^VERSION|' "$TMP_PARSE" || true)
n_a=$(grep -c '^ARTIFACT|' "$TMP_PARSE" || true)
n_i=$(grep -c '^INLINE|' "$TMP_PARSE" || true)

# ============================================================
# Phase 5: 리포트 작성
# ============================================================
{
  echo "# /dep-health (gradle) 리포트 — $(date +%Y-%m-%d) ($BASENAME)"
  echo
  echo "> 대상: \`$ROOT_TARGET\` (Gradle Kotlin DSL + Version Catalog)"
  echo "> 입력: \`gradle/libs.versions.toml\` + \`*/build.gradle.kts\` 정적 파싱"
  echo "> 휴리스틱: 본 스크립트 내장 EOL/CVE 표 (보수적, ./gradlew 미호출)"
  echo "> 생성: by scripts/gradle-dep-health.sh — 결정적 bash, LLM 미호출"
  echo
  echo "## 0. 한 장 요약"
  echo
  echo "- Version Catalog 항목: ${n_v} version + ${n_a} artifact"
  echo "- Inline 의존성 (build.gradle.kts 직접 명시): ${n_i}"
  echo "- 위험 등급: CRIT ${#CRIT_LIST[@]} / HIGH ${#HIGH_LIST[@]} / MED ${#MED_LIST[@]} / LOW ${#LOW_LIST[@]}"
  echo
  if [ "${#CRIT_LIST[@]}" -gt 0 ]; then
    echo "**즉시 조치 필요 (CRIT):**"
    for x in "${CRIT_LIST[@]}"; do echo "- $x"; done
    echo
  fi

  echo "## 1. CRIT — 즉시 조치"
  echo
  if [ "${#CRIT_LIST[@]}" -eq 0 ]; then
    echo "_없음._"
  else
    for x in "${CRIT_LIST[@]}"; do echo "- $x"; done
  fi
  echo

  echo "## 2. HIGH — 다음 스프린트"
  echo
  if [ "${#HIGH_LIST[@]}" -eq 0 ]; then
    echo "_없음._"
  else
    for x in "${HIGH_LIST[@]}"; do echo "- $x"; done
  fi
  echo

  echo "## 3. MED — 백로그"
  echo
  if [ "${#MED_LIST[@]}" -eq 0 ]; then
    echo "_없음._"
  else
    for x in "${MED_LIST[@]}"; do echo "- $x"; done
  fi
  echo

  echo "## 4. 보안 취약점 상세"
  echo
  echo "v1 은 \`./gradlew\` 미호출 (정적 파싱). transitive CVE 추적 불가 — 휴리스틱 표에 명시된 직접 의존성만."
  echo "라이브 CVE 는 별도 \`./gradlew dependencyCheckAnalyze\` (OWASP Dependency-Check 플러그인) 또는 deps.dev API 권장."
  echo

  echo "## 5. 인벤토리 (참고)"
  echo
  echo "### 5.1 Version Catalog \`[versions]\`"
  echo
  echo "| key | value |"
  echo "|-----|-------|"
  for entry in "${INVENTORY[@]}"; do
    [[ "$entry" == VERSION\|* ]] || continue
    IFS='|' read -r _ k v <<< "$entry"
    echo "| $k | $v |"
  done
  echo

  echo "### 5.2 Version Catalog \`[libraries]\` (explicit version)"
  echo
  echo "| alias | module | version |"
  echo "|-------|--------|---------|"
  for entry in "${INVENTORY[@]}"; do
    [[ "$entry" == ARTIFACT\|* ]] || continue
    IFS='|' read -r _ alias mod ver <<< "$entry"
    echo "| $alias | $mod | $ver |"
  done
  echo

  echo "### 5.3 Inline \`build.gradle.kts\` 의존성"
  echo
  echo "| module | version | file |"
  echo "|--------|---------|------|"
  for entry in "${INVENTORY[@]}"; do
    [[ "$entry" == INLINE\|* ]] || continue
    IFS='|' read -r _ mod ver file <<< "$entry"
    rel="${file#$ROOT_TARGET/}"
    echo "| $mod | $ver | \`$rel\` |"
  done
  echo

  echo "## 6. 추천 후속"
  echo
  echo "- CRIT/HIGH 항목은 별도 PR 단위 마이그레이션 (호환성 회귀 위험)"
  echo "- 라이브 CVE: \`./gradlew dependencyCheckAnalyze\` 또는 GitHub Dependabot 활성화"
  echo "- Spring Boot 메이저: 분기말 \`/regression-diff dep-health\` 로 격차 추적"
  echo "- 본 정적 파싱은 transitive 의존성 미점검 — \`./gradlew dependencies --configuration runtimeClasspath\` 추가 검토 권장"
  echo
} > "$OUT"

rm -f "$TMP_PARSE"
echo "✅ $OUT 생성 (CRIT ${#CRIT_LIST[@]} / HIGH ${#HIGH_LIST[@]} / MED ${#MED_LIST[@]} / LOW ${#LOW_LIST[@]})"

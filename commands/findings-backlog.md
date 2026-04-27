---
description: B1 산출물(23 bridge §5 + ingest §0)을 통합해 발견 사항 백로그를 자동 생성. 수동 1~2시간 → 자동 5분.
argument-hint: [target_date]
---

# /findings-backlog

`reports/bridge/*.md` 23개 + `reports/ingest-medipanda-backend-*.md` 최신본 → `reports/findings-backlog-YYYYMMDD.md`.

B1 분기 재실행 직후마다 호출. 수동 통합 1~2시간 → 자동 5분.

`$ARGUMENTS` 첫 번째 = `target_date` (`YYYYMMDD`). 미지정 시 오늘.

---

## Phase 0. 사전점검

```bash
DATE="${1:-$(date +%Y%m%d)}"
ROOT=/Users/jmk0629/Downloads/homework/claude-opus-test
cd "$ROOT"

bridge_count=$(ls reports/bridge/*.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$bridge_count" != "23" ]; then
  echo "❌ reports/bridge/ 가 ${bridge_count}개 (기대 23). B1 /ingest-medipanda-backend 먼저 실행."
  exit 1
fi

ingest=$(ls -t reports/ingest-medipanda-backend-*.md 2>/dev/null | head -1)
if [ -z "$ingest" ]; then
  echo "❌ ingest summary 없음. B1 /ingest-medipanda-backend 먼저 실행."
  exit 1
fi

echo "✅ Phase 0 통과 — bridge 23개 + ingest $ingest, target=$DATE"
```

---

## Phase 1. findings-extractor 1회 호출

`agents/findings-extractor.md` 의 정의를 따른다. 입력은 위 사전점검 결과 (bridge 23 + ingest 최신).

**호출 형식:**
```
findings-extractor 에이전트 호출. target_date=$DATE
```

에이전트가 읽는 파일:
- `reports/bridge/*.md` (23개)
- `reports/ingest-medipanda-backend-*.md` (최신 1개)
- (선택) `reports/findings-backlog-*.md` 직전본 — diff 요약용

에이전트가 쓰는 파일:
- `reports/findings-backlog-$DATE.md`

---

## Phase 2. 사후 검증

```bash
out="reports/findings-backlog-$DATE.md"
[ -f "$out" ] || { echo "❌ 산출 파일 없음"; exit 1; }

# 인용한 bridge 파일 모두 실재 (lint-harness Job 3 와 동일 검증)
missing=$(grep -oE 'bridge/[a-z0-9-]+\.md' "$out" | sort -u | while read -r ref; do
  [ -f "reports/$ref" ] || echo "$ref"
done)
if [ -n "$missing" ]; then
  echo "❌ 인용 누락 bridge:"
  echo "$missing"
  exit 1
fi

# 카운트 한 줄 요약
grep -E '^- \*\*총 발견' "$out" | head -1
echo "✅ $out 생성 완료"
```

---

## Phase 3. 다음 단계 안내

1. 신규 발견 (P0) 외주사 즉시 통보 (Slack/직통)
2. P1 묶음 PR 4개 (RBAC / IDOR / 인증세션 / Tx-N+1) 담당 배정
3. 다음 분기 B1 재실행 후 본 백로그와 diff — 해소·신규·등급 변경 추적
4. lint-harness 자동 검증: `bash scripts/lint-harness.sh` (Job 3 cross-ref)

---

## 사용 예시

```
# 오늘 날짜로
/findings-backlog

# 특정 날짜 (B1 재실행 일자와 맞추는 게 일반적)
/findings-backlog 20260728
```

산출 후 PR 작성자/QA/외주사 담당자에게 공유.

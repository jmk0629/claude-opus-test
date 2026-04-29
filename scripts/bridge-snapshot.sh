#!/usr/bin/env bash
# bridge-snapshot.sh — B1 재실행 직전 reports/bridge/ 를 reports/bridge-snapshot-YYYYMMDD/ 로 보존.
# 사용: bash scripts/bridge-snapshot.sh [date_override]
# 출력: reports/bridge-snapshot-YYYYMMDD/ (23 bridge 파일 복사본)
# 다음 회 B1 재실행 후 /regression-diff bridge 가 본 디렉토리를 prev 로 사용.

set -uo pipefail

ROOT=/Users/jmk0629/Downloads/homework/claude-opus-test
cd "$ROOT"

DATE="${1:-$(date +%Y%m%d)}"
SRC=reports/bridge
DST=reports/bridge-snapshot-${DATE}

if [ ! -d "$SRC" ]; then
  echo "❌ $SRC 없음 — B1 (/ingest-medipanda-backend) 미실행 또는 산출물 손실"; exit 1
fi
if [ -d "$DST" ]; then
  echo "ℹ️  $DST 이미 존재 — 덮어쓰지 않음. 다른 날짜로 재시도하거나 직접 정리."; exit 1
fi

cp -r "$SRC" "$DST"
n=$(ls "$DST"/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "✅ $DST 생성 (${n}개 bridge 보존)"
echo "   → 다음 B1 재실행 후 /regression-diff bridge 호출하면 본 스냅샷이 prev 로 사용됨."

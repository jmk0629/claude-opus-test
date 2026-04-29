#!/usr/bin/env bash
# notify-local.sh — macOS osascript 로컬 알림 + reports/notifications.log append
#
# 사용:
#   bash scripts/notify-local.sh "<title>" "<message>" [info|warn|crit]
#
# - macOS: 알림센터 토스트 (osascript display notification)
#   severity=crit 시 say 음성 추가 (눈 안 봐도 들림)
# - non-macOS: stdout 폴백 (CI/Linux 서버 호환)
# - 항상 reports/notifications.log 에 timestamp + severity + title + message append (휘발 대비)
#
# ENV:
#   NOTIFY_DISABLE=1  → 알림/say 모두 skip (로그만 남김). 야간 배치 등 사용자 부재 시.

set -u

TITLE="${1:?title 필수}"
MSG="${2:?message 필수}"
SEV="${3:-info}"

case "$SEV" in
  info|warn|crit) ;;
  *) echo "❌ severity ∈ info|warn|crit (got: $SEV)" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$ROOT/reports/notifications.log"
mkdir -p "$(dirname "$LOG")"

TS=$(date '+%Y-%m-%d %H:%M:%S')
printf '[%s] [%s] %s — %s\n' "$TS" "$SEV" "$TITLE" "$MSG" >> "$LOG"

if [ "${NOTIFY_DISABLE:-0}" = "1" ]; then
  exit 0
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
  # AppleScript escape: backslash 와 " 만 백슬래시로 escape (그 외 문자는 안전).
  esc() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }
  ETITLE=$(esc "$TITLE")
  EMSG=$(esc "$MSG")
  osascript -e "display notification \"$EMSG\" with title \"$ETITLE\" subtitle \"[$SEV]\"" 2>/dev/null || true
  if [ "$SEV" = "crit" ]; then
    say "$TITLE" 2>/dev/null || true
  fi
else
  printf '🔔 [%s] %s — %s\n' "$SEV" "$TITLE" "$MSG"
fi

---
description: backend.ts (OpenAPI 자동생성)와 수기 API 문서의 드리프트를 탐지하고, 삭제/변경된 API를 쓰는 프론트 호출부를 리포트
argument-hint: 대상 레포 경로 (생략 시 /Users/jmk0629/keymedi/medipanda-web)
---

# /sync-api-docs

`$ARGUMENTS` (미지정 시 `/Users/jmk0629/keymedi/medipanda-web`)의 **자동 생성 API 클라이언트와 수기 문서 간 동기화 상태**를 점검하고 영향 범위를 리포트합니다.

---

## Phase 1: 대상 확인
다음 파일 존재 확인:
- `src/backend/backend.ts`
- `docs/API_ENDPOINTS.md`
- `docs/API_USAGE_STATS.md`

없으면 중단.

---

## Phase 2: api-doc-writer 실행
**api-doc-writer 에이전트**를 실행:
- 작업: "backend.ts vs API_ENDPOINTS.md/API_USAGE_STATS.md 드리프트 감사. Added/Removed/Changed/분류 drift 4개 매트릭스 생성. M2(Removed), M3(Changed)에 해당하는 함수명 목록은 반드시 리스트로 별도 반환."

결과에서 **M2/M3 함수명 리스트**를 추출.

---

## Phase 3: impact-scanner 실행 (M2/M3 함수가 있을 때만)
**impact-scanner 에이전트**를 실행:
- 작업: "다음 API 함수들의 프론트 호출부를 스캔: `[M2+M3 함수명 배열]`. 파일:라인과 위험도 분류."

결과를 api-doc-writer 리포트에 섹션으로 덧붙임.

M2/M3가 없으면 "영향 함수 없음" 기록하고 스킵.

---

## Phase 4: 리포트 저장
`reports/sync-api-docs-YYYYMMDD.md`로 저장 (오늘 날짜).

---

## Phase 5: 요약 및 수동 검증 안내

사용자에게 제시:

```
## A1 동기화 결과
- Added(문서 추가 필요): N개
- Removed(문서 삭제 + 호출부 영향): M개  ← 있으면 최우선
- Changed: K개
- 통계 불일치: ...

### High impact 호출부
[impact-scanner의 High 위험도 상위 N건]

### 브라우저 검증
`http://localhost:5173/admin` 또는 `http://localhost:5173/`에서:
- Removed 엔드포인트를 호출하는 화면 실제 동작 여부
- Changed 엔드포인트 화면 렌더링 정상 여부

### 리포트 전문
reports/sync-api-docs-YYYYMMDD.md
```

---

## 사용 예시
```
/sync-api-docs
/sync-api-docs /Users/jmk0629/keymedi/other-project
```

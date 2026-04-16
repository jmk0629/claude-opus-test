---
description: 프론트엔드 호출부와 backend.ts 시그니처 간 계약 위반(orphan call, arity mismatch, axios bypass, hardcoded URL)을 탐지해 리포트
argument-hint: 대상 레포 경로 (생략 시 /Users/jmk0629/keymedi/medipanda-web)
---

# /verify-frontend-contract

`$ARGUMENTS` (미지정 시 `/Users/jmk0629/keymedi/medipanda-web`)의 **프론트 ↔ 자동 생성 API 클라이언트 계약 정합성**을 검증합니다. A1(`/sync-api-docs`)이 문서와 backend.ts를 본다면, A2는 **실제 호출 코드와 backend.ts**를 봅니다.

---

## Phase 1: 대상 확인
- `src/backend/backend.ts` 존재
- `src/pages-user/`, `src/pages-admin/`, `src/hooks/`, `src/components/` 존재

---

## Phase 2: contract-checker 실행
**contract-checker 에이전트**를 실행:
- 작업: "대상 레포 전수 스캔. C1 Orphan Call은 전수, C2/C3/C4는 상위 20+요약. 모든 항목 파일:라인 필수. backend.ts는 Grep만 사용."

---

## Phase 3: 리포트 저장
`reports/verify-frontend-contract-YYYYMMDD.md`

---

## Phase 4: 요약 및 수동 검증 안내

```
## A2 계약 검증 결과
- 심각 N / 경고 M / 정보 K

### 즉시 수정
[C1 orphan call 목록]

### 브라우저 검증
- admin: http://localhost:5173/admin/...
- user: http://localhost:5174/...
- C3(axios bypass) 위치의 화면 동작 실제 확인

### 리포트 전문
reports/verify-frontend-contract-YYYYMMDD.md
```

---

## 사용 예시
```
/verify-frontend-contract
/verify-frontend-contract /path/to/other-repo
```

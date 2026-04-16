---
description: PR 변경 파일 목록으로부터 **영향 지도**(화면/API/DB) 자동 생성. screen-mapper + api-mapper + db-mapper 3에이전트 병렬 실행.
argument-hint: "파일 목록(콤마/공백 구분) 또는 대상 레포 경로 (생략 시 git diff --name-only HEAD~1)"
---

# /pr-context

`$ARGUMENTS`로 받은 변경 파일 목록을 **영향 지도**로 전환합니다. 리뷰어가 "이 PR이 어느 화면/API/DB를 건드리는가"를 30초 안에 파악하도록 돕는 것이 목표.

기본 대상: `/Users/jmk0629/keymedi/medipanda-web`

---

## Phase 1: 입력 해석

다음 중 하나로 파일 목록 확보:
1. `$ARGUMENTS`가 파일 경로면 그대로 사용 (콤마/공백 구분)
2. `$ARGUMENTS`가 레포 경로면 `git -C <repo> diff --name-only HEAD~1 HEAD`
3. 생략 시 현재 working tree의 `git status --porcelain`

파일 0건이면 즉시 중단하고 "변경 없음" 리포트.

---

## Phase 2: 3에이전트 병렬 실행

다음 3개를 **동시 실행** (단일 메시지에서 Agent 호출 3개):

1. **screen-mapper** — 변경 파일 → 메뉴/페이지 매핑
2. **api-mapper** — 변경 파일 → 호출 API (backend.ts Grep)
3. **db-mapper** — 메뉴/API → DB 테이블 (docs/*/analysis/*.md)

입력 분배:
- screen-mapper: 변경 파일 목록
- api-mapper: 변경 파일 목록 + (선택) 메뉴 힌트
- db-mapper: screen-mapper 결과 기반이지만 parallel 호출하려면 **변경 파일 + 메뉴 번호 패턴 추정**을 함께 넘김

3개가 병렬이어야 대기 시간 최소화. 의존성은 리포트 통합 단계에서 해소.

---

## Phase 3: 통합 리포트 작성

3개 결과를 아래 구조로 통합:

```markdown
# /pr-context 리포트 — YYYY-MM-DD

## PR 요약
- 변경 파일: N개
- 영향 메뉴: M개 (admin K / user L / 공통 P)
- 영향 API: Q개
- 영향 테이블: R개 (추정, 프론트 분석 문서 기준)

## 영향 지도

### 1. 화면
(screen-mapper 표)

### 2. API
(api-mapper 표)

### 3. DB
(db-mapper 표)

## PR 코멘트용 요약 (복붙 가능)
### 🧭 이 PR이 건드리는 것
- 화면: admin/회원 관리, admin/처방 관리
- API: GET /v1/members, DELETE /v1/members/{id}, ...
- DB(추정): users, prescriptions

### ⚠️ 리뷰 시 확인 권장
- admin 권한 가드가 해당 라우트에 적용되어 있는지
- 마이그레이션 필요 여부
- ...
```

---

## Phase 4: 리포트 저장

`reports/pr-context-YYYYMMDD.md` (또는 파라미터로 받은 커스텀 이름)

---

## Phase 5: 수동 검증 안내

```
## C1 PR 컨텍스트 결과
- 영향 화면 N / API M / DB 테이블 K

### 브라우저 검증 권장
- admin: http://localhost:5173/admin/<영향 메뉴 경로>
- user: http://localhost:5174/<영향 메뉴 경로>

### PR 코멘트 복붙용
(리포트의 "PR 코멘트용 요약" 섹션을 PR에 붙여넣기)

### 리포트 전문
reports/pr-context-YYYYMMDD.md
```

---

## 사용 예시

```
# 현재 working tree 변경분
/pr-context

# 특정 파일들
/pr-context src/pages-admin/MpAdminMemberList.tsx src/components/MemberCard.tsx

# 다른 레포
/pr-context /path/to/other-repo
```

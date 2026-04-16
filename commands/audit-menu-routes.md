---
description: medipanda-web 류 React SPA의 메뉴 ↔ 라우트 ↔ 가드 정합성을 감사하고 리포트를 `reports/`에 저장
argument-hint: 대상 레포 경로 (생략 시 /Users/jmk0629/keymedi/medipanda-web)
---

# /audit-menu-routes

`$ARGUMENTS` (미지정 시 `/Users/jmk0629/keymedi/medipanda-web`)의 메뉴/라우트/가드 드리프트를 찾아 리포트를 만듭니다.

---

## Phase 1: 대상 확인

1. `$ARGUMENTS` 경로 결정 (기본값: `/Users/jmk0629/keymedi/medipanda-web`)
2. 다음 파일 존재 확인:
   - `src/menus.ts`
   - `src/routes-admin.tsx`, `src/routes-user.tsx`
   - `src/guards/` 디렉토리

없으면 사용자에게 "경로가 맞는지 / 파일 규약이 다른지" 확인 후 중단.

---

## Phase 2: route-auditor 실행

**route-auditor 에이전트**를 실행:
- 작업: "`$ARGUMENTS` 레포에 대해 매트릭스 A/B/C/D를 모두 생성. 심각/경고/정보 3단계로 분류해 리포트 작성. admin 라우트 가드 미적용(매트릭스 C)은 보안 구멍이니 최우선. 모든 항목에 파일:라인 표기."

---

## Phase 3: 리포트 저장

에이전트 결과를 `reports/audit-menu-routes-YYYYMMDD.md`로 저장 (오늘 날짜).

---

## Phase 4: 요약 및 수동 검증 안내

사용자에게 제시:

```
## A3 감사 결과
- 심각: N개 (보안)
- 경고: N개
- 정보: N개

### 즉시 확인 권장
[심각 이슈 상위 3개 파일:라인 요약]

### 브라우저 검증
다음 경로를 `http://localhost:5173/admin`에서 확인:
- /admin/xxx — (이유)
- ...

### 리포트 전문
reports/audit-menu-routes-YYYYMMDD.md
```

---

## 사용 예시

```
/audit-menu-routes
/audit-menu-routes /Users/jmk0629/keymedi/other-project
```

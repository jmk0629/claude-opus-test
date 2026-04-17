---
description: 메뉴 문서(`docs/user|admin/NN_*.md`)를 입력받아 **Playwright 초안 .spec.ts**를 생성. medipanda-web에 e2e 인프라가 아직 없으므로 초안은 `reports/ui-smoke/`에 저장되고 사람이 검수 후 실제 레포에 반영.
argument-hint: "메뉴 식별자 (user/02, admin/05, 또는 직접 경로) | 생략 시 대상 선택 안내"
---

# /ui-smoke

medipanda-web의 풍부한 메뉴 문서 자산을 **Playwright E2E 초안**으로 전환하는 커맨드. B2 리포트에서 확인된 대로 현재 medipanda-web에 테스트 인프라가 **전혀 없으므로**, 이 커맨드는 "어느 날 Playwright 도입할 때 바로 쓸 수 있는 시나리오 초안 팩"을 축적하는 용도.

기본 대상: `/Users/jmk0629/keymedi/medipanda-web`
초안 저장 위치: `claude-opus-test/reports/ui-smoke/` (대상 레포는 절대 건드리지 않음)

---

## Phase 1: 입력 해석

`$ARGUMENTS` 파싱:
- `user/02` → `docs/user/02_HOME.md` 자동 매칭
- `admin/05` → `docs/admin/05_PRESCRIPTION_MANAGEMENT.md`
- `docs/user/02_HOME.md` → 직접 경로
- **`user`** → user 전 메뉴(01~11) **배치 모드**: test-writer N개 병렬 실행
- **`admin`** → admin 전 메뉴(01~09) 배치 모드
- **`all`** → user+admin 전체 20개 (주의: 토큰 소비 큼, 2웨이브로 쪼개 실행 권장)
- 생략 시 → 전체 메뉴 목록을 Glob으로 출력하고 사용자에게 선택 요청

메뉴 목록(참고):
- user: 01_AUTH, 02_HOME, 03_PRODUCT_SEARCH, 04_PRESCRIPTION, 05_SETTLEMENT, 06_COMMUNITY, 07_SALES_AGENCY_PRODUCT, 08_EVENT, 09_CUSTOMER_SERVICE, 10_MYPAGE, 11_PARTNER_CONTRACT
- admin: 01_MEMBER, 02_PRODUCT, 03_PARTNER, 04_SALES_AGENCY_PRODUCT, 05_PRESCRIPTION, 06_SETTLEMENT, 07_EXPENSE_REPORT, 08_COMMUNITY, 09_CONTENT_MANAGEMENT

---

## Phase 2: 출력 경로 결정 + 디렉토리 보장

슬러그 생성: `user-02-home.spec.ts` 형식
- `user/02_HOME.md` → `user-02-home.spec.ts`
- `admin/05_PRESCRIPTION_MANAGEMENT.md` → `admin-05-prescription-management.spec.ts`

`reports/ui-smoke/` 디렉토리 없으면 `mkdir -p`로 생성.

---

## Phase 3: test-writer 에이전트 호출

test-writer 에이전트에 다음 전달:
- 프로젝트 루트: `/Users/jmk0629/keymedi/medipanda-web`
- 메뉴 문서 경로
- 출력 spec 경로: `claude-opus-test/reports/ui-smoke/<슬러그>.spec.ts`
- 베이스 URL: user는 `http://localhost:5174`, admin은 `http://localhost:5173/admin`

에이전트는 문서 + 실제 .tsx 소스를 교차 조회하여 시나리오 5-8개 작성 후 파일 Write + 요약 반환.

---

## Phase 4: 요약 리포트 작성

test-writer 응답을 바탕으로 마크다운 리포트 생성:

```markdown
# /ui-smoke 리포트 — YYYY-MM-DD

## 생성 대상
- 원본 문서: docs/user/02_HOME.md
- 출력 초안: reports/ui-smoke/user-02-home.spec.ts
- 시나리오: N개

## 시나리오 커버리지
(test-writer의 시나리오 표 인용)

## 실행 준비 (대상 레포에 playwright 미도입 상태)
1. medipanda-web에 `@playwright/test` 설치
2. `playwright.config.ts` 초안 생성 (아래 예시 참고)
3. 이 spec 파일을 `e2e/` 디렉토리로 복사
4. `npx playwright test` 실행

## 검수 체크리스트
- [ ] 각 getByRole/getByText 셀렉터가 실제 DOM과 일치
- [ ] API mock 또는 테스트용 계정 준비
- [ ] 로그인 필요 시나리오는 storageState 전략 결정
- [ ] 한글 텍스트 매칭은 i18n 전이라 안정적이나, 도입 후 재작성 필요
```

리포트 저장: `reports/ui-smoke-YYYYMMDD.md` (여러 메뉴를 한 세션에 돌리면 날짜별 누적)

---

## Phase 5: 수동 검증 안내

```
## C2 UI 스모크 초안 결과
- 생성: reports/ui-smoke/user-02-home.spec.ts (N개 시나리오)
- 요약: reports/ui-smoke-YYYYMMDD.md

### 다음 단계 (사람 검수 필요)
1. spec 파일 열어서 셀렉터·기대값 확인
2. 🟡 신뢰도 항목은 실제 DOM 비교
3. Playwright 도입 시점에 복사해서 e2e/ 에 붙여넣기

### ⚠️ 자동 머지 금지
이 초안은 "언젠가 쓸" 자료. Playwright 인프라 없는 상태에서는 동작 검증 불가.
```

---

## 사용 예시

```
# 홈 페이지 스모크 초안
/ui-smoke user/02

# 처방 관리 admin
/ui-smoke admin/05

# 직접 경로
/ui-smoke docs/user/06_COMMUNITY.md
```

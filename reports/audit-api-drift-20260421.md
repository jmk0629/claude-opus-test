# API 문서 드리프트 감사 리포트

> **감사 일자:** 2026-04-21  
> **감사 범위:** 크로스커팅 #2 — 자동 생성 `backend.ts` ↔ 수기 관리 API 문서 4종  
> **감사 대상 저장소:** `medipanda-web-test`, `medipanda-api`, `claude-opus-test`  
> **이전 감사:** `audit-menu-routes-20260421.md` (크로스커팅 #1)

---

## Executive Summary

| 구분 | 개수 |
|------|------|
| 🔴 CRITICAL | **2** |
| 🟠 HIGH | **2** |
| 🟡 MEDIUM | **2** |
| 🟢 LOW | **1** |

### Top 핵심 이슈

1. **🔴 게시판·댓글 API 재구조화 이후 메뉴 문서 2종이 구(舊) 경로 유지**  
   `ADMIN_MENU_API_ENDPOINTS.md`, `USER_MENU_API_ENDPOINTS.md`가 존재하지 않는 `/v1/boards/comments/*` 경로를 10건 참조. 실제 백엔드·`backend.ts`·`API_ENDPOINTS.md`는 `/v1/comments/*`로 이관 완료.
2. **🔴 `/v1/sales-agency-products/{id}/applicants/excel-download`** — 3개 문서에 존재한다고 기재되었으나 `backend.ts` 래퍼·URL 빌더 모두 부재.
3. **🟠 3건의 직접 URL 호출 우회** — `settlements-member-monthly` 관련 3개 페이지가 `backend.ts` 함수 대신 로컬 `axios.request` 중복 정의.
4. **🟠 HTTP 메서드 불일치** — `/v1/boards/{id}` (docs PATCH vs backend PUT), `/v1/boards/{id}/like` (docs PUT vs backend POST). 프론트 호출은 backend 기준으로 동작하므로 문서가 틀림.

### 커버리지 요약

| 소스 | 엔드포인트 수 | 비고 |
|------|---------------|------|
| `backend.ts` (axios 래퍼 + URL 빌더) | **182** | 172 async + 10 URL builder |
| `API_ENDPOINTS.md` | 183 | |
| `API_USAGE_STATS.md` | 183 | operationId 기준 (Swagger 역참조) |
| `ADMIN_MENU_API_ENDPOINTS.md` | 183 | |
| `USER_MENU_API_ENDPOINTS.md` | 76 | User 기능 범위만 |
| 문서 union | **193** | 4문서 합집합 |
| 문서∖backend 차집합 | **11** | 아래 §D-1, D-2 |
| backend∖문서 차집합 | **0** | 백엔드 생성 후 문서 반영 100% |

---

## 1. 감사 방법론

### 입력
```
Source:  src/backend/backend.ts              (4588 라인, 172 async + 10 URL 빌더)
Docs A:  docs/API_ENDPOINTS.md               (486 라인, 183 엔드포인트)
Docs B:  docs/API_USAGE_STATS.md             (257 라인, 183 엔드포인트)
Docs C:  docs/ADMIN_MENU_API_ENDPOINTS.md    (482 라인, 183 엔드포인트)
Docs D:  docs/USER_MENU_API_ENDPOINTS.md     (415 라인, 76 엔드포인트)
```

### 파이프라인
1. `backend.ts`의 `axios.request({ method, url })` 호출 쌍 추출
2. `const baseUrl = '/v1/...'` URL 빌더 함수 추출
3. 각 문서 마크다운 테이블에서 `| METHOD | URL |` 행 추출
4. `{pathParam}` 정규화 후 set-diff 계산
5. 프론트엔드 `axios.*` 직접 호출 스캔 (backend.ts 우회 탐지)

### 파일 수정 일시
```
backend.ts                        2026-04-06 14:38  ← 가장 오래됨 (15일 전)
API_ENDPOINTS.md                  2026-04-08 10:13
API_USAGE_STATS.md                2026-04-08 12:12
ADMIN_MENU_API_ENDPOINTS.md       2026-04-09 11:11
USER_MENU_API_ENDPOINTS.md       2026-04-09 12:38
```
문서는 backend.ts보다 2~3일 뒤에 손본 것으로 보이나 **반영이 누락**된 영역이 존재함.

---

## 2. 드리프트 목록

### 🔴 D-1 | CRITICAL — 메뉴 문서 2종의 `/v1/boards/comments/*` 구경로 참조

**영향:** ADMIN_MENU / USER_MENU 문서가 **존재하지 않는 URL**을 공식 스펙처럼 나열 → 외주업체 인수인계 시 백엔드 팀이 이 경로로 신규 API를 만들거나, 프론트 개발자가 잘못된 경로로 fetch를 시도할 위험.

| docs 주장 | backend.ts 실제 | 함수명 |
|-----------|-----------------|--------|
| `PUT /v1/boards/comments` | `PUT /v1/comments` | `updateComment` |
| `DELETE /v1/boards/comments/{id}` | `DELETE /v1/comments/{id}` | `deleteComment` |
| `PUT /v1/boards/comments/{id}/like` | `POST /v1/comments/{id}/like` | `toggleLike` (메서드 동시 변경) |
| `PUT /v1/boards/comments/{id}/blind` | `PUT /v1/comments/{id}/toggle-blind` | `toggleBlindStatus` |
| `GET /v1/boards/comments/members` | `GET /v1/comments` | `getCommentMembers` |
| `POST /v1/boards/{id}/comments` | `POST /v1/comments/{userId}` | `createComment` (경로 재구조화) |
| `POST /v1/boards/{id}/editor-file` | `POST /v1/boards/uploads` | `uploadEditorFile` |
| `PUT /v1/boards/{id}/blind` | `PUT /v1/boards/{id}/toggle-blind` | `toggleBlindStatus_1` |
| `PUT /v1/boards/{id}/like` | `POST /v1/boards/{id}/like` | `toggleLike_1` |
| `PATCH /v1/boards/{id}` | `PUT /v1/boards/{id}` | `updateBoardPost` |

**증거:**
- 구경로 출현: `ADMIN_MENU_API_ENDPOINTS.md`에서 5회, `USER_MENU_API_ENDPOINTS.md`에서 4회
- 신경로 출현: `API_ENDPOINTS.md`(7회), `API_USAGE_STATS.md`(6회), `backend.ts`(6회)

**조치 티어:** 이관 전 외주 요청  
**수정안:**  
```bash
# ADMIN_MENU_API_ENDPOINTS.md, USER_MENU_API_ENDPOINTS.md 치환
sed -i '' 's|/v1/boards/comments|/v1/comments|g' docs/ADMIN_MENU_API_ENDPOINTS.md docs/USER_MENU_API_ENDPOINTS.md
sed -i '' 's|/v1/boards/{id}/blind|/v1/boards/{id}/toggle-blind|g' ...
# 메서드 수정: PATCH /v1/boards/{id} → PUT, PUT like → POST
```

---

### 🔴 D-2 | CRITICAL — `/v1/sales-agency-products/{id}/applicants/excel-download` 미구현

**영향:** 3개 문서가 이 엔드포인트를 Admin 전용 52개 API 중 하나로 기재했으나 `backend.ts`에도 URL 빌더 함수에도 없음. 실제 UI(`MpAdminSalesAgencyProductList.tsx`)에서 "신청자 엑셀 다운로드" 버튼 기능 누락 가능성.

**증거:**
- `API_ENDPOINTS.md` / `API_USAGE_STATS.md` / `ADMIN_MENU_API_ENDPOINTS.md` 모두 기재
- `backend.ts` 전체 스캔: `sales-agency-products.*applicants.*excel` 매치 0건
- 백엔드 컨트롤러 확인 필요 (`medipanda-api/application/.../SalesAgencyProductController.kt`)

**조치 티어:** 이관 직후  
**수정 방향:**  
- 컨트롤러에 실제 엔드포인트가 있다면 → `backend.ts` 재생성 필요 (OpenAPI 스펙 누락 가능성)
- 컨트롤러에도 없다면 → 3개 문서에서 삭제

---

### 🟠 D-3 | HIGH — `backend.ts` 우회 직접 axios 호출 3건

`src/backend/backend.ts` 밖에서 axios로 `/v1/...` URL을 직접 호출하는 위치. `backend.ts`에 동일 기능 래퍼가 존재함에도 중복 정의.

| 파일 | 라인 | 중복 기능 | `backend.ts` 대체 함수 |
|------|------|-----------|------------------------|
| `pages-admin/MpAdminSettlementMemberMonthlyList.tsx` | 53-58 | `GET /v1/settlements-member-monthly` | `getList` |
| `pages-admin/MpAdminSettlementMemberMonthlyList.tsx` | 65-71 | `PUT /v1/settlements-member-monthly/{id}` | `update` |
| `pages-admin/MpAdminSettlementMemberMonthlyList.tsx` | 298 | `GET /v1/settlements-member-monthly/excel-download` | `getDownloadExcel` (URL 빌더) |
| `pages-user/SettlementDrugCompany.tsx` | 43-50 | `GET /v1/settlements-member-monthly` | `getList` |

**문제점:**  
1. API 시그니처 변경 시 3곳 모두 수동 수정 필요 → 유지보수성 악화
2. `backend.ts`는 axios interceptor(`/src/utils/axios.ts`) 의존 — 우회 호출도 인터셉터는 타지만, 타입 안전성 체크가 빠짐
3. `getList`, `update` 같이 제네릭한 함수명이 중복 정의되어 있어 IDE navigation 혼란 유발

**조치 티어:** 이관 직후  
**수정안:** 로컬 `async function getSettlementsMemberMonthly` / `updateSettlementMemberMonthly` / 하드코딩 href를 `backend.ts` 함수 호출로 치환.

---

### 🟠 D-4 | HIGH — HTTP 메서드 불일치 (문서 오기)

문서에서 표기한 메서드가 실제 backend.ts 호출 메서드와 다른 케이스. D-1에 포함된 항목 외에 독립 이슈로 분리.

| URL | 문서 메서드 | backend.ts 메서드 | 판정 |
|-----|-------------|-------------------|------|
| `/v1/boards/{id}` | PATCH *(ADMIN_MENU, USER_MENU)* | PUT | 문서가 오래됨 |
| `/v1/boards/{id}/like` | PUT *(ADMIN_MENU, USER_MENU)* | POST | 문서가 오래됨 |

**영향:** 프론트엔드 실제 호출은 backend.ts 기준이므로 런타임 오류는 없으나, 인수인계 후 백엔드 개발자가 문서 보고 PATCH/PUT 핸들러를 추가할 경우 호환 문제 발생.

**조치 티어:** 이관 전 외주 요청

---

### 🟡 D-5 | MEDIUM — `/ocr` 엔드포인트 문서 미기재

`src/backend/ocr.ts` 내부 `requestOcr` 함수가 `POST /ocr`을 호출. `/v1/` 프리픽스가 없는 별도 서비스이며 4개 문서 중 어디에도 언급 없음.

**증거:**
```typescript
// src/backend/ocr.ts:34-38
const response = await axios.request<OcrResponse[]>({
  method: 'POST',
  url: '/ocr',
  data: form,
});
```
- 사용처: `MpOcrRequestModal.tsx`, `MpAdminPrescriptionFormEdit.tsx`
- OpenAPI 스펙(`swagger/api-docs.json`)에 정의되어 있는지 확인 필요

**조치 티어:** 이관 직후  
**수정안:**  
- 외부 OCR 서비스라면 `API_ENDPOINTS.md` 서두에 "외부 연동" 섹션 추가
- 동일 백엔드라면 `/v1/` prefix로 통합하거나 별도 섹션 명시

---

### 🟡 D-6 | MEDIUM — 엑셀 다운로드 엔드포인트가 async 함수가 아닌 URL 빌더로 분류

`backend.ts`의 엑셀 다운로드 엔드포인트 10개는 axios 호출이 아닌 쿼리스트링 생성 후 URL 문자열 반환 형태:
```typescript
export function getDownloadExpenseReportListExcel(options?): string {
  const baseUrl = '/v1/expense-reports/excel-download';
  // ... return `${baseUrl}?${params.toString()}`;
}
```

**문제점:**
- 일관성 부재: `uploadSettlementExcel` 같은 POST 업로드는 async, GET 다운로드는 동기
- 문서(API_ENDPOINTS.md, API_USAGE_STATS.md)에는 일반 GET처럼 기술되어 있어 혼선
- `downloadExpenseReportFiles` 같이 실제 axios로 Blob을 받는 함수도 있어 패턴이 혼재

**조치 티어:** 장기 리팩토링 (코드 스타일 정합성)  
**수정안:** OpenAPI generator 템플릿에서 파일 다운로드 응답 처리 규약 통일 (예: `responseType: 'blob'`로 async 통일).

---

### 🟢 D-7 | LOW — `USER_MENU_API_ENDPOINTS.md`의 구조적 한계

USER 전용 메뉴 API 문서는 76개 엔드포인트만 수록. 합집합(193개)과 단순 비교 시 "낮음"처럼 보이나, User 페이지가 실제로 호출하는 엔드포인트 중에도 Admin과 공유하는 것이 22개(API_USAGE_STATS.md 기준)이므로 범위 정의상 자연스러움.

**주의점:**
- User가 호출하는 공통 API(`/v1/auth/me`, `/v1/notices` 등)가 USER_MENU에 없어도 의도된 설계
- 다만 "공통 API" 섹션을 별도 상단 표로 추가하면 인수인계 시 혼선 방지 가능

**조치 티어:** 장기 리팩토링

---

## 3. 요약표

| ID | 심각도 | 영역 | 요약 | 조치 티어 |
|----|--------|------|------|-----------|
| D-1 | 🔴 CRITICAL | 문서 스펙 | 게시판/댓글 구경로 10건 잔존 | 이관 전 외주 요청 |
| D-2 | 🔴 CRITICAL | 미구현 | `/applicants/excel-download` 부재 | 이관 직후 |
| D-3 | 🟠 HIGH | 코드 패턴 | axios 직접 호출 4건 | 이관 직후 |
| D-4 | 🟠 HIGH | 문서 스펙 | boards HTTP 메서드 오기 2건 | 이관 전 외주 요청 |
| D-5 | 🟡 MEDIUM | 문서 커버리지 | `/ocr` 미문서화 | 이관 직후 |
| D-6 | 🟡 MEDIUM | 코드 일관성 | 엑셀 다운로드 동기/비동기 혼재 | 장기 리팩토링 |
| D-7 | 🟢 LOW | 문서 구조 | USER_MENU 공통 API 미표기 | 장기 리팩토링 |

---

## 4. 자동화 권장 사항

### 4-1. CI에 드리프트 검사 추가
```bash
# scripts/check-api-drift.sh (신규)
# 1. backend.ts 재생성
# 2. docs/*.md 엔드포인트 리스트 추출
# 3. set-diff > 0 이면 CI fail
```

### 4-2. Playwright 회귀 테스트 (claude-opus-test)
D-1의 구경로가 실제로 404를 내는지 검증:
```typescript
// playwright/api-drift.spec.ts
test('old /v1/boards/comments path returns 404', async ({ request }) => {
  const res = await request.put('/v1/boards/comments');
  expect(res.status()).toBe(404);
});
```
`claude-opus-test/.auth/user.json` storageState 재사용.

### 4-3. ESLint 규칙
`src/backend/` 외부에서 `axios.request`/`axios.get` 등 직접 호출 금지 (D-3 재발 방지):
```json
// .eslintrc
{
  "no-restricted-syntax": [
    "error",
    {
      "selector": "CallExpression[callee.object.name='axios']",
      "message": "Call backend.ts wrapper functions instead of axios directly."
    }
  ]
}
```

---

## 5. 3-레포 교차 참조

| 소재 | 용도 |
|------|------|
| `medipanda-api/application/.../*Controller.kt` | D-2 `/applicants/excel-download` 실존 여부 1차 증거 |
| `medipanda-api/build/openapi/openapi-*.json` | backend.ts 재생성 소스 (최신 여부 확인) |
| `medipanda-web-test/swagger/api-docs.json` | API_USAGE_STATS.md의 183개 기준점 (드리프트 2차 증거) |
| `claude-opus-test/playwright/refresh-auth.ts` | D-1/D-2 회귀 테스트용 자동 로그인 |

---

## 6. 부록 A — 문서에만 존재하는 11개 엔드포인트 전체 목록

```
DELETE /v1/boards/comments/{id}                                  [ADMIN, USER]
GET    /v1/boards/comments/members                               [ADMIN]
GET    /v1/sales-agency-products/{id}/applicants/excel-download  [API_ENDPOINTS, USAGE_STATS, ADMIN]
PATCH  /v1/boards/{id}                                           [ADMIN, USER]
POST   /v1/boards/{id}/comments                                  [ADMIN, USER]
POST   /v1/boards/{id}/editor-file                               [ADMIN]
PUT    /v1/boards/comments                                       [ADMIN, USER]
PUT    /v1/boards/comments/{id}/blind                            [ADMIN]
PUT    /v1/boards/comments/{id}/like                             [ADMIN]
PUT    /v1/boards/{id}/blind                                     [ADMIN]
PUT    /v1/boards/{id}/like                                      [ADMIN, USER]
```

## 7. 부록 B — backend.ts의 게시판/댓글 실제 엔드포인트 전체

```
GET    /v1/boards                         getBoards
POST   /v1/boards                         createBoardPost
GET    /v1/boards/members                 getBoardMembers
GET    /v1/boards/notices/fixed-top       getFixedTopNotices
POST   /v1/boards/uploads                 uploadEditorFile        ← editor-file 대체
GET    /v1/boards/{id}                    getBoardDetails
PUT    /v1/boards/{id}                    updateBoardPost         ← docs PATCH
DELETE /v1/boards/{id}                    deleteBoardPost
POST   /v1/boards/{id}/like               toggleLike_1            ← docs PUT
PUT    /v1/boards/{id}/toggle-blind       toggleBlindStatus_1     ← docs /blind
GET    /v1/comments                       getCommentMembers       ← docs /boards/comments/members
PUT    /v1/comments                       updateComment           ← docs /boards/comments
DELETE /v1/comments/{id}                  deleteComment           ← docs /boards/comments/{id}
POST   /v1/comments/{id}/like             toggleLike              ← docs PUT /boards/comments/{id}/like
PUT    /v1/comments/{id}/toggle-blind     toggleBlindStatus       ← docs /boards/comments/{id}/blind
POST   /v1/comments/{userId}              createComment           ← docs /boards/{id}/comments
```

---

## 8. 결론

인수인계 관점의 평가:
- **backend.ts 기준 신뢰 가능** — OpenAPI 자동 생성이므로 런타임 동작의 근거로 사용 가능
- **API_ENDPOINTS.md, API_USAGE_STATS.md 대체로 최신** — 주요 경로 재구조화 반영됨
- **ADMIN_MENU / USER_MENU 문서 2종 구 스냅샷 잔존** — 인수인계 직전 re-sync 필수 (CRITICAL D-1)
- **3건의 코드 우회** — 리팩토링 대상이며, 이관 직후 3개 파일 정비 가능 (HIGH D-3)

최종 권장: **D-1 + D-2 + D-4**를 외주 이관 체크리스트에 포함시키고 **D-3**를 인수인계 직후 첫 번째 정리 대상으로 지정.

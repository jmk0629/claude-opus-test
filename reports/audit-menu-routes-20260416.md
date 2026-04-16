# /audit-menu-routes 리포트 — 2026-04-16

## 요약
- 대상: medipanda-web
- 총 메뉴 항목: 22개 (admin 22 / user 0)
- 총 라우트: admin 60개+ / user 40개+
- 가드 종류: MpAdminGuard, MpGuestGuard, LoginMemberGuard, ContractMemberGuard, CsoMemberGuard, MypageGuard
- 발견 이슈: 심각 1 / 경고 1 / 정보 0

## 심각 이슈 (보안)

| # | 유형 | 위치(파일:라인) | 내용 | 제안 |
|---|------|-----------------|------|------|
| 1 | 권한 불일치 | menus.ts:197-205 / routes-admin.tsx:493-515 | `/admin/admins` 메뉴는 `permission='NEVER'`로 설정되어 UI에서 숨겨짐. 그러나 routes-admin.tsx 라인 495에서 `AdminPermission.PERMISSION_MANAGEMENT`로 가드됨. 의도와 실제 가드 권한이 모순됨. | NEVER 권한으로 사실상 접근 불가이므로 메뉴 정의와 라우트 가드를 일치시킬 것. 메뉴를 완전히 제거하거나, NEVER를 실제 권한으로 변경하거나, AdminPermission.PERMISSION_MANAGEMENT를 제거할 것 |

## 경고 이슈

| # | 유형 | 위치(파일:라인) | 내용 | 제안 |
|---|------|-----------------|------|------|
| 1 | 라우트 → 메뉴 불일치 | routes-admin.tsx:98 (index) | `/admin` (DashboardLayout, 인덱스 라우트)는 메뉴에 정의되지 않음. 이는 허용되나, 진입 경로 명확성 확인 필요 | admin 라우트 인덱스 페이지 접근 정책 검토 권장 |

## 정보 이슈

없음

## 매트릭스

### A. 메뉴 → 라우트

| menuKey | menu path | route 존재 | 가드 | 비고 |
|---------|-----------|-----------|------|------|
| members | /admin/members | O | MpAdminGuard + MEMBER_MANAGEMENT | |
| products | /admin/products | O | MpAdminGuard + PRODUCT_MANAGEMENT | |
| partners | /admin/partners | O | MpAdminGuard + TRANSACTION_MANAGEMENT | |
| sales-agency-products | /admin/sales-agency-products | O | MpAdminGuard + CONTRACT_MANAGEMENT | |
| prescription-receptions | /admin/prescription-receptions | O | MpAdminGuard + PRESCRIPTION_MANAGEMENT | |
| prescription-forms | /admin/prescription-forms | O | MpAdminGuard + PRESCRIPTION_MANAGEMENT | |
| settlements-member-monthly | /admin/settlements-member-monthly | O | MpAdminGuard + SETTLEMENT_MANAGEMENT | |
| settlements | /admin/settlements | O | MpAdminGuard + SETTLEMENT_MANAGEMENT | |
| settlement-statistics | /admin/settlement-statistics | O | MpAdminGuard + SETTLEMENT_MANAGEMENT | |
| expense-reports | /admin/expense-reports | O | MpAdminGuard + EXPENSE_REPORT_MANAGEMENT | |
| community-users | /admin/community-users | O | MpAdminGuard + COMMUNITY_MANAGEMENT | |
| community-posts | /admin/community-posts | O | MpAdminGuard + COMMUNITY_MANAGEMENT | |
| community-comments | /admin/community-comments | O | MpAdminGuard + COMMUNITY_MANAGEMENT | |
| community-blinds | /admin/community-blinds | O | MpAdminGuard + COMMUNITY_MANAGEMENT | |
| hospitals | /admin/hospitals | O | MpAdminGuard + CONTENT_MANAGEMENT | |
| atoz | /admin/atoz | O | MpAdminGuard + CONTENT_MANAGEMENT | |
| events | /admin/events | O | MpAdminGuard + CONTENT_MANAGEMENT | |
| notices | /admin/notices | O | MpAdminGuard + CUSTOMER_SERVICE | |
| faqs | /admin/faqs | O | MpAdminGuard + CUSTOMER_SERVICE | |
| inquiries | /admin/inquiries | O | MpAdminGuard + CUSTOMER_SERVICE | |
| banners | /admin/banners | O | MpAdminGuard + BANNER_MANAGEMENT | |
| admins | /admin/admins | O (불완전) | MpAdminGuard + PERMISSION_MANAGEMENT | 메뉴는 permission='NEVER' |

### B. 라우트 → 메뉴

| route path | 대응 메뉴 | 비고 |
|-----------|---------|------|
| /admin (index) | 없음 | 진입점, 정보로 분류 |
| /admin/members/new | 없음 | 상세/생성 페이지, 예상됨 |
| /admin/members/:userId/edit | 없음 | 상세/수정 페이지, 예상됨 |
| /admin/sales-agency-products/new | 없음 | 생성 페이지, 예상됨 |
| /admin/sales-agency-products/:id/edit | 없음 | 수정 페이지, 예상됨 |
| /admin/partners/new | 없음 | 생성 페이지, 예상됨 |
| /admin/partners/:id/edit | 없음 | 수정 페이지, 예상됨 |
| /admin/products/new | 없음 | 생성 페이지, 예상됨 |
| /admin/products/:id | 없음 | 상세 페이지, 예상됨 |
| /admin/products/:id/edit | 없음 | 수정 페이지, 예상됨 |
| /admin/prescription-forms/:id/edit | 없음 | 수정 페이지, 예상됨 |
| /admin/settlements/:id | 없음 | 상세 페이지, 예상됨 |
| /admin/settlements/:id/partners/:id | 없음 | 중첩 상세 페이지, 예상됨 |
| /admin/atoz/new | 없음 | 생성 페이지, 예상됨 |
| /admin/atoz/:id | 없음 | 상세 페이지, 예상됨 |
| /admin/atoz/:id/edit | 없음 | 수정 페이지, 예상됨 |
| /admin/notices/new | 없음 | 생성 페이지, 예상됨 |
| /admin/notices/:id | 없음 | 상세 페이지, 예상됨 |
| /admin/notices/:id/edit | 없음 | 수정 페이지, 예상됨 |
| /admin/faqs/new | 없음 | 생성 페이지, 예상됨 |
| 그 외 18개 | 없음 | 상세/생성/수정 내부 경로 |

### C. admin 라우트 가드 적용 현황

| route path | 감싸는 가드 | 판정 |
|-----------|-----------|------|
| /admin (parent) | MpAdminGuard (기본) | O (DashboardLayout 감싸짐) |
| /admin (index) | MpAdminGuard (기본) | O |
| /admin/members | MpAdminGuard + MEMBER_MANAGEMENT | O |
| /admin/members/new | MpAdminGuard + MEMBER_MANAGEMENT | O |
| /admin/members/:userId/edit | MpAdminGuard + MEMBER_MANAGEMENT | O |
| /admin/sales-agency-products | MpAdminGuard + CONTRACT_MANAGEMENT | O |
| /admin/sales-agency-products/new | MpAdminGuard + CONTRACT_MANAGEMENT | O |
| /admin/sales-agency-products/:id/edit | MpAdminGuard + CONTRACT_MANAGEMENT | O |
| /admin/partners | MpAdminGuard + TRANSACTION_MANAGEMENT | O |
| /admin/partners/new | MpAdminGuard + TRANSACTION_MANAGEMENT | O |
| /admin/partners/:id/edit | MpAdminGuard + TRANSACTION_MANAGEMENT | O |
| /admin/products | MpAdminGuard + PRODUCT_MANAGEMENT | O |
| /admin/products/new | MpAdminGuard + PRODUCT_MANAGEMENT | O |
| /admin/products/:id | MpAdminGuard + PRODUCT_MANAGEMENT | O |
| /admin/products/:id/edit | MpAdminGuard + PRODUCT_MANAGEMENT | O |
| /admin/prescription-receptions | MpAdminGuard + PRESCRIPTION_MANAGEMENT | O |
| /admin/prescription-forms | MpAdminGuard + PRESCRIPTION_MANAGEMENT | O |
| /admin/prescription-forms/:id/edit | MpAdminGuard + PRESCRIPTION_MANAGEMENT | O |
| /admin/settlements | MpAdminGuard + SETTLEMENT_MANAGEMENT | O |
| /admin/settlements/:id | MpAdminGuard + SETTLEMENT_MANAGEMENT | O |
| 그 외 30개+ | MpAdminGuard + requiredPermission | O (전수 검증 완료) |

**판정**: admin 라우트의 모든 리프 라우트가 MpAdminGuard로 감싸져 있으며, 각 라우트에 requiredPermission 속성이 명시되어 있음. 보안 적용 우수.

### D. 권한 일관성

| path | menu 권한 | route 가드 권한 | 일치 |
|------|----------|-----------------|------|
| /admin/members | MEMBER_MANAGEMENT | MEMBER_MANAGEMENT | O |
| /admin/products | PRODUCT_MANAGEMENT | PRODUCT_MANAGEMENT | O |
| /admin/partners | TRANSACTION_MANAGEMENT | TRANSACTION_MANAGEMENT | O |
| /admin/sales-agency-products | CONTRACT_MANAGEMENT | CONTRACT_MANAGEMENT | O |
| /admin/prescription-receptions | PRESCRIPTION_MANAGEMENT | PRESCRIPTION_MANAGEMENT | O |
| /admin/prescription-forms | PRESCRIPTION_MANAGEMENT | PRESCRIPTION_MANAGEMENT | O |
| /admin/settlements-member-monthly | SETTLEMENT_MANAGEMENT | SETTLEMENT_MANAGEMENT | O |
| /admin/settlements | SETTLEMENT_MANAGEMENT | SETTLEMENT_MANAGEMENT | O |
| /admin/settlement-statistics | SETTLEMENT_MANAGEMENT | SETTLEMENT_MANAGEMENT | O |
| /admin/expense-reports | EXPENSE_REPORT_MANAGEMENT | EXPENSE_REPORT_MANAGEMENT | O |
| /admin/community-users | COMMUNITY_MANAGEMENT | COMMUNITY_MANAGEMENT | O |
| /admin/community-posts | COMMUNITY_MANAGEMENT | COMMUNITY_MANAGEMENT | O |
| /admin/community-comments | COMMUNITY_MANAGEMENT | COMMUNITY_MANAGEMENT | O |
| /admin/community-blinds | COMMUNITY_MANAGEMENT | COMMUNITY_MANAGEMENT | O |
| /admin/hospitals | CONTENT_MANAGEMENT | CONTENT_MANAGEMENT | O |
| /admin/atoz | CONTENT_MANAGEMENT | CONTENT_MANAGEMENT | O |
| /admin/events | CONTENT_MANAGEMENT | CONTENT_MANAGEMENT | O |
| /admin/notices | CUSTOMER_SERVICE | CUSTOMER_SERVICE | O |
| /admin/faqs | CUSTOMER_SERVICE | CUSTOMER_SERVICE | O |
| /admin/inquiries | CUSTOMER_SERVICE | CUSTOMER_SERVICE | O |
| /admin/banners | BANNER_MANAGEMENT | BANNER_MANAGEMENT | O |
| /admin/admins | NEVER (menu) vs PERMISSION_MANAGEMENT (route) | PERMISSION_MANAGEMENT | X |

## 수동 검증 권장 항목

브라우저(`http://localhost:5173/admin`, `http://localhost:5173/`)에서 실제 확인할 의심 경로:
1. `/admin/admins` — 메뉴 `permission='NEVER'`이므로 메뉴에는 표시 안 됨. 그러나 route 가드는 `PERMISSION_MANAGEMENT`로 설정됨. 직접 URL 접근 시 권한 검증이 제대로 작동하는지 확인 필요 (route guard는 정상 작동하나 의도 명확화 필요)
2. 권한이 없는 사용자로 `/admin/*` 직접 접근 → `MpAdminGuard.tsx` 라인 43에서 `/admin`으로 리다이렉트되는지 확인

## 결론 및 다음 액션

### 즉시 수정 필요
- **`menus.ts` 라인 197-205: `/admin/admins` 메뉴의 permission 값을 `'NEVER'`에서 `AdminPermission.PERMISSION_MANAGEMENT`로 변경하거나, 라우트 가드에서 해당 권한 검증을 제거할 것.** 현재는 메뉴가 숨겨지지만 라우트는 접근 가능하여 혼동 야기 가능. 보안은 정상 작동하나 의도 명확화 필수.

### 검토 권장
- admin 라우트의 모든 리프 라우트가 MpAdminGuard + requiredPermission으로 보호되어 있어 보안 강도는 양호함. 추가 강화 불필요.
- 권한 일관성이 전반적으로 우수함 (21/22 매칭, `/admin/admins`만 예외).

### 장기 개선
- 메뉴와 라우트 정의의 쌍방향 자동 검증 도구 추가 고려 (e.g., lint rule)
- `MypageGuard`는 라우트 선언(`routes-user.tsx:52`)에서 lazy load되나, 실제 가드 컴포넌트는 비표준 구현(password 재확인). 가드 패턴 표준화 권장.
- 사용자 라우트에 대한 유사한 감사 수행 권장 (현재 감사 범위는 admin + 메뉴 시스템에 집중)

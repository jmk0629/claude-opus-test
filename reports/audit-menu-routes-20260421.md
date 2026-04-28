# /audit-menu-routes 리포트 — 2026-04-21 (2차)

> 전회차(2026-04-16) 리포트는 admin 22개 메뉴만 다뤘음. 본 2차 감사에서는:
> 1. 전회차 지적(`/admin/admins` 권한 불일치) **재검증** → 5일 경과 시점 상태
> 2. **user 라우트·가드** 전수 감사 (전회차 TODO)
> 3. `medipanda-api/docs/AUDIT_REPORT.md`의 백엔드 IDOR 이슈와 프론트 가드 정합성 교차 검증
>
> 입력 리포:
> - `medipanda-web-test` (프론트)
> - `medipanda-api` (백엔드, 메뉴별 §5 + `docs/AUDIT_REPORT.md`)
> - `claude-opus-test/reports/audit-menu-routes-20260416.md` (1차)

---

## 요약

| 항목 | 1차(04-16) | 2차(04-21) | 변화 |
|---|---|---|---|
| 대상 영역 | admin 메뉴만 | admin + user + auth | +user, +인증 플로우 |
| 감사된 메뉴 | 22 | 22 (admin) + 9 (user 추론) | user 쪽 메뉴 정의 부재 확인 |
| 감사된 라우트 | 60+ (admin) | 60+ (admin) + 40+ (user) | |
| 발견 이슈 (심각/경고/정보) | 1 / 1 / 0 | **3 / 5 / 2** | 새 이슈 8건 |
| 미해결 1차 이슈 | — | 1건 (`/admin/admins`) | 유지 |

---

## 심각 이슈 (CRITICAL — 보안 영향)

### #1. 🔴 **미해결 재확인** — `/admin/admins` 메뉴 permission vs 라우트 가드 불일치

- 1차 리포트 (2026-04-16) 이슈, **5일 경과 시점 여전히 미수정**.
- `menus.ts:198` → `permission: 'NEVER'` (UI 숨김)
- `routes-admin.tsx:495,503,511` → `MpAdminGuard requiredPermission={AdminPermission.PERMISSION_MANAGEMENT}`
- 추가 증거: `MpAdminAdminEdit.tsx:98,109` — **새 admin 생성 시 `PERMISSION_MANAGEMENT` 권한을 강제 부여**.
- 즉 이 권한 관리 페이지는 `permission_management` 권한을 가진 자만 접근 가능하고, 새로 만드는 관리자에게 해당 권한이 자동 부여됨 → UI에서 메뉴를 숨긴 이유가 불명확.
- **권고**: 세 가지 중 택1
  1. `menus.ts`에서 `NEVER`를 `AdminPermission.PERMISSION_MANAGEMENT`로 교체 (가장 단순, 메뉴 노출 허용)
  2. 진짜 숨기려면 route도 `MpAdminGuard requiredPermission={AdminPermission.NEVER}` 또는 SUPER_ADMIN 전용 guard로
  3. 완전히 다른 경로(예: `/admin/_internal/admins`)로 이동하고 feature flag로 제어

### #2. 🔴 NEW — 익명게시판 상세/생성/수정 라우트에 **CsoMemberGuard 누락**

- 위치: `routes-user.tsx:262-272`
  ```tsx
  {
    path: 'anonymous',
    element: <CsoMemberGuard><AnonymousList /></CsoMemberGuard>,   // ← 리스트만 가드
  },
  {
    path: 'anonymous/:id',
    element: <CommunityDetail boardType={BoardType.ANONYMOUS} />,   // ← 가드 없음
  },
  {
    path: 'anonymous/new',
    element: <CommunityEdit boardType={BoardType.ANONYMOUS} />,     // ← 가드 없음
  },
  {
    path: 'anonymous/:id/edit',
    element: <CommunityEdit boardType={BoardType.ANONYMOUS} />,     // ← 가드 없음
  },
  ```
- 영향: **비-CSO 로그인 회원**이 익명게시판 상세/신규 작성/수정을 URL 직접 타이핑으로 우회 가능.
- 백엔드 방어선: `medipanda-api`의 `BoardController` / `BoardService`에서 BoardType.ANONYMOUS 작성·조회 시 CSO 검증이 있으면 실질 피해는 없으나, UX+다중방어 원칙상 프론트도 가드 필요.
- **권고**: 부모 경로에 `<CsoMemberGuard>` 를 올리거나 각 자식 요소를 감싸기.

### #3. 🔴 NEW — `/community/mr-cso-matching/*` 가드 누락 (계약회원 전용)

- 위치: `routes-user.tsx:274-288`
- `MR_CSO_MATCHING` 게시판은 `medipanda-api/docs/user/06_COMMUNITY.md` 기준 **계약회원 전용**(신규처 매칭은 ORGANIZATION/INDIVIDUAL 대상).
- 현재 부모 `/community`는 `LoginMemberGuard`만 적용. `ContractMemberGuard` 또는 `CsoMemberGuard`가 없음.
- 리스트(`MrCsoMatchingList`), 상세, 작성, 수정 전체가 로그인만 되면 접근 가능.
- **권고**: 리스트·상세·작성·수정 모두 `ContractMemberGuard`로 감싸거나 내부 페이지에서 `hasContractMemberPermission(session)` 체크 후 UI 제한.

---

## 경고 이슈 (HIGH — UX/일관성·다중방어)

### #4. 🟡 NEW — user-side 인증 페이지에 **MpGuestGuard 미적용**

- `MpGuestGuard`는 이미 로그인된 사용자를 이전 페이지/`/admin`으로 리다이렉트하는 가드.
- `routes-admin.tsx:70` — admin `/login`은 `MpGuestGuard` 보호.
- `routes-user.tsx:66` — user `/login`은 **가드 없음**.
- 유사하게 `/signup`(86), `/find-account`(90), `/find-password`(94)도 가드 없음.
- 영향: 로그인된 상태에서 `/login`에 접근하면 로그인 폼이 표시되어 혼란. `/signup`에 접근해도 막히지 않음.
- **권고**: 4개 경로 전부 `<MpGuestGuard>` 감쌈 또는 컴포넌트 내부 `useEffect(() => if (session) navigate('/'), [])`.

### #5. 🟡 NEW — `MypageGuard` 이중 용도 (element + wrapper)

- `routes-user.tsx:52,98-100,105`
  ```tsx
  const MypageGuard = LazyComponent(lazy(() => import('@/guards/MypageGuard')));
  ...
  { path: 'mypage/guard', element: <MypageGuard /> },  // element 단독 노출
  ...
  <LoginMemberGuard>
    <MypageGuard>                                       // wrapper 사용
      <SidebarLayout ... />
    </MypageGuard>
  </LoginMemberGuard>
  ```
- 같은 컴포넌트를 **단독 라우트 element**로도, **자식을 감싸는 wrapper**로도 사용.
- `/mypage/guard` 경로가 실제로 어디서 링크되는지 불분명 — dead route 의심.
- `MypageGuard` 자체는 비밀번호 재확인 UI. element 용도로 띄우면 확인 후 아무것도 안 나타남(children이 undefined).
- **권고**:
  1. `/mypage/guard` 경로 제거 또는 실제 사용 위치 확인.
  2. gate 컴포넌트는 wrapper 전용으로 사용 (element 용도와 분리).

### #6. 🟡 NEW — `hasCsoMemberPermission` / `hasContractMemberPermission` 의 **타입 혼동**

- `utils/member-utils.ts:18-24`
  ```ts
  export function hasContractMemberPermission(member: MemberDetailsResponse) {
    return member.partnerContractStatus === MemberType.INDIVIDUAL || member.partnerContractStatus === MemberType.ORGANIZATION;
  }
  export function hasCsoMemberPermission(member: MemberDetailsResponse) {
    return member.partnerContractStatus === MemberType.CSO || hasContractMemberPermission(member);
  }
  ```
- `partnerContractStatus` 는 의미상 **PartnerContract의 상태**(PENDING/APPROVED/REJECTED/CANCELLED) 여야 하나, 이 코드는 `MemberType` enum (NONE/CSO/INDIVIDUAL/ORGANIZATION) 과 비교.
- 백엔드 `AuthService.whoAmI` (AuthService.kt:75-82) 는 `partnerContract?.status` 를 `contractStatus` 필드에 세팅. 이 프론트 함수의 원래 필드가 `memberType`이어야 했거나, 반대로 필드가 잘못 매핑됐을 가능성.
- 백엔드 감사 보고서(`AUDIT_REPORT.md` §C-5)의 "네이밍 혼란"과 연결.
- **권고**: `MemberDetailsResponse.memberType` 인지 `partnerContractStatus` 인지 백엔드 DTO 정의 확인 후 필드명·비교값 정정.

### #7. 🟡 NEW — `LoginMemberGuard`의 session 로딩 미처리

- `guards/LoginMemberGuard.tsx:11-19`
  ```tsx
  useEffect(() => {
    if (session === null) {
      navigate(`/login?redirectTo=...`, { replace: true });
    }
  }, [session]);
  if (session === null) return <FixedLinearProgress />;
  return children;
  ```
- `useSession()`은 초기엔 `undefined` 반환할 가능성. `session === null` 체크만 있고 `isLoading` 미확인 → `children` 이 세션 확정 전에 렌더돼 **내부에서 session!.userId 접근 시 crash 또는 비인증 API 호출**.
- `MpAdminGuard`는 `isLoading` 을 명시적으로 처리 (MpAdminGuard.tsx:22-29) — 두 가드가 동일 패턴 아님.
- **권고**: `LoginMemberGuard`도 `isLoading` 플래그 수신 후 패턴 통일.

### #8. 🟡 NEW — 프론트 라우트 ↔ 백엔드 IDOR 교차검증 시 4건 위험 노출

- `medipanda-api/docs/AUDIT_REPORT.md` §A-10 CRITICAL IDOR 4건:
  | 백엔드 IDOR | 프론트 진입 경로 | 프론트 가드 |
  |---|---|---|
  | `GET /v1/partner-contracts/{userId}` (user/11 §5-A) | `/partner-contract` | `LoginMemberGuard` 만 — **userId 파라미터 매칭 없음** |
  | `POST /v1/partner-contracts/{contractId}/update` (user/11 §5-D) | 동일 | 동일 |
  | `POST /v1/members/{userId}/nickname` (user/10 §5-A) | `/mypage/info` | `LoginMemberGuard + MypageGuard` (통과 후 본인 userId로 호출 가정) |
  | `existsByPhoneNumber(userId)` 오타 (user/10 §5-C) | `/signup` | 가드 없음 |
- 프론트에선 본인 userId로만 호출하지만, 백엔드가 path variable 로 다른 userId를 받아도 막지 않음 → 프록시/curl 로 직접 호출 시 노출.
- **권고**: 백엔드 수정이 근본해결이나, 프론트에서도 API 호출 시 path variable = session.userId 를 강제 (axios interceptor 또는 typed API wrapper).

---

## 정보 이슈 (LOW)

### #9. 🟢 `/` (Home) 게스트 허용 — 의도 확인 필요

- `routes-user.tsx:82-84`: `/` = `<Home />`, 가드 없음.
- 비로그인도 홈 배너/통계 조회 가능 — `medipanda-api/docs/user/02_HOME.md` 기준 의도 부합.
- 확인 목적으로만 기록.

### #10. 🟢 `/terms`, `/privacy` 게스트 허용 — OK

- 의도대로. 회원가입 직전 접근 필요.

---

## 매트릭스 (user 라우트 — 1차에 누락됐던 부분)

### E. user 라우트 → 기능 카테고리·가드 적용

| route path | 기능 카테고리 | 가드 체인 | 판정 |
|---|---|---|---|
| `/login` | 인증 | — | ⚠️ MpGuestGuard 누락 (#4) |
| `/logout` | 인증 | — | ℹ️ |
| `/` | 홈 | — | ✅ 게스트 허용 의도 |
| `/signup` | 인증 | — | ⚠️ MpGuestGuard 누락 (#4) |
| `/find-account` | 인증 | — | ⚠️ MpGuestGuard 누락 (#4) |
| `/find-password` | 인증 | — | ⚠️ MpGuestGuard 누락 (#4) |
| `/mypage/guard` | 마이페이지 | — | ⚠️ dead route 의심 (#5) |
| `/mypage` (부모) | 마이페이지 | LoginMemberGuard + MypageGuard | ✅ |
| `/mypage/info` | 마이페이지 | 부모 가드 상속 | ✅ |
| `/mypage/notification` | 마이페이지 | 부모 가드 상속 | ✅ |
| `/mypage/withdraw` | 마이페이지 | 부모 가드 상속 | ✅ |
| `/partner-contract` | 계약신청 | LoginMemberGuard | ⚠️ 백엔드 IDOR 노출(#8) |
| `/products` | 상품검색 | LoginMemberGuard | ✅ |
| `/prescriptions` (실적) | 실적관리 | LoginMemberGuard + ContractMemberGuard | ✅ |
| `/dealers` (실적) | 실적관리 | LoginMemberGuard + ContractMemberGuard | ✅ |
| `/settlement-drug-company` | 정산 | LoginMemberGuard + ContractMemberGuard | ✅ |
| `/settlement-list` | 정산 | LoginMemberGuard + ContractMemberGuard | ✅ |
| `/sales-statistic` | 정산 | LoginMemberGuard + ContractMemberGuard | ✅ |
| `/community` (부모) | 커뮤니티 | LoginMemberGuard | ✅ |
| `/community/anonymous` | 커뮤니티 | LoginMemberGuard + CsoMemberGuard | ✅ |
| `/community/anonymous/:id` | 커뮤니티 | LoginMemberGuard만 | 🔴 CsoMemberGuard 누락 (#2) |
| `/community/anonymous/new` | 커뮤니티 | LoginMemberGuard만 | 🔴 (#2) |
| `/community/anonymous/:id/edit` | 커뮤니티 | LoginMemberGuard만 | 🔴 (#2) |
| `/community/mr-cso-matching` | 커뮤니티 | LoginMemberGuard만 | 🔴 ContractMemberGuard 누락 (#3) |
| `/community/mr-cso-matching/:id` | 커뮤니티 | LoginMemberGuard만 | 🔴 (#3) |
| `/community/mr-cso-matching/new` | 커뮤니티 | LoginMemberGuard만 | 🔴 (#3) |
| `/community/mr-cso-matching/:id/edit` | 커뮤니티 | LoginMemberGuard만 | 🔴 (#3) |
| `/sales-agency-products` | 영업대행 | LoginMemberGuard | ✅ |
| `/sales-agency-products/:id` | 영업대행 | LoginMemberGuard | ✅ |
| `/events` | 이벤트 | LoginMemberGuard | ✅ |
| `/events/:id` | 이벤트 | LoginMemberGuard | ✅ |
| `/customer-service` (부모) | 고객센터 | LoginMemberGuard | ✅ |
| `/customer-service/notice` | 고객센터 | 부모 상속 | ✅ |
| `/customer-service/notice/:id` | 고객센터 | 부모 상속 | ✅ |
| `/customer-service/faq` | 고객센터 | 부모 상속 | ✅ |
| `/customer-service/inquiry` | 고객센터 | 부모 상속 | ✅ |
| `/customer-service/inquiry/:id` | 고객센터 | 부모 상속 | ✅ |
| `/customer-service/inquiry/:id/edit` | 고객센터 | 부모 상속 | ✅ |
| `/customer-service/inquiry/new` | 고객센터 | 부모 상속 | ✅ |
| `/terms` | 정책 | — | ✅ |
| `/privacy` | 정책 | — | ✅ |
| `*` (404) | fallback | — | ✅ |

**판정**: user 라우트 41개 중 **7개가 가드 누락**(17%) — 대부분 익명/MR_CSO 커뮤니티 하위 라우트 + 인증 페이지.

### F. user 메뉴 — 존재하지 않음

- `menus.ts` 전체가 admin 메뉴 정의만 담고 있음.
- user 쪽은 하단 `GNB`/사이드바가 **페이지 내부 하드코딩** (예: `/mypage` SidebarLayout tabConfig 직접 나열).
- 즉 "고아 메뉴" 개념 자체가 user에는 없음 → 이 축의 감사는 admin만 해당.
- 장기 개선: user 쪽도 `menus.ts`에 선언적으로 정의하면 라우트 정합성·권한 필터 재사용 가능.

### G. 가드 인벤토리 (6종)

| 가드 | 파일 | 역할 | 사용 위치 수 |
|---|---|---|---|
| `MpAdminGuard` | guards/MpAdminGuard.tsx | admin 섹션 + requiredPermission 분기 | routes-admin.tsx 전체 리프 라우트 |
| `MpGuestGuard` | guards/MpGuestGuard.tsx | 로그인 된 사용자 차단 | routes-admin.tsx:70 (admin /login 한 곳) |
| `LoginMemberGuard` | guards/LoginMemberGuard.tsx | 미로그인 차단 (user 섹션) | routes-user.tsx 15+ 경로 |
| `ContractMemberGuard` | guards/ContractMemberGuard.tsx | 계약회원 전용 | 실적·정산 부모 element |
| `CsoMemberGuard` | guards/CsoMemberGuard.tsx | CSO 회원 전용 | 익명게시판 리스트 element만 |
| `MypageGuard` | guards/MypageGuard.tsx | 비밀번호 재확인 | mypage 부모 + `/mypage/guard` element (#5) |

---

## 자동화·테스트 연계 (claude-opus-test 자산 활용)

### 현재 사용 가능한 자동화

| 도구 | 경로 | 용도 |
|---|---|---|
| `playwright/refresh-auth.ts` | claude-opus-test/playwright/ | `.auth/admin.json` · `.auth/user.json` JWT 자동 갱신 (30분 access / 14일 refresh) |
| `npm run auth:admin` / `auth:user` | claude-opus-test/package.json | 최초 로그인 → storageState 저장 |
| `agents/route-auditor.md` | claude-opus-test/agents/ | 본 리포트를 자동 생성한 감사 에이전트 정의 |
| `commands/audit-menu-routes.md` | claude-opus-test/commands/ | `/audit-menu-routes` 슬래시 커맨드 |
| UI-smoke 스펙 초안들 | claude-opus-test/reports/ui-smoke* | 메뉴별 Playwright 테스트 골격 |

### 본 리포트의 이슈를 Playwright 회귀 테스트로 고정하는 권고안

| 이슈 # | 회귀 테스트 시나리오 |
|---|---|
| #2 | 비-CSO 유저(storageState)로 `/community/anonymous/:id` 직접 방문 → 가드가 없으면 페이지 렌더, 가드 추가 후 뒤로가기/리다이렉트 assert |
| #3 | 비계약 유저로 `/community/mr-cso-matching/new` 접근 시 리다이렉트 assert |
| #4 | 로그인 상태 user storageState로 `/login` 방문 → `/` 또는 redirectTo 리다이렉트 assert |
| #8 | Axios mock으로 `GET /v1/partner-contracts/{다른userId}` 직접 호출 요청 → 백엔드 수정 후 403 assert |

---

## 수동 검증 권장 항목

1. `/community/anonymous/:id` — 비-CSO storageState 로 접근하여 실제로 상세가 렌더되는지.
2. `/community/mr-cso-matching/new` — 비계약 storageState 로 접근하여 글작성 폼이 뜨는지.
3. `/login` — 로그인 상태에서 재방문 시 동작(로그인 폼 노출 여부).
4. `/mypage/guard` — 내비게이션 링크로 접근 가능한지, 실제 사용처 존재 여부.
5. `/partner-contract` — `GET /v1/partner-contracts/{다른userId}` 요청을 DevTools로 변조했을 때 타인 정보 노출 여부 (백엔드 IDOR).

---

## 조치 우선순위

### 이관 전 외주 수정 요청 (CRITICAL)
- **#1** `/admin/admins` 정합화 (1차 리포트 5일 미수정)
- **#2** 익명게시판 상세/작성/수정 CsoMemberGuard 부착
- **#3** MR_CSO 매칭 ContractMemberGuard 부착

### 이관 직후 자체 수정 (HIGH)
- **#4** user 인증 페이지 MpGuestGuard
- **#7** LoginMemberGuard 의 isLoading 패턴 통일
- **#8** 백엔드 IDOR 4건 수정 후, 프론트는 axios wrapper로 path variable 강제

### 장기 개선 (MEDIUM/LOW)
- **#5** MypageGuard element/wrapper 이중용도 정리
- **#6** `partnerContractStatus` ↔ `memberType` 타입 혼동 정정
- user 메뉴 `menus.ts` 선언화 (F 항목)

---

## 결론

- **1차 리포트 기준** `admin 라우트`는 견고. 5일 내 유지보수 없었음.
- **2차 리포트에서 새로 드러난 user 라우트의 가드 공백**이 실질 보안 리스크. 특히 #2(익명게시판) #3(MR_CSO) 은 **비-CSO/비계약 회원이 특정 게시판 URL을 직접 입력하면 접근 가능**.
- 백엔드 감사 보고서(`medipanda-api/docs/AUDIT_REPORT.md`)의 IDOR 4건과 결합하면, **프론트 가드 + 백엔드 RBAC 이중 누락**이 되는 경로는 특히 `/partner-contract` — 최우선 수정.
- 자동화 자산(`claude-opus-test` refresh-auth, route-auditor agent, playwright specs)은 갖춰져 있으므로, 본 리포트 발견사항을 Playwright 회귀 테스트로 즉시 고정 가능.

### 1차 대비 변화
- ✅ 감사 범위 확장 (admin-only → admin+user+auth)
- ⬜ `/admin/admins` 이슈 **5일 미해결** → 우선순위 상향 권고
- 🆕 신규 이슈 8건 (CRITICAL 2 + HIGH 5 + LOW 2 그 중 user-side 7건)

_작성일: 2026-04-21_

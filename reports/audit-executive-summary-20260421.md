# Medipanda 인수인계 — 품질 감사 Executive Summary

- 작성일: 2026-04-21
- 대상: medipanda-web-test (프런트), medipanda-api (백엔드), claude-opus-test (E2E)
- 원본 보고서 5종 (각각 상세 증거·재현 경로 포함):
  - [audit-menu-routes-20260421.md](./audit-menu-routes-20260421.md) — 메뉴/라우트/가드 정합성
  - [audit-api-drift-20260421.md](./audit-api-drift-20260421.md) — API 계약 드리프트
  - [audit-nplus1-20260421.md](./audit-nplus1-20260421.md) — N+1·영속성
  - [audit-admin-rbac-20260421.md](./audit-admin-rbac-20260421.md) — 관리자 RBAC/IDOR
  - [audit-secrets-config-20260421.md](./audit-secrets-config-20260421.md) — 시크릿·설정 관리

---

## 0. 한 문장 결론

> **프런트 UI와 백엔드 컨트랙트가 모두 겉으론 동작하지만, 관리자 권한 경계와 병원 데이터 보호 경계가 둘 다 뚫려 있어 "운영 배포 전 P0 5건은 반드시 선결"해야 한다.** 그 외 이슈는 인수인계 후 1~2 스프린트에 분산 가능하다.

---

## 1. P0 — 지금 당장 (운영 배포 전 반드시)

| # | 이슈 | 위치 | 공수 | 출처 |
|---|---|---|---|---|
| **P0-1** | 🚨 `/v1/hospitals/bulk-upsert`·`/v1/hospitals/all`이 `permitAll` — JWT 없이 전체 병원 데이터 삭제·위조 가능 | `WebSecurityConfig.kt:43-44` | 10분 | RBAC §R-1 |
| **P0-2** | 🚨 `RoleCheckAspect`: `ADMIN_OR_SELF` + `targetUserId==null` 분기가 role 검사 없이 `proceed()` → `{id}`·`{contractId}` 등 `userId` 이외 PathVariable 전부 fail-open | `RoleCheckAspect.kt:50-51, 104` | 30분 (fail-closed 전환) | RBAC §R-3 |
| **P0-3** | 🚨 `/admin/admins` 권한 불일치 5일째 미수정 — `menus.ts` `NEVER` vs route guard `PERMISSION_MANAGEMENT` | `menus.ts:198`, `routes-admin.tsx:495-511` | 10분 | Menu §#1 |
| **P0-4** | 🚨 `ProductService.saveProductExtraInfos` 2N 쿼리 — 엑셀 업로드 한 번이 수천 쿼리 유발, 스테이징 부하 테스트에서 드러날 것 | `ProductService.kt:677-702` | 1~2시간 (배치 `findAllByProductIdInAndMonth` 전환) | N+1 §N-1 |
| **P0-5** | 🚨 익명게시판·MR-CSO 매칭 라우트에 가드 누락 — 비-CSO/비-계약 회원이 URL 타이핑으로 상세/작성/수정 접근 | `routes-user.tsx:262-288` | 30분 | Menu §#2, #3 |
| **P0-6** | 🚨 `application.yml`이 리포 커밋 + `.gitignore` 미포함 — AES 키·RSA 개인키·GCP 서비스 계정·DB 비밀번호·Basic Auth 비밀번호 평문 노출 | `application.yml`, `.gitignore` | 1일 (로테이트 포함) | Secret §S-1 |
| **P0-7** | 🚨 `encryptUserData`가 **XOR**(반복 키)로 사용자 토큰 "암호화" — 평문 2개로 키 복원 가능 + 기본 키가 하드코딩되어 dev/prod 동일 | `AuthService.kt:474-496`, `application.yml:11` | 반나절 (AES-GCM 교체) | Secret §S-2 |
| **P0-8** | 🚨 JWT 쿠키 `secure = false` 하드코딩 — 운영 HTTPS 도메인에서도 HTTP 경로로 전송 가능 (MITM) | `JwtService.kt:89, 98` | 30분 | Secret §S-3 |

**P0 총합 공수**: 1~1.5일 (시크릿 로테이트 포함 시). 로테이트 없이 코드 변경만이면 약 반나절.

---

## 2. P1 — 다음 스프린트 (2~3일)

| # | 이슈 | 범위 | 출처 |
|---|---|---|---|
| P1-1 | 15/23 백엔드 컨트롤러 `@RequiredRole` 0건 — Product, Partner, Hospital, ExpenseReport, Prescription 등 관리자 기능 | 컨트롤러 클래스 레벨 어노테이션 백필 (0.5~1일) | RBAC §R-2 |
| P1-2 | `WebSecurityConfig` URL 매처에 role 규칙 0건 — 2차 방어층 부재 | `/v1/admin/**` prefix 분리 + `.hasRole("ADMIN")` (1~2일) | RBAC §R-4 |
| P1-3 | 게시판·댓글 API 메뉴 문서 2종이 `/v1/boards/comments/*` 구 경로 10건 유지 | `ADMIN_MENU_API_ENDPOINTS.md`, `USER_MENU_API_ENDPOINTS.md` 수정 (1~2시간) | API-drift §D-1 |
| P1-4 | `/v1/sales-agency-products/{id}/applicants/excel-download` 래퍼 부재 — 문서엔 있으나 `backend.ts`·프런트에 없음 | OpenAPI 재생성 또는 수기 추가 (30분) | API-drift §D-2 |
| P1-5 | `backend.ts` 우회 axios 중복 정의 4곳 — `settlement-member-monthly` 관련 페이지 | 리팩터 (2~3시간) | API-drift §D-3 |
| P1-6 | JOIN FETCH 커버리지 7.5% (4/53) — 리스트 API 응답에서 연관 엔티티 프록시 접근 시 N+1 잠재 | 상위 10개 리스트 쿼리부터 JOIN FETCH 또는 `@EntityGraph` 적용 (2일) | N+1 §N-2 |
| P1-7 | `BoardService.updateBoardPost` 에디터 파일 N+1 + `ProductService` KIMS 배치 N+1 | 배치 fetch로 전환 (반나절) | N+1 §N-3, N-4 |
| P1-8 | `inMemoryAuthentication` 하드코딩 자격증명 + `{noop}` 평문 비밀번호 | 미사용이면 블록 제거, 사용 중이면 Basic 활성 조건 명시 (15분) | RBAC §R-5 |
| P1-9 | user 인증 페이지 (`/login`·`/signup`·`/find-*`) `MpGuestGuard` 미적용 | 4개 경로 가드 감싸기 (30분) | Menu §#4 |
| P1-10 | `hasContractMemberPermission` 타입 혼동 — `partnerContractStatus` 필드를 `MemberType` enum과 비교 | DTO 정의 대조 후 필드/비교값 정정 (1~2시간) | Menu §#6 |

**P1 총합 공수**: 약 1주.

---

## 3. P2 — 리팩터·장기 (여유 될 때)

| # | 이슈 | 출처 |
|---|---|---|
| P2-1 | `RoleCheckAspect`를 파라미터 이름 설정 가능하게 리팩터 (`targetParam = "id"` 지정) | RBAC §R-3 확장 |
| P2-2 | `MypageGuard` 이중 용도 (element + wrapper) 정리, `/mypage/guard` dead route 확인 | Menu §#5 |
| P2-3 | `LoginMemberGuard` `isLoading` 플래그 미처리 — `MpAdminGuard`와 패턴 불일치 | Menu §#7 |
| P2-4 | `@EntityGraph` 도입 (현재 0건) + Service `findById` 55회 호출 검토 | N+1 §N-5~7 |
| P2-5 | 프런트 `AdminPermission` 13종 중 `PRODUCT/PARTNER/HOSPITAL/EXPENSE/EVENT/SALES_AGENCY/PRESCRIPTION_MANAGEMENT`가 백엔드 enforcement 없음 — 메뉴는 장식 상태 | RBAC §R-6 |
| P2-6 | `/v1/test`, `/swagger-ui/**`, `/api-docs/**` 운영 배포 파이프라인에서 제거 | RBAC §R-8 |
| P2-7 | HTTP 메서드 불일치 2건 (`/v1/boards/{id}` PATCH vs PUT, `/v1/boards/{id}/like` PUT vs POST) | API-drift §D-4 |
| P2-8 | `@TestOnly` 붙은 `getPartnerIdsByUserId` — 런타임 보호 없음, IDOR 주의 | RBAC §R-9 |

---

## 4. 긍정 발견 (유지할 것)

- 도메인이 얕음: `@OneToMany` 1개 (Member만), `@ManyToOne`은 LAZY 기본 준수 — N+1 위험이 *이론적 최대치보다 낮음*
- `backend.ts`에 backend∖문서 차집합 **0** — 새 엔드포인트가 backend.ts에 추가되면 문서엔 빠짐없이 반영됨 (OpenAPI 파이프라인 정상)
- `@RequiredRole` AOP 자체 설계는 단순·명확 — 파라미터 이름 하드코딩만 고치면 견고해짐
- 청크 배치 패턴(`.chunked(1000).forEach { saveAll(...) }`) 일부 서비스에 존재 — 복제할 가치 있음

---

## 5. 권장 실행 순서

1. **Day 0 (오늘)** — P0-1, P0-2, P0-3 (병합해 1 PR로 가능)
2. **Day 1~2** — P0-4 (N+1 수정 + 로드 테스트), P0-5 (가드 4개)
3. **Week 1 후반** — P1-1, P1-2 (RBAC 백필 — 가장 큰 리스크 제거)
4. **Week 2** — P1-3 ~ P1-10 병렬
5. **Week 3+** — P2 리팩터

**중요**: P0-1, P0-2는 "새로운 코드 추가" 없이 **삭제/플래그 전환**만으로 닫힘. 즉시 배포 가능한 방어.

---

## 6. 감사 지표 스냅샷

| 영역 | 지표 | 값 | 판정 |
|---|---|---|---|
| 프런트 라우트 | 발견 이슈 | 3 CRIT / 5 HIGH / 2 INFO | |
| 프런트 라우트 | 1차 이슈 미해결 | 1건 (5일 경과) | 🔴 처리 지연 |
| API 계약 | 문서∖backend 차집합 | 11 | |
| API 계약 | backend∖문서 차집합 | 0 | ✅ 파이프라인 양호 |
| 영속성 | JOIN FETCH 커버리지 | 4/53 (7.5%) | 🔴 낮음 |
| 영속성 | `@EntityGraph` 사용 | 0 | 🟠 미사용 |
| RBAC | `@RequiredRole` 적용 컨트롤러 | 8/23 (35%) | 🔴 낮음 |
| RBAC | `WebSecurityConfig` role 매처 | 0건 | 🔴 부재 |
| RBAC | permitAll 중 관리자 파괴 엔드포인트 | 2건 | 🚨 즉시 조치 |

---

## 7. 후속 감사 후보 (미실행)

다음 크로스커팅은 이번 라운드 범위 밖이나 인수인계 완결을 위해 한 번 더 돌 가치가 있음:

- **#5 Secret/Config 감사** — `SecretKeyService` SSM 폴백, application.yml 평문 override, `inMemoryAuthentication`의 properties 값 출처
- **#6 Playwright 커버리지 감사** — `claude-opus-test/tests/*.spec.ts` vs 31개 메뉴 대조, 커버리지 구멍 식별
- **#7 `@Transactional` 일관성** — readOnly 누락, propagation 혼용
- **#8 에러/관측성** — ControllerAdvice 일관성, 로깅 레벨, 예외 분류

---

> **인수인계 체크리스트 (받는 쪽용)**
> - [ ] 본 요약 + 4개 상세 보고서 완독
> - [ ] P0 5건의 담당자·일정 지정
> - [ ] 현재 브랜치/배포 상태 확인: 운영에 P0-1, P0-2가 이미 나갔는가?
> - [ ] `WebSecurityConfig.kt`의 TODO 주석 (`운영 배포시 제거`) 추적 지라/노션에 티켓화
> - [ ] `menus.ts` 권한 상수가 "UI 장식"인지 "실제 경계"인지 제품 팀과 정렬

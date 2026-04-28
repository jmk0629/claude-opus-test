# Admin RBAC / IDOR 교차 감사 (Crosscutting #4)

- 작성일: 2026-04-21
- 범위: `medipanda-api` (Spring Boot 3 + Kotlin) × `medipanda-web-test` 관리자 메뉴 권한 모델
- 감사 축: (1) `WebSecurityConfig` URL 정책 → (2) `@RequiredRole` 어노테이션 적용률 → (3) `RoleCheckAspect` 실행 로직 → (4) `menus.ts` 프론트 권한과의 정합성

---

## 0. 한 페이지 요약

| 지표 | 값 |
|---|---|
| 총 컨트롤러 | 23개 |
| `@RequiredRole` 적용 컨트롤러 | 8개 (35%) |
| `@RequiredRole` 적용 핸들러(총 발생 수) | 25개 |
| 프로젝트 전체 엔드포인트(backend.ts 기준) | 182개 |
| 관리자 권한 강제가 "어노테이션 단 한 줄"로 구현된 비중 | 100% — Spring Security URL 매처엔 role-based 규칙 0건 |
| `permitAll` 목록에서 어드민 전용 파괴적 엔드포인트 | **2건** (`/v1/hospitals/bulk-upsert`, `/v1/hospitals/all`) |
| 프런트 `AdminPermission` → 백엔드 enforcement 매핑 | 13개 권한 중 최소 6개는 컨트롤러에서 조회 불가 (장식 상태) |

**치명 결론**: 관리자 보호 모델은 *"관리자가 성실하게 어노테이션을 붙여야만 작동"*하는 fail-open 구조다. 어노테이션이 빠진 15개 컨트롤러는 JWT만 가진 **임의의 일반 사용자 계정**으로 호출 가능하다. 게다가 `/v1/hospitals/*` 두 건은 JWT조차 불필요하다.

---

## 1. CRITICAL 발견

### R-1. 🚨 병원 전역 파괴 엔드포인트가 **인증 없이** 공개
**WebSecurityConfig.kt:43-44**

```kotlin
it.requestMatchers(
    ...
    "/v1/hospitals/bulk-upsert",
    "/v1/hospitals/all",
).permitAll()
```

- `DELETE /v1/hospitals/all` — 전체 병원 레코드 삭제 (HospitalController.kt:88-93)
- `POST /v1/hospitals/bulk-upsert` — 병원 테이블 대량 쓰기 (HospitalController.kt:95-100)
- **현재 상태**: JWT 없이 curl 한 줄로 전체 병원 데이터 파괴·위조 가능
- **추정 원인**: 초기 시딩 편의용 TODO가 운영에 그대로 남음 (`/v1/test`, `/swagger-ui/**`, `/api-docs/**`가 같은 블록에 `//TODO: 운영 배포시 제거` 주석 포함)

**즉시 조치**: permitAll에서 제거 → `@RequiredRole(ADMIN_ONLY, SUPER_ADMIN)` 부여. 스테이징/운영 분리 전 반드시.

---

### R-2. 🚨 관리자 강제 로직이 "어노테이션 누락 = 완전 무방비"
**패턴**: 23개 컨트롤러 중 **15개가 `@RequiredRole` 어노테이션 0건**

| 컨트롤러 | `@RequiredRole` | 노출 민감도 | 비고 |
|---|---:|---|---|
| ProductController | 0 | 🔴 HIGH | 상품 soft delete, 엑셀 업로드, KIMS S3 업로드, 전체 TSV export |
| HospitalController | 0 | 🔴 HIGH | 개별 softDelete + 위 R-1 2건 |
| PartnerController | 0 | 🔴 HIGH | 거래선 CRUD 전량, 엑셀 업·다운로드, `/ids/{userId}` (IDOR 주의) |
| ExpenseReportController | 0 | 🔴 HIGH | 경비 전표 CRUD |
| SalesAgencyProductBoardController | 0 | 🟠 MED | 판매 대행 제품 게시판 |
| SettlementMemberMonthlyController | 0 | 🟠 MED | 월별 정산 조회·엑셀 |
| PrescriptionController | 0 | 🟠 MED | 처방 데이터 (PHI 근접) |
| EventBoardController | 0 | 🟠 MED | 이벤트 게시판 |
| ReportController | 0 | 🟠 MED | 신고 |
| DealerController | 0 | 🟡 LOW | |
| BlockController | 0 | 🟡 LOW | 차단 |
| TermsController | 0 | 🟡 LOW | |
| KmcAuthController | 0 | 🟢 N/A | permitAll 경로 |
| AuthController | 0 | 🟢 N/A | 로그인·토큰 |
| TestController | 0 | 🟢 N/A | permitAll + TODO 제거 대상 |

**공격 시나리오 (예)**: 일반 사용자로 로그인 → JWT 획득 → `DELETE /v1/partners/{id}` 직접 호출 → 거래선 soft delete. `WebSecurityConfig`의 `anyRequest().authenticated()`만 통과하면 role 검증 없이 성공.

**즉시 조치**: 각 컨트롤러 클래스 상단에 기본값 `@RequiredRole(ADMIN_ONLY)` 부여 + `@RequestMapping` 하위 메서드별 permission 지정. 특히 PartnerController는 `CONTRACT_MANAGEMENT`, ProductController는 `PRODUCT_MANAGEMENT` 권한으로.

---

### R-3. 🚨 `RoleCheckAspect`의 오너십 검증이 `userId` 이름에만 동작
**RoleCheckAspect.kt:92-113**

```kotlin
private fun extractUserIdFromPathVariable(joinPoint: ProceedingJoinPoint): String? {
    ...
    for (parameter in pathVariables) {
        if (parameter.parameterName == "userId") {   // ← 하드코딩
            val args = joinPoint.args
            return args[parameter.parameterIndex]?.toString()
        }
    }
    ...
    return null
}
```

- PathVariable 이름이 `id`, `partnerId`, `contractId`, `memberId`, `reportId` 등으로 선언된 수많은 핸들러는 **`targetUserId = null`**이 된다.
- **RoleCheckAspect.kt:50-51**에서 `ADMIN_OR_SELF` + `targetUserId == null` 분기가 **바로 `joinPoint.proceed()`를 반환** — role/permission 검사 없이 통과.

```kotlin
} else if ((isSelfRequest || targetUserId == null) && (requiredRole.mode == RoleCheckMode.ADMIN_OR_SELF)) {
    return joinPoint.proceed()
}
```

**결과**: `@RequiredRole(ADMIN_OR_SELF)`가 붙어 있어도 path가 `/v1/boards/{id}` 같이 `userId`가 아닌 경우, **일반 사용자도 관리자 전용 데이터에 접근 가능**. 즉, 방어하려는 의도는 있으나 실제로는 무력화된 어노테이션이 여러 개 존재한다.

**영향 대상 확인 필요**:
- BlindPostController, BoardController, CommentController, PartnerContractController에서 `@PathVariable id` + `ADMIN_OR_SELF` 조합 가능성. `ADMIN_ONLY` 모드에서도 43-49행 분기는 role/priority 검사는 하므로 일부 방어가 남지만, `ADMIN_OR_SELF` 계열은 전부 침해 우려.

**즉시 조치**:
1. Aspect를 단순화 — `ADMIN_OR_SELF`에서 `targetUserId == null`은 **명시적으로 401/500**을 던지도록 변경 (fail-closed).
2. PathVariable 이름을 `userId`로 통일하거나, 어노테이션 파라미터로 `targetParam = "id"` 같이 지정 가능하게 리팩터.

---

## 2. HIGH 발견

### R-4. Spring Security 필터는 "JWT 여부"만 검사, role 매처 0건
**WebSecurityConfig.kt:26-51**

`authorizeHttpRequests` 블록 안에 `.hasRole(...)` / `.hasAuthority(...)` / `.hasAnyRole(...)` 사용 **0건**. 전체 role gating이 `@RequiredRole` AOP 단일 레이어에 의존.

- 어노테이션이 빠지면 JWT만 있으면 통과 (R-2와 동일 근본 원인).
- URL 매처로 2차 방어층이 없어서 리팩터 중 실수로 어노테이션이 탈락하면 즉시 노출.

**권장**: 최소 `GET/PUT/PATCH/POST/DELETE` × `/v1/**` 전 구간을 `.authenticated()`에 추가로 `.hasRole("USER")` 정도로 올리고, 관리자 경로(`/v1/admin/**` 별도 prefix)를 만들어 `.hasRole("ADMIN")`로 고정. 대규모 변경이므로 P1.

---

### R-5. `inMemoryAuthentication`에 하드코딩 ADMIN 자격 증명
**WebSecurityConfig.kt:71-78**

```kotlin
@Autowired
@Throws(Exception::class)
fun configureGlobal(auth: AuthenticationManagerBuilder) {
    auth.inMemoryAuthentication()
        .withUser(apiAuthenticationProperties.username)
        .password("{noop}${apiAuthenticationProperties.password}")
        .roles("ADMIN")
}
```

- `{noop}` — 평문 비밀번호
- properties 주입이지만 값이 평문 SSM이 아닌 application.yml fallback인지 확인 필요
- JWT 흐름과 별개인 **Basic Auth 백도어**로 오용될 수 있음. `SecurityFilterChain`이 Basic을 활성화하지 않으면 dormant이지만, 향후 actuator 등을 붙이면서 활성화될 위험.

**권장**: 명시적으로 `httpBasic { it.disable() }` 추가하고, 사용처가 없다면 `configureGlobal` 블록 제거.

---

### R-6. 프론트 `AdminPermission` 13종 중 상당수가 백엔드 enforcement 없음
**백엔드 현황**

| 백엔드에서 사용 중인 permission (RequiredRole.permission=) | 컨트롤러 |
|---|---|
| MEMBER_MANAGEMENT | MemberController (12회) |
| PERMISSION_MANAGEMENT | MemberController |
| COMMUNITY_MANAGEMENT | Board, BlindPost, Comment |
| CONTRACT_MANAGEMENT | PartnerContract, DrugCompany |
| BANNER_MANAGEMENT | Banner |
| SETTLEMENT_MANAGEMENT | Settlement |

**프런트 `menus.ts`가 요구하는 permission** 중 백엔드 컨트롤러에서 **한 번도 enforcement 되지 않는 값**:

- `PRODUCT_MANAGEMENT` — ProductController 무방비 (R-2)
- `PARTNER_MANAGEMENT` / `HOSPITAL_MANAGEMENT` (있다면) — 해당 컨트롤러 무방비 (R-2)
- `EXPENSE_MANAGEMENT` — ExpenseReportController 무방비
- `EVENT_MANAGEMENT` — EventBoardController 무방비
- `SALES_AGENCY_MANAGEMENT` — SalesAgencyProductBoardController 무방비
- `PRESCRIPTION_MANAGEMENT` — PrescriptionController 무방비

**의미**: 관리자 UI에서 "이 메뉴는 X 권한이 있어야만 보임"이라고 말해도, 백엔드는 권한 유무와 무관하게 응답한다. **메뉴 숨김은 UX 장식**이지 권한 경계가 아니다.

---

## 3. MEDIUM 발견

### R-7. `extractUserIdFromPathVariable`의 예외 무시
**RoleCheckAspect.kt:109-111**

```kotlin
} catch (e: Exception) {
    e.printStackTrace()  // ← stack trace만 출력, 결과는 null
}
return null
```

- 추출 실패 시 `null` 반환 → `ADMIN_OR_SELF` 분기에서 fail-open.
- `e.printStackTrace()`는 로그 프레임워크 우회. 운영에서 탐지 난항.

### R-8. `/v1/test` permitAll 유지
**WebSecurityConfig.kt:31** + `TestController.kt` 전체.
- `//TODO: 운영 배포시 제거` 주석이 붙어 있지만 현행. 배포 체크리스트에 삭제 단계 필요.

### R-9. `@TestOnly`가 런타임 방어 수단이 아님
**PartnerController.kt:180**

```kotlin
@TestOnly
@GetMapping("/ids/{userId}")
fun getPartnerIdsByUserId(@PathVariable userId: String)
```

- `org.jetbrains.annotations.TestOnly`는 **IntelliJ 정적 린트**일 뿐 런타임 접근 차단 없음.
- `userId`를 패스 파라미터로 받으므로 **임의 사용자의 파트너 ID 목록 조회 가능** (IDOR).
- `@RequiredRole(ADMIN_ONLY)` 없이 노출.

---

## 4. LOW / 관찰

- **R-10**. `AdminPermission.ALL` 상수: SUPER_ADMIN 우회 루프와 조합되어 "permission 검사 면제" 값으로 쓰임. 직관적이지만 permission enum에 "검사 면제" 값이 섞인 것은 냄새. 향후 `requiredRole.permission`이 optional 되도록 분리 권장.
- **R-11**. `ADMIN_OR_SELF` + `targetUserId` null 분기가 **사실상 public 통과**로 해석될 수 있어, code review 시 의도 파악 어려움. 분기에 주석 또는 설계 문서 링크 필요.
- **R-12**. `SecurityConfig.kt`(별도 파일, passwordEncoder Bean만 12줄)와 `WebSecurityConfig.kt`가 이름이 유사해 혼동 유발. `PasswordEncoderConfig.kt` 수준으로 rename 권장.

---

## 5. 우선순위 개선 로드맵

| 순위 | 작업 | 예상 공수 | 레버리지 |
|---|---|---|---|
| **P0** | R-1: permitAll에서 `/v1/hospitals/bulk-upsert`, `/v1/hospitals/all` 제거 | 10분 | 치명 |
| **P0** | R-3: `ADMIN_OR_SELF` + null targetUserId를 fail-closed로 전환 | 30분 | 치명 |
| **P1** | R-2: 15개 무방비 컨트롤러에 `@RequiredRole` 클래스 레벨 부여 | 0.5~1일 | 높음 |
| **P1** | R-5: `inMemoryAuthentication` 블록 제거 or Basic 명시 disable | 15분 | 중간 |
| **P1** | R-9: `getPartnerIdsByUserId`에 RequiredRole(ADMIN_ONLY) | 5분 | 중간 |
| **P2** | R-4: URL 매처에 role hint 2차 방어층 추가 | 1~2일 | 장기 |
| **P2** | `RoleCheckAspect` param 이름 설정 가능하게 리팩터 | 반나절 | 장기 |
| **P2** | R-8: `/v1/test`, swagger-ui, api-docs 운영 배포 파이프라인에서 제거 | CI 작업 | 장기 |

---

## 6. 참고 증거 파일

- `application/src/main/kotlin/kr/co/medipanda/portal/security/WebSecurityConfig.kt` (전체 81줄)
- `application/src/main/kotlin/kr/co/medipanda/portal/security/SecurityConfig.kt` (passwordEncoder만 — 이름 혼동)
- `application/src/main/kotlin/kr/co/medipanda/portal/aspect/RoleCheckAspect.kt` (핵심 버그: L50-51, L104)
- `application/src/main/kotlin/kr/co/medipanda/portal/annotation/RequiredRole.kt` (enum 정의)
- `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/*Controller.kt` (23개)
- 프런트 교차참조: `medipanda-web-test/src/constants/menus.ts`, `audit-menu-routes-20260421.md`

---

## 7. 요약

medipanda-api의 관리자 권한 모델은 **단일 레이어(`@RequiredRole` AOP)에 100% 의존**하고, 그 레이어 자체가 (a) `userId` PathVariable 이름에 하드코딩되어 있으며 (b) targetUserId null을 fail-open으로 처리한다. 상위 Spring Security 필터는 인증 여부만 본다.

결과적으로 **관리자 전용 기능의 최대 절반**이, 적격 JWT를 가진 임의 사용자에 의해 호출 가능하다. 즉시 조치 2건 (`/v1/hospitals/*` permitAll 해제 + `ADMIN_OR_SELF` null fail-closed)만으로도 가장 큰 구멍을 메울 수 있고, 이후 컨트롤러 어노테이션 백필을 P1으로 병행하면 된다.

> 이 보고서는 `audit-api-drift-20260421.md`(계약 드리프트), `audit-nplus1-20260421.md`(성능), `audit-menu-routes-20260421.md`(프런트 권한)과 함께 읽을 때 전체 그림이 완성된다. 특히 메뉴 권한은 **표시 제어 역할 이상을 수행하지 못한다는 전제**로 프런트/백엔드 컨트랙트를 다시 설계해야 한다.

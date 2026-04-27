# 05-security.md — medipanda-api 보안 감사 보고서

**감사 일시:** 2026-04-27
**대상 경로:** `/Users/jmk0629/keymedi/medipanda-api`
**프레임워크:** Spring Boot + Kotlin, Spring Security 6.x

---

## 1. 보안 설정 요약

| 항목 | 값 |
|------|-----|
| 프레임워크 | Spring Security 6.x (`SecurityFilterChain` 방식) |
| 인증 방식 | JWT (HS256) + 쿠키 이중 전달 |
| 권한 모델 | 커스텀 `@RequiredRole` 애너테이션 + AOP (`RoleCheckAspect`) |
| CSRF | 비활성 (`csrf { it.disable() }`) |
| CORS | `allowedOrigins = ["*"]`, 자격증명(credentials) 미허용 |
| 비밀번호 해싱 | BCrypt (strength 미지정 → 기본값 10) |
| 세션 | Stateless (HttpSession 미사용) |
| Swagger | permitAll 상태로 운영 배포 예정 (TODO 주석 존재) |

---

## 2. 필터 체인

```
1. CorsFilter (CorsConfig → allowedOrigins=*)
2. JwtAuthenticationFilter (커스텀, OncePerRequestFilter)
     — shouldNotFilter()로 공개 경로 JWT 스킵
3. UsernamePasswordAuthenticationFilter (미사용, 앞에 커스텀 필터 삽입)
4. ExceptionTranslationFilter
     — authenticationEntryPoint: 401 JSON 반환
     — accessDeniedHandler: 403 JSON 반환
```

**추가:** `configureGlobal`에서 인메모리 BasicAuth 사용자 (`admin` / `q1w2e3`) 등록. Swagger 등 외부 노출 경로와 연동 가능성 있음.

관련 파일:
- `security/WebSecurityConfig.kt`
- `security/JwtAuthenticationFilter.kt`

---

## 3. 엔드포인트 보호 매트릭스

| 패턴 | 인증 | 권한 | 비고 |
|------|------|------|------|
| `/swagger-ui/**`, `/api-docs/**` | permitAll | - | **운영 배포 시 제거 TODO 존재** |
| `/v1/test` | permitAll | - | **운영 배포 시 제거 TODO 존재** |
| `/v1/kmc/**` | permitAll | - | KMC 전체 경로 무인증 |
| `/v1/auth/login`, `/v1/auth/token/refresh`, `/v1/auth/public-key` | permitAll | - | 정상 |
| `/v1/auth/verification-code/**` | permitAll | - | 정상 |
| `/v1/hospitals/bulk-upsert`, `/v1/hospitals/all` | permitAll | - | 병원 대량 upsert·전체조회 무인증 |
| `POST /v1/members` | permitAll | - | 회원가입 (정상) |
| `GET /v1/members/*/available` | permitAll | - | 아이디 중복 체크 (정상) |
| `GET /v1/members/available-nickname` | permitAll | - | 닉네임 중복 체크 (정상) |
| `POST /v1/members/available-phone` | permitAll | - | 전화번호 중복 체크 (정상) |
| `/v1/hospitals/**` (위 외) | authenticated | - | `@RequiredRole` 없음 |
| `/v1/partners/**` | authenticated | - | `@RequiredRole` 없음 — 일반 사용자도 거래선 CRUD 가능 |
| `/v1/prescriptions/**` | authenticated | - | `@RequiredRole` 없음 |
| `/v1/expense-reports/**` | authenticated | - | `@RequiredRole` 없음 |
| `/v1/settlements/**` (일부) | authenticated | 일부만 `ADMIN_ONLY` | 대부분 인증만으로 접근 |
| `/v1/members/**` | authenticated | `@RequiredRole` 적용 | 정상 |
| `/v1/blind-posts/**` | authenticated | `ADMIN_ONLY` | 정상 |
| `/v1/reports/{userId}` | authenticated | - | 신고 기능 권한 없음 |

---

## 4. JWT / 세션 처리

### 알고리즘 및 키 관리

- **알고리즘:** HMAC-SHA (jjwt `Keys.hmacShaKeyFor` — 키 길이에 따라 HS256/HS384/HS512 자동 결정)
  - `security/JwtService.kt:27`
  - `signWith(key)` 호출 시 알고리즘이 명시적으로 지정되지 않아 키 길이에 의존
- **비밀키 소스:** AWS SSM Parameter Store 조회 (`SecretKeyService.getJwtSecretValue()`)
- **로컬 오버라이드:** `secret.jwt-secret-key: ***`이 `application.yml`에 평문 하드코딩 (application.yml:132)

### 토큰 만료

- 액세스 토큰: 30분 (`TimeUnit.MINUTE.toMillis(30)`)
- 리프레시 토큰: 14일 (`TimeUnit.DAY.toMillis(14)`)
  - `security/JwtService.kt:93-94`

### 리프레시 토큰 검증 취약점 (HIGH)

`POST /v1/auth/token/refresh`는 `RefreshTokenRequest(userId, refreshToken)` 수신.
`AuthService.refreshToken()`은 DB에 저장된 refreshToken과 **비교하지 않고** 단순히 서명/만료 유효성만 검증한다.

```kotlin
if (!jwtService.validateToken(requestRefreshToken)) {
    throw IllegalArgumentException("Expired or malformed refresh token")
}
// DB 내 member.refreshToken 값과 비교하는 코드 없음
```
`service/AuthService.kt:434-436`

즉, 유효한 JWT 서명만 갖춘 임의의 리프레시 토큰으로 새 액세스 토큰 발급이 가능하다. Refresh Token Rotation이나 단일 사용(one-time-use) 전략이 없다.

### 쿠키 `Secure` 플래그 미설정

```kotlin
secure = false // HTTPS 도메인 적용 시 true 변경
```
`security/JwtService.kt:103, 112`

운영 프로필에서도 코드 레벨 변경 없이 `false` 고정. HTTPS 운영 환경에서 평문 HTTP 경로로 쿠키가 전송될 수 있다.

### JWT 필터 예외 무시(Silent Fail)

JWT 파싱 예외를 삼키고 인증 없이 요청을 통과시키는 구조:

```kotlin
} catch (e: Exception) {
    // 어떤 예외도 인증 예외로 전파하지 말고 지나가게 한다.
    logger.warn { "JWT filter suppressed exception..." }
    SecurityContextHolder.clearContext()
}
chain.doFilter(req, res)
```
`security/JwtAuthenticationFilter.kt:61-65`

인증 실패 시 즉시 401을 반환하지 않고 `anyRequest().authenticated()` 검사에 위임하므로, `authenticated()` 보호 대상 경로는 정상 차단되나 설계 의도 파악이 어렵고 사이드 이펙트 리스크가 있다.

---

## 5. CORS / CSRF 정책

### CORS — 와일드카드 origin 허용

```kotlin
config.allowedOrigins = listOf("*")
config.allowedHeaders = listOf("*")
config.allowCredentials = false
```
`security/CorsConfig.kt:14-17`

모든 출처의 모든 헤더를 허용. `allowCredentials = false`이므로 쿠키 크로스오리진 전송은 차단되지만, Authorization 헤더를 사용하는 JWT 기반 요청은 임의 출처에서 호출 가능하다. `allowedOriginPatterns`로 운영 도메인을 명시하는 것이 권장된다.

### CSRF — 비활성

`csrf { it.disable() }` — JWT Stateless 구조에서 표준적인 선택이다. 그러나 `genLoginCookie`로 쿠키에도 액세스 토큰을 저장하는 구조이므로, 브라우저 기반 클라이언트가 쿠키를 사용하는 경우 CSRF 리스크가 잠재한다. `SameSite` 속성 설정 없음, `Secure=false`까지 겹쳐 있다.

---

## 6. 메서드 레벨 권한 체계 (@RequiredRole)

- Spring 표준 `@PreAuthorize` / `@Secured` 미사용. 커스텀 `@RequiredRole` + `RoleCheckAspect` 구현.
- `RoleCheckAspect`는 JWT 재파싱으로 역할을 확인하므로 `SecurityContext` 기반 권한 체계와 이중화되어 있다.

### 적용 현황 (컨트롤러별)

| 컨트롤러 | @RequiredRole 적용 | 비고 |
|----------|-------------------|------|
| MemberController | 주요 엔드포인트 적용 | 일부 적용 누락 확인 필요 |
| BlindPostController | 전체 ADMIN_ONLY | 정상 |
| SettlementController | 일부(`excel-download`, `partners/excel-download`) | 나머지 엔드포인트 무제한 접근 |
| PartnerContractController | approve/reject ADMIN_ONLY | 조회·수정은 권한 없음 |
| BoardController | 일부 적용 | |
| **ExpenseReportController** | **전무** | 지출보고 전체 엔드포인트 권한 미설정 |
| **PrescriptionController** | **전무** | 처방 전체 엔드포인트 권한 미설정 |
| **HospitalController** | **전무** | 병원 삭제·전체삭제 권한 미설정 |
| **PartnerController** | **전무** | 거래선 CRUD 권한 미설정 |
| ReportController | **전무** | 신고 생성 권한 미설정 |

### `ADMIN_OR_SELF` 모드 로직 버그 의심

```kotlin
} else if ((isSelfRequest || targetUserId == null) && (requiredRole.mode == RoleCheckMode.ADMIN_OR_SELF)) {
    return joinPoint.proceed()   // 관리자 권한 체크 없이 통과
```
`aspect/RoleCheckAspect.kt:55-56`

`targetUserId == null`인 경우(PathVariable에 `userId` 없는 메서드) `ADMIN_OR_SELF` 모드에서 어떤 역할의 사용자든 무조건 통과한다. 의도적 설계인지 `@RequiredRole` 주석(`userId` 없을 시 self-request로 간주)에 명시되어 있으나, `@RequiredRole`이 붙은 엔드포인트 중 `{userId}`가 없는 케이스를 별도 점검해야 한다.

---

## 7. 비밀번호 / 민감정보 처리

### BCrypt strength 기본값

```kotlin
fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()
```
`config/SecurityConfig.kt:11`

strength 인자 미지정 → 기본값 10. OWASP 2024 권고는 12 이상 또는 PBKDF2/Argon2 사용.

### `encryptPassword` 플래그 기본값 false

```kotlin
var encryptPassword: Boolean = false
```
`config/app/AppConfig.kt:9`

`application.yml` 어느 프로필에도 `app.encrypt-password=true` 설정이 없다. 즉 로그인·비밀번호 변경 요청의 비밀번호가 평문으로 HTTP 바디에 전달된다. RSA 암호화 인프라(공개키 엔드포인트, RsaUtil)가 구현되어 있으나 활성화되지 않은 상태.

### 프로모션 토큰 — XOR 암호화 (비표준)

```kotlin
for (i in dataBytes.indices) {
    encryptedBytes[i] = (dataBytes[i].toInt() xor keyBytes[i % keyBytes.size].toInt()).toByte()
}
```
`service/AuthService.kt:483-485`

이름·생년월일·전화번호·이메일을 포함한 사용자 PII를 XOR로 "암호화"하여 외부 프로모션 서비스에 전달. XOR은 암호학적으로 안전한 암호화가 아니다(반복 키 패턴으로 복원 가능). AES-GCM 등 표준 대칭키 암호화로 교체 필요.

프로모션 암호화 키:
```yaml
promotion:
  encryption:
    secret-key: "***"
```
`application.yml:11` — 소스코드에 평문 하드코딩.

### 인증코드 평문 로깅

```kotlin
logger.info { "Auth code issued for userId=$userId, phone=$normalizedPhoneNumber" }
```
`service/AuthService.kt:95, 114`

인증코드 값 자체는 로그에 출력되지 않으나 전화번호와 userId가 INFO 레벨로 출력된다. p6spy 로그도 활성화되어 있어 SQL 바인딩 파라미터(전화번호, 이메일 등)가 애플리케이션 로그에 남을 수 있다.

### KMC 시크릿 DEBUG 로그

```kotlin
logger.debug { "Starting KMC secrets: $cpId" }
logger.debug { "Verifying KMC secrets: $urlCode" }
```
`config/app/KmcSecrets.kt:19-20`

DEBUG 레벨이므로 운영에서 출력되지 않을 가능성이 높으나, 로깅 레벨 구성에 따라 KMC 연동 인증값이 로그에 노출될 수 있다.

### 로컬 application.yml 내 민감 자격증명

`application.yml` `local-db` 프로필에 실제처럼 보이는 DB 비밀번호(`***`), RSA PRIVATE KEY 전체 PEM, GCP 서비스 계정 JSON이 평문으로 포함되어 있다. 이 파일이 Git에 커밋된 경우 이력에서 복원 가능하다.
- `application.yml:126-162`

---

## 8. 추가 위험 신호

### API 기본 인증 자격증명 평문

```yaml
api:
  basic:
    authentication:
      username: admin
      password: '***'
```
`application.yml:47-48`

`{noop}***`로 인메모리 사용자로 등록됨(`WebSecurityConfig:76`). 어떤 엔드포인트에 이 BasicAuth가 실제 사용되는지, Swagger 접근과 연결되어 있는지 추적 필요.

### 운영 DB URL 소스코드 노출

```yaml
jdbc-url: jdbc:postgresql://medipanda.cp6gkgc82mif.ap-northeast-2.rds.amazonaws.com/medipanda
```
`application.yml:273`

운영 RDS 엔드포인트가 소스코드에 평문 기재. Git 이력에 남을 경우 외부 노출 리스크.

### `/v1/hospitals/bulk-upsert` 무인증 개방

병원 데이터 대량 upsert 엔드포인트가 인증 없이 허용됨(`WebSecurityConfig:43`). 배치 작업용으로 추정되나 별도 IP 제한이나 서비스 토큰 인증 없이 외부에서 임의 호출 가능.

### `@TestOnly` 엔드포인트 운영 노출 의심

```kotlin
@TestOnly
@GetMapping("/ids/{userId}")
fun getPartnerIdsByUserId(@PathVariable userId: String): ...
```
`web/v1/PartnerController.kt:180-186`

`@TestOnly`는 JetBrains 어노테이션으로 런타임 동작에 영향이 없다. 운영 환경에서도 이 엔드포인트가 활성화된다.

---

## 9. 보안 리스크 Top 10

### RISK-01 (High) — Refresh Token DB 비교 미수행

**근거:** `AuthService.refreshToken()` — `AuthService.kt:434`
유효한 서명의 임의 리프레시 토큰으로 새 액세스 토큰 발급 가능. 토큰 탈취 후 로그아웃해도 토큰이 무효화되지 않는다.
**방어:** `refreshToken()`에서 DB 저장 값(`member.refreshToken`)과 요청값을 `MessageDigest.isEqual()` 등 상수 시간 비교로 검증. 사용 후 즉시 폐기(Rotation).

### RISK-02 (High) — 프로모션 토큰 XOR 암호화 (PII 포함)

**근거:** `AuthService.encryptUserData()` — `AuthService.kt:479-496`
이름·생년월일·전화번호·이메일이 XOR로 "암호화"되어 외부 전달.
**방어:** AES-256-GCM 또는 JWE(JSON Web Encryption)로 교체. 키는 SSM/Vault에서 관리.

### RISK-03 (High) — 비밀번호 평문 전송 (`encryptPassword=false`)

**근거:** `AppConfig.kt:9`, `AuthService.kt:305`
모든 프로필에서 RSA 암호화 비활성 — 로그인 비밀번호가 HTTP 바디에 평문 전송.
**방어:** `app.encrypt-password=true`를 dev/prod 프로필에 명시 설정. 또는 HTTPS 강제 + HSTS 헤더 구성으로 TLS를 보안 계층으로 의존 시 명문화.

### RISK-04 (High) — Swagger/TestController 운영 배포 시 노출

**근거:** `WebSecurityConfig.kt:29-31` (`TODO: 운영 배포시 제거` 주석 존재)
`/swagger-ui/**`, `/api-docs/**`, `/v1/test`가 permitAll로 개방된 채 운영 배포될 경우 API 스키마 전체와 SMS/푸시/이메일 발송 테스트 엔드포인트가 무인증 노출.
**방어:** 운영 프로필에서 Swagger를 비활성화 (`springdoc.swagger-ui.enabled=false`). `TestController`는 운영 빌드에서 제외(`@Profile("!prod")`).

### RISK-05 (High) — `/v1/hospitals/bulk-upsert` 무인증 대량 쓰기

**근거:** `WebSecurityConfig.kt:43`, `HospitalController.kt:95-100`
인증 없이 병원 데이터 대량 upsert 가능.
**방어:** 서비스 간 인증(API Key, IP 화이트리스트, 또는 내부망 전용 엔드포인트)으로 보호. 최소한 `authenticated()`로 승격.

### RISK-06 (Medium) — `ExpenseReportController`, `PrescriptionController` 권한 부재

**근거:** `ExpenseReportController.kt` 전체, `PrescriptionController.kt` 전체 — `@RequiredRole` 미적용
인증된 일반 사용자(`ROLE_USER`)가 타인의 지출보고 삭제(`DELETE /v1/expense-reports/{id}`), 처방 승인(`PATCH /v1/prescriptions/{id}/confirm`) 등 관리자 기능 호출 가능.
**방어:** 각 엔드포인트에 `@RequiredRole(mode=ADMIN_ONLY)` 또는 서비스 계층에서 `loginUser.role` 검사 추가.

### RISK-07 (Medium) — 쿠키 `Secure=false` 하드코딩

**근거:** `JwtService.kt:103, 112`
운영 HTTPS 환경에서 `AUTH_TOKEN` 쿠키에 `Secure` 플래그가 없어 HTTP 요청에도 쿠키 전송.
**방어:** `secure = environment.acceptsProfiles("prod")` 패턴으로 프로필 기반 동적 설정. 또는 `SameSite=Strict` 설정 병행.

### RISK-08 (Medium) — application.yml에 민감 자격증명 커밋

**근거:** `application.yml:48` (BasicAuth 비밀번호), `:126` (DB 비밀번호), `:132` (JWT 시크릿), `:133-161` (RSA 개인키), `:162` (GCP 서비스 계정 JSON), `:273` (운영 RDS 엔드포인트)
Git 이력에 영구 저장될 경우 비밀키/자격증명 복원 가능.
**방어:** `.gitignore`로 `application-local-db.yml` 분리. `git-secrets` 또는 `truffleHog`으로 Git hook 설정. 이미 커밋된 경우 키 로테이션 필수.

### RISK-09 (Medium) — CORS `allowedOrigins = ["*"]`

**근거:** `CorsConfig.kt:14`
임의 출처에서 API 호출 허용. `allowCredentials=false`로 쿠키 크로스오리진 전송은 차단되나, Authorization 헤더 기반 JWT는 제한 없음.
**방어:** `allowedOriginPatterns = ["https://*.medipanda.co.kr"]`로 운영 도메인 제한.

### RISK-10 (Medium) — BCrypt strength=10 (권고 이하) / RSA 우회 경로

**근거:** `SecurityConfig.kt:11` (strength 미지정), `MemberController.kt:301-313` (`PATCH /{userId}/password-for-find-account` — `@RequiredRole` 미적용)
비밀번호 찾기 후 비밀번호 변경 엔드포인트에 권한 체크 없음. 리프레시 토큰 취약점(RISK-01)과 결합 시 계정 탈취 경로가 될 수 있다.
**방어:** BCrypt strength 12 이상으로 상향. `changePasswordForFindAccount` 엔드포인트에 별도 단기 토큰(패스워드 재설정 전용 토큰) 검증 또는 직전 인증코드 세션 재확인 추가.

---

## 권장 액션 (우선순위 순)

1. **[즉시]** Refresh Token 검증을 DB 비교 방식으로 교체 — Token Rotation 도입
2. **[즉시]** 운영 배포 전 Swagger, `/v1/test` 엔드포인트 비활성화/프로파일 분리
3. **[즉시]** application.yml에서 RSA 개인키, GCP 서비스 계정 JSON 제거 — 별도 파일 또는 환경변수로 분리. Git 이력 검토 후 키 로테이션
4. **[단기]** `app.encrypt-password=true` 운영/개발 프로필 활성화 또는 명시적 HTTPS-only 정책 문서화
5. **[단기]** 프로모션 토큰 XOR 암호화 → AES-256-GCM으로 교체
6. **[단기]** `ExpenseReportController`, `PrescriptionController`, `HospitalController`, `PartnerController`에 역할 기반 접근 제어 추가
7. **[단기]** `/v1/hospitals/bulk-upsert` 인증 또는 IP 제한 적용
8. **[단기]** 쿠키 `Secure` 플래그를 환경 프로필 기반으로 동적 설정. `SameSite=Strict` 추가
9. **[중기]** CORS `allowedOrigins = ["*"]` → 운영 도메인 명시
10. **[중기]** BCrypt strength 12 이상으로 상향. 비밀번호 재설정 플로우에 전용 임시 토큰 도입

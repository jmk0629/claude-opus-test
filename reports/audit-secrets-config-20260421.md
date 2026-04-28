# Secret · Config 감사 (Crosscutting #5)

- 작성일: 2026-04-21
- 범위: `medipanda-api` — `application.yml`, `SecretKeyService`, `WebSecurityConfig`, `CorsConfig`, `JwtService`, AWS 연동, 암호 처리
- 감사 축: (1) 리포에 커밋된 시크릿 → (2) SSM 폴백 전략 → (3) 암호·JWT·쿠키 보안 → (4) CORS/CSRF/Basic Auth → (5) 프로필 분리

---

## 0. 한 문장 결론

> **`application.yml`이 리포에 커밋되어 있으며 .gitignore로 제외되지도 않았고, 그 안엔 AES 키·RSA 개인키·GCP 서비스 계정·DB 비밀번호·Basic Auth 비밀번호가 평문으로 들어 있다.** 운영에서는 SSM이 일부 덮어쓰지만, `promotion.encryption.secret-key`는 덮어쓰기 경로가 없고 그 키로 만든 "암호문"은 **XOR**이라 실제 암호화가 아니다. P0 3건 즉시 조치.

---

## 1. CRITICAL 발견

### S-1. 🚨 `application.yml`이 리포 커밋, `.gitignore` 미포함
**`application/src/main/resources/application.yml`** — git 추적 중
**`.gitignore`** — `application.yml`, `*.yml`, `resources/*.yml` 어느 패턴도 없음

파일 내용에 다음 시크릿이 평문으로 존재:
| 라인 | 항목 | 값 |
|---|---|---|
| 11 | `promotion.encryption.secret-key` | `"MediPanda2024!@#$%SecureKey789"` |
| 42 | `api.basic.authentication.password` | `'q1w2e3'` |
| 119-120 | local `postgresql.datasource.username/password` | `jmk0629` / `'aa1234**'` |
| 125 | local `secret.db-password` | `'aa1234**'` |
| 126 | local `secret.jwt-secret-key` | 32-byte HMAC 키 평문 |
| 127-155 | local `secret.password-secret-key` | **cryptographically valid 2048-bit RSA PEM 블록** |
| 156 | local `secret.gcp-service-account` | service account JSON + private key (라벨은 "dummy") |
| 164-169 | local `secret.abs.sms.aligo.*`, `secret.abs.kmc.*` | SMS·KMC override 더미 |

**위험 시나리오**:
- 리포가 퍼블릭이거나, 협력사/외주에 리포 권한을 준 순간 위 모든 값이 유출
- local 프로필 RSA 키가 우연히 운영 `JwtService`의 공개키와 맞으면 완전 위조 가능 (저장소 히스토리상 과거 값 재확인 권장)
- `aa1234**` 같은 패턴은 타 프로젝트 비밀번호로 재사용될 가능성 높음 — 담당자 계정 감사 필요

**즉시 조치**:
1. `.gitignore`에 `**/src/main/resources/application*.yml` 추가
2. `application.yml`을 `application-example.yml`로 rename → 실제 `application.yml`은 로컬 전용·배포 시 주입
3. 이미 커밋된 시크릿은 **로테이트 필수** (git rm만으로 무효화 불가능, history에 잔존)
4. `git log -p --all -- application/src/main/resources/application.yml` 로 과거 값 확인 후 유출 대응

---

### S-2. 🚨 `promotion.encryption.secret-key`는 덮어쓰기 경로가 없고, 그 "암호화"는 XOR
**AuthService.kt:474-496** + **application.yml:11** + **PromotionConfig.kt:7-11**

```kotlin
// AuthService.kt
private fun encryptUserData(userData: Map<String, Any?>): String {
    val secretKey = promotionConfig.secretKey
    val jsonData = objectMapper.writeValueAsString(userData)
    val keyBytes = secretKey.toByteArray()
    val dataBytes = jsonData.toByteArray()
    val encryptedBytes = ByteArray(dataBytes.size)
    for (i in dataBytes.indices) {
        encryptedBytes[i] = (dataBytes[i].toInt()
            xor keyBytes[i % keyBytes.size].toInt()).toByte()   // ← 반복 키 XOR
    }
    return Base64.getEncoder().encodeToString(encryptedBytes)...
}
```

- `secret.MediPanda2024!@#$%SecureKey789` 는 *profile override 없이* default 블록(`promotion.encryption.secret-key`)에 하드코딩. 즉 dev/prod 전부 같은 키.
- 알고리즘은 **반복 키 XOR**. 고전 암호 분석서 1장 수준 — 평문 2개 이상 알려지면 키 복원.
- 메서드 이름이 `encryptUserData`이지만 실제로는 **URL-safe 인코딩 + 경량 난독화**에 불과.
- 호출처: 프로모션 토큰 발급 플로우. 토큰이 외부에 노출되면 사용자 데이터(`userId`, timestamp 등) 복원 가능 + 위조 가능.

**즉시 조치**:
1. **키 자체**는 SSM 파라미터로 이전 → 기본값 삭제
2. **알고리즘**은 AES-GCM 등 표준으로 교체. `javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")` + nonce
3. 기존 발급 토큰은 전부 만료 처리 (revoke)

---

### S-3. 🚨 JWT 쿠키 `secure = false` 하드코딩, 운영 도메인에서도 HTTP 전송 허용
**JwtService.kt:89, 98**

```kotlin
fun genLogoutCookie() = Cookie("AUTH_TOKEN", "").apply {
    ...
    secure = false  // HTTPS 도메인 적용 시 true 변경
    ...
}
fun genLoginCookie(authToken: String) = Cookie("AUTH_TOKEN", authToken).apply {
    ...
    secure = false
    ...
}
```

- 주석은 "적용 시 true 변경"이지만 **현재도 운영 도메인에서 false 유지**. HTTPS 배포 시 쿠키는 HTTP 경로로도 송신됨 → MITM.
- `csrf().disable()` (WebSecurityConfig.kt:25) + `SameSite` 미설정 조합 → 쿠키 JWT 세션이 CSRF·세션 탈취에 모두 노출.
- `HttpOnly = true`는 유지 (XSS는 방어) — 부분 방어만 있음.

**즉시 조치**:
1. `secure = true` — 운영 환경에서는 HTTPS만 → 로컬 개발은 프로필 분기 (`@Value("\${cookie.secure:true}")`)
2. `sameSite = "Strict"` 또는 `"Lax"` 설정 (Spring 6의 `ResponseCookie` 권장)
3. CSRF는 쿠키 JWT를 사용하는 한 재활성화 필요 (Bearer 헤더만 쓸 거면 `disable` 유지 OK)

---

## 2. HIGH 발견

### S-4. `api.basic.authentication.password: 'q1w2e3'` + `inMemoryAuthentication`
**application.yml:42** + **WebSecurityConfig.kt:71-78** (RBAC §R-5에서 지적, 여기선 **값까지 확정**)

- `q1w2e3` 6자 약한 비밀번호, 키보드 좌상단 행 패턴. 무차별 대입 수십 회 이내.
- `{noop}` 평문 + `.roles("ADMIN")` — Spring Security가 Basic Auth 요청 수신 시 이 자격증명으로 ADMIN 통과.
- `WebSecurityConfig.filterChain`에서 `httpBasic` 을 명시적으로 disable하지 않았으므로 기본값 확인 필요. Spring Boot 3의 default는 `formLogin/httpBasic`이 **disabled**이나, `authorizeHttpRequests`만 쓸 때도 `authenticationManager`가 inMemoryAuth를 소비할 가능성이 있음.

**조치**: 
- `configureGlobal(auth)` 블록을 **전부 제거**. inMemoryAuthentication 사용처가 없다면 (현재 코드상 확인 안 됨) 통째로 삭제해도 영향 없음.
- 혹시 Actuator 등 내부 엔드포인트용이면 `@Profile("local")`로 한정.

---

### S-5. `SecretKeyService` 캐시가 TTL/eviction 없음 — SSM 로테이션 무시
**SecretKeyService.kt:22, 35-43**

```kotlin
private val cache = ConcurrentHashMap<String, String>() // simple in-memory cache

fun getAbs(paramName: String, decrypt: Boolean = true): String {
    ...
    return cache.computeIfAbsent(paramName) {
        ssmClient.getParameter(...).parameter().value()
    }
}
```

- 첫 호출 시 SSM에서 가져온 값이 **프로세스 생명주기 내내** 유지.
- SSM에서 파라미터 로테이션(예: DB 비밀번호 변경, JWT 키 교체)해도 앱 재시작 전까지 구 값 사용.
- 로테이션 자동화가 중요한 운영 환경에서 큰 리스크.

**조치**:
- Caffeine 캐시로 전환 + TTL 10~30분
- 또는 명시적 `refresh()` 엔드포인트 + 스케줄러
- 혹은 로테이션 이벤트(AWS EventBridge)를 받아 캐시 무효화

---

### S-6. `KmcSecrets.log()`의 @PostConstruct에서 KMC 식별 코드를 debug 로그
**KmcSecrets.kt:18-22**

```kotlin
@PostConstruct
fun log() {
    logger.debug { "Starting KMC secrets: $cpId" }
    logger.debug { "Verifying KMC secrets: $urlCode" }
}
```

- `cpId`, `urlCode`는 KMC(본인확인 서비스) 계약 식별자. 노출되면 타 서비스가 동일 식별자로 인증 시도 가능.
- debug 레벨이라 기본은 미출력이나, 로깅 레벨이 문제 상황에서 올라갔을 때 로그에 남음.
- **log()가 PostConstruct에 있어** 부팅 시 매번 평가 — 로깅 안 하는 편이 안전.

**조치**: `log()` 메서드 통째로 제거 또는 `"KMC secrets initialized"` 수준으로 축약.

---

### S-7. `AwsConfig`의 silent fallback — 운영 환경 자격증명 혼동 위험
**AwsConfig.kt:17-26**

```kotlin
@Bean
fun awsCredentialsProvider(): AwsCredentialsProvider {
    return try {
        ProfileCredentialsProvider.builder()
            .profileName("medipanda")
            .build()
            .also { it.resolveCredentials() } // force check
    } catch (ex: Exception) {
        DefaultCredentialsProvider.create()
    }
}
```

- 1순위: 로컬 `~/.aws/credentials`의 `[medipanda]` 프로필
- 2순위 (fallback): `DefaultCredentialsProvider` — env vars → `~/.aws/credentials` default → ECS/EC2 role
- **예외를 삼켜서** 어떤 경로로 자격증명이 로드됐는지 로그 부재. 운영 컨테이너에서 의도와 다른 role 사용 가능.
- 개발자가 로컬에 운영용 프로필을 가지고 있고, 실수로 이 앱을 `SPRING_PROFILES_ACTIVE=prod`로 띄우면 운영 SSM/SES/S3에 접근.

**조치**:
- `catch`에 `logger.warn`로 어떤 provider로 fallback했는지 로그
- 운영 컨테이너에는 `ProfileCredentialsProvider` 시도 자체 생략 (env var `AWS_PROFILE` 미설정 시 바로 Default)
- 로컬 프로필명을 `medipanda-dev`로 바꿔 운영과 격리

---

### S-8. dev/prod 프로필의 `password: dummy`는 SSM 실패 시 사일런트 잘못된 값 사용
**application.yml:193, 216**

```yaml
postgresql:
  datasource:
    password: dummy   # dev profile
```

- 실제 로딩은 `PostgreSqlConfig.kt:40`의 `hikariConfig.password = secretKeyService.getDbPassword()`로 **코드가 덮어씀**. yml 값은 바인딩 단계의 placeholder.
- 하지만 `getDbPassword()`가 SSM override 존재 시 그 값, 없으면 `secret.db-password` → 마지막에 SSM. SSM 호출이 실패하면 예외 전파 → 앱 부팅 실패 — 이건 안전.
- 다만 이 "placeholder"가 yml에 남아 있어 **초심자 오해** 가능 — "dummy 비밀번호로 운영 DB 접근"으로 읽힐 여지.

**조치**: `password: ${secret.db-password}` 플레이스홀더만 남기고 실제 literal 제거. 더 명확.

---

## 3. MEDIUM 발견

### S-9. CORS `allowedOrigins = listOf("*")` 전역
**CorsConfig.kt:14**

```kotlin
config.allowedOrigins = listOf("*")
config.allowedMethods = listOf("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS")
config.allowedHeaders = listOf("*")
config.allowCredentials = false  // ← 이건 true가 아니어서 쿠키는 안 실림, OK
```

- `allowCredentials=false`라 JWT 쿠키가 다른 오리진으로 새진 않음 (**긍정**).
- 그러나 Bearer 헤더 방식의 JWT는 `allowCredentials` 와 무관하게 임의 오리진에서 호출 가능 → 프론트엔드 외의 사이트가 API를 임의 호출해도 CORS는 막지 않음.
- **조치**: allowlist (`https://admin.medipanda.co.kr`, `https://app.medipanda.co.kr`, 로컬만) + 프로필별 yml로 주입.

### S-10. `swagger-ui`, `api-docs`, `/v1/test`가 `permitAll` — 운영 노출
**WebSecurityConfig.kt:28-34** (RBAC §R-8 재확인)

- 주석 `//TODO: 운영 배포시 제거` 3건 방치.
- `springdoc.api-docs.path: /api-docs`, `swagger-ui.path: /swagger-ui.html` (application.yml:45-48)는 default 프로필에 설정 — prod 프로필에서도 활성.
- **조치**: `application-prod.yml`에서 `springdoc.api-docs.enabled: false`, `springdoc.swagger-ui.enabled: false`. 필터 체인의 permitAll도 `@Profile("!prod")` 분기.

### S-11. `env: prod` 바인딩은 `@Value("\${env}")` — 프로필 명확성 부족
**application.yml: 86, 122, 195, 218, 242, 266** + **SecretKeyService.kt:15**

- `env` 라는 **짧은 키**가 root namespace에 있음. IDE 자동완성·로그 검색·grep 모두 noisy.
- 일반 컨벤션은 `app.env` / `medipanda.env`.
- **조치**: `medipanda.env`로 rename. 1회성 grep + rename이면 끝.

### S-12. KIMS 외부 API `token: your-kims-cust-id` placeholder
**application.yml:58** + **ExternalApiProperties.kt**

- default 값이 `your-kims-cust-id`. 운영에선 무엇이 덮어쓰는지 불분명 (SSM 경로·env var). `KmcSecrets`처럼 `SecretKeyService.getAbs("/kims/cust-id")` 패턴으로 통일 권장.

---

## 4. LOW / 관찰

- **S-13**. `SPRING_PROFILES_ACTIVE=prod` 기본값이 Dockerfile에 박혀 있음 (line 55). 체크: `local-db` profile로 뜨는 Dockerfile.local과 병행 — 이미지 태깅 규약 확인 필요.
- **S-14**. 정적 리소스(`static/test-images/`, `static/test-excel-files/`)는 `.gitignore`되어 있으나 기존 커밋 이력 확인 권장.
- **S-15**. `Cookie.maxAge = TimeUnit.MINUTE.toSeconds(30)` vs JWT 만료 30분 — 일관됨. (긍정)

---

## 5. 긍정 발견

- `SecretKeyService.getAbs()`의 **local override 설계** (`secret.abs.<dot-path>`)는 깔끔. 로컬 개발 시 AWS 자격증명 없이도 앱 기동 가능하게 만든 패턴 — 복제·확장할 가치.
- CORS `allowCredentials = false` — 쿠키 탈취 경로 차단.
- Dockerfile이 multi-stage + 최소 베이스(`amazoncorretto:17`) — 공격 표면 작음.
- `.gitignore`가 `.idea`, `.vscode`, `build/` 등 개발 도구 산출물은 제대로 제외.

---

## 6. 우선순위 개선 로드맵

| 순위 | 작업 | 공수 | 레버리지 |
|---|---|---|---|
| **P0** | S-1: `application.yml` gitignore 추가 + example 분리 + 시크릿 로테이트 | 1일 (로테이트 포함) | 치명 |
| **P0** | S-2: `promotion.encryption` 알고리즘을 AES-GCM으로 교체 + 키 SSM 이전 | 반나절 | 치명 |
| **P0** | S-3: JWT 쿠키 `secure=true` + `SameSite=Strict` | 30분 | 치명 |
| **P1** | S-4: `inMemoryAuthentication` 블록 제거 | 15분 | 높음 |
| **P1** | S-5: `SecretKeyService` 캐시 TTL 도입 (Caffeine) | 1~2시간 | 높음 |
| **P1** | S-6: `KmcSecrets.log()` 제거 | 5분 | 중간 |
| **P1** | S-7: `AwsConfig` fallback 로그 추가 + 운영 프로필명 분리 | 30분 | 중간 |
| **P2** | S-9: CORS allowlist 프로필 분리 | 반나절 | 중간 |
| **P2** | S-10: Swagger/api-docs prod off + `/v1/test` 삭제 | 15분 | 중간 |
| **P2** | S-11: `env` → `medipanda.env` rename | 30분 | 낮음 |
| **P2** | S-12: KIMS 토큰 SSM 이전 | 30분 | 중간 |

**P0 공수 총합**: 약 하루 (로테이트 포함). 로테이트 없이 코드 변경만이라면 3시간.

---

## 7. Executive Summary 업데이트 제안

본 감사로 **executive summary의 P0가 5건 → 7건**으로 확장:

| 추가 P0 | 근거 |
|---|---|
| P0-6 (신규) | S-1: 리포 커밋된 시크릿 제거 + 로테이트 |
| P0-7 (신규) | S-2: `encryptUserData` XOR을 AES-GCM으로 교체 |

기존 RBAC §R-5(inMemoryAuth)와 S-4는 동일 이슈, 본 보고서에서 값(`q1w2e3`)까지 확정.

---

## 8. 참고 파일

- `application/src/main/resources/application.yml` (266 라인, 6개 profile)
- `.gitignore` (46 라인)
- `application/src/main/kotlin/kr/co/medipanda/portal/security/SecretKeyService.kt`
- `application/src/main/kotlin/kr/co/medipanda/portal/security/WebSecurityConfig.kt`
- `application/src/main/kotlin/kr/co/medipanda/portal/security/JwtService.kt`
- `application/src/main/kotlin/kr/co/medipanda/portal/security/CorsConfig.kt`
- `application/src/main/kotlin/kr/co/medipanda/portal/service/AuthService.kt` (L474-496)
- `application/src/main/kotlin/kr/co/medipanda/portal/config/aws/AwsConfig.kt`
- `application/src/main/kotlin/kr/co/medipanda/portal/config/app/{PromotionConfig,ApiAuthenticationProperties,KmcSecrets}.kt`
- `Dockerfile`, `Dockerfile.local`

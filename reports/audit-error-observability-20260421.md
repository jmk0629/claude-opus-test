# 감사 보고서 — 에러 처리·관측성 (크로스커팅 #8)

- 작성일: 2026-04-21
- 범위: `GlobalExceptionHandler`, 커스텀 예외, 로깅 패턴, 민감정보 마스킹, 관측성(MDC/Metrics/Tracing/Actuator)
- 인접 감사: [audit-secrets-config-20260421.md](./audit-secrets-config-20260421.md) — 민감값 설정 관리, [audit-admin-rbac-20260421.md](./audit-admin-rbac-20260421.md) — AOP 예외 처리

---

## 0. Executive Summary

> 에러 핸들링은 **"동작은 하지만 품질은 낮다."** 중앙 `GlobalExceptionHandler` 1개로 9가지 예외를 처리하지만, Spring MVC 표준 예외 다수가 누락돼 클라이언트에 **500 Internal Server Error**가 나가고, 응답 포맷이 `ErrorResponse(code,message)`와 plain `String` 두 가지로 혼용된다. 더 큰 문제는 **로그에 전화번호·FCM 토큰·암호 복호화 실패 메시지가 평문**으로 남고, **관측성 인프라(MDC·Metrics·Actuator·Tracing)가 0건**이다. 운영 중 사고 발생 시 "이 요청의 로그만 추적"이 불가능하다.
>
> **P0 2건(PII 유출, AOP `printStackTrace`), P1 3건(응답 포맷 불일치·표준 예외 누락·관측성 부재), P2 4건.**

### 지표 스냅샷

| 지표 | 값 | 판정 |
|---|---|---|
| `@RestControllerAdvice` | 1개 (GlobalExceptionHandler) | ✅ 중앙화 |
| `@ExceptionHandler` 메서드 | 9개 | 🟡 Spring MVC 표준 예외 ≥8개 누락 |
| 응답 포맷 | `ErrorResponse` 5건 + plain `String` 4건 | 🔴 혼용 |
| 커스텀 예외 클래스 | **2개** (BadRequest, Unauthorized) | 🔴 도메인 예외 체계 부재 |
| `e.printStackTrace()` | 1건 (RoleCheckAspect.kt:110) | 🔴 구조화 로깅 우회 |
| `logger.*` 사용 | 367건 / 50 파일 | ✅ 광범위 |
| MDC (Mapped Diagnostic Context) | **0건** | 🔴 traceId/requestId 없음 |
| Micrometer/`@Timed`/`Counter` | **0건** | 🔴 메트릭 수집 0 |
| Actuator 의존성/엔드포인트 | **0건** | 🔴 health check도 수동 |
| Distributed tracing (Sleuth/OTel) | **0건** | 🔴 분산 추적 없음 |
| 민감 정보 로그 유출 (PII) | 최소 **8곳** (전화번호·FCM 토큰) | 🚨 |
| JSON 구조화 로깅 | ❌ 평문 패턴 | 🟠 ELK 파싱 저효율 |

---

## 1. E-1 [P0 🚨] 로그에 전화번호·FCM 토큰 평문 기록 — PII 유출

**위치 및 증거**

| 파일·라인 | 로그 내용 | 레벨 | 노출 PII |
|---|---|---|---|
| `AuthService.kt:95` | `"Auth code issued for userId=$userId, phone=$normalizedPhoneNumber"` | INFO | 📱 전화번호 |
| `AuthService.kt:114` | `"Auth code issued for userId=$userId, phone=$normalizedPhoneNumber"` | INFO | 📱 전화번호 |
| `AuthService.kt:137` | `"Auth code verify result for phone=$normalizedPhoneNumber"` | INFO | 📱 전화번호 |
| `AuthService.kt:140` | `"auth verification failed for phone=$phoneNumber, userId=$userId"` | ERROR | 📱 전화번호 + 예외 스택 |
| `AuthService.kt:171` | `"인증 성공: phoneNumber=$normalizedPhoneNumber, userId=$userId"` | INFO | 📱 전화번호 |
| `AuthService.kt:191` | `"auth code verify result for phone=$phoneNumber, userId=$userId"` | ERROR | 📱 전화번호 |
| `SmsSender.kt:31` | `"Sending SMS via Aligo. originalReceiver='$phoneE164', normalized='$receiverCsv', sender='$sender'"` | INFO | 📱 송수신 전화번호 **모두** |
| `PushTokenCleaner.kt:18` | `"Soft-deleted FCM token. token=$token, affected=$affected"` | INFO | 🔑 FCM 토큰 전체 |

**문제**
- 전화번호는 개인정보보호법상 **개인식별정보** — 로그 파일에 평문 저장 시 접근 제어·보유 기간·익명화 대상
- FCM 토큰은 디바이스 식별자 + 푸시 발송 권한 토큰 → 탈취 시 타인에게 푸시 발송·스팸 가능
- 로그 파일 경로 `/tmp/log/medipanda/medipanda-api.log` — 30일 보관 (logback-spring.xml:19). 즉 **과거 30일치 전화번호·토큰이 파일에 누적**
- PushEventAfterCommitListener.kt:95에서는 `token.take(20)` 부분 마스킹 시도 존재 → **부분 마스킹 의식은 있으나 일관되지 않음**

**재현 증거 (3초)**
```bash
grep "phone=" /tmp/log/medipanda/medipanda-api.log | head
grep "token=" /tmp/log/medipanda/medipanda-api.log | head
```

**권고 (필수)**
1. 전화번호 마스킹 확장 함수 도입:
   ```kotlin
   fun String.maskPhone(): String =
       if (length >= 8) "${take(3)}****${takeLast(4)}" else "****"
   ```
   → 모든 로그에서 `$phoneNumber` → `${phoneNumber.maskPhone()}` 치환
2. FCM 토큰은 해시값 또는 `take(8)...` 형태로만 로그:
   ```kotlin
   fun String.maskToken(): String = "${take(8)}...${takeLast(4)}"
   ```
3. 이미 기록된 30일치 로그 **즉시 삭제 또는 마스킹**
4. 신규 개인정보 필드가 로그에 들어가지 않도록 **Logback MDC Converter 기반 마스킹 필터** 도입 검토 (logback-spring.xml에 `<conversionRule>` 추가)

**공수**: 2시간 (치환 + 기존 로그 정리 + 필터 PoC)

---

## 2. E-2 [P0 🚨] `RoleCheckAspect.printStackTrace()` — 구조화 로깅 우회 + stderr 직접 출력

**위치** `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/aspect/RoleCheckAspect.kt:109-111`

```kotlin
} catch (e: Exception) {
    e.printStackTrace()  // ← stderr에 직접 출력, logback 미경유
}
return null
```

**문제**
- `printStackTrace()`는 JVM 표준 stderr로 출력 → logback 포맷·필터·MDC 미적용
- 해당 스택 트레이스는 로그 파일에 남지 않고 컨테이너 stdout/stderr로만 나감 → 로그 수집 파이프라인 누락 시 증발
- RoleCheckAspect는 **인증/권한 검사 지점**이라 사실상 모든 관리자 요청이 지나감. 이 지점의 예외는 보안 이벤트로서 추적 필수
- 더불어 메서드 리턴값이 `null`로 조용히 떨어지면서 AOP 호출자가 정상 흐름으로 진행 → **사일런트 실패** (RBAC 감사 R-3 fail-open과 연계)

**권고**
```kotlin
} catch (e: Exception) {
    logger.warn(e) { "Failed to extract target userId from PathVariable" }
}
```
- RBAC 감사의 R-3 fail-open 수정과 **동일 PR로 병합** 권고

**공수**: 5분

---

## 3. E-3 [P1] `GlobalExceptionHandler` 응답 포맷 혼용 — `ErrorResponse` vs `String`

**증거**

| 핸들러 | 리턴 타입 | 응답 예시 |
|---|---|---|
| `handleDataIntegrityViolation` | `ResponseEntity<ErrorResponse>` | `{"code":"PARTNER_DUPLICATE","message":"..."}` |
| `handleBadRequest` (IllegalArgument) | `ResponseEntity<String>` | `"Bad request: ${ex.message}"` |
| `handleNotFound` | `ResponseEntity<String>` | `"Not found: ${ex.message}"` |
| `handleDatabaseError` | `ResponseEntity<ErrorResponse>` | `{"code":"INTERNAL_ERROR","message":"Database error"}` |
| `handleIllegalState` | `ResponseEntity<ErrorResponse>` | `{"code":"CONFLICT","message":"..."}` |
| `handleOtherErrors` | `ResponseEntity<ErrorResponse>` | `{"code":"INTERNAL_ERROR","message":"Unexpected error"}` |
| `handleUnauthorized` | `ResponseEntity<String>` | `"Unauthorized: ${ex.message}"` |
| `handleBadRequestCustom` | `ResponseEntity<String>` | `"Bad request: ${ex.message}"` |

**문제**
- 프런트는 같은 에러 응답에 대해 **두 가지 파싱 경로**를 유지해야 함
  - `axios` 인터셉터에서 `error.response.data.message` vs `error.response.data` 문자열 직접 분기 필요
- 4개 String 핸들러에서 `ex.message`가 클라이언트에 **직접 노출됨** → 예: `IllegalArgumentException("SQL: SELECT ... WHERE userId=123")` 형태의 내부 오류 메시지가 브라우저에 도달
- `handleIllegalState` 역시 `ex.message ?: "Illegal state"` — 내부 메시지 그대로 노출

**권고**
```kotlin
// 통일된 포맷 강제
@ExceptionHandler(IllegalArgumentException::class)
fun handleBadRequest(ex: IllegalArgumentException): ResponseEntity<ErrorResponse> {
    logger.warn { "IllegalArgument: ${ex.message}" }  // 서버 로그에만
    return ResponseEntity
        .status(HttpStatus.BAD_REQUEST)
        .body(ErrorResponse(code = "BAD_REQUEST", message = "요청 형식이 올바르지 않습니다."))
    // 내부 메시지를 클라이언트에 노출하지 않음
}
```

**공수**: 1시간 (9개 핸들러 통일)

---

## 4. E-4 [P1] Spring MVC 표준 예외 **8+종 누락** — 기본 500/403 동작에 의존

현재 `GlobalExceptionHandler`가 처리하지 않는 주요 예외:

| 예외 | 발생 상황 | 현재 동작 | 권고 상태 |
|---|---|---|---|
| `MethodArgumentNotValidException` | `@Valid` DTO 검증 실패 | 400 + Spring 기본 메시지(거대한 JSON) | 400 + 필드별 메시지 압축 |
| `ConstraintViolationException` | `@Validated` 파라미터 검증 | 500 Internal Server Error | 400 |
| `HttpMessageNotReadableException` | JSON 파싱 실패·Content-Type 미스매치 | Spring 기본 400 | 400 + "요청 형식 오류" |
| `MissingServletRequestParameterException` | 필수 쿼리 파라미터 누락 | Spring 기본 400 | 400 + 파라미터 이름 |
| `HttpRequestMethodNotSupportedException` | GET 엔드포인트를 POST로 호출 등 | Spring 기본 405 | 405 (현 동작 유지, 로그 추가) |
| `MaxUploadSizeExceededException` | 파일 업로드 크기 초과 | **500 Internal Server Error** | 413 Payload Too Large |
| `AccessDeniedException` | Spring Security 권한 거부 | Spring Security 기본 403 HTML 페이지 | 403 JSON |
| `AuthenticationException` | 인증 실패 (JWT 만료 등) | Spring Security 기본 401 | 401 JSON + 재발급 힌트 |
| `MethodArgumentTypeMismatchException` | PathVariable 타입 불일치 (e.g. `/v1/members/abc` → Long 변환 실패) | 400 + 원시 메시지 | 400 + 타입 힌트 |

**프런트 사용자 영향**
- 파일 업로드 실패 시 "서버 오류 발생" 토스트 (실제는 413) → 사용자가 뭘 잘못했는지 알 수 없음
- Bean Validation 실패 시 giant JSON 구조를 프런트가 파싱 → UX 저하
- AccessDenied 시 HTML 페이지가 JSON 기대하는 axios에 오면 parse 에러 → "알 수 없는 오류"

**권고**
- 위 8종 모두 `@ExceptionHandler` 추가 → 통일된 `ErrorResponse` 리턴
- `HandlerExceptionResolver`/`ResponseEntityExceptionHandler` 상속 패턴으로 Spring MVC 기본 예외를 한 번에 오버라이드

**공수**: 3시간 (8개 핸들러 + 간단한 매핑 테이블)

---

## 5. E-5 [P1] 관측성 인프라 **전면 부재** — MDC · Metrics · Actuator · Tracing 0건

**증거**
- `MDC`, `Micrometer`, `@Timed`, `@Counted`, `Actuator`, `Tracer`, `Sleuth`, `OpenTelemetry` 키워드 **전체 grep 결과 0**
- `application.yml`에 `management:` 섹션 전무
- `application/build.gradle.kts`에 `micrometer`/`actuator`/`logstash` 의존성 0
- `logback-spring.xml` 패턴에 MDC placeholder(`%X{...}`) 없음 → 로그 라인에 traceId/requestId 주입 불가

**운영 영향 시나리오**
1. **장애 대응**: "13:42 에러 스파이크 발생" → 어떤 사용자·어떤 요청의 에러인지 로그에서 상관관계 추적 불가
2. **성능 저하**: "API 응답이 느려요" → 어느 엔드포인트·어느 서비스 메서드가 병목인지 메트릭 없음. 스크린샷 시간대를 grep으로 직접 찾아야 함
3. **health check**: K8s/ALB가 `/actuator/health`를 기대할 수 있으나 존재하지 않음 → 임시로 `/v1/test` 엔드포인트로 대체되었을 가능성 (RBAC 감사 §R-8 참조)
4. **용량 산정**: "이 엔드포인트의 p95 latency는?" → 답 없음

**권고 (단계별)**

### Step 1 (반나절): Spring Boot Actuator + Request ID MDC
```kotlin
// build.gradle.kts
implementation("org.springframework.boot:spring-boot-starter-actuator")
implementation("io.micrometer:micrometer-registry-prometheus")

// application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      show-details: when-authorized

// RequestIdFilter.kt (새 파일, JwtAuthenticationFilter 앞에 배치)
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestIdFilter : OncePerRequestFilter() {
    override fun doFilterInternal(req: HttpServletRequest, res: HttpServletResponse, chain: FilterChain) {
        val requestId = req.getHeader("X-Request-Id") ?: UUID.randomUUID().toString()
        MDC.put("requestId", requestId)
        res.setHeader("X-Request-Id", requestId)
        try {
            chain.doFilter(req, res)
        } finally {
            MDC.clear()
        }
    }
}

// logback-spring.xml 패턴 수정
<pattern>%d ... [%X{requestId:-}] %class{36}.%method:%line - %msg%n</pattern>
```

### Step 2 (1일): Prometheus + Grafana 연계
- `/actuator/prometheus` 엔드포인트 노출 (관리 포트 분리 권장: `management.server.port=8081`)
- Grafana 대시보드: HTTP 요청 rate, latency p50/p95/p99, JVM 메모리, HikariCP 커넥션 풀, DB 쿼리 타임
- SLO 알림: 5xx 비율 > 1%, p95 > 500ms

### Step 3 (장기): OpenTelemetry 도입
- Spring Boot 3 OTel auto-instrumentation agent
- 트레이스 → Tempo/Jaeger
- 서비스 간 호출 (ProductService → BoardService 등) 시각화

**공수**: Step 1 반나절, Step 2 1일, Step 3 1주

---

## 6. E-6 [P2] 커스텀 예외 클래스 **2개**뿐 — 도메인 의도 모호

**증거**
```
/domain/exception/
├── BadRequestException.kt        ← message만
└── UnauthorizedException.kt      ← @ResponseStatus(401)
```

**문제**
- 나머지 예외 상황은 `IllegalArgumentException`(404·400 혼용), `IllegalStateException`(409), `NoSuchElementException`(404), `EntityNotFoundException` 등 **JDK/JPA 표준 예외를 재활용**
- 같은 `IllegalArgumentException`이 "파라미터 누락"과 "비즈니스 규칙 위반"을 모두 표현 → 의도 파악을 위해 메시지 문자열에 의존
- 예:
  - `ProductService.kt:108` — `throw IllegalArgumentException("Product not found. code=...")` ← **사실 404 NotFound 의도**
  - `AuthService` 전반 — 인증 실패를 `IllegalStateException`으로 표현 → GlobalExceptionHandler가 409 CONFLICT로 변환 (의도와 불일치)

**권고 (도메인 예외 체계)**
```kotlin
sealed class BusinessException(message: String) : RuntimeException(message)

class NotFoundException(resource: String, id: Any?) :
    BusinessException("$resource not found: id=$id")

class ForbiddenException(message: String) : BusinessException(message)
class ConflictException(message: String) : BusinessException(message)
class ValidationException(message: String) : BusinessException(message)
```

**마이그레이션**
- 신규 코드만 적용하고 기존 `IllegalArgumentException` 유지해도 점진적으로 감소
- 우선순위: `throw IllegalArgumentException("... not found")` → `throw NotFoundException(...)` 치환

**공수**: 계층 정의 1시간 + 점진적 리팩터 (스프린트 백로그)

---

## 7. E-7 [P2] 로그 레벨 적절성 — INFO에 진단용/노이즈 정보 과다

**샘플 증거**

| 위치 | 로그 | 적절 레벨 |
|---|---|---|
| `AuthService.kt:238` | `"Password check for userId=$userId, matched=$matched"` | **DEBUG** (모든 로그인 시마다 INFO 기록) |
| `PrescriptionMonthlyStatsService.kt:55` | `"Monthly count cache hit. userId=$userId..."` | **DEBUG** (캐시 히트 로그는 운영에서 과다) |
| `PushEventAfterCommitListener.kt:56, 85, 104, 108` | 토큰 수집·중복 필터링 상세 | **DEBUG** |
| `SecretKeyService.kt:32, 36` | SSM 파라미터 이름·override 키 | **DEBUG** (이미 부팅 시마다 기록) |
| `DealerService.kt:37` | `"Duplicate dealer creation blocked..."` | WARN 유지 ✅ |

**영향**
- INFO가 기본 루트 레벨이면 `medipanda-api.log`에 하루 수 GB 누적 (30일 보관 → 100GB+ 디스크)
- 진짜 중요한 INFO 이벤트(로그인 성공·주요 상태 변경)가 노이즈에 묻힘

**권고**
- "요청마다 발생"하는 로그는 DEBUG로 하향
- "시스템 상태 변경"(로그인 성공, 주문 완료, 관리자 조작)은 INFO 유지
- "사용자 에러"(검증 실패, 권한 거부)는 WARN
- "시스템 에러"(DB·외부 연동 실패)는 ERROR

**공수**: 반나절 (전수 검토 + 레벨 조정)

---

## 8. E-8 [P2] JSON 구조화 로깅 부재 — ELK/Loki 파싱 비효율

**현황** `logback-spring.xml:22-26`
```xml
<pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level %-4relative --- [ %thread{10} ] %class{36}.%method:%line - %msg%n</pattern>
```

**문제**
- 평문 패턴 → Logstash grok 패턴으로 파싱해야 함. 정규식 실패 시 "Failed to parse" 이벤트 누적
- `msg` 안에 `key=value` 혼합 (예: `userId=123, phone=010...`) — 구조화 필드로 인덱싱 안 됨
- Elasticsearch에서 "특정 userId의 모든 로그"를 find하려면 `msg: *userId=123*` wildcard 검색 → 느림

**권고**
- 프로덕션 프로파일에서 Logstash encoder 또는 Logback JSON encoder 도입:
  ```xml
  <appender name="JSON" class="ch.qos.logback.core.rolling.RollingFileAppender">
      <encoder class="net.logstash.logback.encoder.LogstashEncoder">
          <customFields>{"service":"medipanda-api"}</customFields>
      </encoder>
  </appender>
  ```
- 의존성 추가: `implementation("net.logstash.logback:logstash-logback-encoder:7.4")`
- 서비스 코드의 `logger.info { "... userId=$userId" }` 패턴을 MDC + 구조 필드로 점진 전환

**공수**: 의존성·설정 3시간. 점진적 MDC 키화는 스프린트 백로그

---

## 9. E-9 [P2] 로그 파일 경로 `/tmp/log/medipanda/*` — 컨테이너 환경 부적절

**위치** `logback-spring.xml:14, 50`
```xml
<file>/tmp/log/medipanda/medipanda-api.log</file>
```

**문제**
- `/tmp`는 컨테이너 재시작 시 소실되는 레이어
- K8s/ECS에서 `emptyDir` 또는 볼륨 마운트가 없으면 30일 보관 설정이 무의미
- 또한 `/tmp`는 다른 프로세스가 함부로 쓸 수 있는 공용 공간 — 보안 기준 불충족

**권고**
- 표준 경로로 변경: `/var/log/medipanda/...` 또는 환경 변수화 `${LOG_PATH:-/var/log/medipanda}`
- 컨테이너 배포 시 **stdout/stderr만 출력**하고 파일 로깅은 제거 (12-factor app 원칙). 로그 수집은 Kubernetes 레벨에서 Fluent Bit/Loki 담당
- Dockerfile에 `VOLUME /var/log/medipanda` 추가

**공수**: 30분 + 인프라 팀과 조율

---

## 10. E-10 [P3] `logback-spring.xml` 프로파일 분기 — `local` vs `!local`만

**위치** `logback-spring.xml:5, 41`
```xml
<springProfile name="local">...</springProfile>
<springProfile name="!local">...</springProfile>  <!-- dev, prod 모두 같은 설정 -->
```

**문제**
- dev·prod 구분 없음 → prod에서도 `%class{36}:%line.%method` 같은 **reflective** 패턴 사용 (성능 영향)
- dev에서 TRACE/DEBUG 활성화하려면 파일 수정 후 전체 배포 필요 (환경변수 override 없음)

**권고**
- `<springProfile name="prod">` 분리 + 최소 패턴 + JSON encoder
- 로그 레벨을 환경 변수로 override 가능하게:
  ```xml
  <logger name="kr.co.medipanda" level="${LOG_LEVEL_APP:-INFO}"/>
  ```

**공수**: 30분

---

## 11. 긍정 발견

- ✅ `GlobalExceptionHandler` 중앙 집중 **1개만 존재** — 분산된 handler advice 남용 없음
- ✅ logback-spring.xml **30일 보관 정책** 명시 (`maxHistory`)
- ✅ DataIntegrityViolation 핸들러에서 Partner unique key 충돌만 선별해 422 스타일 응답 (도메인 특화 처리)
- ✅ Kotlin `KotlinLogging`(mu.KLogging) 일관 사용 → `companion object : KLogging()` 패턴 통일
- ✅ `logger.info { "..." }` 람다 블록 사용 — 로그 레벨 필터 시 string interpolation 비용 회피 (성능 고려)
- ✅ `@ResponseStatus` 어노테이션 활용 (`UnauthorizedException`) — Spring 네이티브 통합

---

## 12. 권장 실행 순서

### Week 0 (즉시)
1. **E-1** 로그 PII 마스킹 (2시간) + 기존 30일치 로그 정리
2. **E-2** `printStackTrace()` → `logger.warn(e)` (5분)

### Week 1
3. **E-3** 응답 포맷 통일 (1시간)
4. **E-4** Spring MVC 표준 예외 핸들러 8종 추가 (3시간)
5. **E-5 Step 1** Actuator + MDC RequestIdFilter (반나절)

### Week 2
6. **E-5 Step 2** Prometheus 메트릭 수집 (1일)
7. **E-7** 로그 레벨 조정 (반나절)
8. **E-6** 도메인 예외 계층 정의 (1시간) + 신규 코드부터 적용

### Backlog (장기)
- **E-5 Step 3** OpenTelemetry
- **E-8** JSON 구조화 로깅
- **E-9** 로그 경로 표준화
- **E-10** 프로파일 분기 세분화

---

## 13. 감사 간 교차 영향

| 감사 | 연계 |
|---|---|
| #2 API 계약 | E-3/E-4 응답 포맷 통일 시 프런트 axios 인터셉터와 맞물림 — OpenAPI 스키마에 `ErrorResponse` 공통 반영 필요 |
| #4 RBAC/IDOR | **E-2 `printStackTrace`는 RBAC R-3 fail-open 이슈와 동일 파일** — 한 PR로 처리 |
| #5 Secret/Config | E-1 PII + S-1 평문 yml은 **"로그/파일 둘 다에 평문 존재"** 맥락. 공통 비밀값 관리 정책 수립 필요 |
| #6 E2E | 관측성 부재(E-5)로 Playwright 실패 원인 추적 어려움. MDC 도입 시 Playwright 테스트가 X-Request-Id 기록하면 실패 재현 가속 |
| #7 @Transactional | LazyInit/TransactionRequired 발생 시 현재 핸들러 없음 — E-4 추가 후보에 `LazyInitializationException` 포함 권고 |

---

## 14. 한 줄 결론

> 에러 핸들링은 골격은 있으나 채워지지 않았고, 관측성은 아예 시작되지 않았다. **로그 PII 유출(E-1)과 RoleCheckAspect printStackTrace(E-2) 2건은 운영 배포 전 반드시 닫아야 한다.** 나머지는 "장애가 터지면 후회할 부채"로, 2스프린트 내 분산 처리 가능하다.

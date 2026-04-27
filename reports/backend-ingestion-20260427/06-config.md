# 06-config.md — medipanda-api 설정/인프라 계층 분석

분석 기준: /Users/jmk0629/keymedi/medipanda-api
분석일: 2026-04-27

---

## 1. 런타임 스택

| 항목 | 값 | 출처:라인 |
|------|-----|----------|
| JDK | 17 (Amazon Corretto 17, 런타임) | `application/build.gradle.kts:15`, `Dockerfile:44` |
| Kotlin | 1.9.21 | `gradle/libs.versions.toml:2` |
| Spring Boot | 3.1.4 | `gradle/libs.versions.toml:4` |
| Spring Dependency Management | 1.1.4 | `gradle/libs.versions.toml:5` |
| 빌드 도구 | Gradle Kotlin DSL (멀티모듈: root + application) | `settings.gradle.kts:1-3` |
| 서버 포트 | 18080 | `application/src/main/resources/application.yml:2` |
| 멀티파트 업로드 임시 경로 | `/var/tmp/portal-upload` | `application.yml:23` |
| 멀티파트 최대 크기 | 128 MB | `application.yml:24-25` |

빌드 단계는 `gradle:8.7.0-jdk17` 이미지, 런타임은 `amazoncorretto:17` 이미지 사용.
JVM 옵션: `-Xms1g -Xmx3g -Djava.library.path=/app/native`

---

## 2. 핵심 의존성 (카테고리별)

### Core Web
- `org.springframework.boot:spring-boot-starter-web` — `application/build.gradle.kts:36`
- `org.springframework.boot:spring-boot-starter-webflux` — `application/build.gradle.kts:37` (WebClient 비동기 HTTP 사용)
- `org.springframework.boot:spring-boot-starter-security` — `application/build.gradle.kts:35`
- `org.springframework.boot:spring-boot-starter-cache` — `application/build.gradle.kts:34`
- `org.springframework.boot:spring-boot-starter-data-jpa` — `application/build.gradle.kts:33`

### 영속성
- `org.postgresql:postgresql` (runtimeOnly) — `application/build.gradle.kts:48`
- HikariCP (Spring Boot 기본 내장) — `PostgreSqlConfig.kt:4`
- `com.github.gavlyukovskiy:p6spy-spring-boot-starter:1.9.2` — `application/build.gradle.kts:52` (SQL 로깅, 로컬용)

### 캐시
- `com.github.ben-manes.caffeine:caffeine:3.1.8` — `gradle/libs.versions.toml:19`

### JWT/보안
- `io.jsonwebtoken:jjwt:0.12.5` — `gradle/libs.versions.toml:40`
- `io.jsonwebtoken:jjwt-api/impl/jackson:0.12.5` — `gradle/libs.versions.toml:41-43`
- `org.bouncycastle:bcprov-jdk15on:1.70` — `gradle/libs.versions.toml:44`

### AWS SDK (v2.25.10)
- `software.amazon.awssdk:s3` — `gradle/libs.versions.toml:33`
- `software.amazon.awssdk:ses` — `gradle/libs.versions.toml:32`
- `software.amazon.awssdk:ssm` — `gradle/libs.versions.toml:34`
- `software.amazon.awssdk:sns` — `gradle/libs.versions.toml:35`

### GCP / Firebase
- `com.google.firebase:firebase-admin:9.1.1` — `gradle/libs.versions.toml:46`

### 로깅
- `ch.qos.logback:logback-core/classic:1.4.14` — `gradle/libs.versions.toml:26-27`
- `net.logstash.logback:logstash-logback-encoder:7.4` — `gradle/libs.versions.toml:28`
- `com.kdgregory.logging:logback-aws-appenders:3.2.1` — `gradle/libs.versions.toml:29`
- `com.kdgregory.logging:aws-facade-v2:3.2.1` — `gradle/libs.versions.toml:30`
- `io.github.microutils:kotlin-logging-jvm:3.0.5` — `gradle/libs.versions.toml:22`

### 직렬화/유틸
- `com.fasterxml.jackson.module:jackson-module-kotlin:2.16.0` — `gradle/libs.versions.toml:37`
- `com.fasterxml.jackson.datatype:jackson-datatype-jsr310:2.16.0` — `gradle/libs.versions.toml:38`
- `org.json:json:20240303` — `gradle/libs.versions.toml:39`
- `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.2.0` — `gradle/libs.versions.toml:45`
- `org.apache.poi:poi-ooxml:5.2.4` — `gradle/libs.versions.toml:20`
- `org.apache.commons:commons-csv:1.12.0` — `application/build.gradle.kts:39`
- `org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1` — `application/build.gradle.kts:49`
- `org.jetbrains.kotlinx:kotlinx-coroutines-reactor:1.7.3` — `gradle/libs.versions.toml:24`

### 로컬 라이브러리 (비공개 JAR)
- `../libs/KmcCrypto.jar` — `application/build.gradle.kts:42` (KMC 본인인증 암호화 모듈, JNI 연동)
- `native/libKmcCryptoJNI.so` — `Dockerfile:52`, `Dockerfile.local:46` (네이티브 공유 라이브러리)

### 테스트
- Kotest 5.8.0 (runner, assertions, property, spring extension, datatest) — `gradle/libs.versions.toml:48-51`
- MockK 1.13.4 / SpringMockK 3.1.2 — `gradle/libs.versions.toml:53-54`

---

## 3. application.yml 프로파일 매트릭스

파일 경로: `/Users/jmk0629/keymedi/medipanda-api/application/src/main/resources/application.yml`
단일 파일에 `---` 구분자로 6개 프로파일 세그먼트가 정의됨.

| 항목 | (공통) | local | local-db | dev | prod | local-prod-db | local-dev-db |
|------|--------|-------|----------|-----|------|---------------|--------------|
| env 값 | — | local | local | dev | prod | local | local |
| DB JDBC URL | — | (없음/주석) | `jdbc:postgresql://127.0.0.1:5432/postgres` | `...rds.amazonaws.com/qa2` | `...rds.amazonaws.com/medipanda` | `...rds.amazonaws.com/medipanda` | `...rds.amazonaws.com/qa2` |
| DB username | — | jmk0629 | jmk0629 | medipanda | medipanda | medipanda | medipanda |
| DB password | — | (없음) | `***` | dummy(SSM 대체) | dummy(SSM 대체) | dummy(SSM 대체) | dummy(SSM 대체) |
| ddl-auto | — | — | validate | update | (미설정=none) | (미설정=none) | (미설정=none) |
| show-sql | — | — | false | true | false | false | false |
| p6spy 로깅 | — | true | true | — | — | — | — |
| SSM 시크릿 우회 | — | — | secret.abs.* 키로 로컬 오버라이드 | SSM 호출 | SSM 호출 | SSM 호출 | SSM 호출 |

RDS 엔드포인트: `medipanda.cp6gkgc82mif.ap-northeast-2.rds.amazonaws.com` — `application.yml:250,273,297,321`

**공통 설정 (프로파일 무관)**
- 서버 포트: 18080 — `application.yml:2`
- Jackson 타임존: UTC — `application.yml:42`
- Hibernate JDBC 타임존: UTC — `application.yml:33`
- Hibernate 배치 크기: 1000 — `application.yml:29`
- S3 버킷: `medipanda` — `application.yml:58`
- Swagger API docs: `/api-docs`, `/swagger-ui.html` — `application.yml:51-53`
- Admin sender email: `info@knmedicine.com` — `application.yml:84`
- Admin 페이지 기본 URL: `https://admin.medipanda.co.kr/admin/*` — `application.yml:80-83`

---

## 4. 환경변수 / 시크릿 키 목록

### application.yml 직접 선언 키 (로컬 오버라이드용)

| 키 | 역할 | 비고 |
|----|------|------|
| `secret.db-password` | DB 비밀번호 | local-db 프로파일에 평문 기재 (주의 신호 참조) |
| `secret.jwt-secret-key` | JWT 서명 키 | local-db 프로파일에 더미값 |
| `secret.password-secret-key` | RSA 개인키 (PEM) | local-db에 테스트용 PEM 평문 포함 |
| `secret.gcp-service-account` | Firebase GCP 서비스 계정 JSON | local-db에 더미 JSON 포함 |
| `secret.abs.sms.aligo.key` | Aligo SMS API 키 | SSM 우회용 |
| `secret.abs.sms.aligo.user-id` | Aligo 계정 ID | SSM 우회용 |
| `secret.abs.sms.aligo.sender` | Aligo 발신번호 | SSM 우회용 |
| `secret.abs.kmc.cp-id` | KMC 본인인증 CP ID | SSM 우회용 |
| `secret.abs.kmc.url-code` | KMC URL 코드 | SSM 우회용 |

### AWS SSM Parameter Store 실운영 키 (로컬 우회 없을 때 SSM 조회)

| SSM 파라미터명 | 역할 | 관련 코드:라인 |
|---------------|------|--------------|
| `postgres-{env}-password` | DB 비밀번호 | `SecretKeyService.kt:66` |
| `jwt-secret-key` | JWT 서명 키 | `SecretKeyService.kt:73` |
| `gcp-service-account` | GCP Firebase 서비스 계정 | `SecretKeyService.kt:80` |
| `password-secret-key` | RSA PEM 개인키 | `SecretKeyService.kt:87` |
| `/sms/aligo/key` | Aligo SMS API 키 | `AligoSmsProperties.kt:10` |
| `/sms/aligo/user-id` | Aligo 계정 ID | `AligoSmsProperties.kt:11` |
| `/sms/aligo/sender` | Aligo 발신번호 | `AligoSmsProperties.kt:12` |
| `/kmc/cp-id` | KMC CP ID (암호화) | `KmcSecrets.kt:15` |
| `/kmc/url-code` | KMC URL 코드 (암호화) | `KmcSecrets.kt:16` |

### GitHub Actions Secrets (CI/CD)

| 시크릿명 | 역할 | 출처:라인 |
|---------|------|----------|
| `AWS_ACCESS_KEY_ID` | AWS 자격증명 | `workflow.yml:37` |
| `AWS_SECRET_ACCESS_KEY` | AWS 자격증명 | `workflow.yml:38` |
| `AWS_REGION` | AWS 리전 | `workflow.yml:39` |
| `EC2_INSTANCE_ID` | 운영 EC2 인스턴스 ID | `workflow.yml:71` |
| `DEV_EC2_INSTANCE_ID` | 개발 EC2 인스턴스 ID | `workflow.yml:71` |

---

## 5. 외부 시스템 의존성 맵

### 5-1. PostgreSQL (주 데이터베이스)
- 드라이버: `org.postgresql.Driver`
- 커넥션 풀: HikariCP (Spring Boot 기본, 별도 풀 설정 미존재)
- JPA 방언: `org.hibernate.dialect.PostgreSQLDialect`
- 네이밍 전략: `CamelCaseToUnderscoresNamingStrategy`
- dev/prod RDS 엔드포인트: `medipanda.cp6gkgc82mif.ap-northeast-2.rds.amazonaws.com` (ap-northeast-2)
- dev DB: `qa2`, prod DB: `medipanda` — `application.yml:250,273`
- 비밀번호 우선순위: `secret.db-password` 환경변수 → SSM `postgres-{env}-password` — `SecretKeyService.kt:64-68`
- 설정 클래스: `PostgreSqlConfig.kt`

### 5-2. AWS S3 (파일 스토리지)
- 버킷: `medipanda` — `application.yml:58`
- 리전: `ap-northeast-2` — `AwsConfig.kt:31`
- 용도: 회원 파일, 배너, 게시글 첨부, 파트너 계약서, 지출 보고서, EDI 파일 — `S3FileUploadListener.kt:40-74`
- 업로드 방식: 트랜잭션 커밋 후 코루틴 비동기 (`@TransactionalEventListener(AFTER_COMMIT)`)
- 설정 클래스: `S3Properties.kt`, `AwsConfig.kt`

### 5-3. AWS SES (이메일 발송)
- 리전: `ap-northeast-2` — `AwsConfig.kt:43-46`
- 발신자: `info@knmedicine.com` — `application.yml:84`
- 용도: 어드민 알림 이메일 — `EmailSender.kt`
- 설정 클래스: `AwsConfig.kt`

### 5-4. AWS SSM Parameter Store (시크릿 관리)
- 리전: `ap-northeast-2` — `AwsConfig.kt:36-40`
- 역할: DB 비밀번호, JWT 키, GCP 서비스 계정, KMC 설정, Aligo SMS 키를 SecureString으로 보관
- 인메모리 캐싱: `ConcurrentHashMap` (앱 재시작 전까지 유효) — `SecretKeyService.kt:22`
- 로컬 우회: `secret.abs.{path}` 형식 프로퍼티로 SSM 호출 생략 — `SecretKeyService.kt:29-33`

### 5-5. AWS SNS (사용 선언, 실제 사용처 미확인)
- `SnsClient` Bean 등록됨 — `AwsConfig.kt:29-33`
- 리전: `ap-northeast-2`
- 주석에 "SMS 권역은 글로벌; 보통 Tokyo/N. Virginia 많이 사용"이라고 명시 — `AwsConfig.kt:31`

### 5-6. GCP Firebase (FCM 푸시 알림)
- 서비스 계정 JSON: SSM `gcp-service-account` 또는 `secret.gcp-service-account` 오버라이드
- SDK: `firebase-admin:9.1.1` — `gradle/libs.versions.toml:46`
- 발송 방식: `FirebaseMessaging.sendAsync()` (Dispatchers.IO에서 코루틴으로 실행)
- 토큰 무효시 자동 soft-delete 처리 — `PushSender.kt:117-130`
- 설정 클래스: `FirebaseConfig.kt`

### 5-7. KIMS (의약품 정보 API)
- 기본 URL: `https://api.kims.co.kr` — `application.yml:64`
- 인증: Basic Auth (Base64 인코딩 토큰, 설정키 `external.apis.product.token`) — `ProductApiAdapter.kt:21-25`
- 엔드포인트: `GET /api/drug/info?drugcode=&drugType=` — `ProductApiAdapter.kt:28-38`
- 호출 방식: WebFlux `WebClient` + 코루틴 suspend 함수
- 설정: `ExternalApiProperties.product.*`

### 5-8. HIRA (건강보험심사평가원 병원 API)
- 기본 URL: `https://api.hira.or.kr` — `application.yml:66`
- WebClient Bean: `hospitalWebClient` — `WebClientFactory.kt:23-28`
- 설정: `ExternalApiProperties.hospital.*`

### 5-9. Aligo SMS (문자 발송)
- 기본 URL: `https://apis.aligo.in` — `application.yml:68`
- 엔드포인트: `POST /send/` — `SmsSender.kt:105`
- 인증: form 파라미터 `key`, `user_id` (SSM에서 로딩)
- 호출 방식: WebFlux `WebClient` 동기 `.block()`, 타임아웃 10초 — `SmsSender.kt:49`
- 테스트 모드: `sms.aligo.test-mode-yn=N` (실 발송) — `application.yml:72`
- 설정 클래스: `AligoSmsProperties.kt`

### 5-10. KMC (본인인증)
- 본인인증 요청 URL: `https://www.kmcert.com/kmcis/web/kmcisReq.jsp` — `application.yml:75`
- 토큰 검증 URL: `https://www.kmcert.com/kmcis/api/kmcisToken_api.jsp` — `application.yml:76`
- JNI 라이브러리: `libs/KmcCrypto.jar` + `native/libKmcCryptoJNI.so` — `Dockerfile:52`, `build.gradle.kts:42`
- CP ID / URL 코드: SSM `secret.abs.kmc.cp-id`, `secret.abs.kmc.url-code` (암호화 복호화)
- 세션 상태 DB 저장: `KmcAuthSession` 엔티티 — `KmcAuthSessionRepository.kt`
- 활성화 프로파일: `local`, `dev`, `prod`, `local-kmc-test` — `KmcAuthService.kt:30`

### 5-11. 프로모션 암호화
- 키: `promotion.encryption.secret-key` (application.yml에 평문 하드코딩) — `application.yml:11`
- 토큰 만료: 5분 — `application.yml:12`
- 설정 클래스: `PromotionConfig.kt`

---

## 6. 스케줄러 / 배치 / 큐

### 6-1. @Scheduled 목록

| Cron | 타임존 | 메서드 | 역할 | 파일:라인 |
|------|--------|--------|------|----------|
| `0 0 3 * * *` | Asia/Seoul | `HospitalSidoCountScheduler.refreshDaily()` | 병원 시도별 카운트 캐시 갱신 | `HospitalSidoCountScheduler.kt:30` |
| `0 0 0 * * *` | 기본(서버) | `BoardPostViewCleanupScheduler.cleanup()` | 14일 초과 게시글 조회 이력 삭제 | `BoardPostViewCleanupScheduler.kt:16` |
| `0 0 10 7 * *` | Asia/Seoul | `EdiMonthlyReminderScheduler.sendMonthlyEdiMissingReminders()` | 매월 7일 10시, 전월 EDI 미제출 파트너에게 FCM 푸시 | `EdiMonthlyReminderScheduler.kt:25` |

앱 기동 시: `HospitalSidoCountScheduler.warmup()` (`@EventListener(ApplicationReadyEvent)`) — `HospitalSidoCountScheduler.kt:19`

### 6-2. @EnableScheduling / @EnableAsync

`Application.kt:8-9`에 두 어노테이션 모두 선언.

### 6-3. @Async

| 메서드 | 역할 | 파일:라인 |
|--------|------|----------|
| `PrescriptionMonthlyStatsService.refreshByUserId()` | 처방 저장 후 월별 통계 캐시 비동기 재계산 | `PrescriptionMonthlyStatsService.kt:93` |
| `ProductService` (메서드명 미확인) | 비동기 처리 | `ProductService.kt:710` |

### 6-4. 인메모리 큐 (LinkedBlockingQueue)

브로커 없는 JVM 내부 큐로 비동기 처리.

| 큐 Bean 명 | 타입 | 용량 | 역할 | 파일 |
|-----------|------|------|------|------|
| `pushEventQueue` | `BlockingQueue<NotificationPushEvent>` | 무제한 | FCM 푸시 이벤트 | `NotificationQueueConfig.kt:15` |
| `emailEventQueue` | `BlockingQueue<NotificationEmailEvent>` | 무제한 | SES 이메일 이벤트 | `NotificationQueueConfig.kt:19` |
| `postViewQueue` | `BlockingQueue<RecordPostViewCommand>` | 50,000 | 게시글 조회수 기록 | `PostViewQueueConfig.kt:11` |
| `likeCommandQueue` | `BlockingQueue<LikeCommand>` | 50,000 | 좋아요 명령 처리 | `LikeQueueConfig.kt:11` |

각 큐는 전용 Consumer(`PostViewConsumer`, `LikeCommandConsumer`, `PushEventConsumer`, `EmailEventConsumer`)가 `@PostConstruct`에서 코루틴으로 시작하는 루프로 소비.

### 6-5. 이벤트 리스너 (@TransactionalEventListener AFTER_COMMIT)

| 리스너 | 이벤트 | 역할 | 파일 |
|--------|--------|------|------|
| `PushEventAfterCommitListener` | `NotificationPushEvent` | 트랜잭션 커밋 후 FCM 수신자 조회 → pushEventQueue 투입 | `PushEventAfterCommitListener.kt` |
| `S3FileUploadListener` | `S3FileUploadEvent` | 트랜잭션 커밋 후 S3 비동기 업로드 | `S3FileUploadListener.kt` |
| `BoardStatsAfterCommitListener` | BoardStatsEvent | 게시판 통계 갱신 | `BoardStatsAfterCommitListener.kt` |

### 6-6. 코루틴 설정

`CoroutineConfig.kt`에 `SupervisorJob + CoroutineExceptionHandler` 조합의 `defaultScope` Bean 등록. 하위 코루틴 실패가 부모를 취소하지 않도록 격리. — `CoroutineConfig.kt:19-23`

---

## 7. 캐시 / 세션 저장소

Redis 의존성 없음. 전부 JVM 인메모리 캐시로 구성됨.

### 7-1. Caffeine (Spring Cache 통합)

`MemberSecurityCacheConfig.kt`에서 `@EnableCaching` 활성화.

| 캐시 명 | TTL | 최대 크기 | 용도 | 파일:라인 |
|--------|-----|----------|------|----------|
| `ACTIVE_AUTH_MEMBER_CACHE` | 10분 (기본) | 10,000 | 인증된 회원 정보 캐싱 | `MemberSecurityCacheConfig.kt:17` |
| `MEMBER_ROLE_CACHE` | 10분 (기본) | 10,000 | 회원 역할 캐싱 | `MemberSecurityCacheConfig.kt:17` |

TTL과 maxSize는 `app.cache.member-security.ttl`, `app.cache.member-security.max-size`로 조정 가능 — `application.yml:16-18`

### 7-2. Caffeine (직접 생성, Spring Cache 외부)

`PrescriptionMonthlyStatsService.kt`에서 Spring `@Cacheable`을 사용하지 않고 Caffeine Cache 인스턴스를 직접 생성하여 사용.

| 캐시 필드 | TTL | 최대 크기 | 용도 | 파일:라인 |
|----------|-----|----------|------|----------|
| `monthlyCountCache` | 1일 | 1,000 | (userId, yearMonth)별 처방 건수 | `PrescriptionMonthlyStatsService.kt:30-33` |
| `monthlyFeeCache` | 1일 | 1,000 | (userId, yearMonth)별 처방 금액 | `PrescriptionMonthlyStatsService.kt:35-38` |

`@Async refreshByUserId()` 호출로 처방 변경 시 캐시 갱신. 이벤트 누락 시 최대 24시간 stale 가능.

### 7-3. AtomicReference 기반 인메모리 캐시

`HospitalSidoCountCacheService.kt:18`: `AtomicReference<Map<String, Int>>`로 병원 시도별 카운트 전량 메모리 보관. 매일 03:00(KST)에 전체 재로딩. DB에서 전체 병원 레코드를 JVM 메모리로 로드하는 방식이므로 병원 데이터 증가 시 메모리 압박 가능.

### 7-4. ConcurrentHashMap 기반 캐시

`SecretKeyService.kt:22`: `ConcurrentHashMap<String, String>`으로 SSM 파라미터값 인메모리 캐싱. 앱 재시작 전까지 만료 없음.

### 7-5. KMC 인증 세션

Redis나 Spring Session 없이 PostgreSQL `kmc_auth_session` 테이블에 세션 상태 저장. — `KmcAuthSession.kt`, `KmcAuthSessionRepository.kt`

---

## 8. 로깅 / 모니터링

### 8-1. Logback 설정

파일: `/Users/jmk0629/keymedi/medipanda-api/application/src/main/resources/logback-spring.xml`

| 프로파일 | 루트 레벨 | 애플리케이션 패키지(`kr.co.medipanda`) 레벨 | Appender |
|---------|---------|---------------------------------------|----------|
| local | INFO | INFO | CONSOLE + FILE |
| !local (dev/prod) | INFO | INFO | CONSOLE + FILE |

공통 파일 Appender:
- 경로: `/tmp/log/medipanda/medipanda-api.log` — `logback-spring.xml:14,50`
- 롤링 정책: 일별 (`medipanda-api.%d{yyyy-MM-dd}.log`), 보관 30일 — `logback-spring.xml:17-19`

프레임워크 로그 레벨:
- `org.springframework`: WARN
- `software.amazon.awssdk`: WARN
- `org.apache`: WARN
- `org.hibernate.SQL`: WARN
- AWS SDK 프로파일 로더: ERROR

### 8-2. p6spy SQL 로깅 (로컬)

`application.yml:209-215` (local 프로파일):
- `decorator.datasource.p6spy.enable-logging: true`
- 포맷: `[conn=%(connectionId)] [%(executionTime)ms] %(sqlSingleLine)`
- Hibernate SQL 로그는 OFF, p6spy를 DEBUG 레벨로 단독 사용

### 8-3. AWS CloudWatch Appender (의존성 등록, 미설정)

`gradle/libs.versions.toml:29-30`에 `logback-aws-appenders:3.2.1`과 `aws-facade-v2:3.2.1` 의존성이 `app-deps` 번들에 포함되어 있으나, `logback-spring.xml`에 CloudWatch Appender 설정 없음. 현재 미사용 상태.

### 8-4. Sentry

Sentry 의존성 없음. 에러 추적 도구 미도입.

### 8-5. Actuator / 모니터링 엔드포인트

`spring-boot-starter-actuator` 의존성 없음. 운영 헬스체크 엔드포인트 미도입.

---

## 9. 배포 산출물

### 9-1. Dockerfile (운영)

파일: `/Users/jmk0629/keymedi/medipanda-api/Dockerfile`

- 빌드 이미지: `gradle:8.7.0-jdk17`
- 런타임 이미지: `amazoncorretto:17`
- 빌드 JVM: `-Xms1g -Xmx3g -XX:MaxMetaspaceSize=1536m` — `Dockerfile:10`
- 런타임 JVM: `-Xms1g -Xmx3g -Djava.library.path=/app/native` — `Dockerfile:60`
- 기본 프로파일: `prod` (환경변수 `SPRING_PROFILES_ACTIVE`로 오버라이드 가능) — `Dockerfile:55`
- 노출 포트: 18080 — `Dockerfile:57`
- Gradle 최적화: daemon 비활성화, 병렬 빌드 비활성화, 워커 1개 제한

### 9-2. Dockerfile.local

파일: `/Users/jmk0629/keymedi/medipanda-api/Dockerfile.local`

- 기본 프로파일: `local-db` — `Dockerfile.local:49`
- 타임존: `Asia/Seoul` — `Dockerfile.local:50`
- JVM 옵션 미설정 (런타임에 `-jar` 직접 실행, 메모리 제한 없음)

### 9-3. CI/CD

파일: `/Users/jmk0629/keymedi/medipanda-api/.github/workflows/workflow.yml`

- 트리거: `workflow_dispatch` (수동 실행만) — `workflow.yml:3`
- 브랜치별 환경:
  - `dev` 브랜치 → Spring Profile `dev`, 개발 서버
  - 기타(main 등) → Spring Profile `prod`, 운영 서버
- 단계: checkout → AWS 자격증명 설정 → ECR 로그인 → 이미지 빌드/태깅/푸시 → SSM Run Command로 EC2에 컨테이너 배포
- ECR 리포지토리: `medipanda/medipanda-api`
- 이미지 태그 패턴: `dev-{timestamp}` 또는 `prod-{timestamp}`
- 배포 방식: SSM Agent로 EC2에 원격 셸 명령 실행 (docker pull → rm → run)
- 운영 URL: `https://prod.api.medipanda.co.kr`, 개발 URL: `https://dev.api.medipanda.co.kr` — `workflow.yml:131-133`

---

## 10. @ConfigurationProperties 카탈로그

| 클래스 | prefix | 필드 | 파일 |
|-------|--------|------|------|
| `S3Properties` | `aws.s3` | `bucket` | `config/aws/S3Properties.kt` |
| `ApiAuthenticationProperties` | `api.basic.authentication` | `username`, `password` | `config/app/ApiAuthenticationProperties.kt` |
| `AppConfig` | `app` | `encryptPassword`, `onlyInfoEmail` | `config/app/AppConfig.kt` |
| `PromotionConfig` | `promotion.encryption` | `secretKey`, `tokenExpiryMinutes` | `config/app/PromotionConfig.kt` |
| `ExternalApiProperties` | `external.apis` | `product.baseUrl/token`, `hospital.baseUrl`, `aligo.baseUrl` | `config/app/ExternalApiProperties.kt` |
| `KmcProperties` | `kmc` | `startUrl`, `verifyUrl` | `config/app/KmcProperties.kt` |
| `AdminPageProperties` | `admin` | `memberPageUrl`, `salesProductPageUrl`, `inquiryPageUrl`, `settlementPageUrl`, `partnerContractPageUrl`, `senderEmail` | `config/app/AdminPageProperties.kt` |
| `HikariConfig` (DB) | `postgresql.datasource` | `jdbcUrl`, `username`, `password`, `driverClassName` | `config/db/PostgreSqlConfig.kt:30` |

---

## 11. 주의 신호

- application.yml `local-db` 프로파일에 실제 사용 가능한 DB 비밀번호(`***`) 평문 기재 (`application.yml:126`). 환경변수 또는 .gitignore 파일로 이관 권장.
- application.yml `local-db` 프로파일에 테스트용 RSA 개인키(PEM) 전체와 GCP 서비스 계정 JSON 더미값이 평문 포함 (`application.yml:133-162`). 더미값이라도 실제 키 형식과 동일하여 git 이력 노출 시 오해 가능.
- `promotion.encryption.secret-key` 공통 섹션에 평문 하드코딩 (`application.yml:11`). 프로파일 구분 없이 모든 환경에 적용됨. SSM 이관 권장.
- `api.basic.authentication.password` 공통 섹션 평문 (`application.yml:48`).
- `dev` 프로파일에서 `ddl-auto: update` 설정 (`application.yml:240`). 운영 유사 DB(`qa2`)에 대해 자동 스키마 변경 허용 상태. `validate`로 전환 권장.
- HikariCP 커넥션 풀 설정(최대 커넥션 수, 타임아웃 등)이 미설정. 기본값(maximumPoolSize=10)으로 운영 중. 트래픽에 따라 조정 필요.
- CloudWatch Appender 의존성은 포함되어 있으나 실제 설정 없음 (`logback-spring.xml` 미구성). 운영 환경 중앙 로그 집계 부재.
- Actuator 미도입으로 `/health`, `/metrics` 엔드포인트 없음. 로드밸런서 헬스체크나 운영 모니터링을 별도 구성해야 함.
- `HospitalSidoCountCacheService`가 앱 기동 시 및 매일 03:00에 병원 전체 레코드를 JVM 메모리에 로드 (`HospitalSidoCountCacheService.kt:27`). 데이터 증가 시 Heap 영향 가능.
- `postViewQueue`, `likeCommandQueue` 용량이 50,000건으로 고정 (`PostViewQueueConfig.kt:11`, `LikeQueueConfig.kt:11`). 큐 초과 시 `LinkedBlockingQueue`는 블로킹 방식이므로 요청 쓰레드 지연 발생 가능.
- CI/CD 워크플로우가 `workflow_dispatch` (수동) 전용. 자동화 배포 파이프라인(PR merge 등) 미구성.
- `workflow.yml:31` 주석: `# TODO: 애플 심사 완료 후 prod-db로 변경` — 별도 `prod-db` 프로파일 전환이 미완료 상태일 수 있음 확인 필요.

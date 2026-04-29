# /dep-health (gradle) 리포트 — 2026-04-29 (medipanda-api)

> 대상: `/Users/jmk0629/keymedi/medipanda-api` (Gradle Kotlin DSL + Version Catalog)
> 입력: `gradle/libs.versions.toml` + `*/build.gradle.kts` 정적 파싱
> 휴리스틱: 본 스크립트 내장 EOL/CVE 표 (보수적, ./gradlew 미호출)
> 생성: by scripts/gradle-dep-health.sh — 결정적 bash, LLM 미호출

## 0. 한 장 요약

- Version Catalog 항목: 6 version + 22 artifact
- Inline 의존성 (build.gradle.kts 직접 명시): 3
- 위험 등급: CRIT 0 / HIGH 1 / MED 2 / LOW 1

## 1. CRIT — 즉시 조치

_없음._

## 2. HIGH — 다음 스프린트

- org.bouncycastle:bcprov-jdk15on:1.70 — bcprov-jdk15on deprecated — bcprov-jdk18on (Java 15+) 마이그레이션 필수 (현재 1.70)

## 3. MED — 백로그

- kotlin=1.9.21 — Kotlin 1.9 — 2.0+ 점진 검토 (마이너 영향 미미) (현재 1.9.21)
- spring-boot-gradle-plugin=3.1.4 — Spring Boot 3.1 OSS 지원 종료(2024-05) — 3.3 LTS 권장 (현재 3.1.4)

## 4. 보안 취약점 상세

v1 은 `./gradlew` 미호출 (정적 파싱). transitive CVE 추적 불가 — 휴리스틱 표에 명시된 직접 의존성만.
라이브 CVE 는 별도 `./gradlew dependencyCheckAnalyze` (OWASP Dependency-Check 플러그인) 또는 deps.dev API 권장.

## 5. 인벤토리 (참고)

### 5.1 Version Catalog `[versions]`

| key | value |
|-----|-------|
| kotlin | 1.9.21 |
| kotlinx-coroutines | 1.7.3 |
| spring-boot-gradle-plugin | 3.1.4 |
| spring-dependency | 1.1.4 |
| aws-sdk | 2.25.10 |
| kotest | 5.8.0 |

### 5.2 Version Catalog `[libraries]` (explicit version)

| alias | module | version |
|-------|--------|---------|
| de-thetaphi-forbiddenapis | de.thetaphi:forbiddenapis | 3.8 |
| caffeine | com.github.ben-manes.caffeine:caffeine | 3.1.8 |
| poi | org.apache.poi:poi-ooxml | 5.2.4 |
| kotlin-logging | io.github.microutils:kotlin-logging-jvm | 3.0.5 |
| logback-core | ch.qos.logback:logback-core | 1.4.14 |
| logback-classic | ch.qos.logback:logback-classic | 1.4.14 |
| logback | net.logstash.logback:logstash-logback-encoder | 7.4 |
| cloud-watch-appender | com.kdgregory.logging:logback-aws-appenders | 3.2.1 |
| facade | com.kdgregory.logging:aws-facade-v2 | 3.2.1 |
| jackson-kotlin | com.fasterxml.jackson.module:jackson-module-kotlin | 2.16.0 |
| jackson-jsr310 | com.fasterxml.jackson.datatype:jackson-datatype-jsr310 | 2.16.0 |
| json | org.json:json | 20240303 |
| jjwt | io.jsonwebtoken:jjwt | 0.12.5 |
| jjwt-api | io.jsonwebtoken:jjwt-api | 0.12.5 |
| jjwt-impl | io.jsonwebtoken:jjwt-impl | 0.12.5 |
| jjwt-jackson | io.jsonwebtoken:jjwt-jackson | 0.12.5 |
| bouncy-castle | org.bouncycastle:bcprov-jdk15on | 1.70 |
| swagger-ui | org.springdoc:springdoc-openapi-starter-webmvc-ui | 2.2.0 |
| firebase-admin | com.google.firebase:firebase-admin | 9.1.1 |
| kotest-extensions-spring | io.kotest.extensions:kotest-extensions-spring | 1.1.2 |
| mockk | io.mockk:mockk | 1.13.4 |
| springmockk | com.ninja-squad:springmockk | 3.1.2 |

### 5.3 Inline `build.gradle.kts` 의존성

| module | version | file |
|--------|---------|------|
| org.apache.commons:commons-csv | 1.12.0 | `application/build.gradle.kts` |
| org.jetbrains.kotlinx:kotlinx-coroutines-core | 1.8.1 | `application/build.gradle.kts` |
| com.github.gavlyukovskiy:p6spy-spring-boot-starter | 1.9.2 | `application/build.gradle.kts` |

## 6. 추천 후속

- CRIT/HIGH 항목은 별도 PR 단위 마이그레이션 (호환성 회귀 위험)
- 라이브 CVE: `./gradlew dependencyCheckAnalyze` 또는 GitHub Dependabot 활성화
- Spring Boot 메이저: 분기말 `/regression-diff dep-health` 로 격차 추적
- 본 정적 파싱은 transitive 의존성 미점검 — `./gradlew dependencies --configuration runtimeClasspath` 추가 검토 권장


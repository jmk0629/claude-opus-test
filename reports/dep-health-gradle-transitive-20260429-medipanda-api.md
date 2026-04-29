# /dep-health (gradle transitive) 리포트 — 2026-04-29 (medipanda-api)

> 대상: `/Users/jmk0629/keymedi/medipanda-api` (Gradle Version Catalog 기반)
> 입력: `gradle/libs.versions.toml` [libraries] 의 explicit version → deps.dev API 로 transitive + advisory 조회
> 외부: api.deps.dev (Google Open Source Insights). 캐시: `reports/cache/deps.dev/`
> 생성: by scripts/gradle-deps-transitive.sh — 결정적 (캐시 hit 시 동일 출력)

## 0. 한 장 요약

- 직접 의존성: 38건 (Version Catalog [libraries] explicit version)
- 고유 transitive 노드: 397건 (직접 + 간접 합산, group:artifact:version dedupe)
- Advisory: CRIT 2 / HIGH 39 / MED 48 / LOW 36

**즉시 조치 필요 (CRIT):**
- `org.springframework:spring-beans:5.3.17` (via `com.ninja-squad:springmockk:3.1.2`) — CVE-2022-22965 (CVSS 9.8)
- `io.netty:netty-codec-http:4.1.42.Final` (via `com.kdgregory.logging:aws-facade-v2:3.2.1`) — CVE-2019-20444 (CVSS 9.1)

## 1. CRIT (CVSS ≥ 9.0)

| CVSS | CVE | 모듈 | via | 요약 |
|------|-----|------|-----|------|
| 9.8 | CVE-2022-22965 | `org.springframework:spring-beans:5.3.17` | `com.ninja-squad:springmockk:3.1.2` | Remote Code Execution in Spring Framework |
| 9.1 | CVE-2019-20444 | `io.netty:netty-codec-http:4.1.42.Final` | `com.kdgregory.logging:aws-facade-v2:3.2.1` | HTTP Request Smuggling in Netty |

## 2. HIGH (7.0 ≤ CVSS < 9.0)

| CVSS | CVE | 모듈 | via | 요약 |
|------|-----|------|-----|------|
| 8.3 | CVE-2022-1471 | `org.yaml:snakeyaml:1.33` | `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.2.0` | SnakeYaml Constructor Deserialization Remote Code Execution |
| 8.1 | CVE-2024-22262 | `org.springframework:spring-web:6.0.11` | `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.2.0` | Spring Framework URL Parsing with Host Validation |
| 7.5 | CVE-2024-7254 | `com.google.protobuf:protobuf-java:3.21.8` | `com.google.firebase:firebase-admin:9.1.1` | protobuf-java has potential Denial of Service issue |
| 7.3 | CVE-2025-22235 | `org.springframework.boot:spring-boot:2.6.5` | `com.ninja-squad:springmockk:3.1.2` | Spring Boot EndpointRequest.to() creates wrong matcher if actuator endpoint is not exposed |
| 7.1 | CVE-2023-6378 | `ch.qos.logback:logback-classic:1.2.0` | `com.kdgregory.logging:logback-aws-appenders:3.2.1` | logback serialization vulnerability |

## 3. MED (4.0 ≤ CVSS < 7.0)

| CVSS | CVE | 모듈 | via | 요약 |
|------|-----|------|-----|------|
| 6.6 | CVE-2021-42550 | `ch.qos.logback:logback-core:1.2.0` | `com.kdgregory.logging:logback-aws-appenders:3.2.1` | Deserialization of Untrusted Data in logback |
| 6.5 | CVE-2025-67735 | `io.netty:netty-codec-http:4.1.84.Final` | `com.google.firebase:firebase-admin:9.1.1` | Netty has a CRLF Injection vulnerability in io.netty.handler.codec.http.HttpRequestEncoder |
| 6.2 | CVE-2021-21290 | `io.netty:netty-codec-http:4.1.42.Final` | `com.kdgregory.logging:aws-facade-v2:3.2.1` | Local Information Disclosure Vulnerability in Netty on Unix-Like systems |
| 5.9 | CVE-2021-21409 | `io.netty:netty-codec-http2:4.1.42.Final` | `com.kdgregory.logging:aws-facade-v2:3.2.1` | Possible request smuggling in HTTP/2 due missing validation of content-length |
| 5.5 | CVE-2023-2976 | `com.google.guava:guava:31.1-jre` | `com.google.firebase:firebase-admin:9.1.1` | Guava vulnerable to insecure use of temporary directory |
| 5.3 | CVE-2024-29025 | `io.netty:netty-codec-http:4.1.84.Final` | `com.google.firebase:firebase-admin:9.1.1` | Netty's HttpPostRequestDecoder can OOM |
| 4.3 | CVE-2024-38808 | `org.springframework:spring-expression:5.3.17` | `com.ninja-squad:springmockk:3.1.2` | Spring Framework vulnerable to Denial of Service |
| 4 | CVE-2025-49128 | `com.fasterxml.jackson.core:jackson-core:2.10.0` | `com.kdgregory.logging:aws-facade-v2:3.2.1` | Jackson-core Vulnerable to Memory Disclosure via Source Snippet in JsonLocation |

## 4. LOW (CVSS < 4.0)

| CVSS | CVE | 모듈 | via | 요약 |
|------|-----|------|-----|------|
| 3.3 | CVE-2020-8908 | `com.google.guava:guava:31.1-jre` | `com.google.firebase:firebase-admin:9.1.1` | Information Disclosure in Guava |
| 3.1 | CVE-2025-22233 | `org.springframework:spring-context:5.3.17` | `com.ninja-squad:springmockk:3.1.2` | Spring Framework DataBinder Case Sensitive Match Exception |
| 2.6 | CVE-2026-22735 | `org.springframework:spring-webmvc:6.0.11` | `org.springdoc:springdoc-openapi-starter-webmvc-ui:2.2.0` | Spring MVC and WebFlux has Server Sent Event stream corruption |
| 0 | CVE-2025-11226 | `ch.qos.logback:logback-core:1.4.14` | `ch.qos.logback:logback-classic:1.4.14` | QOS.CH logback-core is vulnerable to Arbitrary Code Execution through file processing |

## 5. 직접 의존성 인벤토리 (조회 대상)

| 모듈 | 버전 |
|------|------|
| `ch.qos.logback:logback-classic` | 1.4.14 |
| `ch.qos.logback:logback-core` | 1.4.14 |
| `com.fasterxml.jackson.datatype:jackson-datatype-jsr310` | 2.16.0 |
| `com.fasterxml.jackson.module:jackson-module-kotlin` | 2.16.0 |
| `com.github.ben-manes.caffeine:caffeine` | 3.1.8 |
| `com.google.firebase:firebase-admin` | 9.1.1 |
| `com.kdgregory.logging:aws-facade-v2` | 3.2.1 |
| `com.kdgregory.logging:logback-aws-appenders` | 3.2.1 |
| `com.ninja-squad:springmockk` | 3.1.2 |
| `de.thetaphi:forbiddenapis` | 3.8 |
| `io.github.microutils:kotlin-logging-jvm` | 3.0.5 |
| `io.jsonwebtoken:jjwt-api` | 0.12.5 |
| `io.jsonwebtoken:jjwt-impl` | 0.12.5 |
| `io.jsonwebtoken:jjwt-jackson` | 0.12.5 |
| `io.jsonwebtoken:jjwt` | 0.12.5 |
| `io.kotest.extensions:kotest-extensions-spring` | 1.1.2 |
| `io.kotest:kotest-assertions-core-jvm` | 5.8.0 |
| `io.kotest:kotest-framework-datatest` | 5.8.0 |
| `io.kotest:kotest-property-jvm` | 5.8.0 |
| `io.kotest:kotest-runner-junit5-jvm` | 5.8.0 |
| `io.mockk:mockk` | 1.13.4 |
| `io.spring.gradle:dependency-management-plugin` | 1.1.4 |
| `net.logstash.logback:logstash-logback-encoder` | 7.4 |
| `org.apache.poi:poi-ooxml` | 5.2.4 |
| `org.bouncycastle:bcprov-jdk15on` | 1.70 |
| `org.jetbrains.kotlin:kotlin-allopen` | 1.9.21 |
| `org.jetbrains.kotlin:kotlin-gradle-plugin` | 1.9.21 |
| `org.jetbrains.kotlin:kotlin-noarg` | 1.9.21 |
| `org.jetbrains.kotlin:kotlin-serialization` | 1.9.21 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-reactor` | 1.7.3 |
| `org.jetbrains.kotlinx:kotlinx-coroutines-test` | 1.7.3 |
| `org.json:json` | 20240303 |
| `org.springdoc:springdoc-openapi-starter-webmvc-ui` | 2.2.0 |
| `org.springframework.boot:spring-boot-gradle-plugin` | 3.1.4 |
| `software.amazon.awssdk:s3` | 2.25.10 |
| `software.amazon.awssdk:ses` | 2.25.10 |
| `software.amazon.awssdk:sns` | 2.25.10 |
| `software.amazon.awssdk:ssm` | 2.25.10 |

## 6. 메모

- deps.dev 는 **공식 Maven Central published 버전** 만 인덱싱. inline jar (예: `libs/KmcCrypto.jar`) / 자체 빌드 / SNAPSHOT 은 누락.
- transitive 트리는 deps.dev 가 메이븐 메타데이터에서 해석한 **선언 의존성** (런타임 충돌 해소 결과 ≠ Gradle 최종 classpath).
- 정확도가 중요하면 `./gradlew :application:dependencies --configuration runtimeClasspath` 결과 + OWASP Dependency-Check 권장.
- 캐시 갱신: `rm -rf reports/cache/deps.dev` 후 재실행.

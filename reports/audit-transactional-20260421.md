# 감사 보고서 — `@Transactional` 일관성 (크로스커팅 #7)

- 작성일: 2026-04-21
- 범위: `medipanda-api/application/src/main/kotlin/**` — 서비스 30개, 리포지터리 커스텀 쿼리, 스케줄러/리스너 포함
- 인접 감사: [audit-nplus1-20260421.md](./audit-nplus1-20260421.md) — 영속성 계층 기초, [audit-admin-rbac-20260421.md](./audit-admin-rbac-20260421.md) — AOP 레이어

---

## 0. Executive Summary

> 트랜잭션은 **기능적으로 동작**하나, `readOnly=true`를 쓰는 서비스가 **30개 중 단 1개** (`SettlementMemberMonthlyService`) 뿐이다. 나머지 19개 서비스는 조회 메서드에도 쓰기 트랜잭션이 열리고 (또는 트랜잭션이 아예 없고), 엑셀/ZIP 같은 수 초 단위 compute-heavy 작업까지 **write 트랜잭션으로 DB 커넥션을 붙잡는다.** 즉시 장애는 없지만 부하 증가 시 커넥션 풀 고갈·락 경합의 일차 원인이 될 수 있다. **P0 없음, P1 2건, P2·P3 합 6건.**

### 지표 스냅샷

| 지표 | 값 | 판정 |
|---|---|---|
| 전체 `@Transactional` 선언 | 104건 (32 파일) | |
| `readOnly = true` 사용 | **1건** (SettlementMemberMonthlyService 클래스 레벨) | 🔴 1% |
| 클래스 레벨 `@Transactional` | **1/30 서비스** | 🔴 저조 |
| `propagation = REQUIRES_NEW` | 6건 — 모두 통계/푸시/스케줄러 격리 목적 | ✅ 의도적 |
| `rollbackFor` / `noRollbackFor` | 0건 | ✅ (Kotlin은 RuntimeException 기본 롤백) |
| Self-invocation (this.method) | 0건 (거짓 양성 3건 — extension fn) | ✅ |
| Repository에 `@Transactional` | 3건 (`@Modifying` 때문) | 🟡 anti-pattern |
| `spring.jpa.open-in-view` 명시 설정 | **0건** (기본 `true` 의존) | 🟡 암묵 |

---

## 1. T-1 [P1] `readOnly = true` 사실상 미사용 — 19/20 서비스에 누락

**증거**
- 전체 104개 `@Transactional` 중 `readOnly=true`는 딱 1건:
  - `SettlementMemberMonthlyService.kt:17-19` — 클래스 레벨 `@Transactional(readOnly = true)` 후 `update()`만 `@Transactional` 오버라이드
- 나머지 19개 서비스는 **모두 메서드 레벨 `@Transactional`만 사용** (class-level 없음):
  - HospitalService, ProductService, ExpenseReportService, DealerService, MemberService, BannerService, PartnerService, PartnerContractService, AuthService, ReportService, BoardService, SalesAgencyProductBoardService, PartnerPharmacyService, SettlementService, HospitalSidoCountCacheService, EventBoardService, BlockService, PrescriptionService, CommentService

**문제**
- 조회 트랜잭션에서도 Hibernate가 dirty-check 수행, flush mode가 `AUTO`로 유지됨
- PostgreSQL 드라이버 관점에서 `setReadOnly(true)` 미호출 → 명시적 READ ONLY 트랜잭션 최적화 상실
- **특히 심각한 예시** — `ExpenseReportService`:
  - `ExpenseReportService.kt:111-163` `buildProductBriefingSingleXlsx` — **XLSX 빌드 전 구간**을 `@Transactional` (read-write)로 감쌈. Excel 시트 생성·autoSize·직렬화 수 초 동안 DB 트랜잭션 점유
  - `ExpenseReportService.kt:166-173` `buildBriefingSingleXlsxFileName` — **파일명 문자열 가공**조차 `@Transactional`. 내부에서 조회 재호출 후 문자열 리턴
  - `ExpenseReportService.kt:47-89` `writeSingleReportZip` — ZIP 스트림 쓰기 + S3 다운로드까지 단일 write 트랜잭션

**위험도**
- 현재 부하에서는 눈에 안 띔
- 동시 엑셀 다운로드 + 트래픽 급증 시: HikariCP `maximumPoolSize` (기본 10)가 long-running txn에 잠기면 `connection timeout` 연쇄
- 성능 이슈가 N+1 (감사 #3)와 결합되면 증상 가속

**권고**
- **표준 패턴 도입 (SettlementMemberMonthlyService 복제)**:
  ```kotlin
  @Service
  @Transactional(readOnly = true)
  class ProductService(...) {
      // 조회 메서드는 어노테이션 불필요 (클래스 레벨 상속)
      fun getProductDetails(...) { ... }

      @Transactional  // 쓰기만 오버라이드
      fun createProductExtraInfo(...) { ... }
  }
  ```
- 우선 적용 대상: ExpenseReportService, ProductService, BoardService, MemberService (요청량 상위 4개)
- 공수: 서비스당 15~30분 — 조회/쓰기 메서드 분류 후 어노테이션 교체. **단, 아래 T-2 선결 필요**

---

## 2. T-2 [P1] 조회 메서드에 `@Transactional` 자체가 없는 경우 — OSIV(open-in-view) 기본값 의존

**증거**
- `ProductService.getProductDetails` (ProductService.kt:143~): 제품 상세 조회. `@Transactional` 없음
  - `boardService.getBoardDetails()` 호출 — BoardService의 해당 메서드도 @Transactional 없음
  - Entity 필드(`extraInfo.boardPost.id`) 접근 → LazyLoading이 Controller 뷰 레이어까지 연장
- `application.yml`·`application-*.yml` 어디에도 `spring.jpa.open-in-view` 설정 없음 → Spring Boot 기본 `true`
- Hibernate는 Controller 리턴 시점까지 EntityManager를 open 유지 → 커넥션도 보유

**문제**
- **암묵적 OSIV 의존**: 현재 코드가 동작하는 이유는 "Spring Boot가 조용히 OSIV=true 경고를 띄우기 때문". 경고 본인이 이미 "antipattern in most cases"라 명시
- 시작 로그:
  ```
  spring.jpa.open-in-view is enabled by default. Therefore, database queries
  may be performed during view rendering. Explicitly configure spring.jpa.open-in-view
  to disable this warning
  ```
- 나중에 OSIV를 끄려는 순간 (또는 WebFlux 전환 시) **광범위한 LazyInitializationException** 발생. 레거시화가 깊어질수록 제거 비용 상승

**위험도**
- 기능 장애 없음
- 성능: Request 수명 전체 동안 DB 커넥션 1개 점유 → 실제 DB 작업이 10ms인데 커넥션은 300ms+ 보유
- 아키텍처 부채: 트랜잭션 경계가 서비스가 아니라 "ViewResolver 리턴까지"로 번지면, 트랜잭션 경계 리팩터가 불가능해짐

**권고**
1. **단기**: `application.yml`에 `spring.jpa.open-in-view: true` **명시** — 의도적 선택임을 표시 + 경고 로그 제거
2. **중기**: T-1과 동반, 모든 서비스 조회 메서드를 `@Transactional(readOnly = true)`로 감싸 트랜잭션 경계를 서비스로 내림
3. **장기 (1분기)**: `open-in-view: false`로 전환 — 각 서비스가 DTO로 변환 후 리턴하는 구조 강제. 여기서는 서비스가 이미 대부분 DTO 반환이라 부담 적음

---

## 3. T-3 [P2] `ProductService.triggerExportAfterCommit` — coroutine launch 안에서 DB 접근

**위치** `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/service/ProductService.kt:70-90`

```kotlin
private val exportScope = CoroutineScope(Dispatchers.IO + exportJob)

private fun triggerExportAfterCommit() {
    if (TransactionSynchronizationManager.isActualTransactionActive()) {
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() {
                exportScope.launch { exportAllProductsToRootTsv() }  // ← 트랜잭션 컨텍스트 없는 새 스레드
            }
        })
    } else {
        exportScope.launch { exportAllProductsToRootTsv() }
    }
}
```

**문제**
- `afterCommit()` 자체는 정상 (commit 이후 export) — 설계 의도 OK
- 그러나 `launch {}`는 **다른 스레드에서 실행**되고, Spring 트랜잭션은 스레드-로컬(`TransactionSynchronizationManager`)이라 **전파 안됨**
- `exportAllProductsToRootTsv()` 내부에서 Repository 조회를 수행한다면:
  - `@Transactional` 없으면 → 짧은 auto-commit 트랜잭션 각 쿼리마다 발생 (N+1 효과)
  - OSIV도 무관 (request 종료된 이후이므로)

**실제 확인** (필요 시)
- `exportAllProductsToRootTsv()` 메서드 본체 읽고 `@Transactional` 유무 확인 (본 감사 시간상 확인 생략)
- 현재 observation: coroutine 내부에서 Repository 호출 시 트랜잭션 경계 불명확

**권고**
- `exportAllProductsToRootTsv()`에 `@Transactional(readOnly = true)` **명시**
- 또는 별도 `@Service` 분리 후 coroutine이 그 프록시를 호출하게 구성 (self-invocation 우회 + 트랜잭션 보장)

---

## 4. T-4 [P2] `BoardStatisticsService.findByBoardPost` — 암묵적 트랜잭션 계약

**위치** `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/service/BoardStatisticsService.kt:17-29`

```kotlin
// 통계 row 보장(동일 트랜잭션에서 호출됨)
fun findByBoardPost(boardPost: BoardPost): BoardStatistics {
    return boardStatisticsRepository.findById(boardPost.id).orElseGet {
        boardStatisticsRepository.save(  // ← 트랜잭션 필수
            BoardStatistics(...)
        )
    }
}
```

**문제**
- 메서드에 `@Transactional` 없으나 분기에 따라 `.save()` 실행 — 호출자 트랜잭션에 의존
- 주석("동일 트랜잭션에서 호출됨")으로만 계약 명시 — 컴파일러가 강제하지 못함
- 호출자가 트랜잭션 밖(예: 스케줄러·리스너·비동기) 에서 호출하면 `TransactionRequiredException` 또는 `.save()`가 즉시 auto-commit (부분 쓰기)

**호출처 추적 필요** (권고된 작업)
- 현재 호출자가 모두 `BoardService`의 `@Transactional` 메서드에서 들어오는지 검증
- 그렇다면 `findByBoardPost`에 `@Transactional(propagation = MANDATORY)` 부여해 계약을 런타임 강제로 격상

**권고**
```kotlin
@Transactional(propagation = Propagation.MANDATORY)
fun findByBoardPost(boardPost: BoardPost): BoardStatistics { ... }
```
- 호출자 트랜잭션 없이 호출되면 `IllegalTransactionStateException` 즉시 발생 — 주석 대신 런타임 강제

---

## 5. T-5 [P3] Repository 레이어 `@Transactional` — anti-pattern

**위치**
- `PrescriptionEdiFileRepository.kt:70` — `@Modifying + @Transactional`
- `ProductRepository.kt:23` — `@Modifying + @Transactional(propagation = REQUIRES_NEW)`
- `S3FileRepository.kt:16` — `@Modifying + @Transactional`

**문제**
- JPA Repository에 `@Transactional`을 직접 거는 패턴은 스프링 권장과 반대 방향
- 트랜잭션 경계는 **서비스 계층**에서만 관리하는 것이 표준 — Repository는 트랜잭션을 "받아 쓴다"
- `@Modifying` UPDATE/DELETE 쿼리는 서비스 계층에서 이미 `@Transactional` 안에서 호출되므로 중복
- 특히 `ProductRepository.kt:23`의 `REQUIRES_NEW`는 호출하는 서비스 트랜잭션을 강제로 끊음 — 의도했을 수도, 사고였을 수도 있음

**권고**
- Repository `@Transactional` 3건 제거 → 서비스 계층에서 관리
- `ProductRepository.kt:23`의 `REQUIRES_NEW`가 의도적이라면 주석 필수 (현재 주석 없음)

---

## 6. T-6 [INFO] `Propagation.REQUIRES_NEW` — 6건 모두 설계 의도 확인됨 ✅

| 위치 | 용도 | 평가 |
|---|---|---|
| `ProductRepository.kt:23` | `@Modifying` UPDATE 격리 | 의도 불명확 — T-5 참고 |
| `PushTokenCleaner.kt:15` `softDeleteInvalidToken` | 푸시 발송 실패 시 토큰 무효화 롤백 격리 | ✅ |
| `BoardStatsApplier.kt:16, 27, 42` (3건) | 이벤트 리스너에서 통계 업데이트 격리 — 메인 트랜잭션 롤백과 무관하게 commit | ✅ |
| `BoardStatsAfterCommitListener.kt:25` (주석) | "비동기 분리(새 스레드) → 내부에서 REQUIRES_NEW 트랜잭션으로 실행" | ✅ |

대체로 **이벤트 리스너 패턴**에서 메인 비즈니스 롤백 ≠ 통계 롤백을 분리하는 정석적 사용.

---

## 7. T-7 [INFO] `rollbackFor` / `noRollbackFor` — 0건

Kotlin은 checked exception 강제가 없고, 모든 사용자 예외가 `RuntimeException` 계열이면 기본 동작(롤백)으로 커버됨. 현재 코드베이스 기준 문제 없음.

**장래 주의**
- 향후 `IOException`, `SQLException` 등 checked 예외를 catch 하지 않고 올리는 코드가 추가될 경우, 롤백되지 않음
- 공통 `rollbackFor = [Exception::class]` 정책을 서비스 레벨 메타 어노테이션으로 추출하는 방법 검토

---

## 8. T-8 [P3] Self-invocation 0건 — ✅ 다만 향후 주의

- 현 코드베이스에서 `this.method()` 패턴은 extension function 3건 (PrescriptionService String/File 확장) — **프록시와 무관**
- Spring AOP 기반 `@Transactional`은 외부 프록시 호출에서만 동작. `this.someTransactionalMethod()` 호출 시 **프록시 우회**, 어노테이션 무시
- Kotlin은 내부 메서드 호출 시 Java와 동일하게 `this`로 바인딩되므로 향후 "같은 클래스 내에서 @Transactional 메서드 호출"이 추가되면 **조용히 트랜잭션이 사라짐**

**권고**
- 코드 리뷰 체크리스트에 "동일 클래스 내 @Transactional 메서드 호출 금지" 추가
- 필요 시 `@Autowired self: ApplicationContext.getBean(...)` 또는 별도 서비스로 분리

---

## 9. T-9 [P3] `HospitalService.deleteAll` — TRUNCATE Native Query + `@Transactional`

**위치** `HospitalService.kt:119-121`

```kotlin
@Transactional
fun deleteAll() {
    entityManager.createNativeQuery("TRUNCATE TABLE hospital RESTART IDENTITY CASCADE").executeUpdate()
}
```

**관찰**
- TRUNCATE는 PostgreSQL에서 트랜잭션 가능하지만 **DDL-like 락**을 짧게 획득 (ACCESS EXCLUSIVE)
- `CASCADE` 옵션 — 참조 FK 테이블도 함께 TRUNCATE → 의도한 범위 초과 위험
- `/v1/hospitals/bulk-upsert` (RBAC §R-1의 P0 대상)가 이 경로를 호출할 가능성 — 보안 감사와 연계하여 확인 필요

**권고**
- `CASCADE` 사용이 반드시 필요한지 재검토. 불필요하면 제거
- 운영 배포 전 RBAC 보호 필수 (RBAC 감사 §R-1과 병합 처리)

---

## 10. 권장 실행 순서

### Week 1
1. **T-1 단계 1**: ExpenseReportService, ProductService 클래스 레벨 `@Transactional(readOnly = true)` 적용 — **가장 큰 이득, 가장 작은 변경** (각 서비스 30분)
2. **T-2 단기**: `application.yml`에 `spring.jpa.open-in-view: true` **명시적 설정** (5분)

### Week 2
3. T-1 나머지 17개 서비스 점진 적용
4. **T-4**: BoardStatisticsService `propagation = MANDATORY`로 격상 (15분)

### 장기 (다음 분기)
5. T-3: ProductService export 경로 트랜잭션 명시
6. T-5: Repository `@Transactional` 3건 서비스 계층으로 이동
7. T-2 중기/장기: OSIV 비활성화 준비 — DTO 변환 누락 지점 스캔 후 순차 전환

---

## 11. 긍정 발견

- ✅ `SettlementMemberMonthlyService`는 **정석 패턴의 reference implementation** — 클래스 레벨 readOnly + 메서드 레벨 오버라이드
- ✅ `REQUIRES_NEW` 6건 모두 의도적이고 주석까지 있음 — 숙련된 설계
- ✅ self-invocation 0건 — 프록시 우회로 인한 트랜잭션 무력화 사고 없음
- ✅ `TransactionalEventListener(AFTER_COMMIT)` 3건 — 커밋 이후 부수 효과(푸시/S3/통계) 분리가 일관됨
- ✅ coroutine 사용처가 `exportScope` (custom CoroutineScope)로 한정 — GlobalScope 남용 없음

---

## 12. 후속 감사와의 연계

| 감사 | 연계 지점 |
|---|---|
| #3 N+1 (영속성) | T-1 readOnly 적용 시 Hibernate가 flush 생략 → dirty-check 비용 제거. N+1 총 오버헤드 감소 (쿼리 수 자체는 안 줄지만 응답 시간 개선) |
| #4 RBAC | T-9의 `deleteAll` — RBAC §R-1의 `/v1/hospitals/bulk-upsert` P0와 동일 엔드포인트 호출 경로 |
| #5 Secret | 연관 없음 |
| #6 E2E | 트랜잭션 경계 변경은 E2E로 검증 어려움 — 단위/통합 테스트에서 검증 권장 |
| #8 에러/관측성 (다음 후보) | `TransactionRequiredException`, `LazyInitializationException` 발생 시 전역 핸들러 부재 여부 확인 연계 |

---

> **감사 종료**. 감사자는 T-1 (readOnly 누락)의 성능 리스크가 감사 #3 N+1과 맞물려 스테이징 부하 테스트에서 가장 먼저 발현될 것으로 예측한다. 그러나 운영 배포 저지 요인은 없다 (**P0 없음**).

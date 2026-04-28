# N+1 쿼리·영속성 감사 리포트

> **감사 일자:** 2026-04-21  
> **감사 범위:** 크로스커팅 #3 — JPA/QueryDSL 영속성 계층 N+1 위험  
> **감사 대상:** `medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/{service,repo,domain/entity}`  
> **관련 리포트:** `AUDIT_REPORT.md §F`(성능), `audit-menu-routes-20260421.md`, `audit-api-drift-20260421.md`

---

## Executive Summary

| 구분 | 개수 |
|------|------|
| 🔴 CRITICAL | **2** |
| 🟠 HIGH | **3** |
| 🟡 MEDIUM | **3** |
| 🟢 LOW | **2** |

### 정량 지표

| 항목 | 수치 | 판정 |
|------|------|------|
| Entity 파일 | 53 | - |
| `FetchType.LAZY/EAGER` 명시 횟수 | 78 | 대체로 LAZY 명시 (양호) |
| `@OneToMany` 컬렉션 | **1** (Member) | 도메인이 얕음 (좋음) |
| `@ManyToOne` 관계 | 다수 | LAZY 기본 준수 |
| JOIN FETCH 보유 Repository | **4 / 53** (7.5%) | 🔴 **낮음** |
| `@EntityGraph` 사용 | **0** | 🟠 **미사용** |
| Service 계층 `findById` 호출 | 55회 | - |
| Service `forEach/map` 블록 | 123회 | 개별 검토 필요 |

### Top 핵심 이슈

1. **🔴 `ProductService.saveProductExtraInfos`**: 엑셀 업로드 시 N개 레코드마다 개별 `findByProductIdAndMonth` + `save` → **2N 쿼리** (N=수천). 단일 엑셀 업로드가 수초~수십초 지연 유발 가능.
2. **🔴 JOIN FETCH 커버리지 7.5%**: 53개 리포지토리 중 4개만 fetch join 보유. 리스트 API 응답에서 연관 엔티티 프록시 접근 시 대량 N+1 유발 가능.
3. **🟠 `BoardService.updateBoardPost`**: editor 파일 N개마다 `s3FileRepository.findById` + `boardPostFileRepository.save` 루프 → 게시글 수정 시 2N 쿼리.
4. **🟠 `ProductService` KIMS 배치 업데이트**: `products.forEach { ... findByProductIdAndMonth ... save }` → 제품 전량 업데이트 시 수만 쿼리.

---

## 1. 감사 방법론

### 접근법
1. **Entity 관계 맵**: `@OneToMany`, `@ManyToMany`, `@OneToOne`, `@ManyToOne` + `FetchType` 설정 스캔
2. **Fetch 전략**: `@EntityGraph`, `JOIN FETCH` 쿼리 커버리지 확인
3. **호출 패턴**: Service 계층의 루프 내 리포지토리 호출 (`.forEach { ... repository }`) 탐지
4. **배치 vs 개별**: `findAllById`/`findAllByX` 사용 비율 확인

### 평가 기준
- 🔴 CRITICAL: 1회 요청으로 수백~수천 쿼리 유발 가능 (프로덕션 영향 큼)
- 🟠 HIGH: 1회 요청으로 수십 쿼리 (페이지네이션/트래픽 급증 시 병목)
- 🟡 MEDIUM: 패턴상 비효율이나 스케일이 작음
- 🟢 LOW: 스타일·일관성 이슈

---

## 2. 드리프트 목록

### 🔴 N-1 | CRITICAL — `ProductService.saveProductExtraInfos` N+1

**위치:** `service/ProductService.kt:677-702`

```kotlin
fun saveProductExtraInfos(extraInfos: List<ProductExtraInfo>) {
    extraInfos.forEach { newInfo ->
        val productId = newInfo.product.id
        val existing = productExtraInfoRepository
            .findByProductIdAndMonth(productId, newInfo.month)   // ← N queries

        if (existing == null) {
            productExtraInfoRepository.save(newInfo)              // ← N inserts
        } else {
            existing.apply { ... }                                // dirty-check writes
        }
    }
}
```

**영향:**
- 엑셀/JSON으로 수천 건 제품 부가정보 업로드 시 **`2N` 쿼리** 발생
- 프로덕션 `product_extra_info` 기준 월 단위 업로드는 보통 수천~수만 건 → 단일 트랜잭션이 수 분 지속
- 호출자: `uploadProductExtraInfoFromExcel`, `uploadProductExtraInfoFromJson` (Admin API)

**수정안 (배치 쿼리):**
```kotlin
fun saveProductExtraInfos(extraInfos: List<ProductExtraInfo>) {
    val pairs = extraInfos.map { it.product.id to it.month }
    val existingMap = productExtraInfoRepository
        .findAllByProductIdAndMonthIn(pairs)    // 1 query
        .associateBy { it.product.id to it.month }
    
    val (toUpdate, toInsert) = extraInfos.partition { 
        existingMap.containsKey(it.product.id to it.month) 
    }
    // ... batch save
    productExtraInfoRepository.saveAll(toInsert)  // batched
    toUpdate.forEach { /* dirty-check merge */ }
}
```

**조치 티어:** 이관 직후

---

### 🔴 N-2 | CRITICAL — JOIN FETCH 커버리지 7.5%

**위치:** `repo/postgresql/` 전체 (53개 리포지토리 중 4개만 JOIN FETCH 사용)

| JOIN FETCH 보유 | 미보유 |
|-----------------|--------|
| `BannerFileRepository` | `MemberRepository` |
| `BoardCommentRepository` | `BoardPostRepository` |
| `PrescriptionEdiFileRepository` | `PartnerRepository` |
| `SettlementPartnerProductRepository` | `PartnerContractRepository` |
|  | `PrescriptionRepository` |
|  | `PrescriptionPartnerRepository` |
|  | `ExpenseReportRepository` |
|  | `EventBoardRepository` |
|  | `SalesAgencyProductBoardRepository` |
|  | `SettlementRepository` |
|  | `SettlementMemberMonthlyRepository` |
|  | `ProductRepository` |
|  | ... (총 49개) |

**영향:**  
대부분 엔티티는 `@ManyToOne(fetch = LAZY)`로 올바르게 선언되어 있으나, 이는 **지연 로딩 프록시**만 설정하므로 서비스 계층에서 `entity.partner.name` 같은 접근 시 자동으로 개별 SELECT 발생. 페이지네이션 리스트 API(크기 50)에서 1개 연관 엔티티만 접근해도 **51 쿼리** (1+N).

**확인 필요 핫 패스:**
- `getPartners()` → Partner.owner(Member), Partner.drugCompany 접근
- `getExpenseReports()` → ExpenseReport.reporter(Member)
- `getSalesAgencyProducts()` → SalesAgencyProductBoard.boardPost
- `getPrescriptionPartnerList()` → 연쇄 다단 접근

**수정안:**  
페이지네이션이 잦은 리포지토리에 `JOIN FETCH` 또는 `@EntityGraph` 추가. 예:
```kotlin
@Query("""
    SELECT p FROM Partner p
    JOIN FETCH p.owner m
    LEFT JOIN FETCH p.drugCompany dc
    WHERE p.deleted = false
""")
fun findAllWithOwnerAndDrugCompany(pageable: Pageable): Page<Partner>
```

**조치 티어:** 장기 리팩토링 (운영 지표 기반 핫 패스 식별 후 순차 적용)

---

### 🟠 N-3 | HIGH — `ProductService` KIMS 배치 업데이트 N+1

**위치:** `service/ProductService.kt:838-846`

```kotlin
kdCodes.chunked(1000).forEach { chunk ->
    val products = productRepository.findByKdCodeIn(chunk)      // ✓ batch
    products.forEach { product ->
        val existing = productExtraInfoRepository
            .findByProductIdAndMonth(product.id, currentMonth)  // ← N queries in loop
        if (existing != null) {
            existing.isStopSelling = isStopSelling
            productExtraInfoRepository.save(existing)
        }
    }
}
```

**영향:**
- `kdCodes` 전체(수만 개) → chunk 단위 배치는 OK, but 내부 products.forEach에서 각 product마다 별도 `findByProductIdAndMonth` 발생.
- 1000 chunk 기준 1000 제품 × 1 쿼리 = 1000 쿼리. 전체 제품 순회 시 수만 쿼리.
- KIMS 주기 갱신 작업이 DB 락 경합·커넥션 고갈 위험.

**수정안:** 
```kotlin
kdCodes.chunked(1000).forEach { chunk ->
    val products = productRepository.findByKdCodeIn(chunk)
    val productIds = products.map { it.id }
    val existingMap = productExtraInfoRepository
        .findAllByProductIdInAndMonth(productIds, currentMonth)  // 1 query per chunk
        .associateBy { it.product.id }
    
    existingMap.values.forEach { it.isStopSelling = isStopSelling }
    // dirty-check 자동 flush
}
```

**조치 티어:** 이관 직후

---

### 🟠 N-4 | HIGH — `BoardService.updateBoardPost` editor 파일 N+1

**위치:** `service/BoardService.kt:501-530`

```kotlin
deletedFiles.forEach {
    s3FileRepository.save(it.s3File.copy(deleted = true))       // N saves
}
request.editorFileIds?.forEachIndexed { index, fileId ->
    val s3File = s3FileRepository.findById(fileId)              // ← N findById
        .orElseThrow { ... }
    boardPostFileRepository.save(BoardPostFile(...))            // N saves
}
```

**영향:**
- 게시글 1건 수정 시 에디터에 임베드된 이미지/파일 개수만큼 2~3N 쿼리
- 이벤트 게시물·공지사항 상세처럼 20~50개 이미지가 있는 경우 페이지 수정이 100+ 쿼리

**수정안:**
```kotlin
val deletedIds = deletedFiles.map { it.s3File.id }
s3FileRepository.markDeletedByIds(deletedIds)                   // 1 update

val editorS3Files = s3FileRepository.findAllById(request.editorFileIds)
val boardPostFiles = editorS3Files.mapIndexed { index, s3File ->
    BoardPostFile(...)
}
boardPostFileRepository.saveAll(boardPostFiles)                 // 1 batch insert
```

**조치 티어:** 이관 직후

---

### 🟠 N-5 | HIGH — `PartnerContractService` 파일 업서트 루프

**위치:** `service/PartnerContractService.kt:197-240`

```kotlin
files.forEach { (fileType, file) ->
    // 파일 타입별로 s3FileRepository.save + partnerContractFileRepository.save
    val s3File = reused ?: s3FileRepository.save(S3File(...))
    val contractFile = partnerContractFileRepository.save(PartnerContractFile(...))
}
```

**영향:**  
`files` 맵 크기는 파일 타입 수(보통 3-5개: 사업자등록증·통장사본·CSO등록증·계약서 등)로 작아 영향 제한적. 하지만 각 루프에서 2회 save = 최대 10 쿼리 + 기존 파일 조회 로직.

**조치 티어:** 이관 직후 (선택)

---

### 🟡 N-6 | MEDIUM — `@EntityGraph` 미사용

**현황:** 전체 repo에서 `@EntityGraph` **0회 사용**

**영향:**  
JOIN FETCH의 장점(컴파일 타임 검증, 다중 EntityGraph 재사용)을 살리지 못함. 대형 팀에서는 `@NamedEntityGraph` + `@EntityGraph` 조합이 `JOIN FETCH` 쿼리 중복 제거에 유리.

**수정안 (선택):** QueryDSL이 주 도구라면 그대로 유지 가능. Spring Data JPA 파생 쿼리가 많다면 `@EntityGraph` 도입 권장.

**조치 티어:** 장기 리팩토링

---

### 🟡 N-7 | MEDIUM — Service 계층 `findById` 55회 산재

**현황:** 서비스 코드에서 단건 `findById` 호출이 55회. 대부분은 정당하나(단건 조회), 루프 내부에서 발생하는 경우 확인 필요.

**위험 패턴 예시 (확인됨):**
- `BoardService.kt:507` — editorFileIds forEach 내부 `findById` (N-4)
- `PartnerContractService.kt` — 반복 save 사이 간간이 존재

**수정안:** Code review 체크리스트에 "루프 내 `findById`·`findBy*`" 항목 추가.

**조치 티어:** 장기 리팩토링

---

### 🟡 N-8 | MEDIUM — `Member.@OneToMany`와 `orphanRemoval=true`

**위치:** `entity/postgresql/Member.kt:82-87`

```kotlin
@OneToMany(
    mappedBy = "member",
    cascade = [CascadeType.ALL],
    orphanRemoval = true,
    fetch = FetchType.LAZY
)
```

**영향:**
- `CascadeType.ALL` + `orphanRemoval = true` 조합은 Member 삭제/수정 시 collection 전체 재평가 → 개별 DELETE 발행 가능
- `fetch = LAZY` 이므로 `member.someCollection` 접근 시 collection 전체 로드 → 1 쿼리로 N 레코드 가져오는 "collection N+1" 변형 발생 가능

**수정안:** 해당 `OneToMany` 대상이 무엇인지(Memberfile? Device?) 확인하고, 쓰기 경로에서 직접 repository 조작 고려.

**조치 티어:** 장기 리팩토링 (Member 도메인 리팩토링과 함께)

---

### 🟢 N-9 | LOW — `chunked` 배치 패턴 정착 (양호)

**위치:** `ProductService.kt:442, 566, 838`

```kotlin
productCodes.chunked(10_000).forEach { chunk ->
    val products = productRepository.findByKdCodeIn(chunk)  // ← IN 쿼리, 올바름
    ...
}
```

**판정:** 대용량 처리 경로에서 `chunked` + `findByKdCodeIn` 패턴이 자리잡아 있음. 내부 N+1만 제거하면 우수한 구조.

---

### 🟢 N-10 | LOW — 대부분 엔티티 `FetchType.LAZY` 준수

**판정:** 41개 엔티티 파일 중 78회 FetchType 명시 → 개발자가 의식적으로 설정. EAGER 남용 없음(무작위 스캔상).

---

## 3. 요약표

| ID | 심각도 | 영역 | 핵심 수정 대상 | 조치 티어 |
|----|--------|------|----------------|-----------|
| N-1 | 🔴 CRITICAL | Service 루프 | `saveProductExtraInfos` | 이관 직후 |
| N-2 | 🔴 CRITICAL | 리포지토리 전반 | JOIN FETCH 확대 | 장기 리팩토링 |
| N-3 | 🟠 HIGH | Service 배치 | KIMS 업데이트 루프 | 이관 직후 |
| N-4 | 🟠 HIGH | Service 루프 | 게시글 editor 파일 | 이관 직후 |
| N-5 | 🟠 HIGH | Service 루프 | 계약 파일 업서트 | 이관 직후 (선택) |
| N-6 | 🟡 MEDIUM | 영속성 전략 | @EntityGraph 도입 | 장기 리팩토링 |
| N-7 | 🟡 MEDIUM | 코드 패턴 | 루프 내 findById 55 | 장기 리팩토링 |
| N-8 | 🟡 MEDIUM | 엔티티 설계 | Member 컬렉션 | 장기 리팩토링 |
| N-9 | 🟢 LOW | 배치 패턴 | chunked 정착 | 유지 |
| N-10 | 🟢 LOW | Fetch 전략 | LAZY 준수 | 유지 |

---

## 4. 모니터링·측정 권장

### 4-1. Hibernate SQL 통계 활성화
```yaml
# application.yml (local/dev 환경만)
spring:
  jpa:
    properties:
      hibernate:
        generate_statistics: true
logging:
  level:
    org.hibernate.stat: DEBUG
    org.hibernate.SQL: DEBUG
    org.hibernate.type.descriptor.sql.BasicBinder: TRACE
```
이후 핫 패스 API를 호출하고 `StatisticsImpl#queryExecutionCount` 관찰 → N-2 범위 정량화.

### 4-2. 통합 테스트 어서션
```kotlin
@Test
fun `getProducts should issue at most 2 queries per page`() {
    statistics.clear()
    productService.getProductSummaries(...)
    assertThat(statistics.queryExecutionCount).isLessThanOrEqualTo(2)
}
```

### 4-3. Playwright + 백엔드 로깅 조합 (claude-opus-test)
자동 로그인 이후 `/admin/products`, `/admin/partners` 리스트 페이지 접속 → 서버 로그에서 SQL 카운트 관찰.

---

## 5. 결론

- **도메인이 얕음** (`@OneToMany` 단 1개) → 구조적 N+1 가능성은 제한적
- **핵심 위험은 Service 계층 루프 N+1** (N-1, N-3, N-4 세 건이 프로덕션 영향 가장 큼)
- **리포지토리 fetch 전략이 얕음** (N-2) → 페이지네이션 리스트에서 상시 N+1 유발 가능성
- **배치 패턴은 일부 정착** (N-9) → N-1/N-3 수정 시 동일 패턴 재사용 가능

**외주 이관 체크리스트 권장:**
1. N-1 수정 (엑셀 업로드 2N→2 쿼리) 우선
2. N-3, N-4 수정 (Admin 쓰기 경로)
3. Hibernate statistics 설정 + 회귀 테스트 도입 (이관 직후 2주 내)
4. N-2 JOIN FETCH 확대는 운영 APM 데이터 기반 순차 적용

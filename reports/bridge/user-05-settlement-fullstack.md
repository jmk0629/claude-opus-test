# user-05 정산 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs `medipanda-web-test/docs/user/05_SETTLEMENT.md` / 백엔드 docs `medipanda-api/docs/user/05_SETTLEMENT.md` / ingest 6종 (`reports/backend-ingestion-20260427/`)
> 짝꿍: 같은 도메인을 admin이 함께 사용 — `bridge/admin-06-settlement-fullstack.md` 와 §4 권한·필드 차이 비교

## 1. 화면 요약

거래처/약국이 **자기 정산만** 조회·요청·이의제기·엑셀 다운로드 하는 메뉴. `ContractMemberGuard`(로그인 + 파트너 계약) 통과 후 3개 페이지 + 다이얼로그 1개로 구성 (frontend doc:1-39).

- **제약사별 정산내역** (`/settlement-drug-company`, `pages-user/SettlementDrugCompany.tsx`) — 본인의 제약사×월별 집계. `getSettlementsMemberMonthly`는 `@/backend` 미생성 → `axios.request()` 인라인 (frontend doc:62-83). `format(d, 'yyyyMM01')` 8자리 Int로 단월 조회 (frontend doc:117-130).
- **딜러별 정산내역** (`/settlement-list`, `pages-user/SettlementList.tsx`) — 좌 목록 + 우 `SettlementDetailForm` 거래처 요약 + `SettlementDetailDialog` 제품 상세. **정산요청** 모달 2단계 vs **이의제기** 즉시 호출 (frontend doc:430-448). ZIP 다운로드는 `RouterLink` IIFE로 URL 직접 조립 (frontend doc:167-185).
- **매출통계** (`/sales-statistic`, `SalesStatistic.tsx`) — `?tab=ALL|INDIVIDUAL`로 `TotalSalesStatistic` ↔ `PartnerSalesStatistic` 전환. `ChartView`는 누락 월 0 채움 + `checkedIndexes` 시리즈 필터 (frontend doc:206-273).

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 (호출처) | Controller | Service | Repository | 비고 |
|---|------|------|--------------------|------------|---------|------------|------|
| 1 | GET | `/v1/settlements-member-monthly` | `getSettlementsMemberMonthly` (인라인 axios, `SettlementDrugCompany.tsx` frontend doc:62-78) | `SettlementMemberMonthlyController.kt:23` (01-controllers.md:204) | `SettlementMemberMonthlyService.search:23` (02-services.md:207, **클래스 readOnly**) | `SettlementMemberMonthlyRepository.search:21` (03-repositories.md:79, 128) | 행당 SELECT절 상관 서브쿼리 2개 → N×2 추가 쿼리. user면 `memberRepository.findByUserId(loginUser.userId)?.id`로 강제 (backend doc:50-52) |
| 2 | GET | `/v1/settlements` | `getSettlements` (`@/backend`, `SettlementList.tsx` frontend doc:402-411) | `SettlementController.kt:147` (01-controllers.md:180) | `SettlementService.getSettlementList:539` (02-services.md:113-127) | `SettlementRepository.searchSettlements:164` (03-repositories.md:34, backend doc:531-569) | `userId = AuthScopeUtil.userIdForQuery(loginUser)` → JPQL `(:userId IS NULL OR dm.userId = :userId)`. `JOIN PartnerContract pc ON pc.member = dm` **INNER** — 계약 끊긴 회원 정산 누락 (§5) |
| 3 | GET | `/v1/settlements/total-prescription-amount` | `getSettlementsTotal` (frontend doc:412-416) | `SettlementController.kt:174` (01-controllers.md:181) | `SettlementService` | `SettlementRepository.searchSettlementsTotal:199` (backend doc:572-594) | `EXISTS` 서브쿼리로 중복 SUM 방지. 페이지네이션과 무관한 전역 합계 |
| 4 | GET | `/v1/settlements/partners` | `getSettlementPartnerSummary` (frontend doc:626-633) | `SettlementController.kt:207` (01-controllers.md:184) | `SettlementService.getSettlementPartnerSummary:503` | `SettlementPartnerRepository.searchSettlementPartnerSummary:55` (03-repositories.md:35, backend doc:596-626) | **⚠️ JPQL에 `userId` 필터 없음 (IDOR-1)** — 타인 settlementId 직접 호출 가능 (backend doc:108) |
| 5 | GET | `/v1/settlements/partners/{id}/products` | `getSettlementPartnerProducts` (`SettlementDetailDialog`) | `SettlementController.kt:139` (01-controllers.md:186) | `SettlementService.getSettlementPartnerProducts:493` | `SettlementPartnerProductRepository.findBySettlementPartnerId:59` (backend doc:629-639) | **⚠️ 스코프 없음 (IDOR-1 동일)**. 정렬은 클라이언트 `products.sort()` (frontend doc:309-329) |
| 6 | POST | `/v1/settlements/notify-admin` | `notifyAdminForSettlements` (모달 2단계, frontend doc:431-437) | `SettlementController.kt:360` (01-controllers.md:197) | `SettlementService.notifyAdminForSettlements:74` (02-services.md:120 **REQUIRED**) | `SettlementRepository.findAllById` + `DealerRepository.findById` (03-repositories.md:122 N+1) | 상태 `REQUEST` + `NotificationEmailEvent(SETTLEMENT_REQUESTED, ADMIN)`. **⚠️ 소유자 검증 없음 (IDOR-2)** (backend doc:120) |
| 7 | POST | `/v1/settlements/notify-admin/objections` | `notifyAdminForObjections` (확인 모달 없이 즉시, frontend doc:439-445) | `SettlementController.kt:350` (01-controllers.md:196) | `SettlementService.notifyAdminForObjections:47` (02-services.md:121, **@Transactional 누락 [RISK-1]** 02-services.md:382-383) | `SettlementRepository.findAllById` + `DealerRepository.findById` 루프 (03-repositories.md:121 N+1) | 상태 `OBJECTION` + `NotificationEmailEvent(OBJECTION_SUBMITTED, ADMIN)`. **⚠️ IDOR-2 + 트랜잭션 부재 → 부분 저장+이메일 전체 발행 위험** |
| 8 | GET | `/v1/settlements/export-zip` | `RouterLink` IIFE 직접 URL (frontend doc:167-185) | `SettlementController.exportGroupedZip:253` (01-controllers.md, backend doc:26) | `SettlementService.createGroupedExcelZip:153` | `SettlementPartnerProductRepository.findAllByFilter:32` (03-repositories.md:105 8개 JOIN FETCH, backend doc:642-661) | **이 EP만 `loginUserId = loginUser.userId` non-null 강제** — 사용자 경로 중 유일하게 항상 본인 데이터로 제한 (backend doc:136) |
| 9 | GET | `/v1/settlements/performance/by-drug-company` | `getPerformanceByDrugCompany` (`TotalSalesStatistic` + `PartnerSalesStatistic`) | `SettlementController.kt:107` (01-controllers.md, backend doc:27) | `SettlementService.getStatsByDrugCompany:377` (02-services.md:122) | `SettlementRepository.getPerformanceStats:51` + `SettlementMemberMonthlyRepository.findByMemberIdAndSettlementMonthBetween` (03-repositories.md:80, 6-I) | `Pageable.unpaged()` 후 JVM `groupBy` (§5 OOM 후보). SMM extra를 제약사명 키로 매칭 합산 |
| 10 | GET | `/v1/settlements/performance/by-drug-company/monthly` | `getPerformanceByDrugCompanyMonthly` (`ChartView`) | `SettlementController.kt:123` (backend doc:28) | `SettlementService.getStatsByDrugCompanyMonthly:434` | 동일 (위) | 매칭 키 `(dcName, settlementMonth.toIsoDateString())` — Int↔String 변환 위험 (§5) |
| 11 | GET | `/v1/settlements/performance/by-institution` | `getPerformanceByInstitution` (`PartnerSalesStatistic`) | `SettlementController.kt:93` (backend doc:29) | `SettlementService.getStatsByInstitution:347` | `SettlementRepository.getPerformanceStats` (동일) | 정렬·페이징 없이 전량 → `groupBy { (institutionCode, name) }` |

> 추정: 프론트 표기 `getSettlementsMemberMonthly`는 swagger 누락으로 인라인 axios. 백엔드 정규 경로는 `/v1/settlements-member-monthly` 단수 (frontend doc:75, backend doc §5 이슈 14).

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|---|---|---|---|
| `settlement` | 헤더 (딜러×제약사×월) | `dealer_id`, `drug_company_id` | `BaseEntity` 상속, `settlementMonth` Int(YYYYMMDD) (04-domain.md:45, 180-181). **`settlement_month` 인덱스 없음** (backend doc §5 이슈 11) |
| `settlement_partner` | 정산 거래처 라인 | `settlement_id`, `partner_id`, `dealer_id` | **`BaseEntity` 미상속** (04-domain.md:46, 183). UNIQUE 인덱스 부재 |
| `settlement_partner_product` | 제품 라인 (금액·수수료) | `settlement_partner_id`, `product_id` | **미상속**, `feeAmount/unitPrice` Long, `prescription_month` DATE — `settlement.settlement_month`(Int)와 타입 불일치 (04-domain.md:47, 184, 410; backend doc §5 이슈 12) |
| `settlement_member_monthly` | 회원×제약사×월 추가수수료/비고 | `member_id`, `drug_company_id` | UNIQUE `(member_id, drug_company_id, settlement_month)`. 독립 Aggregate, 자체 Audit (04-domain.md:48, 250). 로컬 39행·15회원·2제약사 (backend doc §4-E) |
| `partner_contract` | `companyName` 출처 | `member_id` | `searchSettlements`에서 **INNER JOIN** → 계약 없는 회원 정산 누락 (backend doc §5 이슈 8); SMM은 LEFT지만 다중 계약 시 행 중복 (이슈 7) |
| `dealer`, `member`, `drug_company`, `partner`, `product` | 외부 참조 | — | Settlement Aggregate 외부 |

핵심 JOIN — `searchSettlements` (user 시점, `dm.user_id` 스코프; backend doc:531-569):

```sql
SELECT s.id, s.settlement_month, dc.name AS drug_company, d.dealer_name, pc.company_name, s.status,
       SUM(COALESCE(spp.fee_amount,0) + COALESCE(spp.extra_fee_amount,0))            AS total_fee,
       SUM(COALESCE(spp.fee_amount,0) + COALESCE(spp.extra_fee_amount,0)) / 1.1      AS supply_amount,
       SUM(COALESCE(spp.prescription_amount,0))                                        AS prescription_amount
FROM settlement s
JOIN dealer d                       ON d.id = s.dealer_id
JOIN member dm                      ON dm.id = d.member_id
JOIN partner_contract pc            ON pc.member_id = dm.id    -- ⚠️ INNER (이슈 8)
JOIN drug_company dc                ON dc.id = s.drug_company_id
JOIN settlement_partner sp          ON sp.settlement_id = s.id
JOIN settlement_partner_product spp ON spp.settlement_partner_id = sp.id
WHERE (:user_id IS NULL OR dm.user_id = :user_id)              -- user면 본인 userId
  AND (:start_month IS NULL OR s.settlement_month >= :start_month)
  AND (:end_month   IS NULL OR s.settlement_month <= :end_month)
GROUP BY s.id, d.id, d.dealer_name, pc.company_name, s.settlement_month, s.status, dc.id, dc.name
ORDER BY s.id DESC;
```

## 4. 권한·트랜잭션 (admin/06 과의 차이)

| 항목 | user/05 | admin/06 | 출처 |
|---|---|---|---|
| `@RequiredRole` | **전무** — 비admin 통과는 JPQL `:userId` 필터에만 의존 (backend doc §6 메모) | `excel-download`, `partners/excel-download` 두 엔드포인트만 `ADMIN_ONLY/SETTLEMENT_MANAGEMENT` (05-security.md:157) | 05-security.md:157 |
| 스코프 키 | **두 가지 공존** — `SettlementMemberMonthlyController`는 `memberId(Long)` (member.user_id 기반 Member.id로 변환), `SettlementController`는 `AuthScopeUtil.userIdForQuery(loginUser)`로 `userId(String)` (dealer.member.user_id) | admin이면 양쪽 모두 `null` → 전체 조회 | backend doc:33-38 |
| 응답 필드 차이 | 동일 DTO 공유. user `SettlementMemberMonthlyResponse.baseFeeAmount`는 `SUM(fee + COALESCE(extra,0))` 이므로 **이름과 달리 extra 포함** → 프런트가 `totalFee = base + extra`로 다시 더해 `/1.1` → 공급가액 **이중 카운트** (backend doc §5 이슈 4 = admin/06 이슈 6-C). 현 데이터 SMM extra 1건뿐이라 잠복 | 동일 버그 공유 | backend doc §4-E, §5 이슈 4 |
| 정산상태 변경 EP | `notify-admin`, `notify-admin/objections` 모두 user가 호출 (사용자 트리거 전용) | admin은 미사용 (운영용으로 분류) | backend doc:24-25 |
| 트랜잭션 | `notifyAdminForSettlements` `@Transactional`(REQUIRED), `notifyAdminForObjections` **누락** — 부분 저장 + 이메일 전체 발행 가능 (02-services.md:120-121, 382-383). + 둘 다 N+1 (`dealerRepository.findById` 루프, 03-repositories.md:121-122) | 동일 코드 경로 | 02-services.md:382-383 [RISK-1] |
| IDOR | (1) `/v1/settlements/partners`·`/partners/{id}/products`에 `userId` 필터 없음 → 타인 settlementId 열람. (2) `notify-admin`·`/objections`은 `findAllById(ids)` 후 소유자 검증 없이 상태/이메일 처리 → 타인 정산 상태 뒤집기 가능 | admin은 의도적 전체 접근, 문제 아님 | backend doc §5 이슈 1, 2 |
| `export-zip` 스코프 | **`loginUserId` non-null 강제** — user 경로 중 유일하게 항상 본인 데이터 (backend doc:136) | admin도 동일 코드 경로 사용. 단 admin이면 다른 EP에서 전체 가능하므로 현 ZIP만 제한 일관성 차이 | backend doc:136 |

## 5. 리스크 / 후속 액션

1. **IDOR-1 (P0)** — `SettlementPartnerRepository.searchSettlementPartnerSummary:55`, `SettlementPartnerProductRepository.findBySettlementPartnerId:59`에 `userId`/`memberId` 필터 추가. `AuthScopeUtil.userIdForQuery(loginUser)` 파라미터 전파 (backend doc §5 이슈 1).
2. **IDOR-2 (P0)** — `notifyAdminForSettlements`·`notifyAdminForObjections` 루프에서 `settlement.dealer.member.userId == loginUser.userId` 검증, 불일치 시 403 (backend doc §5 이슈 2).
3. **트랜잭션 일관성 (P1)** — `SettlementService.notifyAdminForObjections`에 `@Transactional` 부착하여 `notifyAdminForSettlements`와 대칭 (02-services.md [RISK-1]). N+1도 `dealerRepository.findAllById(ids).associateBy { it.id }` 패턴으로 동시 해소 (03-repositories.md:194).
4. **이중 카운트 (P1)** — `SettlementMemberMonthlyResponse.baseFeeAmount` 이름·의미 분리: 백엔드를 `baseAndExtraFeeAmount` 또는 순수 base로 변경, 프론트 `totalFee` 계산 정정 (backend doc §5 이슈 4).
5. **PartnerContract INNER JOIN (P1)** — 계약 종료 회원 과거 정산 열람 차단이 의도인지 확인 후 LEFT JOIN 또는 별도 정책 (backend doc §5 이슈 8).
6. **상관 서브쿼리 N×2 (P2)** — `SettlementMemberMonthlyRepository.search` SELECT절 두 서브쿼리를 LEFT JOIN + GROUP BY로 리팩터링 (03-repositories.md:128, 195).
7. **`Pageable.unpaged()` OOM (P2)** — `getStatsByDrugCompany/Institution`을 DB 집계 또는 streaming으로 (backend doc §5 이슈 10).
8. **`settlement_month` 인덱스 (P2)** — `CREATE INDEX idx__settlement__settlement_month ON settlement (settlement_month)` (03-repositories.md:145, backend doc §5 이슈 11).
9. **JPQL `LIKE %...%` 혼재 (P3)** — SMM은 raw `%:param%`, Settlement는 `LOWER(... LIKE LOWER(CONCAT('%', :p, '%')))`. 검색 UX 통일 (backend doc §5 이슈 3).
10. **swagger 동기화 (P3)** — `/v1/settlements-member-monthly`가 backend.ts 생성에서 누락 → `axios.request()` 인라인 (frontend doc §2-1, backend doc §5 이슈 14). OpenAPI 보강해 인라인 제거.
11. **JPQL `ORDER BY` 하드코딩 (P3)** — SMM `search`가 `ORDER BY smm.settlementMonth DESC, dc.name, pc.companyName` 고정 → Pageable.Sort 무시 (backend doc §5 이슈 5).
12. **Audit 부재 (P3)** — `SettlementPartner`, `SettlementPartnerProduct` BaseEntity 미상속 → 금액 변경 이력 추적 불가 (04-domain.md:183-184, 03-repositories.md:200).

## 6. 참조

- 프론트 docs: `medipanda-web-test/docs/user/05_SETTLEMENT.md`
- 프론트 코드: `medipanda-web-test/src/pages-user/SettlementDrugCompany.tsx`, `SettlementList.tsx`; `pages-user/SalesStatistic.tsx` (탭/차트는 프론트 docs §5)
- 백엔드 docs: `medipanda-api/docs/user/05_SETTLEMENT.md` (특히 §1 매트릭스, §5 이슈, §6 JPQL→SQL)
- ingest 6종 (`reports/backend-ingestion-20260427/`):
  - `01-controllers.md:26-27, 180-205, 373` — 컨트롤러 인덱스
  - `02-services.md:12, 111-127, 205-213, 361-383, 419` — 서비스 책임/트랜잭션/[RISK-1]
  - `03-repositories.md:34-37, 79-105, 121-128, 142-145, 194-200` — Repo·N+1·인덱스
  - `04-domain.md:45-48, 96, 180-188, 247-250, 351-358, 409-410` — 엔티티/관계/타입
  - `05-security.md:140-174` — `@RequiredRole` 적용 현황 + `ADMIN_OR_SELF` 모드
- 짝꿍 문서: `bridge/admin-06-settlement-fullstack.md` (동일 도메인 관리자 시점)

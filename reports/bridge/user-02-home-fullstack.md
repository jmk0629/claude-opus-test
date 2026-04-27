# user-02 홈 (대시보드) — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer fallback)
> 입력: `medipanda-web-test/docs/user/02_HOME.md`, `medipanda-api/docs/user/02_HOME.md`, `reports/backend-ingestion-20260427/`

## 1. 화면 요약

루트 `/` (`src/pages-user/Home.tsx`, 481 줄). **6 API fan-out** 페이지.

- **히어로 섹션** (로그인만): `/assets/hero.svg` 위에 `position:absolute`로 통계 3 종을 오버레이 — 당월 처방건수 / 당월 수수료(원→백만원 환산) / 최근 1 개월 오픈 병원 수. 비로그인은 `hero-public.svg` + 파트너계약 링크.
- **캐러셀 2 종** (전원, 5 초 자동전환, 602 px): 영업대행 상품 (`fetchSalesAgencyProducts`) + 배너 (`fetchBanners`). 응답 형태가 다른 두 API를 `CarouselItem` 인터페이스로 통일.
- **커뮤니티 섹션** (`session && hasCsoMemberPermission(session)` — CSO 회원만): 신규처매칭/익명게시판 탭 + `RecentBoardTable` (TanStack Table, 최근 10 건).

`useEffect` 두 개 분리: `[]` (마운트 시 캐러셀, 비로그인 포함) + `[session]` (히어로 통계, `session === null`이면 즉시 return). `referenceDate` 타입이 API마다 3 종(`Int yyyyMMdd` / `DateString` / `DateTimeString`)으로 혼재.

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | API | Controller (출처: `01-controllers.md`) | Service (출처: `02-services.md`) | Repository / 캐시 (출처: `03-repositories.md`, `06-config.md`) | RBAC |
|---|---|---|---|---|---|
| 1 | GET `/v1/sales-agency-products` | `SalesAgencyProductBoardController.kt:32` | `SalesAgencyProductBoardService` (02:306) | `SalesAgencyProductBoardRepository#searchSalesAgencyProductBoards` (03:41, JPQL DTO projection + 상관 서브쿼리) | JWT만 |
| 2 | GET `/v1/banners` | `BannerController.kt:29` (01:34, 01:286) | `BannerService` (02:302) | `BannerRepository#findBanners` + `BannerFileRepository` (03:38) | JWT만 |
| 3 | GET `/v1/prescriptions/monthly-count` | `PrescriptionController.kt:34` (01:25, 01:163) | `PrescriptionMonthlyStatsService.monthlyCount` (02:196) | `PrescriptionRepository#countBySubmittedDateBetween` (03:28) **+ Caffeine `monthlyCountCache`** (06:305) | JWT만 |
| 4 | GET `/v1/prescriptions/monthly-total-amount` | `PrescriptionController.kt` (01:164) | `PrescriptionMonthlyStatsService.monthlyTotalAmount` (02:196) | `PrescriptionPartnerProductRepository#sumTotalAmountBySubmittedDateBetween` (03:30) **+ Caffeine `monthlyFeeCache`** (06:306) | JWT만 |
| 5 | GET `/v1/hospitals/opened/count` | `HospitalController.kt:26` (01:37, 01:327) | `HospitalService.countRecentlyOpened` (02:219) | `HospitalRepository#countOpenedBetween` (03:43) | JWT만 |
| 6 | GET `/v1/boards?boardType=...` | `BoardController.kt:32` (01:29, 01:234) | `BoardService.getBoards` (02:68, 02:78) | `BoardPostRepository#findAllWithStatistics` (03:75) + `BoardStatisticsRepository` (03:20) + `MemberBlockRepository` | JWT만 (BoardController 가드 없음 — 05:60) |

부수 효과:
- `PrescriptionService` 처방 저장/수정 후 `TransactionSynchronizationManager.registerSynchronization` + `@Async`로 `PrescriptionMonthlyStatsService.refreshByUserId` 호출 (02:105, 06:254). 캐시 stale 위험.
- `BoardService.getBoards`는 `MemberType=NONE` → ANONYMOUS 차단, MR_CSO_MATCHING은 `NONE`/`CSO` 본인 글만 (02:78, 02:407). 홈 탭에서는 CSO 권한 보유자만 도달 가능하지만 **컨트롤러 가드 부재로 직접 호출은 가능**.

## 3. DB 테이블

| 테이블 | 엔티티 | 출처 |
|---|---|---|
| `sales_agency_product_board` | `SalesAgencyProductBoard` (`SalesAgencyProductBoard.kt:6`, 1:1 EAGER+CASCADE → BoardPost) | 04:69, 04:214 |
| `board_post` + `board_statistics` | `BoardPost` ↔ `BoardStatistics` (mappedBy 1:1) | 04:60, 04:66, 04:211 |
| `banner` + `banner_file` | `Banner` (`BannerStatus`, `BannerScope`, `BannerPosition` enum) | 04:72, 04:111-113 |
| `prescription` + `prescription_partner` + `prescription_partner_product` | Prescription Aggregate (Root: Prescription, status PENDING→IN_PROGRESS→COMPLETED) | 04:40-42, 04:242 |
| `dealer` → `member` | `prescription.registeredDealer.owner.userId` 경로 (탈퇴 회원 deleted 미체크 — 의도적) | 04:164, backend §6-C 주의 |
| `hospital` (SEQUENCE seq_hospital, alloc=50) | `Hospital` | 04:58 |
| `settlement_member_monthly` | `SettlementMemberMonthly` — **홈에서는 미사용**, 정산 화면 전용 (참고용) | 04:48, 04:187, 04:250 |

핵심 JOIN (당월 처방 통계, 4-way, `userId`로 회원 필터):
```sql
SELECT COUNT(pp.id), COALESCE(SUM(ppp.total_price), 0)
FROM prescription_partner pp
JOIN prescription            p   ON p.id  = pp.prescription_id
JOIN dealer                  rd  ON rd.id = p.registered_dealer_id
JOIN member                  m   ON m.id  = rd.owner_id
LEFT JOIN prescription_partner_product ppp ON ppp.prescription_partner_id = pp.id
WHERE p.submitted_date BETWEEN :startInt AND :endInt   -- yyyyMMdd 정수
  AND pp.deleted = false
  AND m.user_id  = :userId;
```

영업대행 상품 캐러셀 (overlap 기간, 회원유형 기반 노출범위):
```sql
SELECT p.id, p.product_name, bp.exposure_range, p.start_date, p.end_date,
       (SELECT COUNT(a.id) FROM sales_agency_product_application a
         WHERE a.product_board_id = p.id) AS applicant_count,
       tf.cloudfront_url AS thumbnail_url
FROM sales_agency_product_board p
JOIN board_post bp   ON bp.id = p.board_post_id
LEFT JOIN s3_file tf ON tf.id = p.thumbnail_s3_file_id
WHERE p.deleted = false
  AND p.end_date   >= :today AND p.start_date <= :today   -- overlap
  AND bp.is_exposed = true
  AND bp.exposure_range IN (:resolvedExposureRanges)       -- 서비스가 재계산
ORDER BY p.id DESC LIMIT 2147483647;                       -- size=2**31-1
```

## 4. 권한·트랜잭션

- **인증**: 6 종 모두 `@RequiredRole` 없음 (05:60, 05:154, 05:319). `WebSecurityConfig`에서 `/v1/banners`·`/v1/sales-agency-products`·`/v1/hospitals/**` 일부는 비로그인 호출 가능, `/v1/prescriptions/**`·`/v1/boards/**`는 `authenticated()`.
- **MemberType 분기 (05:407, 02:78)**:
  - `NONE` → 홈 진입은 가능하나 ANONYMOUS 게시글 0건, MR_CSO_MATCHING은 본인 글만.
  - `CSO` → 커뮤니티 섹션 노출 (`hasCsoMemberPermission`). 영업대행 상품의 `exposureRange` IN ('ALL','CONTRACTED'/'UNCONTRACTED')는 `partnerContractStatus`로 결정.
  - `INDIVIDUAL`/`ORGANIZATION` → 히어로 통계는 동일하게 노출, 커뮤니티 섹션 미노출.
- **트랜잭션**: 6 종 모두 read-only 조회. `PrescriptionMonthlyStatsService.refreshByUserId`는 `@Async`로 처방 커밋 후 실행 (02:105, 06:254) → 홈 진입 시 캐시 hit 확률을 높임.
- **캐시 무효화 권한**: `POST /v1/prescriptions/cache/evict` (01:169) — RBAC 없음, 누구나 전체 무효화 가능 (RISK).

## 5. 리스크 / 후속 액션

1. **캐시 fan-out 부정합** (06:301-306, backend §5-E): `PrescriptionMonthlyStatsService`가 Spring Cache 대신 필드 레벨 Caffeine 인스턴스 사용 → **다중 replica 환경에서 사용자별 값 불일치**. `expireAfterWrite=1일`이 stale 상한. Spring Cache + Redis로 이전, 또는 `refreshByUserId` 이벤트 누락 시 fallback 강제 evict 필요.
2. **`/v1/prescriptions/cache/evict` 무권한 무효화** (01:169, backend §5-E): `@RequiredRole` 부여 (`ADMIN_ONLY` 권장). 현 상태로는 일반 사용자가 캐시 plate를 한 번에 비워 N+1 유사 부하 유발 가능.
3. **첫 진입 N+1·풀스캔 위험** (backend §5-D, §6-B): FE가 `size=2**31-1`로 영업대행 상품·배너 전체 행 + count query 2 회 발행. 영업대행 상품 JPQL은 행마다 `applicantCount` 상관 서브쿼리 실행 — 행 수 증가 시 페이지 first paint 지연. 서버 측 `size` 상한 (예: 200) + `LEFT JOIN`/`GROUP BY`로 재작성.
4. **`exposureRanges` 파라미터가 무시됨** (backend §5-B): `SalesAgencyProductBoardController`가 받기는 하지만 서비스에 전달 안 함. FE 의도와 무관하게 `loginUser.role`+`memberType`로 재계산. **OpenAPI 스펙 정정 또는 구현 반영** 중 택일.
5. **MemberType 별 위젯 차이가 백엔드에 명시되지 않음**:
   - `NONE` 회원이 로그인한 경우 히어로 통계 3줄 모두 0 가능 (backend §5-G) → 빈 상태 UX 부재.
   - `CSO`가 아닌 INDIVIDUAL/ORGANIZATION이 `hasCsoMemberPermission` false면 커뮤니티 섹션이 안 보이는데, **API 호출 자체는 직접 가능** (BoardController 가드 부재, 02:78 ↔ 05:60). FE 분기에 의존.
6. **UTC 경계 폴백** (backend §5-C): `referenceDate` 미지정 시 서버는 `utcNow().toLocalDate()` → KST 00:00~09:00 구간에 전날 yyyyMMdd로 폴백. FE는 항상 명시 송신하므로 현재는 문제 없음, 그러나 다른 클라이언트 결합 시 위험.
7. **썸네일 NPE 가능성** (backend §5-I): `thumbnail_s3_file_id IS NULL` 행이 있으면 응답 `thumbnailUrl=null` → FE `product.thumbnailUrl!`(`!`) 런타임 에러. 현재 `catch` fallback에 잡혀 표면화 안 됨 → 정상 처리 코드 유실 위험.
8. **`AtomicReference` 캐시 의존성 (참고)** (06:310-312): 홈 자체는 `HospitalSidoCountCacheService`를 직접 사용하지 않으나, `HospitalRepository.findAllByDeletedFalse()`로 전량 로드하는 인접 캐시가 있어 병원 데이터 증가 시 OOM 위험.

## 6. 참조

- 프론트: `medipanda-web-test/docs/user/02_HOME.md`, `src/pages-user/Home.tsx`
- 백엔드: `medipanda-api/docs/user/02_HOME.md` (§2-1 ~ §6-D, §5-A ~ §5-J)
- 공유 계층: `docs/admin/08_COMMUNITY.md` (boards), `docs/admin/09_CONTENT_MANAGEMENT.md` (hospitals/opened/count), `docs/admin/11_BANNER.md` (banners), `docs/admin/05_PRESCRIPTION.md` (prescription aggregate)
- 인제스트 리포트: `reports/backend-ingestion-20260427/01-controllers.md` :25/29/34/36/37/163/229/282/302/327, `02-services.md` :68/89/196/219/302/306, `03-repositories.md` :16/20/28/30/38/41/43/75, `04-domain.md` :40-48/60-69/89/164/187/214, `05-security.md` :60/154/319, `06-config.md` :254/297/301-312
- JPQL→SQL 변환 규칙: `docs/JPQL_TO_SQL_GUIDE.md`

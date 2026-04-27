# 03-repositories.md — medipanda-api 영속성 계층 분석

**분석 일시:** 2026-04-27
**대상:** `/Users/jmk0629/keymedi/medipanda-api`
**ORM:** Spring Data JPA (Hibernate) / QueryDSL 미사용 / Specification 미사용
**DB:** PostgreSQL (AWS RDS — prod: `medipanda.cp6gkgc82mif.ap-northeast-2.rds.amazonaws.com/medipanda`)
**Hibernate Batch:** `batch_size=1000`, `order_inserts=true`, `order_updates=true`

---

## 1. JPA Repository 인터페이스 전수

| # | 인터페이스 | 대상 엔티티 | 주요 파생 쿼리 메서드 | @Query 수 | @Modifying 수 |
|---|---|---|---|---|---|
| 1 | MemberRepository | Member | findFirstByPhoneNumberAndDeletedFalse, existsByReferralCode, existsByNickname, findByReferralCode, findAllByUserIdIn, existsByRoleIn | 12 | 6 |
| 2 | BoardPostRepository | BoardPost | (없음) | 5 | 2 |
| 3 | BoardCommentRepository | BoardComment | (없음) | 4 | 3 |
| 4 | BoardCommentLikeRepository | BoardCommentLike | findByMemberUserIdAndCommentId, findAllByCommentIdIn, existsByMemberUserIdAndCommentId | 0 | 0 |
| 5 | BoardPostLikeRepository | BoardPostLike | findByMemberUserIdAndBoardPostId | 0 | 0 |
| 6 | BoardStatisticsRepository | BoardStatistics | (없음) | 6 (전부 nativeQuery) | 6 |
| 7 | BoardPostViewRepository | BoardPostView | (없음) | 4 (3 nativeQuery) | 3 |
| 8 | BoardPostFileRepository | BoardPostFile | (파일명 미조회) | 0 | 0 |
| 9 | BoardNoticeRepository | BoardNotice | findByBoardPostId | 0 | 0 |
| 10 | ReportRepository | Report | findReportsByPostId | 2 (1 native UNION ALL) | 0 |
| 11 | PartnerRepository | Partner | findAllByCompanyNameIn, findByCompanyName, findByOwnerIdAndDrugCompanyIdInAndDeletedFalse, existsByOwnerIdAndDrugCompanyIdAndInstitutionCodeAndDeletedFalse | 7 | 0 |
| 12 | PartnerContractRepository | PartnerContract | existsByMember, findByMemberId | 2 (1 native) | 0 |
| 13 | DealerRepository | Dealer | existsByOwnerIdAndDealerName | 3 | 0 |
| 14 | PrescriptionRepository | Prescription | (없음) | 4 (1 native) | 0 |
| 15 | PrescriptionPartnerRepository | PrescriptionPartner | findAllByPrescriptionId, findOwnerUserIdByPartnerId | 5 | 0 |
| 16 | PrescriptionPartnerProductRepository | PrescriptionPartnerProduct | (없음) | 1 (파생 쿼리 없음) | 0 |
| 17 | PrescriptionEdiFileRepository | PrescriptionEdiFile | (없음) | 4 (2 JOIN FETCH, 1 native) | 1 |
| 18 | ProductRepository | Product | findByKdCode, findByNhiGenericCode, findByKdCodeIn | 5 (2 native 포함) | 2 |
| 19 | ProductExtraInfoRepository | ProductExtraInfo | (미조회) | 0 | 0 |
| 20 | SettlementRepository | Settlement | (없음) | 5 | 0 |
| 21 | SettlementPartnerRepository | SettlementPartner | (없음) | 2 | 0 |
| 22 | SettlementPartnerProductRepository | SettlementPartnerProduct | (없음) | 2 (1 JOIN FETCH) | 0 |
| 23 | SettlementMemberMonthlyRepository | SettlementMemberMonthly | findByMemberIdAndDrugCompanyIdAndSettlementMonth | 4 | 0 |
| 24 | BannerRepository | Banner | (없음) | 1 | 0 |
| 25 | BannerFileRepository | BannerFile | (미조회) | 0 | 0 |
| 26 | EventBoardRepository | EventBoard | (없음) | 1 | 0 |
| 27 | SalesAgencyProductBoardRepository | SalesAgencyProductBoard | (없음) | 1 | 0 |
| 28 | SalesAgencyProductApplicationRepository | SalesAgencyProductApplication | findAllByMemberInAndProductBoard, existsByMemberAndProductBoard | 2 | 1 |
| 29 | HospitalRepository | Hospital | findAllByDeletedFalse | 2 (1 native) | 0 |
| 30 | MemberBlockRepository | MemberBlock | (없음) | 5 (전부 native) | 1 |
| 31 | MemberDeviceRepository | MemberDevice | findAllByMemberIdAndDeletedFalse, findTopByMemberAndFcmTokenOrderByModifiedAtDesc, findByDeviceUuid | 2 | 1 |
| 32 | MemberFileRepository | MemberFile | (미조회) | 0 | 0 |
| 33 | MemberPushPreferenceRepository | MemberPushPreference | findByMemberId, existsByMemberId | 0 | 0 |
| 34 | AdminPermissionMappingRepository | AdminPermissionMapping | findAllByMember | 1 (native) | 0 |
| 35 | S3FileRepository | S3File | findAllByMd5HashInAndDeletedFalse | 2 (1 native) | 2 |
| 36 | NotificationTemplateRepository | NotificationTemplate | (미조회) | 0 | 0 |
| 37 | KmcAuthSessionRepository | KmcAuthSession | findByCertNum | 0 | 0 |
| 38 | RegionCategoryRepository | RegionCategory | (미조회) | 0 | 0 |
| 39 | DrugCompanyRepository | DrugCompany | (미조회) | 0 | 0 |
| 40 | DealerDrugCompanyRepository | DealerDrugCompany | (미조회) | 0 | 0 |
| 41 | PartnerPharmacyRepository | PartnerPharmacy | (미조회) | 0 | 0 |
| 42 | PartnerContractApprovalHistoryRepository | PartnerContractApprovalHistory | (미조회) | 0 | 0 |
| 43 | PartnerContractFileRepository | PartnerContractFile | (미조회) | 0 | 0 |
| 44 | PrescriptionPartnerProductOcrRepository | PrescriptionPartnerProductOcr | (미조회) | 0 | 0 |
| 45 | TermsRepository | Terms | (미조회) | 0 | 0 |
| 46 | ExpenseReportRepository | ExpenseReport | (날짜 분기 4종) | 4 | 0 |
| 47 | BoardPostViewRepository (중복 표기) | BoardPostView | (파생 없음) | 4 | 3 |

**총 Repository 수: 47**
QueryDSL 없음. JpaSpecificationExecutor 없음. 커스텀 레포지토리 구현체(Impl) 없음.

---

## 2. @Query JPQL/Native SQL 패턴

### 2-1. 복잡 JPQL (생성자 프로젝션 + 다중 조인)

| 메서드 | 파일 | 특징 |
|---|---|---|
| `getUserMembers` | `MemberRepository.kt:22` | 8개 동적 LIKE + EXISTS 서브쿼리(MemberFile 유무) + LEFT JOIN PartnerContract. LOWER(CONCAT) LIKE 패턴 다수 → 풀스캔 위험 |
| `findAllWithStatistics` | `BoardPostRepository.kt:35` | 22개 파라미터 동적 쿼리. SELECT절 내 스칼라 서브쿼리 2개(child 존재여부, bv.id). NOT EXISTS(MemberBlock) 2개 |
| `findAllFixedTopNotices` | `BoardPostRepository.kt:158` | Pageable 없이 `List<BoardPostResponse>` 반환. `ORDER BY bp.id DESC` 하드코딩 |
| `findExpenseReports*` (4종) | `ExpenseReportRepository.kt:18~271` | 날짜범위 유무에 따라 메서드를 4개로 분기. 로직 중복 심각. LEFT JOIN 3개(sp, bs, bm) |
| `searchPrescriptionPartnerList` | `PrescriptionPartnerRepository.kt:91` | 10개 동적 필터. `pr.registeredDealer.owner.userId` — 3단계 경로 탐색이 WHERE절에 노출 |
| `search` / `searchAll` | `SettlementMemberMonthlyRepository.kt:21` | SELECT절 내 상관 서브쿼리 2개(prescriptionAmount, feeAmount 각각). 행수 × 2회 추가 쿼리 실행 위험 |
| `getPerformanceStats` | `SettlementRepository.kt:51` | 7개 LIKE 동적 필터 + GROUP BY 8컬럼 + SUM 집계 |

### 2-2. Native SQL (nativeQuery = true)

| 메서드 | 파일:라인 | 비고 |
|---|---|---|
| `findFullRowsByMemberIdAndPrescriptionMonths` | `PrescriptionRepository.kt:17` | 6 JOIN 대형 쿼리. `IN (:prescriptionMonths)` |
| `findBoardMemberStats` | `BoardPostRepository.kt:321` | GROUP BY + DISTINCT COUNT. Pageable 적용 |
| `findBlindPosts` | `ReportRepository.kt:23` | `UNION ALL` (board_post + board_comment) + 별도 countQuery. PostgreSQL ILIKE 사용 |
| `findProductSummaries` | `ProductRepository.kt:167` | `WITH filtered_e AS (ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY id DESC))` — 윈도우 함수 사용. 별도 countQuery 있음 |
| `upsert` (Product) | `ProductRepository.kt:25` | `ON CONFLICT (kd_code) DO UPDATE` — PostgreSQL UPSERT. `Propagation.REQUIRES_NEW` |
| `insertIfAbsentInit` | `BoardStatisticsRepository.kt:14` | `ON CONFLICT (board_post_id) DO NOTHING` |
| `countActiveInSubtree` / `softDeleteSubtree` | `BoardCommentRepository.kt:38,67` | `WITH RECURSIVE subtree` — 재귀 CTE |
| `softDeleteByPrescriptionPartnerId` | `PrescriptionEdiFileRepository.kt:71` | `UPDATE s3_file FROM prescription_edi_file` — PostgreSQL FROM 절 UPDATE |
| `findLatestByMemberId` | `PartnerContractRepository.kt:15` | `ORDER BY contract_date DESC, id DESC LIMIT 1` |
| `findByConditions` (Hospital) | `HospitalRepository.kt:18` | `ILIKE`, `CAST(:startDate AS date)` |

### 2-3. JOIN FETCH 사용 지점

| 메서드 | 파일:라인 | 페치 대상 |
|---|---|---|
| `findTopCommentsByBoardPostId` | `BoardCommentRepository.kt:22` | `JOIN FETCH c.member` |
| `findRepliesByParentIds` | `BoardCommentRepository.kt:91` | `JOIN FETCH r.member` |
| `findAllActiveByPrescriptionId` | `PrescriptionEdiFileRepository.kt:14` | `JOIN FETCH pef.s3File` |
| `findAllActiveByPrescriptionIds` | `PrescriptionEdiFileRepository.kt:27` | `JOIN FETCH pef.s3File, pef.prescriptionPartner, pp.prescription, p.registeredDealer, rd.owner, pp.partner` (6개 JOIN FETCH) |
| `findAllByFilter` (SettlementPartnerProduct) | `SettlementPartnerProductRepository.kt:13` | `JOIN FETCH spp.settlementPartner sp → sp.dealer, sp.settlement, s.drugCompany, spp.product, s.dealer, sd.owner` |

---

## 3. QueryDSL / Specification 사용 여부

**QueryDSL: 미사용.** `*RepositoryCustom`, `*RepositoryImpl`, `QueryDslRepositorySupport` 상속 없음.
**JpaSpecificationExecutor: 미사용.**
동적 쿼리는 전부 `@Query` JPQL 또는 Native SQL에 다중 `:param IS NULL OR ...` 조건으로 구현.

---

## 4. N+1 위험 의심 지점 Top 10

| 순위 | 위치 | 이유 | 파일:라인 |
|---|---|---|---|
| 1 | `SettlementService.notifyAdminForObjections` | `settlementRepository.findAllById(ids)` 후 for 루프에서 `s.dealer.id`를 참조해 `dealerRepository.findById(s.dealer.id)` 를 호출. Settlement N개 → Dealer 조회 N회 | `SettlementService.kt:50~53` |
| 2 | `SettlementService.notifyAdminForSettlements` | 동일 패턴. `settlements.forEach { settlement -> dealerRepository.findById(settlement.dealer.id) }` | `SettlementService.kt:76~81` |
| 3 | `SettlementService.buildWorkbookBytes` | `findAllByFilter`로 `SettlementPartnerProduct` 리스트를 받고 루프에서 `spp.settlementPartner.settlement.drugCompany.name`, `spp.settlementPartner.dealer.dealerName`, `spp.settlementPartner.partner.institutionCode` 접근. `findAllByFilter`가 JOIN FETCH로 연관 선로딩하므로 안전하지만, `spp.product.productName`이 LAZY일 경우 N+1 가능 | `SettlementService.kt:218~223` |
| 4 | `PrescriptionService.buildEdiZipFileName` | `findAllActiveByPrescriptionId`는 `pef.s3File`만 JOIN FETCH. 이후 `ediFiles[0].prescriptionPartner.dealer.dealerName`, `ediFiles[0].prescriptionPartner.partner.drugCompany.name` 접근 시 PrescriptionPartner → Dealer, Partner → DrugCompany 순으로 추가 쿼리 발생(의심) | `PrescriptionService.kt:127~129` |
| 5 | `PrescriptionService.createBulkEdiZipFile` — 루프 내 LAZY 체인 접근 | `findAllActiveByPrescriptionIds`는 6개 JOIN FETCH로 선로딩하므로 안전. 단, `partner.drugCompany`가 `FetchType.EAGER`이므로 Partner 조회 시 DrugCompany 항상 추가 조회됨. prescriptionIds가 수십 건이면 쿼리 수가 급증할 수 있음 | `PrescriptionService.kt:143~155` |
| 6 | `PartnerService` — existingPartners 연산 | `findByOwnerIdAndDrugCompanyIdInAndDeletedFalse` 결과를 `.associateBy { "${it.drugCompany.id}_${it.institutionCode}" }`로 맵 구성. Partner.drugCompany가 `FetchType.EAGER`이므로 Partner 건수만큼 DrugCompany 즉시 로드됨 | `PartnerService.kt:308` |
| 7 | `BoardService` — 댓글 목록 루프 내 `c.member.id` 접근 | `findTopCommentsByBoardPostId`, `findRepliesByParentIds` 모두 `JOIN FETCH member`를 포함하므로 이 지점은 안전하나, `it.member.userId`를 `toDto()`에서 접근할 때 `BoardComment.boardPost`가 LAZY이고 미로딩 상태라면 댓글 수 N회 쿼리 발생 가능(의심) | `BoardService.kt:783~799` |
| 8 | `SettlementMemberMonthlyRepository.search` — 페이지 행당 상관 서브쿼리 2개 | SELECT절 내 `COALESCE((SELECT SUM... WHERE s2.dealer.member.id = m.id ...))` 패턴 2개. 결과 행 수 N × 서브쿼리 2회 실행 = 2N 추가 조회 | `SettlementMemberMonthlyRepository.kt:30~48` |
| 9 | `BoardStatistics` — 기본 EAGER 전략 | `BoardStatistics.boardPost`가 `@OneToOne` 어노테이션에 `fetch` 미지정 → Hibernate 기본값 EAGER. BoardStatistics 목록 조회 시 BoardPost를 항상 로드 | `BoardStatistics.kt:17` |
| 10 | `Member.memberFiles` — LAZY지만 `toDetailsDto()` 내부 직접 접근 | `toDetailsDto()`에서 `this.memberFiles.firstOrNull { ... }` 호출. Member 엔티티를 단순 조회 후 이 메서드를 호출하면 memberFiles 컬렉션을 별도 쿼리로 로드 | `Member.kt:112` |

---

## 5. 인덱스 부족 의심 컬럼 Top 10

| 순위 | 테이블.컬럼 | 사용 쿼리/위치 | 현재 인덱스 | 권장 |
|---|---|---|---|---|
| 1 | `member.phone_number` | `findFirstByPhoneNumberAndDeletedFalse`, `MemberRepository.kt:135` + getUserMembers LIKE 필터 | 없음 | `idx__member__phone_number` (동등 검색 多) |
| 2 | `member.lower(user_id)` | `findAllWithStatistics`에서 `LOWER(m.userId) LIKE ...`, BoardPost 조회 다수 | `idx__member__user_id`(대소문자 구분) | `CREATE INDEX ON member (LOWER(user_id))` (코드 주석에 이미 언급: `BoardPost.kt:80`) |
| 3 | `board_post.deleted` | 거의 모든 board_post 쿼리에 `bp.deleted = false` 조건 | 없음 | `idx__board_post__deleted` 또는 부분인덱스 `WHERE deleted = false` |
| 4 | `board_post.is_exposed` | `findAllWithStatistics`, `findAllFixedTopNotices` | 없음 | `idx__board_post__is_exposed` |
| 5 | `partner.institution_name` | `searchPartners` LIKE, `SettlementPartnerRepository` LIKE, `PrescriptionPartnerRepository` LIKE | 없음(코드 주석에 한국어 collation 인덱스 언급: `SettlementPartnerRepository.kt:90`) | `CREATE INDEX idx__partner__institution_name ON partner(institution_name)` 또는 pg_trgm GIN |
| 6 | `prescription.prescription_month` | `findFullRowsByMemberIdAndPrescriptionMonths` IN 조건, `findPartnerUserIdsMissingPrescriptionOfMonth` | 없음 | `idx__prescription__prescription_month` |
| 7 | `prescription.submitted_date` | `searchPrescriptionResponses` 날짜 범위 필터, `countBySubmittedDateBetween` | 없음 | `idx__prescription__submitted_date` |
| 8 | `settlement.settlement_month` | `searchSettlements`, `getPerformanceStats` BETWEEN 필터, `SettlementMemberMonthlyRepository` | 없음 | `idx__settlement__settlement_month` |
| 9 | `board_comment.is_blind` | `findTopCommentsByBoardPostId`, `findRepliesByParentIds` WHERE 조건 | 없음 | `idx__board_comment__is_blind` (선택도 낮으면 부분인덱스) |
| 10 | `product.deleted` | `findProductSummaries`, `findAllAlternativeProducts`, `findAllWithLatestExtraInfo` | 없음 | `idx__product__deleted` 또는 부분인덱스 `WHERE deleted = false` |

**비고:** `product_extra_info.composition`, `product.composition`에 대한 GIN(pg_trgm) 인덱스가 코드 주석에 명시되어 있으나(`ProductExtraInfo.kt:96`), 실제 DDL에 반영되었는지 확인 필요.

---

## 6. Soft-delete / Audit 컬럼 패턴

### 6-1. Soft-delete 패턴

전체 코드베이스에서 `deleted: Boolean = false` 컬럼을 직접 관리하는 수동 soft-delete 방식을 사용. `@SQLDelete`, `@Where` 등 Hibernate 필터 어노테이션은 **미사용**.

| 엔티티 | soft-delete 컬럼 | 구현 방식 | 비고 |
|---|---|---|---|
| Member | `deleted: Boolean` | `@Modifying @Query UPDATE SET deleted=true` | `MemberRepository.softDeleteByUserId`, `markDeletedAndClearNicknameByUserId` |
| BoardPost | `deleted: Boolean` | `@Modifying @Query UPDATE SET deleted=true` | `softDeleteByPostId`, `softDeleteChildrenByParentId` |
| BoardComment | `deleted: Boolean` | `@Modifying @Query` + Native CTE(`softDeleteSubtree`) | 재귀 soft-delete |
| Partner | `deleted: Boolean` | `WHERE p.deleted = false` 쿼리에 직접 필터 | |
| EventBoard | `deleted: Boolean` | 쿼리 필터 | |
| SalesAgencyProductBoard | `deleted: Boolean` | 쿼리 필터 | |
| Hospital | `deleted: Boolean` | `findAllByDeletedFalse()` 파생 쿼리 | |
| PrescriptionPartner | `deleted: Boolean` | `WHERE pp.deleted = false` 필터 | |
| S3File | `deleted: Boolean` | `softDeleteByIds` (native), `softDeleteAllFilesByPostIdCascade` | |
| MemberDevice | `deleted: Boolean` | `softDeleteByFcmToken` | |
| Product | `deleted: Boolean` | `softDeleteById` | |
| ProductExtraInfo | `deleted: Boolean` | 쿼리 필터 | |

**문제점:** `@Where(clause = "deleted = false")` 미적용으로 인해 모든 쿼리에 `AND deleted = false` 조건을 수동으로 추가해야 함. 누락 시 삭제 데이터가 노출될 수 있음. `MemberRepository.findAllAdmins`는 `deleted = false` 적용, `findAllByUserIdIn`은 `deleted` 필터 없음(의심).

### 6-2. Audit 컬럼 패턴

| 패턴 | 구현 위치 | 대상 |
|---|---|---|
| `BaseEntity` (`createdAt`, `modifiedAt`) | `BaseEntity.kt` — `@MappedSuperclass`, `@EntityListeners(AuditingEntityListener)`, `@CreatedDate`, `@LastModifiedDate` | Member, BoardPost, BoardComment, Partner, Prescription, Settlement, ExpenseReport, Hospital, PartnerContract 등 대부분의 엔티티 |
| 독립 Audit (BaseEntity 미상속) | `SettlementMemberMonthly.kt:24` | `@EntityListeners(AuditingEntityListener)` + `@CreatedDate`/`@LastModifiedDate` 직접 선언 — BaseEntity를 상속하지 않고 개별 구현 |
| PrescriptionPartner | `PrescriptionPartner.kt` | `BaseEntity` 미상속, `createdAt`/`modifiedAt` 컬럼 없음. 이력 추적 불가 |
| SettlementPartner | `SettlementPartner.kt` | `BaseEntity` 미상속. 이력 추적 불가 |
| SettlementPartnerProduct | `SettlementPartnerProduct.kt` | `BaseEntity` 미상속. 이력 추적 불가 |

**lastLoginDate:** Member에 별도 `lastLoginDate: LocalDateTime` 컬럼 존재. `@Modifying`으로 직접 UPDATE (`updateRefreshTokenAndLastLoginDateByUserId`).
**blindedDate:** BoardPost, BoardComment에 `blindedDate: LocalDateTime?` 컬럼 존재. 블라인드 처리 시점 기록용.

---

## 보완 권장 사항 (요약)

1. `Partner.owner` / `Partner.drugCompany` 가 `FetchType.EAGER` — Partner 전체 조회 시 항상 Member, DrugCompany 즉시 로드됨. LAZY로 변경 후 필요 지점에 JOIN FETCH 추가 권장. (`Partner.kt:24,32`)
2. `SettlementService.notifyAdminForObjections/Settlements` 루프 내 `dealerRepository.findById` — `findAllById`로 일괄 조회 후 Map으로 접근하는 방식으로 교체 필요.
3. `SettlementMemberMonthlyRepository.search/searchAll` — SELECT절 상관 서브쿼리 2개 대신 LEFT JOIN + GROUP BY로 리팩터링 필요. (`SettlementMemberMonthlyRepository.kt:30~48`)
4. `findAllWithStatistics`(BoardPostRepository) 내 스칼라 서브쿼리 2개 — 대용량 게시판 환경에서 페이지당 row × 2회 추가 실행.
5. `ExpenseReportRepository` — 날짜 조건 유무에 따른 메서드 4중 분기를 QueryDSL 동적 쿼리로 통합하면 유지보수성 개선.
6. `HospitalRepository.findAllByDeletedFalse()` → `List<Hospital>` 반환. 병원 전체 건수가 많아질 경우 OOM 위험. 현재 `HospitalSidoCountCacheService`가 캐시 목적으로 전량 로드. 캐시 주기/크기 모니터링 필요.
7. `BoardStatistics.boardPost` `@OneToOne` fetch 미지정 → EAGER 기본값. `fetch = FetchType.LAZY` 명시 권장.
8. `PrescriptionPartner`, `SettlementPartner`, `SettlementPartnerProduct`에 `BaseEntity`(createdAt/modifiedAt) 없음 — 금융/처방 핵심 데이터 이력 추적 부재.

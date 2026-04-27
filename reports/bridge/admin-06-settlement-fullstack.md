# admin-06 정산 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs `medipanda-web-test/docs/admin/06_SETTLEMENT_MANAGEMENT.md` / 백엔드 docs `medipanda-api/docs/admin/06_SETTLEMENT_MANAGEMENT.md` / ingest 6종 (`reports/backend-ingestion-20260427/`)

## 1. 화면 요약

세 개 하위 메뉴 + 2단계 드릴다운으로 구성. 핵심 페이지 4종(`MpAdminSettlementMemberMonthlyList.tsx`, `MpAdminSettlementList.tsx`, `MpAdminSettlementDetail.tsx`, `MpAdminSettlementPartnerDetail.tsx`) + 통계(`MpAdminStatisticsList.tsx`) + Excel 업로드 모달(`MpSettlementUploadModal.tsx`).

- **추가수수료 금액** (`/admin/settlements-member-monthly`) — 인라인 편집 + lodash debounce 500ms 자동저장 (frontend doc:84-112).
- **정산내역** (`/admin/settlements`) — 목록·총처방금액·Excel 업로드/다운로드. 딜러명 클릭 → `/admin/settlements/:settlementId`.
- **정산상세 (드릴다운 1)** — 거래처 요약, **state 페이지네이션** (frontend doc:282-321).
- **거래처별 제품상세 (드릴다운 2)** — `/admin/settlements/:settlementId/partners/:settlementPartnerId`. `Promise.all` 병렬 로드 3개 API.
- **실적통계** (`/admin/settlement-statistics`) — `getSettlementsTotal`을 정산내역과 공유.
- 프런트 doc는 `/v1/settlements/{id}/partner-summary`, `/v1/settlement-partners/{id}` 등으로 표기하나 **실제 백엔드는 `/v1/settlements/partners`, `/v1/settlements/partners/{spId}`** (backend doc:9, 693). backend.ts 자동생성에서 흡수되어 화면은 정상 동작.

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 | Controller | Service | Repository | 비고 |
|---|------|------|------------|------------|---------|------------|------|
| 1 | GET | `/v1/settlements-member-monthly` | `getSettlementsMemberMonthly` (로컬 axios, frontend doc:164-178) | `SettlementMemberMonthlyController.kt:23` (01-controllers.md:204) | `SettlementMemberMonthlyService` (02-services.md:207, 클래스레벨 readOnly) | `SettlementMemberMonthlyRepository.search` (03-repositories.md:79) | 페이지 행당 SELECT절 상관 서브쿼리 2개 → N×2 추가 쿼리 (RISK) |
| 2 | PUT | `/v1/settlements-member-monthly/{id}` | `updateSettlementMemberMonthly` (로컬 axios, frontend doc:180-190) | `SettlementMemberMonthlyController.kt:43` (01-controllers.md:205) | `SettlementMemberMonthlyService.update` | `SettlementMemberMonthlyRepository` | `supplyAmount = totalFee/1.1` 부가세 역산, 정수 truncation (02-services.md:213, 419) |
| 3 | GET | `/v1/settlements-member-monthly/excel-download` | href 직접 (frontend doc:237) | `SettlementMemberMonthlyController.kt:51` (01-controllers.md:206) | `SettlementMemberMonthlyService` | `SettlementMemberMonthlyRepository.searchAll` | RBAC 없음 (05-security.md:62 참조) |
| 4 | GET | `/v1/settlements` | `getSettlements` (`@/backend`) | `SettlementController.kt:145` (01-controllers.md:180) | `SettlementService.search*` (02-services.md:113-127) | `SettlementRepository.searchSettlements:164` (backend doc:153) | JPQL `JOIN PartnerContract pc ON pc.member = dm` → 1:N 행 폭증(6-B) |
| 5 | GET | `/v1/settlements/total-prescription-amount` (프런트는 `/total`로 호출) | `getSettlementsTotal` | `SettlementController.kt:172` (01-controllers.md:181) | `SettlementService` | `SettlementPartnerProductRepository` (backend doc:205-214) | 정산내역·실적통계 양쪽 공유 (frontend doc:1546) |
| 6 | GET | `/v1/settlements/excel-download` | `getDownloadSettlementListExcel` | `SettlementController.kt:311` (01-controllers.md:183) | `SettlementService.buildWorkbookBytes` (02-services.md, 03-repositories.md:123) | `SettlementPartnerProductRepository.findAllByFilter` (8개 JOIN FETCH, 03-repositories.md:105) | **`@RequiredRole(ADMIN_ONLY, SETTLEMENT_MANAGEMENT)`** (05-security.md:157) |
| 7 | POST | `/v1/settlements/upload` | `uploadSettlementExcel` (frontend doc:1301) | `SettlementController.kt:238` (01-controllers.md:195) | `SettlementService.uploadSettlementExcel` (02-services.md:119, REQUIRED) | `Settlement/SettlementPartner/SettlementPartnerProduct + Dealer/Partner/Product/DrugCompany Repos` (02-services.md:125) | 누락 시 `IllegalStateException` |
| 8 | GET | `/v1/settlements/partners` (프런트 표기 `/v1/settlements/{id}/partner-summary`) | `getSettlementPartnerSummary` | `SettlementController.getSettlementPartnerSummary:207` (backend doc:25, 1009) | `SettlementService.getSettlementPartnerSummary:503` | `SettlementPartnerRepository` (03-repositories.md:35) | 경로 표기 drift (backend doc:693) |
| 9 | GET | `/v1/settlements/partners/{spId}` (프런트 `/v1/settlement-partners/{id}`) | `getSettlementPartner` | `SettlementController.getSettlementPartner:232` (backend doc:26, 1066) | `SettlementService.getSettlementPartner:513` | `SettlementPartnerRepository` | 경로 drift |
| 10 | GET | `/v1/settlements/partners/{spId}/products` (프런트 `/v1/settlement-partners/{id}/products`) | `getSettlementPartnerProducts` | `SettlementController.getSettlementPartnerProducts:139` (backend doc:27, 1143) | `SettlementService.getSettlementPartnerProducts:493` | `SettlementPartnerProductRepository.findAllByFilter` (JOIN FETCH 8개) | PartnerDetail에서 `Promise.all`로 #11+#9+#10 병렬 호출 (frontend doc:977-979) |
| 11 | GET | `/v1/settlements/{id}` | `getSettlement` | `SettlementController.kt:197` (01-controllers.md:182) | `SettlementService` | `SettlementRepository` | — |
| 12 | GET | `/v1/settlements/partners/excel-download` (프런트 `/v1/settlements/{id}/partner-summary/excel`) | `getDownloadSettlementPartnerSummaryExcel` | `SettlementController.downloadSettlementPartnerSummaryExcel:374` (backend doc:31) | `SettlementService.buildWorkbookBytes` | `SettlementPartnerProductRepository.findAllByFilter` | **`ADMIN_ONLY/SETTLEMENT_MANAGEMENT`** (05-security.md:157) |
| 13 | GET | `/v1/settlements/performance` (프런트 표기 `/v1/performance-stats`) | `getPerformanceStats` (frontend doc:1103, 1174) | `SettlementController.kt:64` (01-controllers.md:189) | `SettlementService.getStatsByDrugCompany` (02-services.md:122) | `SettlementRepository.getPerformanceStats:51` (03-repositories.md:80) | 7 LIKE + GROUP BY 8컬럼 + SUM. `SettlementMemberMonthly.extraFeeAmount` 합산 |
| 14 | GET | `/v1/settlements/performance/excel-download` (프런트 `/v1/performance-stats/excel`) | Excel href | `SettlementController.kt:279` (01-controllers.md:194) | `SettlementService` | `SettlementRepository` | RBAC 미부착 |
| 15 | POST | `/v1/settlements/notify-admin` | (운영용, 프런트 미사용) | `SettlementController.kt:358` (01-controllers.md:197) | `SettlementService.notifyAdminForSettlements` (02-services.md:120, REQUIRED) | `SettlementRepository.findAllById` + `DealerRepository.findById` (03-repositories.md:122 N+1) | `NotificationEmailEvent(SETTLEMENT_REQUESTED)` |
| 16 | POST | `/v1/settlements/notify-admin/objections` | (운영용, 프런트 미사용) | `SettlementController.kt:348` (01-controllers.md:196) | `SettlementService.notifyAdminForObjections` (02-services.md:121, **@Transactional 누락**) | `SettlementRepository.findAllById` + `DealerRepository.findById` 루프 (03-repositories.md:121 N+1) | `NotificationEmailEvent(OBJECTION_SUBMITTED)` — §5 [RISK-1] |

> 추정: 화면 표기와 실서버 경로의 drift는 backend.ts 자동 생성이 정규화하여 처리 — 화면 함수명은 정규 경로 기준. 근거: backend doc:9, 693.

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|---|---|---|---|
| `settlement` | 정산 헤더 (딜러×제약사×월) | `dealer_id`, `drug_company_id` | `BaseEntity` 상속, `settlementMonth` Int (04-domain.md:45, 180-181) |
| `settlement_partner` | 정산 거래처 라인 | `settlement_id`, `partner_id`, `dealer_id` | **`BaseEntity` 미상속** (04-domain.md:46, 183) |
| `settlement_partner_product` | 정산 제품 라인 (금액·수수료) | `settlement_partner_id`, `product_id` | **`BaseEntity` 미상속**, `unitPrice`/`feeAmount` Long (04-domain.md:47, 184, 410) |
| `settlement_member_monthly` | 회원-제약사-월 추가수수료 | `member_id`, `drug_company_id` | 독립 Aggregate, `BaseEntity` 미상속·개별 Audit (04-domain.md:48, 181, 250) |
| `partner_contract` | 정산 JOIN의 `companyName` 출처 | `member_id` | 1:N 행 폭증 원인 (backend doc:72, 158) |
| `dealer`, `member`, `drug_company`, `partner`, `product` | 외래 참조 | — | Settlement Aggregate 외부 |

핵심 JOIN (백엔드 docs 인용, `searchSettlements` JPQL — backend doc:165-186):

```sql
SELECT ...
FROM settlement s
JOIN dealer d            ON d.id  = s.dealer_id
JOIN member dm           ON dm.id = d.member_id
JOIN partner_contract pc ON pc.member_id = dm.id
JOIN drug_company dc     ON dc.id = s.drug_company_id
JOIN settlement_partner         sp  ON sp.settlement_id         = s.id
JOIN settlement_partner_product spp ON spp.settlement_partner_id = sp.id
```

추가 인용 — `SettlementMemberMonthlyRepository.search`의 SELECT절 상관 서브쿼리 (backend doc:83-116):

```sql
SELECT
  smm.*,
  COALESCE((SELECT SUM(spp2.prescription_amount)
              FROM settlement s2
              JOIN settlement_partner sp2 ON sp2.settlement_id = s2.id
              JOIN settlement_partner_product spp2 ON spp2.settlement_partner_id = sp2.id
              JOIN dealer d2 ON d2.id = s2.dealer_id
             WHERE d2.member_id = m.id AND s2.settlement_month = smm.settlement_month), 0) AS prescription_amount,
  COALESCE((SELECT SUM(spp3.fee_amount + COALESCE(spp3.extra_fee_amount,0))
              FROM settlement s3 ...), 0) AS fee_amount
FROM settlement_member_monthly smm
JOIN member m            ON m.id  = smm.member_id
JOIN drug_company dc     ON dc.id = smm.drug_company_id
LEFT JOIN partner_contract pc ON pc.member_id = m.id
```

## 4. 권한·트랜잭션

- **RBAC 부분 적용**: SettlementController의 RBAC는 `excel-download`, `partners/excel-download` **두 엔드포인트만 `ADMIN_ONLY/SETTLEMENT_MANAGEMENT`**. 나머지 14개 엔드포인트(목록/상세/업로드/notify/통계 포함)는 JWT 인증만으로 접근 가능 (05-security.md:62, 157). 정산내역 조회·**Excel 업로드**·notify 호출에 권한 게이트 부재 → 권한 누락 RISK.
- **트랜잭션**:
  - `SettlementMemberMonthlyService` 클래스레벨 `@Transactional(readOnly = true)` — 조회 일관성 OK (02-services.md:12).
  - `uploadSettlementExcel` REQUIRED — 파싱·계층 저장 안전 (02-services.md:119).
  - `notifyAdminForSettlements` REQUIRED — 정상 (02-services.md:120).
  - `notifyAdminForObjections` **@Transactional 누락** — saveAll + 다중 이메일 이벤트가 단일 트랜잭션이 아님 (02-services.md:121, §5 인용).

## 5. 리스크 / 후속 액션

1. **[RISK-1, 트랜잭션] `SettlementService.notifyAdminForObjections` `@Transactional` 누락** — 02-services.md:382 인용:
   > `SettlementService.notifyAdminForObjections` — `@Transactional` 누락 상태에서 `settlementRepository.saveAll`과 다중 이메일 이벤트 발행 수행. 파일: `service/SettlementService.kt:47-71`. 이메일 발행 후 saveAll 실패 시 상태 롤백 불가, 이메일만 발송된 채로 상태 미변경 가능.
   액션: 클래스/메서드 레벨 `@Transactional` 추가, 이벤트 발행은 `PushEventAfterCommitListener` 패턴(트랜잭션 커밋 후 큐 투입, 06-config.md:274) 적용 검토.
2. **[N+1 Top1·2] `notifyAdminForObjections/Settlements` 루프 내 `dealerRepository.findById`** — `findAllById(ids)` 후 for 루프에서 dealer N회 조회 (03-repositories.md:121-122). `dealerRepository.findAllById` + Map으로 교체 (03-repositories.md:194).
3. **[N+1 #8] `SettlementMemberMonthlyRepository.search` SELECT절 상관 서브쿼리 2개** — 페이지 행당 2N 추가 쿼리 (03-repositories.md:128). LEFT JOIN + GROUP BY 리팩터링 권장.
4. **[권한 누락]** SettlementController 14/16 엔드포인트 RBAC 미적용 — 일반 회원 토큰만으로 정산 데이터 조회 및 **Excel 업로드** 가능 (05-security.md:157).
5. **[데이터 모델]** `SettlementPartner`, `SettlementPartnerProduct` BaseEntity 미상속 — 금융 데이터 createdAt/modifiedAt 부재, 이력 추적 불가 (04-domain.md:184, 312, 200).
6. **[정합성]** 화면 doc과 실제 경로 drift (`/partner-summary` vs `/partners`, `/settlement-partners` vs `/settlements/partners`, `/performance-stats` vs `/settlements/performance`) — 운영문서로 API 검색 시 미스매치 (backend doc:693).
7. **[부가세 역산]** `supplyAmount = totalFee / 1.1` 정수 truncation (02-services.md:419, `SettlementMemberMonthlyService.kt:71`) — 누계에서 라운딩 오차 누적 가능.
8. **외부 의존**: 06-config.md상 Settlement 전용 외부 연동은 **AWS SES 이메일** (`NotificationEmailEvent` → `emailEventQueue`, 06-config.md:264, 175). S3는 정산 도메인에서 직접 사용 없음, SMS/푸시 직접 트리거 없음(notify는 이메일 only). admin 발신: `info@knmedicine.com` (06-config.md:109).

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/06_SETTLEMENT_MANAGEMENT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/06_SETTLEMENT_MANAGEMENT.md`
- 프런트 페이지: `medipanda-web-test/src/pages-admin/MpAdminSettlementMemberMonthlyList.tsx`, `MpAdminSettlementList.tsx`, `MpAdminSettlementDetail.tsx`, `MpAdminSettlementPartnerDetail.tsx`
- Backend 코드: `medipanda-api/src/main/kotlin/.../web/v1/SettlementController.kt`, `SettlementMemberMonthlyController.kt`, `service/SettlementService.kt`, `service/SettlementMemberMonthlyService.kt`, `repository/SettlementRepository.kt`, `SettlementPartnerProductRepository.kt`, `SettlementMemberMonthlyRepository.kt`
- Ingest 산출물: `reports/backend-ingestion-20260427/01-controllers.md` (:175-206, :373), `02-services.md` (:111-127, :205-213, :361-362, :382-384), `03-repositories.md` (:34-37, :79-80, :105, :121-128, :194-195), `04-domain.md` (:45-48, :180-188, :247-250, :312, :409-410), `05-security.md` (:62, :157), `06-config.md` (:109, :175, :264, :274)

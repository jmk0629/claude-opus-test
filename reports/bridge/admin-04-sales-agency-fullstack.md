# admin-04 영업대행 상품 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`04_SALES_AGENCY_PRODUCT.md`) / 백엔드 docs(`04_SALES_AGENCY_PRODUCT.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427/`)

## 1. 화면 요약

- 페이지(2개):
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminSalesAgencyProductList.tsx` — 상품 목록 (`/admin/sales-agency-products`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminSalesAgencyProductEdit.tsx` — 신규/상세·편집 (`/admin/sales-agency-products/:id/edit?tab=info|applicants`, `/new`)
- 핵심 사용자 액션:
  1) 상품 목록 검색(상품명/위탁사, 게시기간 범위, 노출여부) + 다중 선택 삭제 + Excel 다운로드(현재 페이지)
  2) 상품 등록(InfoTab) — 게시글(`BoardPost`) + 상품(`SalesAgencyProduct`) + 썸네일을 **multipart 1회 호출**로 일괄 저장
  3) 상품 수정(InfoTab) — `keepFileIds` 로 본문 첨부/에디터 첨부 유지, 새 썸네일 교체 옵션
  4) **신청자(applicant) 흐름**(ApplicantsTab) — `?tab=applicants`로만 진입(신규 등록 시 비활성). 회원이 사용자 포털에서 `POST /v1/sales-agency-products/{id}/apply` 로 신청한 row 를 어드민이 조회/삭제(hard delete)/비고 수정(`onBlur` → 단건 PATCH)
- 권한 태그(프론트 기준): `CONTRACT_MANAGEMENT` / `PRODUCT_MANAGEMENT` (백엔드는 미적용 — §4 참조)
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/04_SALES_AGENCY_PRODUCT.md:38-51`, `/Users/jmk0629/keymedi/medipanda-api/docs/admin/04_SALES_AGENCY_PRODUCT.md:13-23`

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 백엔드 컨트롤러는 `kr.co.medipanda.portal.web.v1.SalesAgencyProductBoardController` 1개에 10 EP + 사용자 신청용 1 EP = 11 EP. 화면이 호출하는 admin 경로 10개 + 신청자 흐름 진입 1개를 함께 기재.

| # | HTTP | Path | 프론트 함수 (`backend.ts`) | Controller | Service | Repository | 비고 (출처) |
|---|------|------|---------------------------|-----------|---------|------------|-----|
| 1 | GET | `/v1/sales-agency-products` | `getSalesAgencyProducts` (`backend.ts:3926`) | `SalesAgencyProductBoardController#getSalesAgencyProducts:35` | `SalesAgencyProductBoardService#searchSalesAgencyProducts:230` | `SalesAgencyProductBoardRepository#searchSalesAgencyProductBoards:43` | List 필터+페이지. 컨트롤러 `exposureRanges` 파라미터는 service 에서 무시(`resolveExposureRanges` 가 덮어씀). 백엔드 docs §5-C |
| 2 | GET | `/v1/sales-agency-products/excel-download` | `getDownloadSalesAgencyProductsExcel` (`backend.ts:3993`, anchor href) | `SalesAgencyProductBoardController#downloadSalesAgencyProductsExcel:81` | `…#searchSalesAgencyProducts` (동일 쿼리 후 fromPage) | 동상 | **현재 페이지만** xlsx (백엔드 docs §5-E). 파일명 `sales_agency_products_page_${page+1}.xlsx` |
| 3 | GET | `/v1/sales-agency-products/{id}` | `getSalesAgencyProductDetails` (`backend.ts:4032`) | `…Controller#getSalesAgencyProductDetails:113` | `…Service#getSalesAgencyProductDetails:123` | `SalesAgencyProductBoardRepository.findById` + `SalesAgencyProductApplicationRepository#existsByMemberAndProductBoard` (파생) | 상세 + `boardPostDetail` (BoardService 위임) + `applied` 플래그. 비활성 회원이면 400 (백엔드 docs §5-N) |
| 4 | POST | `/v1/sales-agency-products` (multipart) | `createSalesAgencyProductBoard` (`backend.ts:3951`) | `…Controller#createSalesAgencyProductBoard:174` | `…Service#createSalesAgencyProductBoard:314` | `BoardPostRepository`(`boardService`), `S3FileRepository`(thumbnail), `SalesAgencyProductBoardRepository.save` | parts: `boardPostCreateRequest` + `salesAgencyProductCreateRequest` + `thumbnail`(필수) + `files[]`. 저장 후 `NotificationPushEvent(template=User.SALES_PRODUCT_REGISTERED, receivers={CSO,PARTNER})` 발행 |
| 5 | PATCH | `/v1/sales-agency-products/{id}` (multipart) | `updateSalesAgencyProductBoard` (`backend.ts:4044`) | `…Controller#updateSalesAgencyProductBoard:198` | `…Service#updateSalesAgencyProductBoard:259` | `SalesAgencyProductBoardRepository.findById/save`, `BoardPost` cascade, `S3FileService` | parts 모두 optional. `keepFileIds` 미포함 첨부는 BoardService 가 삭제. 새 썸네일 시 **이전 S3File 방치**(백엔드 docs §5-M) |
| 6 | DELETE | `/v1/sales-agency-products/{id}` | `deleteSalesAgencyProduct` (`backend.ts:4082`) | `…Controller#deleteSalesAgencyProduct:72` | `…Service#softDeleteSalesAgencyProductBoard:74` | `SalesAgencyProductBoardRepository.save`(dirty UPDATE) | soft delete: `productBoard.deleted=true` + `boardPost.deleted=true` + `thumbnailFile.deleted=true`. 신청 row 는 cascade 안 됨 |
| 7 | POST | `/v1/sales-agency-products/{id}/apply` | (어드민 미사용 — 사용자 포털) | `…Controller#applyProduct:230` | `…Service#apply:45` | `MemberRepository#findActivateMemberByUserId`, `SalesAgencyProductBoardRepository.findById`, `SalesAgencyProductApplicationRepository#existsByMemberAndProductBoard` + `save` | **applicant 흐름의 입구**. 중복 시 `IllegalStateException("Already applied…")` (글로벌 매핑 없으면 500 — 백엔드 docs §5-I). 성공 시 `Admin.SALES_APPLIED` 이메일(ReceiverType.ADMIN) 큐잉 |
| 8 | GET | `/v1/sales-agency-products/{id}/applicants` | `getProductApplicants` (`backend.ts:4091` 인근) | `…Controller#getProductApplicants:123` | `…Service#getApplicantsByProductId:206` | `SalesAgencyProductApplicationRepository#searchApplicantsByProductId:40` | ApplicantsTab 진입 호출. JPQL CASE 로 `contractStatus` 인라인 계산 (`ContractStatus.from` 과 drift — 백엔드 docs §5-H) |
| 9 | GET | `/v1/sales-agency-products/{id}/applicants/excel-download` | (anchor href, `backend.ts` 함수형 wrapper 추정) | `…Controller#downloadProductApplicantsExcel:141` | 동상 | 동상 | 신청자 현재 페이지 xlsx. `SalesAgencyProductApplicantResponse` 에 `@ExcelColumn` 없음 → 영문 헤더 (백엔드 docs §5-F) |
| 10 | DELETE | `/v1/sales-agency-products/{applicantUserId}/applicant?productBoardId=` | `deleteSalesAgencyProductApplicant(applicantUserId, {productBoardId})` (`backend.ts:4015`) | `…Controller#deleteSalesAgencyProductApplicant:62` | `…Service#deleteBy:220` | `SalesAgencyProductApplicationRepository#deleteByUserIdAndProductBoardId:47` (`@Modifying`, **hard delete**) | path 변수가 userId(string), productBoardId 는 query. affected==0 도 200 (백엔드 docs §5-J) |
| 11 | PATCH | `/v1/sales-agency-products/applicants/notes` | `updateApplicantNotes(SalesAgencyProductNoteUpdateRequest)` (`backend.ts:3981`) | `…Controller#updateApplicantNotes:165` | `…Service#updateNotesOnly:159` | `SalesAgencyProductBoardRepository.findById`, `MemberRepository#findAllByUserIdIn`, `SalesAgencyProductApplicationRepository#findAllByMemberInAndProductBoard` (파생), `saveAll` | `onBlur` 당 단건. `note==null` 스킵, `""` → `trim().ifEmpty{null}` 로 DB null (백엔드 docs §5-L) |

## 3. DB 테이블

- 핵심 2개 + 참조 2개:
  - `sales_agency_product_board` — 상품 본체. PK `id`, FK `board_post_id` (UNIQUE, OneToOne CASCADE.ALL → 04-domain.md:214,263), FK `thumbnail_file_id` (UNIQUE → S3File). `start_date`/`end_date` 는 **Int(yyyyMMdd)**, `contract_date` 는 `date`. `price NOT NULL` 이지만 Create API 가 받지 않아 항상 0 (백엔드 docs §5-G). `deleted boolean` soft delete.
  - `sales_agency_product_application` — 신청자 매핑. PK `id`, FK `member_id`, FK `product_board_id`. UNIQUE `(member_id, product_board_id)` 로 **회원당 상품 1회 신청**만 허용. `note varchar(255)` (length 미지정 → JPA 기본 — 장문 입력 시 truncate 위험, 백엔드 docs §5-K)
  - `board_post` — 제목/본문/`is_exposed`/`exposure_range` 보유. exposure_range enum: `ALL` / `CONTRACTED` / `UNCONTRACTED` (FE docs 의 `CONTRACT` 와 drift — 백엔드 docs §5-B)
  - `s3_file` — `cloudfront_url` 가 thumbnail/첨부 노출값. soft delete 시 `deleted=true` 전파

핵심 JOIN (목록 조회, `searchSalesAgencyProductBoards` JPQL → Postgres):

```sql
-- equivalent to: GET /v1/sales-agency-products?page=0&size=20 (admin)
SELECT
  p.id, p.client_name, p.product_name, p.price,
  to_char(p.contract_date,'YYYY-MM-DD') AS contract_date,
  bp.is_exposed, p.start_date, p.end_date,
  (SELECT COUNT(*) FROM sales_agency_product_application a
     WHERE a.product_board_id = p.id)            AS applied_count,
  p.quantity, tf.cloudfront_url                  AS thumbnail_url
FROM sales_agency_product_board p
JOIN board_post bp ON bp.id = p.board_post_id
LEFT JOIN s3_file tf ON tf.id = p.thumbnail_file_id
WHERE p.deleted = false
  AND bp.exposure_range IN ('ALL','CONTRACTED','UNCONTRACTED')  -- admin 전체
ORDER BY p.id DESC                                              -- Pageable Sort 무시 (5-D)
LIMIT 20 OFFSET 0;
```

신청자 매트릭스(JPQL `searchApplicantsByProductId`):

```sql
SELECT m.id, m.user_id, m.name AS member_name, m.phone_number,
       to_char(a.created_at,'YYYY-MM-DD') AS applied_date,
       CASE WHEN m.member_type IN ('INDIVIDUAL','ORGANIZATION')
            THEN 'CONTRACT' ELSE 'NON_CONTRACT' END AS contract_status,
       a.note
FROM sales_agency_product_application a
JOIN member m ON m.id = a.member_id
WHERE a.product_board_id = :productId
ORDER BY a.id DESC LIMIT :size OFFSET :offset;
```

## 4. 권한·트랜잭션

- **인증**: 11개 EP 전부 `JWT 필요` 만 표기, `@RequiredRole` 미적용. (`01-controllers.md:307-317`, `05-security.md:14-16,146-153`)
- **보안 공백 (Critical)**: 프론트 권한 태그가 `CONTRACT_MANAGEMENT` / `PRODUCT_MANAGEMENT` 이지만 백엔드는 인증만 통과하면 **상품 생성/수정/삭제·신청자 hard delete·비고 수정**까지 전부 호출 가능. `WebSecurityConfig` 의 `/v1/**` authenticated 정책에만 의존. (백엔드 docs §5-A)
- **트랜잭션**: `SalesAgencyProductBoardService` 레벨 (Spring 기본 REQUIRED 추정). 게시글+상품+썸네일 INSERT 가 한 트랜잭션. 푸시 알림은 `applicationEventPublisher.publishEvent(NotificationPushEvent…)` 로 commit 후 비동기.
- **Cascade**: `SalesAgencyProductBoard → BoardPost` 가 `@OneToOne(CascadeType.ALL)` (`04-domain.md:214,263,382`). 현재 흐름은 soft delete 만 사용해 안전하지만 **hard delete 도입 시 BoardPost 가 동반 삭제**됨 (백엔드 docs §5-O).
- **신청자 hard delete vs 상품 soft delete**: `sales_agency_product_application` 은 cascade 미설정 + JPQL `DELETE` → 상품 삭제 후에도 application row 잔존, 신청자 삭제는 row 자체 제거.

## 5. 리스크 / 후속 액션

- **R1 (보안, P0)**: 백엔드 11 EP 전부 `@RequiredRole` 부재. 일반 사용자 토큰으로 어드민 기능 호출 가능. → `SalesAgencyProductBoardController` 메서드별 `@RequiredRole(CONTRACT_MANAGEMENT or PRODUCT_MANAGEMENT)` + role 검증 추가. (백엔드 docs §5-A, `05-security.md:153`)
- **R2 (계약 drift)**: FE 의 `exposureRange` enum (`ALL` / `CONTRACT`)와 BE enum (`ALL` / `CONTRACTED` / `UNCONTRACTED`) 불일치. FE 가 `CONTRACT` 를 보내면 enum 역직렬화 실패 → 400. → FE 상수 정정 + verify-frontend-contract 재실행. (백엔드 docs §5-B)
- **R3 (Excel UX)**: 상품·신청자 Excel 모두 **현재 페이지만** 덤프되며, 신청자 응답 DTO 는 `@ExcelColumn` 누락으로 헤더가 영문 필드명. 전량 덤프 기대 시 size 를 충분히 크게 호출하도록 FE 가드 또는 BE 별도 endpoint 필요. (백엔드 docs §5-E, §5-F)
- **R4 (정합성)**: `ORDER BY p.id DESC` 가 Pageable Sort 를 무시(`5-D`). FE 정렬 토글 도입 시 의도대로 작동 안 함. 신청자 비고 `varchar(255)` 길이 초과 시 truncate 에러(`5-K`). 빈 셀 의도 표시는 빈 문자열 보내야 DB null (`5-L`).
- **R5 (스토리지 누수)**: PATCH 시 새 썸네일로 교체되면 이전 `s3_file` row 와 S3 객체가 정리되지 않음 (`5-M`). 정기 정리 잡 또는 `updateSalesAgencyProductBoard` 내부에서 구 파일 soft delete 추가 검토.
- **R6 (applicant 흐름)**: `apply()` 의 중복 신청은 `IllegalStateException` → 글로벌 핸들러가 없으면 500 (`5-I`). FE 가 사용자 포털 측에서 상태 코드 가정한다면 매핑 추가. 또한 신청자 hard delete 후 동일 사용자 재신청 가능 — 정책상 차단 필요하면 soft delete 전환.

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/04_SALES_AGENCY_PRODUCT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/04_SALES_AGENCY_PRODUCT.md`
- 백엔드 ingest:
  - 컨트롤러 매트릭스: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md:36, 302-317`
  - 서비스 카탈로그: `…/02-services.md:306` (`SalesAgencyProductBoardService`)
  - 리포지토리 카탈로그: `…/03-repositories.md:41-42` (Board=1 @Query / Application=2 파생+1 @Query)
  - 도메인/관계: `…/04-domain.md:69-70, 166, 214, 230-231, 263, 306, 382-386`
  - 보안: `…/05-security.md:14-16, 58-63, 146-174` (`/v1/sales-agency-products/**` 별도 라인 없음 → `/v1/**` authenticated 기본 적용)
- 프론트 backend.ts: `/Users/jmk0629/keymedi/medipanda-web-test/src/backend/backend.ts:3924-4115`, types `:868-1467`
- 페이지 컴포넌트: `…/src/pages-admin/MpAdminSalesAgencyProductList.tsx`, `MpAdminSalesAgencyProductEdit.tsx`
- 출력: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-04-sales-agency-fullstack.md`

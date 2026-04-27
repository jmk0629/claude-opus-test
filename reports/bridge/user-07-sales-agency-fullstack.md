# user-07 영업대행 상품 (사용자) — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`user/07_SALES_AGENCY_PRODUCT.md`) / 백엔드 docs(`user/07_SALES_AGENCY_PRODUCT.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427/`)

## 1. 화면 요약

- 페이지(2개):
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/SalesAgencyProductList.tsx` — 상품 목록 (`/sales-agency-products?page=N`). 카드(썸네일 + clientName/productName/기간) + 만료 시 반투명 "종료" 오버레이. 검색 없음, page만 URL 관리.
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/SalesAgencyProductDetail.tsx` — 상품 상세 (`/sales-agency-products/:id`). 헤더(clientName / productName / startDate~endDate / viewsCount) + Tiptap 읽기 전용 본문(`detail.boardPostDetail.content`) + 신청 버튼.
- 핵심 사용자 액션:
  1) 목록 페이지네이션 — `getSalesAgencyProducts({page: page-1, size: 10})` (UI 1-based → API 0-based)
  2) 상세 진입 — `getSalesAgencyProductDetails(id)` 후 `editor.commands.setContent(detail.boardPostDetail.content)`. **호출만으로 board_post_view INSERT + viewsCount 증가** (백엔드 docs §5-J)
  3) 영업대행 신청 — `applyProduct(salesAgencyProductId)` POST → 성공 시 `await fetchDetail(id)` 재조회로 `applied=true` 반영, 버튼 "영업대행 신청완료"로 비활성
- 신청 버튼 3-state(클라 가드만): `applied===true` → "신청완료" / `DateUtils.isExpired(utcToKst(endDate))` → "종료된 상품입니다" / 그 외 "영업대행 신청하기"
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/07_SALES_AGENCY_PRODUCT.md:32-39, 154-185, 342-392`

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 사용자 화면이 호출하는 EP는 11개 중 **3개**. 동일 컨트롤러(`SalesAgencyProductBoardController`)가 admin 7개 EP까지 한꺼번에 묶고 있어 권한 분리는 컨트롤러 메서드별로 이뤄지지 않는다(§4 R1).

| # | HTTP | Path | 프론트 함수 (`backend.ts`) | Controller | Service | Repository | 비고 (출처) |
|---|------|------|---------------------------|-----------|---------|------------|-----|
| 1 | GET | `/v1/sales-agency-products` | `getSalesAgencyProducts` (`backend.ts:3926`) | `SalesAgencyProductBoardController#getSalesAgencyProducts:35` | `SalesAgencyProductBoardService#searchSalesAgencyProducts:230` | `SalesAgencyProductBoardRepository#searchSalesAgencyProductBoards:14-51` | List(size=10). 사용자 호출 시 `resolveExposureRanges(loginUser.role, member.memberType)` 가 `exposureRange` 자동 결정(쿼리스트링 `exposureRanges` 무시). `applicantCount` 는 상관 서브쿼리(§5-C). (백엔드 docs §2-1) |
| 2 | GET | `/v1/sales-agency-products/{id}` | `getSalesAgencyProductDetails` (`backend.ts:4032`) | `…Controller#getSalesAgencyProductDetails:113` | `…Service#getSalesAgencyProductDetails:123-157` | `SalesAgencyProductBoardRepository.findById` + `BoardService.getBoardDetails`(boardPost 위임) + `SalesAgencyProductApplicationRepository#existsByMemberAndProductBoard`(파생) | `boardPostDetail` 중첩(`content`/`viewsCount`) + `applied` 플래그 주입. **soft-deleted 상품도 응답**(`filterDeleted=null`, §5-D). 호출만으로 view INSERT + viewsCount 증가(§5-J) |
| 3 | POST | `/v1/sales-agency-products/{id}/apply` | `applyProduct` (`backend.ts:4135`) | `…Controller#applyProduct:230-238` | `…Service#apply:45-72` `@Transactional` | `MemberRepository#findActivateMemberByUserId`, `SalesAgencyProductBoardRepository.findById`, `SalesAgencyProductApplicationRepository#existsByMemberAndProductBoard`(파생) + `save` | INSERT `(member_id, product_board_id, note=null)`. 중복 시 `IllegalStateException("Already applied")` → 글로벌 매핑 없으면 500(§5-E). 성공 후 `publishSalesAppliedEvent` → 관리자에게 `SALES_APPLIED` 이메일 큐잉 |

## 3. DB 테이블

- 핵심 2개 + 참조 2개:
  - `sales_agency_product_board` — 상품 본체. `start_date`/`end_date`는 **Int(yyyyMMdd)** (settlement과 동일 패턴). `contract_date date`. `price NOT NULL` 이지만 Create API 미수용 → 항상 0 (백엔드 docs §5-G). `deleted boolean` soft delete. UNIQUE on `board_post_id`, `thumbnail_file_id`. (`04-domain.md:69, 214, 263`)
  - `sales_agency_product_application` — 신청자 매핑. UNIQUE `(member_id, product_board_id)` → **회원당 상품 1회 신청**만 허용(애플리케이션 레벨 + DB 레벨 이중 방어). `note varchar(255)` 는 관리자만 입력. (`04-domain.md:70, 230-231`)
  - `board_post` — 제목/본문(`content`)/`viewsCount`/`is_exposed`/`exposure_range`. SALES_AGENCY 상세는 BoardService의 일반 게시글 파이프라인을 그대로 재사용해 댓글·신고·첨부 빌드까지 수행(§2-2). FE는 댓글 UI를 그리지 않음.
  - `s3_file` — `cloudfront_url` = thumbnail 노출값. `LEFT JOIN p.thumbnailFile tf` 로 노출.

핵심 JOIN(`searchSalesAgencyProductBoards` JPQL → Postgres, 사용자 호출 기준):

```sql
-- equivalent to: GET /v1/sales-agency-products?page=0&size=10 (user)
SELECT
  p.id, p.client_name, p.product_name, p.price,
  to_char(p.contract_date,'YYYY-MM-DD') AS contract_date,
  bp.is_exposed, p.start_date, p.end_date,
  (SELECT COUNT(a.id) FROM sales_agency_product_application a
     WHERE a.product_board_id = p.id)            AS applicant_count,
  p.quantity, tf.cloudfront_url                  AS thumbnail_url
FROM sales_agency_product_board p
JOIN board_post bp ON bp.id = p.board_post_id
LEFT JOIN s3_file tf ON tf.id = p.thumbnail_file_id
WHERE p.deleted = false
  AND bp.exposure_range = ANY(:resolvedExposureRanges)  -- 서비스가 role/memberType 으로 산출
ORDER BY p.id DESC                                       -- Pageable Sort 와 중복(§5-N)
LIMIT 10 OFFSET 0;
```

신청 INSERT (UNIQUE 제약이 동시 경합의 최종 방어):

```sql
INSERT INTO sales_agency_product_application(member_id, product_board_id, note, created_at, modified_at)
VALUES (:memberId, :productBoardId, NULL, now(), now());
-- uk__sapa__member_id__product_board_id 위반 → DataIntegrityViolationException
```

## 4. 권한·트랜잭션 (admin/04 와의 차이)

- **인증**: 사용자 화면이 호출하는 3개 EP 전부 `JWT 필요` 만 표기. `@RequiredRole` 미적용 — admin/04 와 **동일 컨트롤러**라 admin 전용 EP 7개도 함께 보호되지 않음. (`01-controllers.md:307-317`, `05-security.md:14-16, 146-153`)
- **R1과 동일 리스크 (Critical)**: 일반 USER 토큰으로 admin EP(상품 등록·수정·삭제·신청자 hard delete·비고 수정·excel-download)를 직접 호출 가능. 사용자 화면은 RouterLink 만으로 admin 경로를 노출하지 않지만, **백엔드는 사용자/관리자 구분을 프론트 라우트에 100% 의존**. (백엔드 docs §5-A)
- **사용자 시점 추가 공백**:
  - 만료 검사 누락(`apply` 가 `endDate < today` 검증 없음, §5-F) → curl로 종료 상품 신청 가능. FE `DateUtils.isExpired(utcToKst(...))` 는 버튼 disable 만 처리.
  - soft-deleted 상품도 상세/신청 가능(§5-D) → 직접 `/v1/sales-agency-products/{deletedId}` URL 또는 apply 호출 시 응답.
  - `isExposed=false` 상품도 신청 가능(목록은 안 떠도 ID 알면 호출 가능).
- **트랜잭션**: `apply()` 가 `@Transactional` (Spring 기본 REQUIRED). 이메일 큐잉이 외부 브로커일 경우 트랜잭션 커밋 전에 외부 이벤트 발행 가능 — `TransactionalEventListener` 적용 여부 미확인(§5-K).
- **관리자 흐름과의 접점**: admin/04 의 ApplicantsTab 이 보는 row 가 바로 본 `apply()` 가 INSERT 한 row. admin은 hard delete(`deleteByUserIdAndProductBoardId`)로 행을 제거 → 사용자가 다시 신청 가능(UNIQUE 제약은 잔존 행 기준).

## 5. 리스크 / 후속 액션

- **R1 (보안, P0, admin/04 R1 과 동일)**: 사용자 시점에서도 일반 USER 가 admin EP 호출 가능. → `SalesAgencyProductBoardController` admin 메서드 7개에 `@RequiredRole(ADMIN_ONLY 또는 CONTRACT_MANAGEMENT/PRODUCT_MANAGEMENT)` 추가. 사용자 EP 3개도 `loginUser.userId` 신뢰 외 추가 검증 불필요. (백엔드 docs §5-A)
- **R2 (서버 만료 검사 부재, P1)**: `apply` 가 `endDate < today` 거부 안 함 → `created_at > endDate` 신청 row 발생 가능. 진단 쿼리: `…/07_SALES_AGENCY_PRODUCT.md` Z-3. → 서비스 진입부에 만료 가드 추가, FE의 `DateUtils.isExpired` 와 일치시킴.
- **R3 (soft-deleted 상품 노출, P1)**: 상세/신청 양쪽에 `productBoard.deleted` 가드 부재(§5-D). → `getSalesAgencyProductDetails`/`apply` 진입부에 `if (productBoard.deleted) throw NotFoundException`.
- **R4 (중복 신청 500)**: `IllegalStateException("Already applied")` + DB UNIQUE `DataIntegrityViolationException` 둘 다 글로벌 핸들러 매핑 없으면 500. FE 의 catch 는 단일 alert("오류가 발생했습니다") 라 사용자 구분 불가. → 409 Conflict 매핑 + FE 메시지 분기.
- **R5 (조회수 부풀림)**: `getSalesAgencyProductDetails` 호출만으로 BoardService 가 view INSERT + viewsCount 증가(§5-J). bot/크롤러로 viewsCount 인플레이션 가능. → 사용자 시점 view 카운트가 정책상 필요한지 재확인.
- **R6 (확장성)**: `applicantCount` 가 상관 서브쿼리(§5-C). 현재 신청 2건이라 무시 가능, 신청·상품 증가 시 `LEFT JOIN … GROUP BY p.id` 로 재작성. `LIKE '%…%'` 와일드카드 선두는 사용자 시점에서는 호출되지 않음(목록 검색 없음).

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/07_SALES_AGENCY_PRODUCT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/user/07_SALES_AGENCY_PRODUCT.md`
- admin 측 풀스택 지도(같은 컨트롤러 admin 7 EP): `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-04-sales-agency-fullstack.md`
- 백엔드 ingest:
  - 컨트롤러 매트릭스: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md:36, 302-317`
  - 서비스 카탈로그: `…/02-services.md:306` (`SalesAgencyProductBoardService`)
  - 리포지토리 카탈로그: `…/03-repositories.md:41-42` (Board=1 @Query / Application=2 파생+1 @Query)
  - 도메인/관계: `…/04-domain.md:69-70, 166, 214, 230-231, 263, 306, 382-386`
  - 보안: `…/05-security.md:14-16, 58-63, 146-174` (`/v1/sales-agency-products/**` 별도 라인 없음 → `/v1/**` authenticated 기본 적용, `@RequiredRole` 부재)
- 프론트 backend.ts: `/Users/jmk0629/keymedi/medipanda-web-test/src/backend/backend.ts:3926, 4032, 4135`
- 페이지 컴포넌트: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/SalesAgencyProductList.tsx`, `SalesAgencyProductDetail.tsx`
- 출력: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/user-07-sales-agency-fullstack.md`

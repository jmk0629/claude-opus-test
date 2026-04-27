# user-03 제품 검색 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`03_PRODUCT_SEARCH.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427`) / 백엔드 docs(`user/03_PRODUCT_SEARCH.md`)

## 1. 화면 요약
- 화면 (1 페이지 + 2 다이얼로그):
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/ProductList.tsx` — `/products` (검색 + 목록)
  - 내부 컴포넌트 `ReplaceableProductDialog` — 행 클릭 시 제품 상세 + 대체가능 의약품
  - 내부 컴포넌트 `ProductDetailInfoDialog` — Tiptap fullScreen 읽기 전용 상세 HTML
- 핵심 사용자 액션:
  1) **기본검색** — `searchType ∈ {composition, productName, manufacturerName}` × `searchKeyword` 1개 필드
  2) **상세검색** 토글 — `compositionKeyword`/`productNameKeyword`/`manufacturerNameKeyword` 동시 + `isAcquisition`/`isPromotion`/`isOutOfStock` 3-state(null/true/false)
  3) 정렬 (`sortType ∈ ProductSortType`) — `Select.onChange` 가 폼 우회하여 `navigate()` 직접
  4) 페이지네이션 (`page` 1-base, `size=10` 고정) — `PaginationItem` + `RouterLink`
  5) 행 클릭 → `selectedId` 세팅 → `getProductDetails(id)` → 대체의약품 + Detail Info 버튼 (`trimTiptapContent` 비어있지 않을 때만)
- URL 이 검색 상태의 단일 진실. `useSearchParamsOrDefault()` + `useEffect([모든 필터, page])` → `fetchContents()`. 빈 문자열 → `null` → API 호출 시 `undefined` 로 누락(쿼리스트링에서 제거).
- 출처: `frontend docs:25-46, 282-298, 301-326`, `backend docs:14-17`, `pages-user/ProductList.tsx`.

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 본 메뉴는 **2 개 GET 만** 사용. 같은 컨트롤러(`ProductController`)에 admin 전용 CUD/엑셀/업로드가 8 개 더 있으나(§4 매트릭스 외) `@RequiredRole` 미부착이라 user JWT 로도 호출 가능 — §5 R-1.

| # | HTTP | Path | 프론트 함수 | Controller | Service | Repository | 비고 |
|---|------|------|-------------|------------|---------|------------|------|
| 1 | GET | `/v1/products` | `getProductSummaries` (`ProductList.tsx`, `frontend docs:43,303`) | `ProductController.getProductSummaries` (`ProductController.kt:96`, `01-controllers.md:106`) | `ProductService.getProductSummaries` (`ProductService.kt:226`, `02-services.md:304`) | `ProductRepository.findProductSummaries` — native, `WITH filtered_e AS (ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY id DESC))` (`ProductRepository.kt:167-260`, `03-repositories.md:89`) | user 호출은 `size=10` 고정. 정렬 4종(`FEE_RATE_DESC/ASC`, `PRICE_DESC/ASC`, `LATEST`)은 `idx__product__current_*_desc_id_desc` 활용 |
| 2 | GET | `/v1/products/{id}/details` | `getProductDetails` (`ReplaceableProductDialog`, `frontend docs:44,530`) | `ProductController.getProductDetails` (`ProductController.kt:135`, `01-controllers.md:108`) | `ProductService.getProductDetails` (`ProductService.kt:143-212`) | `ProductRepository.findByIdOrNull` + `ProductExtraInfoRepository.findTopByProductIdOrderByIdDesc` (파생, `ProductExtraInfoRepository.kt:15`) + `ProductRepository.findAllAlternativeProductsByNhiGenericCode` (JPQL, `ProductRepository.kt:134`) + `BoardService.getBoardDetails` (위임) | user 경로는 `?month` 미전달 → 항상 최신 1건. 대체의약품 비페이지네이션 전수 반환 — §5 R-3 |

근거: 컨트롤러 `01-controllers.md:101-118`, 서비스 `02-services.md:304,344`, 레포 `03-repositories.md:32-33,89`, 백엔드 docs `user/03_PRODUCT_SEARCH.md:13-17, 24-79, 80-125`.

> **admin/02 와의 노출 차이** (백엔드 docs §1, §5-A): 동일 `ProductController` 안의 `excel-download`(`:107`), `softDelete`(`:113`), `extra-info` CUD(`:110-112`), `export-to-root-tsv`(`:114`), `upload-kims-from-s3`(`:115`), `product-extra-info/upload(-json)`(`:116-117`) 가 모두 `@RequiredRole` 없음 → user 토큰만 있으면 SecurityConfig URL matcher 가 막지 않는 한 호출 성공. user-03 화면은 GET 2 개만 호출하지만 **백엔드 표면적은 admin/02 와 동일**.
> `DrugCompanyController.getDrugCompanies` (`/v1/drug-companies`, `01-controllers.md:346`) 는 `@RequiredRole(ADMIN_ONLY/CONTRACT_MANAGEMENT)` 적용 — user-03 검색에서는 호출 안 함(제약사 필터는 `manufacturerName` 자유 텍스트).

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|---|---|---|---|
| `product` | 제품 마스터 (KIMS 적재) | — | 43,149 row, 전부 `deleted=false`. 정렬 캐시 `current_fee_rate`/`current_price` 보유 (`04-domain.md:49`, `백엔드 docs §3-1`) |
| `product_extra_info` | 월별 부가정보(수수료율/노트/플래그/가격 오버라이드) | `product_id`, `board_post_id` UNIQUE | 5,658 row / 1,006 distinct product_id (≈2.3% 만 보유) — `백엔드 docs §3-2, §4-3` |
| `board_post` | Tiptap 상세 HTML (Detail Info 다이얼로그) | — | `BoardService.getBoardDetails(filterBlind=null, filterDeleted=null)` 위임 — 블라인드/삭제 게시물도 반환 |
| `drug_company` | 제약사 (admin 전용 권한) | — | user-03 검색은 `manufacturerName` 자유 텍스트로만 다룸 — 본 메뉴는 read 안 함 |

핵심 JOIN (목록, `백엔드 docs §6-A`):

```sql
WITH filtered_e AS (
  SELECT e.*,
         ROW_NUMBER() OVER (PARTITION BY e.product_id ORDER BY e.id DESC) AS rn
  FROM product_extra_info e
  WHERE 1=1
    AND (:note  IS NULL OR :note = '' OR e.note ILIKE CONCAT('%', :note, '%'))
    AND (:isAcq IS NULL OR e.is_acquisition  = :isAcq)
    AND (:isPro IS NULL OR e.is_promotion    = :isPro)
    AND (:isOos IS NULL OR e.is_out_of_stock = :isOos)
)
SELECT p.id,
       COALESCE(e.product_name,      p.product_name)  AS productName,
       COALESCE(e.composition,       p.composition),
       COALESCE(e.manufacturer_name, p.manufacturer)  AS manufacturerName,
       COALESCE(e.price,             p.nhi_price)     AS price,
       e.fee_rate, e.changed_fee_rate, e.changed_month,
       e.is_acquisition, e.is_promotion, e.is_out_of_stock, e.is_stop_selling
FROM product p
LEFT JOIN filtered_e e ON e.product_id = p.id AND e.rn = 1
WHERE p.deleted = false
  AND ( /* 모든 e.* 필터가 null */ OR e.product_id IS NOT NULL )
ORDER BY p.current_fee_rate DESC, p.id DESC   -- sortType 매핑
LIMIT 10 OFFSET (:page * 10);
```

대체의약품 (`백엔드 docs §6-B`):

```sql
SELECT p.*, COALESCE(p.nhi_price, pei.price), pei.fee_rate, pei.note
FROM product p
LEFT JOIN product_extra_info pei
  ON pei.product_id = p.id
 AND pei.id = (SELECT MAX(sub.id) FROM product_extra_info sub WHERE sub.product_id = p.id)
WHERE p.nhi_generic_code = :code
  AND p.substituent IS NOT NULL
  AND (p.substituent LIKE '%대조%' OR p.substituent LIKE '%생동%')
  AND p.deleted = false;
-- 단일 nhiGenericCode 당 최대 131건(§4-2) 전수 반환, 페이지네이션 없음
```

## 4. 권한·트랜잭션
- **인증**: 두 GET 모두 `@RequiredRole` 미부착, JWT 만 통과하면 호출 (`05-security.md:406`, `백엔드 docs §5-A`). user/admin 응답 동일.
- **트랜잭션**: 두 GET 모두 read-only — `ProductService` 클래스 레벨 기본(`02-services.md:304` REQUIRED). `getProductDetails` 의 board 위임 호출도 read-only.
- **검색은 PUBLIC 가능?** — `WebSecurityConfig` 가 `/v1/products/**` 를 `authenticated` 로 묶음 (`05-security.md` 기조). PUBLIC 아님. 단, `/v1/terms/**` 처럼 비로그인 진입 의도였다면 별도 매처 필요.
- **외부 의존**: KIMS 의약품 마스터(`https://api.kims.co.kr`, Basic Auth) 가 `product` 테이블의 마스터 소스 (`06-config.md:199-204`). user-03 런타임 호출 경로엔 직접 의존 없음 — **데이터 신선도 만** 의존(POST `/v1/products/upload-kims-from-s3` 배치 결과). KIMS 적재 누락 시 검색 결과 자체가 비거나 stale 노출.

## 5. 리스크 / 후속 액션
- **R-1 권한 분리 부재 (admin/02 와의 표면적 동일)**: `ProductController` 의 admin 전용 8 개 CUD/엑셀/업로드가 user JWT 로도 호출 가능 (`05-security.md:406`, 백엔드 docs §5-A). 최소 `excel-download`·`softDelete`·`upload-*`·`export-to-root-tsv`·`extra-info` CUD 에 `@RequiredRole(ADMIN_ONLY)` 필요.
- **R-2 LIKE 풀스캔 + ILIKE `%…%`**: 모든 텍스트 필터(`productName`/`composition`/`manufacturerName`/`note`) 가 ILIKE 양 와일드카드. `idx__product__product_name`/`...nhi_generic_code` 미적용. note 필드는 `pg_trgm` GIN 인덱스 후보(백엔드 docs §5-J).
- **R-3 대체의약품 응답 비페이지네이션 + N+1 잠재**: `findAllAlternativeProductsByNhiGenericCode` 가 단일 `nhi_generic_code` 당 최대 131 건 전수 반환 (백엔드 docs §4-2). 프론트는 다이얼로그에 전량 렌더 + 정렬(`alternativeProductComparator`). 페이로드/렌더 비용. `LIMIT 50` + 더보기 분리 권장.
- **R-4 N+1 명목상 없음/실질적 INNER JOIN 승격**: 목록은 `LEFT JOIN filtered_e (rn=1)` 한 번으로 처리 — 진정한 N+1 없음. 다만 4 개 플래그 필터 중 하나라도 true/false 가 들어오면 `e.product_id IS NOT NULL` 가드로 사실상 INNER JOIN, 모수가 1006 건 이하로 급감(백엔드 docs §5-G) — UX/스펙 명세 필요.
- **R-5 정렬 캐시(`current_fee_rate`/`current_price`) ≠ 응답 값(`e.fee_rate`/`COALESCE(e.price, p.nhi_price)`)**: extra_info upsert 시 product 측 캐시 컬럼 동기화 트리거 부재 → "수수료율 DESC" 정렬인데 행 표시값이 뒤섞일 수 있음 (백엔드 docs §5-B, 진단 SQL §6-Z-2).
- **R-6 `IllegalArgumentException` → 500**: `getProductDetails` 의 미존재 id → `IllegalArgumentException` 던짐, `@ControllerAdvice` 매핑 부재 → 다이얼로그 무한 로딩 (`백엔드 docs §5-C`).
- **R-7 `changedMonth` UTC vs KST + 포맷 혼재**: `YearMonth.now(ZoneOffset.UTC)` 비교 + `varchar(255)` 자유 포맷 (`YYYY-MM` vs `YYYY-MM-DD`) → 월말/월초 KST 새벽 9 시 이전 변경월 판정 1 개월 차이 가능 (백엔드 docs §5-D, 진단 §6-Z-3).
- **R-8 대체의약품 분류 = 한글 문자열 매칭**: `substituent LIKE '%대조%' OR '%생동%'` — 새 코드 체계(영문/숫자) 도입 시 조용히 제외. `is_reference_listed`/`is_bioequivalent` 컬럼 승격 권장 (백엔드 docs §5-E, 진단 §6-Z-4).

## 6. 참조
- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/03_PRODUCT_SEARCH.md`
- 프론트 구현: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/ProductList.tsx` (+ inner `ReplaceableProductDialog`, `ProductDetailInfoDialog`)
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/user/03_PRODUCT_SEARCH.md`
- 백엔드 ingest:
  - 컨트롤러: `reports/backend-ingestion-20260427/01-controllers.md:101-118` (`ProductController`), `:341-346` (`DrugCompanyController`)
  - 서비스: `reports/backend-ingestion-20260427/02-services.md:304,344` (`ProductService`)
  - 레포: `reports/backend-ingestion-20260427/03-repositories.md:32-33,89` (`ProductRepository`/`ProductExtraInfoRepository`/`findProductSummaries`)
  - 도메인: `reports/backend-ingestion-20260427/04-domain.md:49-50,300-301,383-384` (`Product`/`ProductExtraInfo` 1:1 BoardPost LAZY)
  - 보안: `reports/backend-ingestion-20260427/05-security.md:406` (`@RequiredRole` 누락 의심)
  - 설정: `reports/backend-ingestion-20260427/06-config.md:199-204,413` (KIMS Basic Auth)
- 동일 컨트롤러의 admin 시점 매핑: `reports/bridge/admin-02-product-fullstack.md`

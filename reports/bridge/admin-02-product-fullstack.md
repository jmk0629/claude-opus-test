# admin-02 제품 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`02_PRODUCT_MANAGEMENT.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427`) / 백엔드 docs(`02_PRODUCT_MANAGEMENT.md`)

## 1. 화면 요약
- 화면 (3개, Prescription 제외):
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminProductList.tsx` — 제품 목록 (`/admin/products`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminProductDetail.tsx` — 제품 상세(읽기) (`/admin/products/:productId`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminProductEdit.tsx` — 제품 등록·수정 (`/admin/products/new`, `/admin/products/:productId/edit`)
- 핵심 사용자 액션:
  1) 6개 검색 필드(productName/composition/productCode/manufacturerName/note + 4개 플래그 체크박스) + 정렬(최신/가격↑↓/수수료율↑↓) + 페이지네이션 — URL 쿼리스트링 동기화
  2) Excel 다운로드 (전체 행을 한 페이지로, `size = 2^31-1`)
  3) 제품 신규 등록 → `POST /v1/products/extra-info` (multipart: 본문 + 부가정보 + 첨부)
  4) 수정 저장 → `PATCH /v1/products/{id}/extra-info`
  5) 상세에서 "대체품(`alternativeProducts`)" 카드 표시 (같은 nhi_generic_code의 대조/생동)
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/02_PRODUCT_MANAGEMENT.md:41-51`, `:151-165`, `:492-499`

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> Path는 `ProductController.kt` 실제 매핑 기준. 프론트 docs 의 `/v1/products/excel` 표기는 실제 `/v1/products/excel-download` (R3 참조). `/v1/products/code/{productCode}/details` 는 처방입력 화면(05)에서 사용되며 본 메뉴와 무관 — 매트릭스에서 제외.

| # | HTTP | Path | 프론트 함수 | Controller | Service | Repository | 비고 |
|---|------|------|-------------|------------|---------|------------|------|
| 1 | GET | `/v1/products` | `getProductSummaries` (`MpAdminProductList.tsx`, frontend docs:188,302) | `ProductController.getProductSummaries` (`ProductController.kt:96`, `01-controllers.md:106`) | `ProductService.getProductSummaries` (`ProductService.kt:226`) | `ProductRepository.findProductSummaries` (native, ROW_NUMBER 윈도우, `03-repositories.md:89`) | 12개 동적 필터 + sortType. 4만건 풀스캔 (R-Excel) |
| 2 | GET | `/v1/products/excel-download` | `getDownloadProductSummariesExcel` (frontend docs:188,331) | `ProductController.downloadProductSummariesExcel` (`ProductController.kt:59`, `01-controllers.md:107`) | `ProductService.getProductSummaries` (재사용) | 동일 (`findProductSummaries`) | `ExcelExportUtil.fromPage` 변환. `size=2^31-1` 풀스캔 위험 (R1) |
| 3 | GET | `/v1/products/{id}/details` | `getProductDetails` (frontend docs:419,569) | `ProductController.getProductDetails` (`ProductController.kt:135`, `01-controllers.md:108`) | `ProductService.getProductDetails` (`ProductService.kt:143`) | `ProductRepository.findByIdOrNull` + `ProductExtraInfoRepository.findTopByProductIdOrderByIdDesc`/`...AndMonthOrderByIdDesc` + `ProductRepository.findAllAlternativeProductsByNhiGenericCode` (`ProductRepository.kt:134`) + `BoardService.getBoardDetails` | `?month=YYYY-MM` 옵션. extra 없으면 `BoardDetailsResponse.dummy()` |
| 4 | POST | `/v1/products/extra-info` | `createProductExtraInfo` (frontend docs:640) | `ProductController.createProductExtraInfo` (`ProductController.kt:39`, `01-controllers.md:110`) | `ProductService.createProductExtraInfo` (`ProductService.kt:93`, `@Transactional`) | `ProductRepository.findByKdCode` (`ProductRepository.kt:80`) + `ProductExtraInfoRepository.save` + `ProductRepository.save` | multipart 3-part. KIMS 마스터에 KD코드 없으면 400 (R5). `triggerExportAfterCommit` async TSV |
| 5 | PATCH | `/v1/products/{id}/extra-info` | `updateProductExtraInfo` (frontend docs:663) | `ProductController.updateProductExtraInfo` (`ProductController.kt:162`, `01-controllers.md:111`) | `ProductService.updateProductExtraInfo` (`ProductService.kt:293`, `@Transactional`) | `ProductExtraInfoRepository.findById` (없으면 createProductExtraInfo로 fallback — R4) + `BoardService.updateBoardPost` + `save` | path `{id}` 는 **`product_extra_info.id`** (R6: 프론트는 `productId` 로 호출 가능성) |
| 6 | DELETE | `/v1/products/{id}` | (현행 admin 화면에서 호출 미관측 — 추정 backend.ts 노출) | `ProductController.softDelete` (`ProductController.kt:128`, `01-controllers.md:113`) | `ProductService.softDeleteProductBy` (`ProductService.kt:258`) | `ProductRepository.softDeleteById` (`@Modifying UPDATE`) + `ProductExtraInfoRepository.findAllByProductIdAndDeletedFalse` 루프 | LAZY boardPost 접근 → N+1 위험 (R7) |
| 7 | DELETE | `/v1/products/{id}/extra-info` | (현행 화면에서 호출 미관측 — 추정) | `ProductController.updateProductExtraInfo` (함수명-매핑 불일치, `ProductController.kt:50`, `01-controllers.md:112`) | `ProductService.deleteProductExtraInfo` (`ProductService.kt:277`) | `ProductExtraInfoRepository.findById` + `save` | `current_fee_rate=0.0`, `current_price=nhi_price` 강제 리셋 (R2) |
| 8 | PUT | `/v1/products/export-to-root-tsv` | (관리 배치 — UI 비노출) | `ProductController` (`ProductController.kt:33`, `01-controllers.md:114`) | `ProductService` (TSV export) | (S3 직접 쓰기) | 운영 배치용. `@RequiredRole` 없음 (R8) |
| 9 | POST | `/v1/products/upload-kims-from-s3` | (KIMS 동기화 — UI 비노출) | `ProductController` (`ProductController.kt:182`, `01-controllers.md:115`) | `ProductService` (KIMS 마스터 적재) | `ProductRepository.upsert` (native `ON CONFLICT (kd_code) DO UPDATE`, `REQUIRES_NEW`, `03-repositories.md:90`) | 외부 KIMS API 인증 = Basic Auth (`06-config.md:199-204`). 4.3만 row 적재 |
| 10 | POST | `/v1/products/product-extra-info/upload(-json)` | (운영 일괄 업로드 — UI 비노출) | `ProductController` (`ProductController.kt:188,205`, `01-controllers.md:116-117`) | `ProductService` (Excel/JSON 파싱→upsert) | `ProductExtraInfoRepository.save` (`(month, product_id)` UNIQUE 갱신) | 실제 prod 데이터의 99.98% 가 이 경로로 system 사용자가 적재 (백엔드 docs 4-7) |

근거: 컨트롤러 `01-controllers.md:101-117`, 서비스 `02-services.md:304,344`, 레포 `03-repositories.md:32-33,89-90`, 백엔드 docs 매핑표 `02_PRODUCT_MANAGEMENT.md:13-21`.

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 |
|--------|------|-------|------|
| `product` | KIMS 제품 마스터 (4.3만건, 100% active) | — | `kd_code` UNIQUE, `current_fee_rate`/`current_price` denormalized 캐시 (정렬 인덱스 6종, `02_PRODUCT_MANAGEMENT.md:495-500`) |
| `product_extra_info` | 월별 수수료·가격·플래그 (5,658건 / 1,006제품 = 2.3%만 등록, `02_PRODUCT_MANAGEMENT.md:559`) | `product_id`→product, `board_post_id`→board_post (UNIQUE) | `(month, product_id)` UNIQUE. `month`(int, YYYYMM) vs `changed_month`(varchar, YYYY-MM) 타입 불일치 (R9) |
| `board_post` | 본문 HTML/제목/첨부 (board_type='PRODUCT') | `member_id` → member | Tiptap 에디터 콘텐츠 저장. `extra_info` 와 1:1 |

`Product` ↔ `ProductExtraInfo` N:1 LAZY (`04-domain.md:384`), `ProductExtraInfo` ↔ `BoardPost` 1:1 LAZY (`04-domain.md:215,383`).

핵심 JOIN (백엔드 docs `02_PRODUCT_MANAGEMENT.md:80-119` 인용):
```sql
-- equivalent to: GET /v1/products?productName=타이레놀&sortType=FEE_RATE_DESC
WITH filtered_e AS (
  SELECT e.*,
         ROW_NUMBER() OVER (PARTITION BY e.product_id ORDER BY e.id DESC) AS rn
  FROM product_extra_info e
)
SELECT p.id, p.insurance,
       COALESCE(e.product_name, p.product_name)      AS product_name,
       COALESCE(e.composition,   p.composition)      AS composition,
       p.kd_code                                     AS product_code,
       COALESCE(e.manufacturer_name, p.manufacturer) AS manufacturer_name,
       COALESCE(e.price, p.nhi_price)                AS price,
       e.fee_rate, e.changed_fee_rate, e.changed_month,
       e.is_acquisition, e.is_promotion, e.is_out_of_stock, e.is_stop_selling
FROM product p
LEFT JOIN filtered_e e ON e.product_id = p.id AND e.rn = 1
WHERE p.deleted = false
  AND REPLACE(p.product_name,' ','') ILIKE '%타이레놀%'
ORDER BY p.current_fee_rate DESC NULLS LAST, p.id DESC
LIMIT 20 OFFSET 0;
```

추가 JPQL (대체품 조회, 백엔드 docs `02_PRODUCT_MANAGEMENT.md:819-832` 인용 — `ProductRepository#findAllAlternativeProductsByNhiGenericCode`):
```sql
SELECT p.id, p.insurance, p.substituent, p.manufacturer, p.kd_code,
       p.product_name, p.composition, p.nhi_price, p.nhi_unit,
       COALESCE(p.nhi_price, pei.price), pei.fee_rate, pei.note
FROM product p
LEFT JOIN product_extra_info pei
  ON pei.product_id = p.id
 AND pei.id = (SELECT MAX(sub.id) FROM product_extra_info sub WHERE sub.product_id = p.id)
WHERE p.nhi_generic_code = :nhiGenericCode
  AND p.substituent IS NOT NULL
  AND (p.substituent LIKE '%대조%' OR p.substituent LIKE '%생동%')
  AND p.deleted = false;
-- 서비스 계층에서 대조(1) → 생동(2) 랭크 재정렬
```

## 4. 권한·트랜잭션
- **권한**: `ProductController` 전 엔드포인트(10개)에 `@RequiredRole` **하나도 없음** (`05-security.md` 미매칭, `01-controllers.md:406`). JWT 만 통과하면 일반 회원도 `POST/PATCH/DELETE` 호출 가능 → 메뉴 가드는 프론트 라우트에만 존재. R8.
- **트랜잭션**:
  - `ProductService.createProductExtraInfo` / `updateProductExtraInfo` / `softDeleteProductBy` / `deleteProductExtraInfo` 모두 `@Transactional` 기본 REQUIRED.
  - `ProductRepository.upsert` 만 `Propagation.REQUIRES_NEW` (`03-repositories.md:90`) — KIMS 적재 중 일부 실패 시 부분 커밋 가능.
  - 커밋 후 훅 `triggerExportAfterCommit()` — async S3 TSV 재생성 (fire-and-forget, 실패 시 추적 불가).
- **외부 연동**:
  - **AWS S3** (버킷 `medipanda`, `06-config.md:107`): board_post 첨부, Tiptap 에디터 이미지, KIMS 원본 TSV/Excel 저장.
  - **KIMS API** (`https://api.kims.co.kr`, Basic Auth, `06-config.md:199-204`): `/v1/products/upload-kims-from-s3` 경로에서 의약품 마스터 4.3만건 동기화. `external.apis.product.token` 환경 키.
  - **`@ExcelColumn` 어노테이션** + `ExcelExportUtil.fromPage` (자체 유틸): `/v1/products/excel-download` 응답 변환.

## 5. 리스크 / 후속 액션
- **R1 (Excel 풀스캔)**: 프론트가 `size=2^31-1` 로 호출 → 4만 row × `ROW_NUMBER()` 윈도우. 인덱스 없음. prod 부하 피크 시 DB CPU 스파이크 후보. 서버 측 `size` 상한 + async 다운로드 도입 필요. (백엔드 docs 5-C, `02_PRODUCT_MANAGEMENT.md:698-700`)
- **R2 (`current_fee_rate`/`current_price` 갱신 비대칭)**: create=갱신, update=갱신 안 함, delete=강제 0/nhi_price 리셋. 정렬 기준이 정확하지 않음. (백엔드 docs 5-G, `:717-723`)
- **R3 (URL drift)**: 프론트 docs는 `/v1/products/excel`, 실제는 `/v1/products/excel-download`. `getDownloadProductSummariesExcel` backend.ts 시그니처와 대조 필요(자동 생성 spec endpoint drift 메모리 기준).
- **R4 (PATCH가 UPSERT)**: `extraInfoId` 미존재 시 조용히 create로 fallback → 404 대신 새 레코드 생성. 클라이언트 예측 불가. (백엔드 docs 5-I, `:730-731`)
- **R5 (Create는 신규 Product를 만들지 않음)**: KIMS 마스터에 `kd_code` 없으면 400. "신규 등록"이라는 메뉴 명칭과 실제 동작 불일치. Product는 `/upload-kims-from-s3` 경로로만 생성. (5-E, `:706-708`)
- **R6 (PATCH path 변수 혼동)**: `@PathVariable id: Long` 은 `product_extra_info.id` 인데 프론트가 `productId` 를 넣고 있음 (frontend docs:663 `updateProductExtraInfo(productId, ...)`). backend.ts 자동생성 시그니처가 어떤 id 를 보내는지 검증 필요. (5-H, `:725-727`)
- **R7 (소프트 삭제 N+1)**: extra_info 루프에서 LAZY boardPost 개별 접근. 10개 extra → 10 추가 쿼리. (5-J, `:734-735`)
- **R8 (권한 결손)**: `@RequiredRole` 부재. 모든 변경 엔드포인트가 JWT 만으로 통과. (5-B, `01-controllers.md:406`)
- **R9 (`month` int vs `changed_month` varchar)**: 같은 테이블 두 컬럼 타입 불일치. `effectiveFeeRate` 계산 시 `YearMonth.parse` WARN 로그 발생. (5-K, `:737-739`)
- **R10 (extra_info 선형 팽창)**: 매월 동일값 upsert로 누적 — 1,006개 제품 × 매월 = 월 1,000건씩 단조 증가. change-detected 시에만 row 생성하도록 변경 검토. (5-N, `:749-751`)
- **R11 (운영 vs 어드민 UI 격차)**: 5,658 extra_info 중 5,657건이 `system` 작성 — 어드민 화면 CRUD는 핫픽스용으로만 사용 중. (백엔드 docs 4-7, `:644-657`)

## 6. 참조
- 프론트 화면: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminProductList.tsx`, `MpAdminProductDetail.tsx`, `MpAdminProductEdit.tsx`
- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/02_PRODUCT_MANAGEMENT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/02_PRODUCT_MANAGEMENT.md`
- 백엔드 ingest:
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md:22,101-117,406,412`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/02-services.md:304,344`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/03-repositories.md:32-33,89-90,149,172`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/04-domain.md:49-50,195,215,300-301,383-384`
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/06-config.md:107,168-173,199-204,409,413`
- 백엔드 소스 (참조): `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/ProductController.kt`, `service/ProductService.kt`, `repo/postgresql/ProductRepository.kt`, `repo/postgresql/ProductExtraInfoRepository.kt`, `domain/entity/Product.kt`, `ProductExtraInfo.kt`
- 보조 분석 docs: `docs/admin/analysis/*Product*.md` — **없음** (Glob no-hit, `/Users/jmk0629/keymedi/medipanda-api/docs/admin/analysis/`)

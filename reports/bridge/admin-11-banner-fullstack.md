# admin-11 배너 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)

## 1. 화면 요약

- 라우트: `/admin/banners` (목록), `/admin/banners/new` (등록), `/admin/banners/:bannerId/edit` (수정).
  - `MpAdminBannerList.tsx:1-` (`pages-admin/MpAdminBannerList.tsx`)
  - `MpAdminBannerEdit.tsx:1-` (`pages-admin/MpAdminBannerEdit.tsx`)
- 목록: `bannerTitle / startAt / endAt / isExposed / bannerPositions[]` 필터 + page/size 페이지네이션. 컬럼: 위치·상태·범위·게시기간·등록일·노출순서·노출수/클릭수/CTR. 체크박스·삭제 버튼 없음 (DELETE EP 부재 — 백엔드 5-I).
- 등록/수정: 폼 밖 `imageFile` state + `<input type="file" hidden accept="image/*">` 단일 이미지, FileReader Data URL 미리보기. 날짜는 `DateTimeString`(시각 포함). 수정 모드는 `imageFile ?? undefined`로 미선택 시 기존 이미지 유지.
- FE 호출: `getBanners` (`MpAdminBannerList.tsx:36, 110`), `getBanner` (`MpAdminBannerEdit.tsx:27, 140`), `createBanner` (`MpAdminBannerEdit.tsx:25, 89`), `updateBanner` (`MpAdminBannerEdit.tsx:28, 104`).
- FE 문서가 수정 메서드를 `PUT`으로 표기했지만 실제 백엔드는 `PATCH` (백엔드 docs §1, OpenAPI 자동 생성으로 런타임은 정합).

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 | Controller | Service | Repository | 비고 |
|---|---|---|---|---|---|---|---|
| 1 | GET | `/v1/banners` | `getBanners` (`MpAdminBannerList.tsx:110`) | `BannerController#getBanners` (`web/v1/BannerController.kt:72`, ingest `01-controllers.md:286`) | `BannerService#getBanners` (`service/BannerService.kt:133-173`, ingest `02-services.md:302`) | `BannerRepository#findBanners` (백엔드 docs §6-A, ingest `03-repositories.md:38`) + `BannerFileRepository#findTopByBannerIdInAndDeletedFalseGrouped` (백엔드 docs §6-D) | 권한 없음(JWT만) — RBAC 공백, scope는 `resolveExposureRanges`로 동적 결정 |
| 2 | GET | `/v1/banners/{id}` | `getBanner` (`MpAdminBannerEdit.tsx:140`) | `BannerController#getBanner` (`web/v1/BannerController.kt:34`, ingest `01-controllers.md:287`) | `BannerService#getById` (`service/BannerService.kt:123-131`) | `BannerRepository#findByIdOrNull` + `BannerFileRepository#findTopBy...Grouped` (백엔드 docs §6-B/§6-D) | 미존재 시 `IllegalArgumentException`→500 (백엔드 5-J), `note` 일반 사용자 노출 (5-L) |
| 3 | POST | `/v1/banners` (multipart) | `createBanner` (`MpAdminBannerEdit.tsx:89`) | `BannerController#createBanner` (`web/v1/BannerController.kt:47`, ingest `01-controllers.md:288`) | `BannerService#createBanner` (`service/BannerService.kt:44-59`) + `uploadBannerFile` (`:88-110`) | `BannerRepository#save` (§6-C) + `BannerFileRepository#save` (§6-E) + `S3FileRepository#save` (§6-F) | `@RequiredRole(ADMIN_ONLY, BANNER_MANAGEMENT)` (ingest `01-controllers.md:288`), `S3FileUploadEvent` AFTER_COMMIT 비동기 |
| 4 | PATCH | `/v1/banners/{id}` (multipart) | `updateBanner` (`MpAdminBannerEdit.tsx:104`) | `BannerController#updateBanner` (`web/v1/BannerController.kt:61`, ingest `01-controllers.md:289`) | `BannerService#updateBanner` (`service/BannerService.kt:62-86`) | `BannerRepository#findByIdOrNull` + `save`(dirty) + `BannerFileRepository#save` (백엔드 docs §6-C/§6-E) | FE 문서엔 `PUT`이라고 적혀 있음(추정: OpenAPI 자동변환). 이미지 교체 시 기존 `banner_file` 잔존(5-D) |

## 3. DB 테이블

- `banner` (4행, ingest `04-domain.md:72`, `Banner.kt:11`): `id, title, link_url, status(VISIBLE/HIDDEN), scope(ENTIRE/CONTRACT/NON_CONTRACT), position(ALL/POPUP/PC_MAIN/PC_COMMUNITY/MOBILE_MAIN), display_order, view_count/click_count/ctr (dead column), note, start_at, end_at, created_at, modified_at`. PK 외 인덱스 없음.
- `banner_file` (10행, ingest `04-domain.md:73`, `BannerFile.kt:7`): `id, banner_id(NULL허용), s3_file_id(NULL허용), display_order(항상 0)`. **`deleted` 컬럼 없음** → soft delete 불가, BaseEntity 비상속(ingest `04-domain.md:312`).
- `s3_file` (`S3File.kt:9`, ingest `04-domain.md:71`): 배너 이미지 메타. `BannerFile`는 `s3_file`와 N:1 EAGER (ingest `04-domain.md:398`).
- 핵심 enum: `BannerStatus`, `BannerScope`, `BannerPosition` (ingest `04-domain.md:111-113`).

핵심 JOIN (목록 + 최신 이미지 1건 매핑, 백엔드 docs §6-A·§6-D 인용):

```sql
SELECT
    b.id, b.title, b.link_url, b.status, b.scope, b.position,
    b.display_order, b.view_count, b.click_count, b.ctr, b.note,
    TO_CHAR(b.start_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS start_at,
    TO_CHAR(b.end_at,   'YYYY-MM-DD"T"HH24:MI:SS') AS end_at,
    s3.cloudfront_url
FROM banner b
LEFT JOIN banner_file bf
       ON bf.banner_id = b.id
      AND bf.id = (
          SELECT MAX(bf2.id)
          FROM banner_file bf2
          JOIN s3_file s2 ON s2.id = bf2.s3_file_id AND s2.deleted = false
          WHERE bf2.banner_id = b.id
      )
LEFT JOIN s3_file s3 ON s3.id = bf.s3_file_id AND s3.deleted = false
WHERE (CAST(:startAt AS timestamp) IS NULL OR b.start_at <= :startAt)   -- 완전 포함 의미 (5-C)
  AND (CAST(:endAt   AS timestamp) IS NULL OR b.end_at   >= :endAt)
  AND (:bannerStatus IS NULL OR b.status = :bannerStatus)
  AND (:applyBannerFilter = FALSE OR b.position IN (:bannerPositions))
  AND  b.scope IN (:bannerScopes)
ORDER BY b.display_order ASC, b.id DESC
LIMIT :size OFFSET :page * :size;
```

## 4. 권한·트랜잭션

- 인증: 모든 EP `JwtAuthenticationFilter` 통과 필요(ingest `05-security.md:13-15`). 비로그인은 `SecurityConfig`가 차단.
- 메서드 권한: POST/PATCH만 `@RequiredRole(mode = ADMIN_ONLY, permission = BANNER_MANAGEMENT)` (`01-controllers.md:288-289`). GET 2종은 `@RequiredRole` 부재 — USER도 `HIDDEN` 배너·관리자 메모(`note`)까지 조회 가능 (백엔드 5-A/5-L). 추정: 구 medipanda에서 사용자 화면과 관리자 화면이 같은 EP를 공유하던 설계 잔재.
- 트랜잭션: `BannerService` 클래스 레벨 `@Transactional` (ingest `02-services.md:302`, REQUIRED). `createBanner`/`updateBanner`는 단일 TX. 이미지 S3 업로드는 `S3FileUploadEvent` → `S3FileUploadListener@TransactionalEventListener(AFTER_COMMIT)` 코루틴 비동기 (ingest `06-config.md:172, 275`). TX 롤백 시 S3 업로드는 발생 안 함.
- 외부 연동: AWS S3 버킷 `medipanda` / 리전 `ap-northeast-2` (ingest `06-config.md:107, 169-173`), 이미지는 CloudFront URL로 응답.

## 5. 리스크 / 후속 액션

- (RBAC) `GET /v1/banners`, `GET /v1/banners/{id}` 권한 부재 + `note` 노출 — admin DTO 분리 또는 `@RequiredRole` 추가. (백엔드 5-A, 5-L)
- (Dead column) `view_count/click_count/ctr` 항상 0인데 FE 목록·통계 컬럼 노출 → 관리자 혼선. 집계 구현 또는 컬럼·UI 제거 결정 필요. (`Banner.kt:36-42`, 백엔드 5-B)
- (UX) 게시기간 필터가 "완전 포함" 의미라 "기간 중 하루라도 노출"을 못 잡음. JPQL을 overlap(`start <= :endAt AND end >= :startAt`)로 변경 권장. (백엔드 5-C)
- (S3 누수) `updateBanner` 시 기존 `banner_file`/`s3_file` soft delete 미수행. banner id=3 기준 6장 누적. `banner_file.deleted` 컬럼 신설 + 이전 행 deleted=true 패턴 도입. (백엔드 5-D, 6-Z-3/4)
- (운영 정합) `status=VISIBLE`이지만 `end_at`이 과거인 배너(id=3)가 목록에 "노출"로 표기. 만료 자동 전환 스케줄러 또는 응답 DTO `isLiveNow` 파생 필드. (백엔드 5-G)
- (HTTP) FE 문서가 수정 메서드를 `PUT`으로 적었으나 실제는 `PATCH`. FE 문서 정정. (백엔드 5-, FE docs §1)
- (DELETE 부재) 완전 삭제 경로 없음 — `status=HIDDEN` 운영 패턴이 사실상 유일. 추정: 의도된 설계지만 FE/백 문서 양쪽에 명시 필요. (백엔드 5-I)
- (오류 매핑) `IllegalArgumentException` → 500. 미존재 id 접근 시 사용자에게 "서버 오류"로만 보임. `ResponseStatusException(NOT_FOUND)` 전환. (백엔드 5-J)
- (DB 제약) `banner_file.banner_id`/`s3_file_id` NULL 허용, `banner.position` CHECK 부재, `display_order` UNIQUE 부재. (백엔드 5-K, 5-M)
- (TZ) `LocalDateTime` + Postgres `timestamp without time zone` + FE `DateTimeString` 조합으로 9시간 어긋남 가능. (백엔드 5-N)

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/11_BANNER.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/11_BANNER.md`
- 프론트 코드: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminBannerList.tsx`, `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminBannerEdit.tsx`
- 백엔드 컨트롤러: `medipanda-api/.../web/v1/BannerController.kt:29` (ingest `01-controllers.md:34, 281-289`)
- 백엔드 서비스: `medipanda-api/.../service/BannerService.kt` (ingest `02-services.md:302`)
- 백엔드 리포지토리: `BannerRepository`, `BannerFileRepository` (ingest `03-repositories.md:38-39`)
- 도메인/enum: `Banner.kt:11`, `BannerFile.kt:7`, `BannerStatus.kt:3/20`, `Banner.kt:77` (ingest `04-domain.md:72-73, 111-113`)
- 보안: `05-security.md:13-15, 146-160` (`@RequiredRole` 모델), 컨트롤러 매트릭스 `01-controllers.md:288-289`
- 외부 연동: `06-config.md:107, 168-173, 273-276` (S3 버킷·비동기 업로드 리스너)

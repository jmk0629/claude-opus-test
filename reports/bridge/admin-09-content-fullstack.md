# admin-09 콘텐츠 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer 폴백)
> 입력: FE `docs/admin/09_CONTENT_MANAGEMENT.md` (메디판다 web-test) / BE `docs/admin/09_CONTENT_MANAGEMENT.md` (medipanda-api) / `reports/backend-ingestion-20260427/01~06`

## 1. 화면 요약

콘텐츠 관리 메뉴는 **전혀 다른 3개 도메인**을 한 좌측 메뉴로 묶은 hybrid 화면이다 (FE §1 라우트 흐름).

| 서브메뉴 | 라우트 | 화면 파일 | 도메인 / 컨트롤러 | CRUD |
|---|---|---|---|---|
| 개원병원페이지 | `/admin/hospitals` | `MpAdminHospitalList.tsx` (429줄) | `HospitalController` (+ region) | **R only** (등록/수정/삭제 버튼 주석) |
| CSO A to Z 목록 | `/admin/atoz` | `MpAdminAtoZList.tsx` (357줄) | `BoardController` + `boardType=CSO_A_TO_Z` | R · D |
| CSO A to Z 상세 | `/admin/atoz/:boardId` | `MpAdminAtoZDetail.tsx` (172줄) | 동상 | R |
| CSO A to Z 등록/수정 | `/admin/atoz/(new\|:id/edit)` | `MpAdminAtoZEdit.tsx` (341줄) | 동상 | C · U (multipart) |
| 이벤트관리 목록 | `/admin/events` | `MpAdminEventList.tsx` (390줄) | `EventBoardController` | R · D |
| 이벤트 상세 | `/admin/events/:eventId` | `MpAdminEventDetail.tsx` (203줄) | 동상 | R |
| 이벤트 등록/수정 | `/admin/events/(new\|:id/edit)` | `MpAdminEventEdit.tsx` (408줄) | 동상 | C · U (multipart, 썸네일 NOT NULL) |

**약관(Terms)**은 이 메뉴 영역이 **아니다** — FE 문서 §1 메뉴 위치와 BE 문서 §0 모두 약관 미언급. (약관은 별도 메뉴 — 본 메뉴는 **개원병원 + CSO A to Z 게시판 + 이벤트 게시판** 3종 묶음.)

특이 클라이언트 패턴 (FE §2):
- 시도/시군구 `-1` = "미선택" 마커 (URL은 문자열, form은 number, Select은 `''`로 변환)
- `regionCategoryId`는 시군구 우선·없으면 시도·둘 다 없으면 `undefined`
- 마운트 시 `Promise.all` 로 17개 시도의 모든 시군구 사전 캐시 (`Record<sidoId, sigungu[]>`)
- 이벤트 상세는 **중첩 구조**: `detail.boardPostDetail.title/content/attachments` + `detail.eventStartDate/endDate/thumbnailUrl/...`
- 첨부파일 `attachedFiles`(서버 기존) vs `newFiles`(신규 multipart) 두 상태로 관리, 수정 시 `keepFileIds` 로 유지 목록만 전달

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 출처: BE 문서 §1 표 + `01-controllers.md:35,37,292,320` + `02-services.md:219,307` + `03-repositories.md:20,40,43,52,91,95`

| # | 영역 | FE 호출 (문서 표기) | 실제 BE 경로 / Method | 컨트롤러:라인 | 서비스:라인 | 리포지토리 메서드 | RBAC |
|---|---|---|---|---|---|---|---|
| 1 | 개원병원 목록 | `GET /v1/hospitals` | `GET /v1/hospitals` | `HospitalController#getHospitals:57` | `HospitalService#searchHospitals:41` | `HospitalRepository#findByConditions:47` (native) | **❌** |
| 2 | 개원병원 단건 삭제 | `DELETE /v1/hospitals/{id}` | 동일 | `HospitalController#softDeleteHospital:78` | `HospitalService#softDeleteHospital:111` | `HospitalRepository.save` (deleted=true) | **❌** |
| 3 | ⚠️ 병원 전체 TRUNCATE | (FE 없음) | `DELETE /v1/hospitals/all` | `HospitalController#deleteAll:88` | `HospitalService.deleteAll` (entityManager native) | `TRUNCATE ... RESTART IDENTITY CASCADE` | **❌ permitAll** (security 05:53) |
| 4 | ⚠️ 병원 bulk insert | (FE 없음) | `POST /v1/hospitals/bulk-upsert` | `HospitalController#bulkUpsert:95` | `HospitalService#bulkUpsert:129` | `RegionCategoryRepository.findAllActiveByDepthIn` + `Hospital.saveAll` | **❌ permitAll** |
| 5 | 최근 개원 카운트 | (FE 없음) | `GET /v1/hospitals/opened/count` | `HospitalController#getRecentlyOpenedCount:46` | `HospitalService#getRecentlyOpenedCount:106` | `HospitalRepository#countOpenedBetween` (JPQL) | ❌ |
| 6 | 시도 조회 | `GET /v1/region-categories/sido` ⚠️ | `GET /v1/hospitals/regions/sido` | `HospitalController#getAllSido:29` | `HospitalService#listSido:84` + `HospitalSidoCountCacheService` | `RegionCategoryRepository#findAllByDepthAndDeletedFalse(1)` | ❌ |
| 7 | 시군구 조회 | `GET /v1/region-categories/sido/{id}/sigungu` ⚠️ | `GET /v1/hospitals/regions/sido/{sidoId}/sigungu` | `HospitalController#getSigunguBySido:37` | `HospitalService#listSigungu:98` | `RegionCategoryRepository#findAllByParentIdAndDepthAndDeletedFalse(:id, 2)` | ❌ |
| 8 | CSO A to Z 목록 | `GET /v1/boards?boardType=CSO_A_TO_Z` | 동일 | `BoardController#getBoards:107` | `BoardService.getBoards` | `BoardPostRepository#findAllWithStatistics` (08-§6-B) | **❌** |
| 9 | CSO A to Z 상세 | `GET /v1/boards/{id}` | 동일 | `BoardController#getBoardDetails:207` | `BoardService.getBoardDetails` | `findBoardDetails` + `findChildrenByParentId` (전량) | ❌ |
| 10 | CSO A to Z 등록 | `POST /v1/boards` (multipart) | 동일 | `BoardController#createBoardPost:159` | `BoardService#createBoardPost:295` | `BoardPostRepository.save` + `BoardStatisticsRepository.save` + push | ❌ (boardType 클라 지정) |
| 11 | CSO A to Z 수정 | `PUT /v1/boards/{id}` (multipart) | 동일 | `BoardController#updateBoardPost:179` | `BoardService.updateBoardPost` | `BoardPost.save` + `BoardPostFileRepository` | ❌ (소유자 체크 한정) |
| 12 | CSO A to Z 삭제 | `DELETE /v1/boards/{id}` | 동일 | `BoardController#deleteBoardPost:169` | `BoardService.softDeleteBoardPost` | `softDeleteByPostId` + `softDeleteChildrenByParentId` + comment soft delete | ❌ (소유자/ADMIN) |
| 13 | 이벤트 목록 | `GET /v1/event-boards` ⚠️ | `GET /v1/events` | `EventBoardController#getEventBoards:95` | `EventBoardService#getEventBoards:35` | `EventBoardRepository#searchEventBoards:49` (JPQL projection 10필드) | **❌** |
| 14 | 이벤트 상세 | `GET /v1/event-boards/{id}` ⚠️ | `GET /v1/events/{id}` | `EventBoardController#getEventBoardDetails:120` | `EventBoardService.getEventBoardDetails` | `EventBoardRepository.findById` + `BoardService.getBoardDetails` | ❌ |
| 15 | 이벤트 등록 | `POST /v1/event-boards` (multipart) ⚠️ | `POST /v1/events` | `EventBoardController#createEventBoard:36` | `EventBoardService.createEventBoard:88` | `BoardService.createBoardPost` + `S3FileService.upload(EVENT_THUMBNAIL)` + `EventBoardRepository.save` | ❌ |
| 16 | 이벤트 수정 | `PUT /v1/event-boards/{id}` (multipart) ⚠️ | **`PATCH /v1/events/{id}`** ⚠️ | `EventBoardController#updateEventBoard:68` | `EventBoardService.updateEventBoard:125` | `EventBoardRepository.save` (title 미동기 — 5-K) | ❌ |
| 17 | 이벤트 soft delete | `DELETE /v1/event-boards/{id}` | `DELETE /v1/events/{id}` | `EventBoardController#softDeleteEventBoard:57` | `EventBoardService.softDeleteEventBoard:161` | `EventBoardRepository.save(deleted=true)` (board_post 미동기 — 5-O) | ❌ |

> ⚠️ FE 문서/코드는 5곳(region 2 + event-boards 4) **잘못된 경로**. Swagger 생성 클라이언트가 실제 경로로 변환되어 호출되므로 런타임 동작은 OK (BE §5-B).
> ⚠️ 17/17 엔드포인트 전부 `@RequiredRole` 부재 (BE §5-A, ingestion `05-security.md:53,58,267,310`).

## 3. DB 테이블

| 테이블 | 행수(로컬) | PK | 핵심 컬럼 / 제약 | 출처 |
|---|---|---|---|---|
| `hospital` | **79,834** | seq_hospital(alloc 50) | `management_number` UNIQUE, `region_category_id` FK, `coord_x/y` varchar(50)(좌표를 문자열 — 5-P), `sido/sigungu` varchar 중복 컬럼 (5-R), `deleted` soft | BE §3-1, ingest `04-domain.md:58` |
| `region_category` | 275 (root1+시도18+시군구256) | IDENTITY | 자기참조 `parent_id`, `depth(0/1/2)`, `id_path` `1\|2\|9009` 파이프 (btree idx — 5-Q), `name_path`, `deleted` | BE §3-2, `04-domain.md:59` |
| `event_board` | 3 | IDENTITY | `board_post_id` UNIQUE FK 1:1 (CASCADE.ALL — `04-domain.md:213`), `thumbnail_file_id` NOT NULL FK→`s3_file`, `title` varchar(255) **이중저장 (5-K)**, `description` varchar(255) **255자 제한**, `event_start/end_date` **integer YYYYMMDD**, `video_url`, `note text`, `deleted` | BE §3-3, `04-domain.md:68,213` |
| `board_post` (CSO_A_TO_Z = 13건, EVENT = 3건) | — | — | `boardType` enum, `deleted`, `is_exposed`, `exposure_range`, `member_id` FK | 08 메뉴 공유 |
| `board_statistics` | per post | board_post_id PK | `views/comment/likes_count` (`insertIfAbsentInit` ON CONFLICT — 6-L) | BE §6-L |
| `s3_file` | per upload | IDENTITY | `prefix_key='EVENT_THUMBNAIL'`, `cloudfront_url`, `deleted` (썸네일 교체 시 orphan — 5-N) | BE §5-N |

핵심 JOIN:

```sql
-- 이벤트 목록 (status='IN_PROGRESS', today=20260421)
SELECT
    e.id,
    bp.title,                    -- ⚠️ e.title 아님 (5-K)
    e.description,
    tf.cloudfront_url            AS thumbnail_url,
    e.event_start_date,
    e.event_end_date,
    bp.is_exposed,
    COALESCE(bs.views_count, 0)  AS views_count,
    e.created_at,
    CASE
        WHEN 20260421 BETWEEN e.event_start_date AND e.event_end_date THEN 'IN_PROGRESS'
        ELSE 'FINISHED'           -- ⚠️ UPCOMING 분기 없음 (5-J)
    END AS status
FROM event_board e
JOIN board_post           bp ON bp.id = e.board_post_id
LEFT JOIN s3_file         tf ON tf.id = e.thumbnail_file_id
LEFT JOIN board_statistics bs ON bs.board_post_id = bp.id
WHERE e.deleted = false
  AND bp.exposure_range IN ('ALL','CONTRACTED','UNCONTRACTED')
  AND 20260421 BETWEEN e.event_start_date AND e.event_end_date
ORDER BY e.id DESC LIMIT 20 OFFSET 0;

-- 개원병원 목록 (서울 9009 + '메디')
SELECT h.*
FROM hospital h
WHERE h.deleted = false
  AND h.name ILIKE '%메디%'
  AND h.license_date BETWEEN CAST('2025-01-01' AS date) AND CAST('2025-12-31' AS date)
  AND h.region_category_id IN (
        9009,
        SELECT id FROM region_category WHERE deleted=false AND id_path LIKE '1|2|9009|%'
  )
ORDER BY h.license_date DESC NULLS LAST  -- 하드코딩, pageable.sort 무시 (5-D)
LIMIT 50 OFFSET 0;
```

## 4. 권한·트랜잭션

**권한·노출 정책:**
- ingest `05-security.md:53` 기준 `/v1/hospitals/bulk-upsert`, `/v1/hospitals/all` 은 **`permitAll`** — 인증조차 안 함. 그 외 17개 EP 는 인증만 요구, **`@RequiredRole` 0건**.
- FE 화면은 `/admin/*` 가드로 들어가지만 BE 단독 호출 시 **일반 회원 토큰으로도 전부 가능**.
- `BoardPostCreateRequest.boardType` 을 클라가 임의 지정 → 일반 회원도 `CSO_A_TO_Z` 글 생성 가능 (BE §5-A·5-H).
- `CSO_A_TO_Z + isExposed=true` 신규 작성 시 `BoardService.publishPushEvent` → `TemplateCode.User.CSO_ATOZ_CONTENT` 가 `ReceiverType.ALL` 전 회원 푸시 (BE §5-H, 멱등성 없음).
- 노출 범위는 `bp.exposure_range IN ('ALL','CONTRACTED','UNCONTRACTED')` 로 일괄 — 회원 타입별 분리 노출 미적용.

**트랜잭션:**
- `EventBoardService.createEventBoard` `@Transactional` 부착이지만 `s3FileService.upload` 의 외부 부작용은 롤백 불가 → S3 orphan 가능 (BE §5-M).
- `HospitalService.softDeleteHospital` `@Transactional` 미부착 (`02-services.md:386 RISK-2`) — save 1회뿐이라 동작은 OK 이나 규칙 위반.
- `HospitalService.bulkUpsert` 는 `REQUIRED` 트랜잭션이지만 `saveAll(persist)` 단일 호출이라 **UNIQUE 충돌 시 배치 전체 롤백**, 이름은 upsert지만 동작은 insert-only (BE §5-G).
- `EventBoardService.softDeleteEventBoard` 는 `event_board.deleted=true` 만 — `board_post.deleted` 미동기 → `GET /v1/boards?boardType=EVENT` 로 여전히 노출 (BE §5-O).
- `EventBoardService.updateEventBoard` 는 `bp.title`만 갱신, `e.title` 미동기 → 검색은 `e.title` 기준이므로 수정 후 옛 제목으로 검색됨 (BE §5-K).
- `EventBoardService.getEventBoardDetails` 는 `deleted=true` 이벤트도 `findById` 로 반환 + 조회수 증가 (BE §5-L).

## 5. 리스크 / 후속 액션

| ID | 심각도 | 요약 | 출처 |
|---|---|---|---|
| **5-F** | **P0** | `DELETE /v1/hospitals/all` 무인증 TRUNCATE — 79,834 rows + seq RESTART. `permitAll`. 1회 호출이면 전량 파괴 | BE §5-F, ingest `05-security:53,267,310` |
| 5-G | P1 | `bulk-upsert` 무인증 + 실제 동작은 insert-only (UNIQUE 충돌 시 배치 전체 fail) | BE §5-G |
| 5-A | P1 | 17/17 RBAC 부재. 일반 회원 토큰으로 이벤트/A to Z/병원 CRUD 전부 가능 | BE §5-A |
| 5-H | P1 | A to Z 신규 저장 시 전 회원 푸시 — 멱등성 없음, 재작성=중복 푸시 | BE §5-H |
| 5-K | P2 | `event_board.title` ↔ `board_post.title` 이중저장, 수정이 한쪽만 갱신 → 검색/표시 불일치 | BE §5-K |
| 5-O | P2 | 이벤트 soft delete 시 `board_post` 미동기 → `/v1/boards` 에서 노출 잔존 | BE §5-O |
| 5-L | P2 | 삭제된 이벤트 상세 열람 가능 + 조회수 증가 | BE §5-L |
| 5-N | P3 | 썸네일 교체 시 이전 `s3_file` orphan 누적 | BE §5-N |
| 5-M | P3 | 이벤트 생성 트랜잭션 부분 실패 시 S3 orphan | BE §5-M |
| 5-J·5-I | P3 | `EventStatus.UPCOMING` 분기 없음 / `today` UTC 기준 → KST 00~09시 하루 어긋남 | BE §5-I,J |
| 5-D | P3 | `findByConditions` native에 ORDER BY 하드코딩, `pageable.sort` 무시 | BE §5-D |
| 5-B | P3 | FE 문서 경로 5곳 (region 2 + event-boards 4 + 메서드 PUT→PATCH) 실제 BE 와 불일치 — Swagger 클라가 흡수 | BE §5-B |
| 5-P·5-R | P3 | `hospital.coord_x/y` varchar 좌표 / `sido/sigungu` 문자열과 `region_category_id` FK 중복 (이름 매칭 실패 시 unmapped) | BE §5-P,R |

**즉시 액션 (P0/P1):**
1. `DELETE /v1/hospitals/all` — 엔드포인트 제거 또는 `@RequiredRole(SUPER_ADMIN_ONLY)` + IP allowlist + Spring Security `authenticated()` 격상.
2. `POST /v1/hospitals/bulk-upsert` — 동일 권한 + `INSERT ... ON CONFLICT(management_number) DO UPDATE` 로 재구현.
3. `EventBoardController` 와 `BoardController`(CSO A to Z 등록/수정/삭제) 에 `@RequiredRole(ADMIN_ONLY, CONTENT_MANAGEMENT)` 부착.
4. `BoardService.createBoardPost` 가 클라 입력 `boardType=CSO_A_TO_Z` 를 ADMIN 외 거절하도록 검증 추가.
5. A to Z 푸시 멱등 키 (post_id 단위 1회) 도입.

## 6. 참조

- FE: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/09_CONTENT_MANAGEMENT.md` (라우트 §1, 핵심개념 §2, 페이지별 §3~9)
- FE 화면: `medipanda-web-test/src/pages-admin/MpAdminHospitalList.tsx`, `MpAdminAtoZList|Detail|Edit.tsx`, `MpAdminEventList|Detail|Edit.tsx`
- BE: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/09_CONTENT_MANAGEMENT.md` (§1 EP 표, §2 EP별 상세, §3 테이블, §5 이슈, §6 Repository→SQL)
- BE 컨트롤러: `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/HospitalController.kt`, `EventBoardController.kt`, `BoardController.kt`
- BE 서비스: `service/HospitalService.kt`, `EventBoardService.kt`, `BoardService.kt`
- BE 리포지토리: `HospitalRepository.kt`, `RegionCategoryRepository.kt`, `EventBoardRepository.kt`, `BoardStatisticsRepository.kt`
- 인게스트 출처:
  - `reports/backend-ingestion-20260427/01-controllers.md:35,37,292,320,406`
  - `reports/backend-ingestion-20260427/02-services.md:219,226,307,386`
  - `reports/backend-ingestion-20260427/03-repositories.md:20,40,43,52,91,95,198`
  - `reports/backend-ingestion-20260427/04-domain.md:58,59,68,213,263,303,307,381,392`
  - `reports/backend-ingestion-20260427/05-security.md:15,53,58,146,267,310,318,356`
  - `reports/backend-ingestion-20260427/06-config.md:208,413` (외부 hospital WebClient — 본 메뉴 직접 사용 X, 참고)
- 연관 메뉴: `admin-08-community` (공용 `/v1/boards` 재사용 — 본 문서 §2 #8~12)

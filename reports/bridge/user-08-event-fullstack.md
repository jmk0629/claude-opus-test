# user-08 이벤트 (사용자) — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`user/08_EVENT.md`) / 백엔드 docs(`user/08_EVENT.md`) / 백엔드 ingest(`reports/backend-ingestion-20260427/`)

## 1. 화면 요약

- 페이지(2개):
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/EventList.tsx` — 이벤트 목록(`/events?page=N`). 카드(썸네일 + 제목 + `eventStartAt~eventEndAt`) + `DateUtils.isExpired(utcToKst(eventEndAt))` 시 `opacity:0.8` "종료" 오버레이. URL `page` 만 상태 소스, 검색·필터 UI 없음.
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/EventDetail.tsx` — 이벤트 상세(`/events/:id`). `useMedipandaEditor()` Tiptap 읽기 전용 본문(`detail.boardPostDetail.content`) + 헤더(`boardPostDetail.title`/`description`/`viewsCount`/`eventStartDate~eventEndDate`).
- 핵심 사용자 액션:
  1) 목록 진입 — `getEventBoards({page: page-1, size:10})` (UI 1-based → API 0-based). `eventStatus` 라벨/`isExposed` 등 백엔드 자동 산출은 미사용(필터 UI 없음).
  2) 상세 진입 — `getEventBoardDetails(id)` 후 `editor.commands.setContent(detail.boardPostDetail.content)`. **호출만으로 `board_post_view` INSERT + `viewsCount += 1`** (BE docs §2-2, USER 역할일 때만 증가).
  3) 본문 내 링크 클릭 인터셉트 — Tiptap `editor.view.dom` 에 native `addEventListener('click')` 등록 → `target.closest('a')` 로 `<a>` 추출 → `isEventUrl(url)` (`medipanda.co.kr|dev.medipanda.co.kr` + `/event\d*\.html` / `/promotion.*\.html` / `/special/.*\.html` 정규식) 통과 시 `createPromotionToken()` POST → 응답 token 을 `?data=<token>` 으로 외부 정적 HTML 에 부착하여 모바일은 `location.href`, 데스크톱은 `window.open(_, _, "width=600,height=800")`. 비-이벤트 URL 은 그냥 `window.open(url,'_blank')`.
- 잘못된 ID 가드: `Number.isNaN(eventId)` → `alert + navigate('/events',{replace:true})`. `useEffect` 두 개로 분리(데이터 로드 / 에디터 초기화·리스너 등록·cleanup).
- 출처: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/08_EVENT.md:18-35, 107-157, 401-654`

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

> 사용자 화면이 호출하는 EP 는 컨트롤러 5개 중 **2개(GET 목록·상세)** + Auth 1개(POST 토큰). 이벤트 컨트롤러는 admin/09 와 **동일 인스턴스**라 admin 측 C/U/D 3개 EP 까지 같은 컨트롤러 안에 묶여 권한 분리가 메서드 레벨에선 부재(§4 R1).

| # | HTTP | Path | 프론트 함수 (`backend.ts`) | Controller | Service | Repository / 위임 | 비고 (출처) |
|---|------|------|---------------------------|-----------|---------|-------------------|-----|
| 1 | GET | `/v1/events` | `getEventBoards` | `EventBoardController#getEventBoards:94` (`01-controllers.md:296`) | `EventBoardService#getEventBoards:35` | `EventBoardRepository#searchEventBoards:14-58` (JPQL, 10필드 projection) | List(size=10). `loginUser` 의 role+memberType 으로 `ExposureRange.resolveExposureRanges` 산출 → JPQL `IN (:exposureRanges)` 주입. **컨트롤러 `exposureRanges` 파라미터는 서비스에 전달 안 됨(BE docs §5-B)**. JPQL 의 `ORDER BY e.id DESC` 가 Pageable Sort 무시(§5-E). UPCOMING 도 `FINISHED` 라벨(§5-C). (BE docs §2-1) |
| 2 | GET | `/v1/events/{id}` | `getEventBoardDetails` | `…Controller#getEventBoardDetails:120` (`01-controllers.md:297`) | `…Service#getEventBoardDetails:160-182` | `EventBoardRepository.findById` (EAGER fetch boardPost) + `BoardService#getBoardDetails`(`postId, filterBlind=null, filterDeleted=null`) | `EventBoardDetailsResponse` = `boardPostDetail`(중첩 `title/content/viewsCount/attachments`) + `description`/`eventStartDate`/`eventEndDate`(YYYY-MM-DD). **soft-deleted 이벤트도 200 응답**(§5-F). USER 호출 시 `board_post_view` INSERT + `views_count += 1`. (BE docs §2-2) |
| 3 | POST | `/v1/auth/promotion-token` | `createPromotionToken` | `AuthController#createPromotionToken:102-115` | `AuthService#createPromotionToken:282-301` | `MemberRepository.whoAmI(userId, response)` → `PromotionConfig.secretKey` 로 `encryptUserData` (XOR) | `eventData = {id, name, birthdate, phone, email, timestamp(ms)}` → 반복 XOR 후 `PromotionTokenResponse{token, expiresAt}`. **PII 5개 필드를 외부 정적 HTML 의 쿼리스트링으로 노출** (§5-I). BLOCKED 회원도 모든 `Exception` catch → 500 으로 포장(§5-H). |

> 미호출(컨트롤러 존재): `POST /v1/events`, `PATCH /v1/events/{id}`, `DELETE /v1/events/{id}` — admin/09 콘텐츠관리 흐름. user 화면은 RouterLink 를 노출하지 않지만 백엔드는 `@RequiredRole` 부재라 **USER 토큰으로도 호출 가능**(§5-A, admin-09 매트릭스 #15·#16·#17 과 동일 EP).

## 3. DB 테이블

- 핵심 1개 + 위임 게시판 4개:
  - `event_board` — 이벤트 본체. `event_start_date`/`event_end_date` 는 **Int(yyyyMMdd)** (정산·영업대행과 동일 패턴, KST 운영 가정). `title varchar(255) NOT NULL` — **생성 시 snapshot**, 이후 어떤 EP 에서도 갱신 안 됨(§5-D drift). `description varchar(255)` — 프론트 EventList 는 주석 처리(§5-M). `deleted boolean` soft delete. `board_post_id` UNIQUE → 1:1 강제. `thumbnail_file_id` → `s3_file` (UNIQUE 아님, 공유 가능). `OneToOne(EAGER, CASCADE.ALL)` (`04-domain.md:213, 263, 307, 381`).
  - `board_post` — `title`/`content`(Tiptap)/`is_exposed`/`exposure_range`(ALL/CONTRACTED/UNCONTRACTED)/`deleted`. `e.title` 검색 vs `bp.title` SELECT 의 키-표시 불일치(§5-D).
  - `board_statistics` — `views_count` 만 사용(이벤트는 댓글·좋아요 UI 없음). USER 호출 시만 증가, ADMIN priority 이상 미증가.
  - `board_post_view` — 조회 기록(중복 방지 BoardService 내부).
  - `s3_file` — `thumbnailFile.cloudfrontUrl` 노출. `searchEventBoards` JPQL 에서 `e.thumbnailFile.cloudfrontUrl` 사용 → Hibernate 가 `JOIN s3_file` 로 풀어냄.

핵심 JOIN(`searchEventBoards` JPQL → Postgres, 사용자 호출 기준 / `today=20260421`, role=USER, memberType=CONTRACT, `[ALL,CONTRACTED]`):

```sql
-- equivalent to: GET /v1/events?page=0&size=10 (user)
SELECT
  e.id, bp.title, e.description, sf.cloudfront_url AS thumbnail_url,
  e.event_start_date, e.event_end_date, bp.is_exposed,
  COALESCE(stats.views_count, 0) AS views_count,
  e.created_at,
  CASE WHEN 20260421 BETWEEN e.event_start_date AND e.event_end_date
       THEN 'IN_PROGRESS' ELSE 'FINISHED' END AS event_status
FROM event_board e
JOIN board_post bp           ON bp.id = e.board_post_id
JOIN s3_file sf              ON sf.id = e.thumbnail_file_id
LEFT JOIN board_statistics stats ON stats.board_post_id = bp.id
WHERE e.deleted = FALSE
  AND bp.exposure_range IN ('ALL','CONTRACTED')   -- 서비스가 role/memberType 으로 산출
ORDER BY e.id DESC                                 -- Pageable Sort 무시(§5-E)
LIMIT 10 OFFSET 0;
```

(BE docs §6-1; UPCOMING 인 이벤트도 위 CASE 의 ELSE 가지로 빠져 `'FINISHED'` 라벨이 됨 — §5-C.)

## 4. 권한·트랜잭션 (admin/09 와의 차이)

- **인증/인가**: 사용자 화면 호출 3개 EP 전부 `JWT 필요` 만 표기, `@RequiredRole` 미적용. admin/09 매트릭스 #13~#17 과 **컨트롤러 자체가 동일** — 즉 user/admin 분리는 컨트롤러 레벨이 아니라 프론트 라우트(`/events` vs `/admin/events`)에만 존재. (`01-controllers.md:294-300, 406`, `05-security.md` /v1/events 별도 라인 없음 → `/v1/**` authenticated 기본 적용)
- **R1과 동일 리스크 (Critical, admin/09 R1 과 동치)**: USER 토큰으로 `POST /v1/events`, `PATCH /v1/events/{id}`, `DELETE /v1/events/{id}` 직접 호출 가능. `updateEventBoard` 만 `BoardService#updateBoardPost` 내부에서 `board_post.user_id` 소유자 체크가 걸려 BoardPost 수정은 차단되지만, **이벤트 전용 필드(`eventStartDate`/`eventEndDate`/`description`/`videoUrl`/`note`/`thumbnailFile`)는 소유자 체크 없이 USER 가 갱신 가능** (BE docs §5-A, §5-J).
- **사용자 시점 추가 공백**:
  - **soft-delete 우회(§5-F)**: `softDeleteEventBoard` 가 `event_board.deleted = true` 만 세팅하고 `board_post.deleted` 는 그대로. `getEventBoardDetails` 가 `eventBoard.deleted` 가드 없이 `findById` → 삭제된 이벤트 URL 직접 공유로 200 응답 + viewsCount 증가까지 발생 (`event_board` 데이터 §4 의 `deleted=0` 과 별개로 향후 운영 위험).
  - **CONTRACTED 노출 자동 산출**: USER+NON_CONTRACT → `[ALL, UNCONTRACTED]`, USER+CONTRACT → `[ALL, CONTRACTED]`. 비계약 회원이 CONTRACTED 이벤트 ID 알면 상세는 200(목록 가드만 존재). `/v1/events/{id}` 에 exposureRange 가드 없음.
  - **프로모션 토큰 PII 노출(§5-I, HIGH)**: `id/name/birthdate/phone/email` 평문이 XOR 암호화 후 `?data=…` 쿼리스트링으로 외부 정적 HTML 에 전달. Referer/접근로그/HTTP 프록시에 PII 평문 잔존 가능. MAC 부재로 변조 감지 불가.
  - **BLOCKED 회원 → 500(§5-H)**: `whoAmI` 가 `AccessDeniedException` 던지면 컨트롤러가 모든 `Exception` catch → 500. `genLogoutCookie()` 는 세팅되나 상태코드는 500.
- **트랜잭션**: `getEventBoardDetails` 는 BoardService 위임 안에서 `board_post_view` INSERT + `board_statistics.views_count += 1` 발생 (Spring 기본 REQUIRED). `createPromotionToken` 은 DB write 없음(저장된 토큰 로그 테이블 부재 — §6-Z10 권장).
- **admin/09 와의 가장 큰 차이**: admin/09 는 같은 컨트롤러로 C/U/D 까지 노출하지만 user 화면은 R 만 사용 → 동일 컨트롤러에 admin EP 3개가 비인가 상태로 떠 있는 게 user 시점에서도 그대로 위협으로 작동.

## 5. 리스크 / 후속 액션

- **R1 (보안, P0, admin/09 R1 과 동치)**: `EventBoardController` 5개 EP 전체 `@RequiredRole` 부재. → C/U/D 3개에 `@RequiredRole(mode=ADMIN_ONLY, permission=CONTENT_MANAGEMENT)` 부착. R 2개는 `loginUser.userId` 신뢰 외 추가 검증 불요(단 R2/R3 가드 추가). (BE docs §5-A)
- **R2 (soft-deleted 이벤트 상세 우회, P1)**: `getEventBoardDetails` 진입부에 `if (eventBoard.deleted) throw NotFoundException` 추가. 부수효과로 view INSERT + viewsCount 증가도 막힘. (BE docs §5-F, 진단 Z5)
- **R3 (CONTRACTED 노출범위 우회, P1)**: 상세 EP 도 `resolveExposureRanges(role, memberType)` 적용 후 `bp.exposure_range` 멤버십 검사. (BE docs §2-1, 진단 Z9)
- **R4 (프로모션 토큰 PII + XOR, P0/HIGH)**: AES-GCM 으로 교체 + 토큰 페이로드 최소화(`id` + 짧은 nonce 만, 외부 정적 HTML 이 별도 API 로 PII 조회). MAC/서명 추가. `application.yml:11` 의 `promotion.encryption.secret-key` 평문 하드코딩(`05-security.md:209-215`)도 환경변수/Secrets Manager 로 이동. (BE docs §5-I)
- **R5 (UPCOMING → FINISHED 라벨, P2)**: `EventStatus` enum 에 `UPCOMING` 추가 + JPQL CASE 분기. 현재 시작 전 이벤트가 `FINISHED` 로 표시되어 프론트의 종료 오버레이 로직(`isExpired(eventEndAt)`)과 별개로 라벨 자체가 잘못됨. (BE docs §5-C, 진단 Z2)
- **R6 (`event_board.title` ↔ `board_post.title` drift, P2)**: 검색 키(`e.title` LIKE) 와 표시값(`bp.title`)이 어긋남. `event_board.title` 컬럼 제거 + `bp.title` 단일 사용 권장. user 측 영향: 향후 검색 UI 추가 시 결과 누락. (BE docs §5-D, 진단 Z3)
- **R7 (BLOCKED → 500, P2)**: `AccessDeniedException` 을 401/403 으로 분리해 Spring Security ExceptionTranslator 위임. (BE docs §5-H)
- **R8 (조회수 부풀림, P3)**: 상세 호출만으로 viewsCount 증가 — bot/refresh 로 인플레이션 가능. user-07 R5 와 동일 이슈(BoardService 공통 파이프라인). 이벤트 정책상 viewsCount 가 사용자에게 의미 있는지 재확인.

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/08_EVENT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/user/08_EVENT.md`
- admin 측 풀스택 지도(같은 컨트롤러 admin EP 묶음): `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-09-content-fullstack.md`
- 백엔드 ingest:
  - 컨트롤러 매트릭스: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md:35, 292-300, 406`
  - 서비스 카탈로그: `…/02-services.md:307` (`EventBoardService`)
  - 리포지토리 카탈로그: `…/03-repositories.md:40` (`EventBoardRepository`, 1 @Query / 0 derived)
  - 도메인/관계: `…/04-domain.md:68, 165, 213, 263, 307, 381`
  - 보안: `…/05-security.md:200-215` (`AuthService.encryptUserData` XOR, `promotion.encryption.secret-key` 평문 하드코딩); `/v1/events/**` 별도 라인 없음 → `/v1/**` authenticated 기본
  - 설정: `…/06-config.md:107, 168-173` (S3 버킷 `medipanda`, `S3FileUploadListener` 트랜잭션 후 비동기 업로드)
- 프론트 페이지 컴포넌트: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/EventList.tsx`, `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/EventDetail.tsx`
- 출력: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/user-08-event-fullstack.md`

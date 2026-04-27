# admin-08 커뮤니티 관리 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/08_COMMUNITY.md`) / 백엔드 ingest(`/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/`) / 백엔드 docs(`/Users/jmk0629/keymedi/medipanda-api/docs/admin/08_COMMUNITY.md`)

## 1. 화면 요약

- 라우트 4개 + 상세 1개 (`AdminPermission.COMMUNITY_MANAGEMENT`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityUserList.tsx` — 이용자 통계 (`/admin/community-users`, 읽기 전용 255줄)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityPostList.tsx` — 포스트 목록 + 블라인드 (`/admin/community-posts`, 408줄)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityPostDetail.tsx` — 포스트 상세 3탭(post/comments/reports), URL `?tab=` (`/admin/community-posts/:boardId`, 294줄)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityCommentList.tsx` — 댓글 목록 + 블라인드 (`/admin/community-comments`, 395줄)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityBlindList.tsx` — 블라인드 항목 + 해제 (`/admin/community-blinds`, 381줄)
- 핵심 사용자 액션
  1) 4종 목록(이용자/포스트/댓글/블라인드) 검색 — 모두 URL 파라미터 + `useSearchParamsOrDefault` 기반, `filterDeleted/filterBlind` 플래그로 관리자용 전체 조회 (프론트 docs `08_COMMUNITY.md:62-74`, `:83-101`)
  2) 포스트 상세는 단일 API `getBoardDetails`로 본문+댓글트리+신고+첨부+공지를 한 번에 로드 (프론트 docs `:610-628`, 백엔드 docs `08_COMMUNITY.md:103-115`)
  3) 블라인드 토글 — 포스트는 `toggleBlindStatus_1`, 댓글은 `toggleBlindStatus`, `for...of` 순차 처리 (프론트 docs `:107-122`, `:127-138`)
  4) 블라인드 해제 — `unblindPost({postId|commentId})` 단일 엔드포인트 분기, **실제는 toggle**이라 재호출 시 다시 블라인드됨 (백엔드 docs 5-I)
  5) Tiptap 에디터 readonly 뷰어 (`editor.setEditable(false)`) — 본문 인라인 이미지(`PostAttachmentType.EDITOR`)만 필터 (프론트 docs `:191-207`)

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 (호출부) | Controller | Service | Repository | 비고 |
|---|------|------|---------------------|------------|---------|------------|------|
| 1 | GET | `/v1/boards/members` | `getBoardMembers` (`MpAdminCommunityUserList.tsx:318`, 프론트 docs `08_COMMUNITY.md:64`) | `BoardController.getBoardMembers` (`web/v1/BoardController.kt:44`, ingest `01-controllers.md:29`, 백엔드 docs `:16`) | `BoardService.getBoardMembers` (`service/BoardService.kt:58`, ingest `02-services.md:68`) | `BoardPostRepository.findBoardMemberStats` (`repo/BoardPostRepository.kt:357`, **nativeQuery**, ingest `03-repositories.md:87`) | `ADMIN_ONLY, COMMUNITY_MANAGEMENT`. GROUP BY + DISTINCT COUNT, `board_type NOT IN ('EVENT','PRODUCT','SALES_AGENCY')` SQL 하드코딩(백엔드 docs 5-C) |
| 2 | GET | `/v1/boards` | `getBoards` (`MpAdminCommunityPostList.tsx:fetchContents`, 프론트 docs `:67`) | `BoardController.getBoards` (`BoardController.kt:107`, 백엔드 docs `:18`) | `BoardService.getBoards` (`service/BoardService.kt:119`) | `BoardPostRepository.findAllWithStatistics` (`BoardPostRepository.kt:131`, JPQL 22 파라미터, ingest `03-repositories.md:75`) + `findAllFixedTopNotices` (`:220`) + `findPostIdsWithImages` (`BoardPostFileRepository.kt:62`) | `@RequiredRole` **없음** (백엔드 docs 5-M). `MemberBlock` 양방향 EXISTS 2개. `onlyCommunityBoards`(관리자 무필터 시 ANONYMOUS+MR_CSO_MATCHING 자동) (백엔드 docs 5-O). 결과 `postIds`로 이미지 후처리 2단계 |
| 3 | GET | `/v1/boards/{id}` | `getBoardDetails` (`MpAdminCommunityPostDetail.tsx:615`, 프론트 docs `:69`) | `BoardController.getBoardDetails` (`BoardController.kt:207`) | `BoardService.getBoardDetails` (`service/BoardService.kt:620`) — 6단계 순차 조회 | `BoardPostRepository.findBoardDetails` (`:269`) + `findChildrenByParentId` (`:314`) + `BoardCommentRepository.findTopCommentsByBoardPostId` (`:31`) + `findRepliesByParentIds` (`:101`) + `BoardCommentLikeRepository.findAllByCommentIdIn` + `ReportRepository.findAllReportByCommentIds` + `findReportsByPostId` + `BoardPostFileRepository.findS3FilesByBoardPostId` (`:21`) + `BoardNoticeRepository.findByBoardPostId` + `MemberBlockRepository.findBlockedIdsByMemberId/findBlockerIdsByMemberId` (둘 다 native) | `@RequiredRole` **없음** (백엔드 docs 5-N) — `filterBlind=false` 파라미터 붙이면 일반 USER도 블라인드 본문 열람 가능. 댓글/신고 페이지네이션 없음(백엔드 docs 5-D, 프론트 docs `:227-236` `count={1} page={1}`). `applyVisibility`로 MR_CSO_MATCHING 외부인 댓글 마스킹(백엔드 docs `:117-126`) |
| 4 | PUT | `/v1/boards/{id}/toggle-blind` | `toggleBlindStatus_1` (`MpAdminCommunityPostList.tsx:459`, `MpAdminCommunityPostDetail.tsx:688`, 프론트 docs `:69`) | `BoardController.toggleBlindStatus` (`BoardController.kt:196`) | `BoardService.toggleBlindStatus` → `findById → copy(isBlind=!isBlind, blindedDate=utcNow()) → save` | `BoardPostRepository.findById/save` (JpaRepository, ingest `03-repositories.md` 6-R) | `ADMIN_ONLY, COMMUNITY_MANAGEMENT`. **프론트 docs는 `/v1/boards/{id}/blind`로 표기 — 실제 `/toggle-blind`** (백엔드 docs 5-A). 일반 PUT `/v1/boards/{id}` 의 `BoardPostUpdateRequest.isBlind`로도 토글 가능 — 이중 경로 (5-F) |
| 5 | GET | `/v1/comments` | `getCommentMembers` (`MpAdminCommunityCommentList.tsx:fetchContents`, 프론트 docs `:71`) | `CommentController.getCommentMembers` (`web/v1/CommentController.kt:97`, ingest `01-controllers.md:30`) | `CommentService.getComments` (`service/CommentService.kt:170`, ingest `02-services.md:298`) | `BoardCommentRepository.findCommentMembers` (`:158`, **nativeQuery + countQuery**, ingest `03-repositories.md:88`) | `ADMIN_ONLY, COMMUNITY_MANAGEMENT`. **프론트 docs `/v1/comment-members` ≠ 실제 `/v1/comments`** (5-A). `CASE WHEN parent_id IS NULL THEN 'COMMENT' ELSE 'REPLY'` — 사실상 enum 2값. 본문은 `=:userId` 정확일치 / countQuery는 `ILIKE` 부분일치 — 내부 비일관 |
| 6 | PUT | `/v1/comments/{id}/toggle-blind` | `toggleBlindStatus` (`MpAdminCommunityCommentList.tsx:828`, 프론트 docs `:71`) | `CommentController.toggleBlindStatus` (`CommentController.kt:85`) | `CommentService.toggleBlindStatus` → 동일 toggle 패턴 | `BoardCommentRepository.findById/save` | `ADMIN_ONLY, COMMUNITY_MANAGEMENT`. 프론트 자동생성 클라이언트가 board의 `_1`과 충돌 회피 위해 `toggleBlindStatus`(suffix 없음)이 댓글, `toggleBlindStatus_1`이 게시글 (프론트 docs `:105-122`) |
| 7 | GET | `/v1/blind-posts` | `getBlindPosts` (`MpAdminCommunityBlindList.tsx:962`, 프론트 docs `:72`) | `BlindPostController.getBlindPosts` (`web/v1/BlindPostController.kt:34`, ingest `01-controllers.md:31`) | `BlindPostService.getBlindPosts` (`service/BlindPostService.kt:17`, ingest `02-services.md:301`) | `ReportRepository.findBlindPosts` (`:102`, **nativeQuery + countQuery**) — **`UNION ALL`** (board_post + board_comment) | `ADMIN_ONLY, COMMUNITY_MANAGEMENT`. `LEFT JOIN report` 다대다 → 신고 N건이면 row 부풀림 + `report_type` 랜덤 1건 (백엔드 docs 5-G). 게시글의 likes_count는 `board_statistics.likes_count`, 댓글은 `COUNT(board_comment_like.id)` — 동명 다소스. 댓글에 `deleted=false` 누락 → 삭제된 블라인드 댓글 노출(5-Q). `CAST(:startAt AS TIMESTAMP)` UTC↔local 경계 off-by-one(5-J) |
| 8 | PUT | `/v1/blind-posts/unblind` | `unblindPost({postId, commentId})` (`MpAdminCommunityBlindList.tsx:1009-1011`, 프론트 docs `:73`) | `BlindPostController.unblindPost` (`BlindPostController.kt:62`) | `BlindPostService.unblindPost` → `if (postId) postService.toggleBlindStatus(postId) else if (commentId) commentService.toggleBlindStatus(commentId)` | (위 4번/6번 토글 경로 재사용) | `ADMIN_ONLY, COMMUNITY_MANAGEMENT`. **프론트 docs `POST /v1/blinds/unblind` ≠ 실제 `PUT /v1/blind-posts/unblind`** (5-A). 둘 다 null → silent noop, 둘 다 값 → postId만 처리(5-H). 이름은 unblind지만 실제는 toggle — 재시도/동시성 시 데이터 뒤집힘(5-I) |

> 추가 의존: `MemberBlockRepository`는 native `findBlockedIdsByMemberId/findBlockerIdsByMemberId` 2개를 댓글 트리 가시성 필터링에 사용 (`02-services.md` 차단 in-memory) — 같은 모듈에서 `findAllWithStatistics`는 DB EXISTS로 직접 차단함 → 일관성 부족.

## 3. DB 테이블

| 테이블 | 역할 | 주 FK / Index | 비고 |
|--------|------|--------------|------|
| `board_post` | 게시글 트리 (자기참조) | `member_id`, `parent_id`, Index: `board_type, member_id, parent_id, posted_date, blinded_date` | `board_type` 9종(ANONYMOUS/MR_CSO_MATCHING/NOTICE/INQUIRY/FAQ/CSO_A_TO_Z/EVENT/SALES_AGENCY/PRODUCT). `posted_date` **YYYYMMDD int**. `is_blind/deleted/is_exposed`. `blinded_date` timestamp(타임존 불명, 5-J). 로컬 9,159건 — 커뮤니티 대상은 ANONYMOUS 18 + MR_CSO_MATCHING 3 + CSO_A_TO_Z 13 = 34건 (백엔드 docs `:386-399`) |
| `board_comment` | 댓글/답글 트리 | `post_id` NOT NULL, `parent_id` nullable, `member_id` | `content varchar(255)` — 5-K 리스크. `depth/is_blind/deleted/blinded_date/commented_date(YYYYMMDD)`. 댓글 신고는 `Report.commentId`로 분기 |
| `board_post_like` / `board_comment_like` | 좋아요 (인메모리 큐 직렬화) | `member_id, board_post_id` / `member_id, comment_id` | `LikeCommandQueue`(`LinkedBlockingQueue`, 50,000 cap, ingest `06-config.md:266`)가 INSERT/DELETE를 직렬화. `LikeCommandConsumer` 코루틴 소비. BaseEntity 미상속 — created/modified 없음(`04-domain.md:312`) |
| `board_post_view` | 조회 이력 (UNIQUE post×member) | `board_post_id, member_id` | `PostViewQueue`(50,000 cap, ingest `06-config.md:265`) 직렬화. 14일 초과 row는 `BoardPostViewCleanupScheduler.cleanup()` 매일 자정 삭제 (`06-config.md:241`). 5-E: 상세 조회 1회당 `postViewPublisher.enqueue` + `boardStatisticsService.increaseViewCount` 둘 다 트리거 (관리자는 후자 skip) |
| `board_statistics` | 게시글당 집계(좋아요/조회/댓글 수) | `board_post_id` UNIQUE 1:1 (`mappedBy`, `04-domain.md:373`) | EAGER 기본값(fetch 미지정, ingest `03-repositories.md:129`). `BoardStatsAfterCommitListener`가 트랜잭션 커밋 후 비동기 갱신(`06-config.md:276`). `BoardStatisticsRepository`는 6 메서드 전부 native (`03-repositories.md:20`) — `insertIfAbsentInit` `ON CONFLICT DO NOTHING` |
| `board_notice` | 공지(notice_type/fixed_top/drug_company) 1:1 확장 | `board_post_id` UNIQUE | `drug_company_name`(string) + `drug_company_id`(FK) 병존 — 정합성 위험(`04-domain.md:413`). 6-C 고정공지는 페이징 미적용 |
| `board_post_file` | 첨부 (S3File N:1 EAGER) | `board_post_id`, `s3_file_id` | `display_order` ASC 정렬. `findPostIdsWithImages` 가 LIKE `%.jpg` 식 끝매칭 — `.jpg.bak` 오탐 가능(ingest 6-L) |
| `report` | 신고 (게시글/댓글 양쪽) | `post_id` nullable, `comment_id` nullable, `member_id` | `report_type` 5종(SPAM/ABUSE/ILLEGAL_CONTENT/PERSONAL_INFORMATION/OTHER, `04-domain.md:128`). **CHECK 제약 없음 → XOR 강제 못 함** (5-L). `nickname` 신고 당시 스냅샷 |
| `member_block` | 회원 상호 차단 (양방향) | `member_id, blocked_member_id` | `findBoards`는 EXISTS 두 개로 양방향 제거 / `getBoardDetails`는 native 2 쿼리 + in-memory 합집합 |

핵심 JOIN (블라인드 통합 목록 — `findBlindPosts` UNION ALL):

```sql
SELECT * FROM (
  SELECT bp.id, m.user_id, m.name AS member_name, m.nickname,
         CASE WHEN m.member_type IN ('NONE','CSO') THEN 'NON_CONTRACT' ELSE 'CONTRACT' END AS contract_status,
         'BOARD' AS post_type,
         bp.title AS content,
         r.report_type,
         COALESCE(bs.likes_count, 0) AS likes_count,
         TO_CHAR(bp.blinded_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS blind_at
  FROM board_post bp
  LEFT JOIN board_statistics bs ON bp.id = bs.board_post_id
  JOIN member m ON m.id = bp.member_id
  LEFT JOIN report r ON bp.id = r.post_id     -- ⚠️ 5-G row 부풀림
  WHERE bp.is_blind = true

  UNION ALL

  SELECT bc.id, m.user_id, m.name, m.nickname,
         CASE WHEN m.member_type IN ('NONE','CSO') THEN 'NON_CONTRACT' ELSE 'CONTRACT' END,
         'COMMENT', bc.content, r.report_type,
         COUNT(bcl.id),                       -- ⚠️ 게시글의 likes_count와 다른 소스
         TO_CHAR(bc.blinded_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS')
  FROM board_comment bc
  JOIN member m ON bc.member_id = m.id
  LEFT JOIN report             r   ON bc.id = r.comment_id
  LEFT JOIN board_comment_like bcl ON bc.id = bcl.comment_id
  WHERE bc.is_blind = true                    -- ⚠️ 5-Q deleted 조건 누락
  GROUP BY bc.id, m.user_id, m.name, m.nickname, m.member_type,
           bc.content, r.report_type, bc.blinded_date
) AS combined
ORDER BY blind_at DESC LIMIT :size OFFSET :offset;
```

서브 트리 재귀 패턴 (`BoardCommentRepository.softDeleteSubtree`/`countActiveInSubtree`, ingest `03-repositories.md:92`): `WITH RECURSIVE subtree` — 댓글 답글 트리를 한 번에 soft-delete.

## 4. 권한·트랜잭션

- **권한 정합성** (`05-security.md:64`, `:156`):
  - `BlindPostController` 전체 `ADMIN_ONLY` ✓
  - `BoardController` "일부 적용" — `getBoardMembers`/`toggleBlindStatus` 만 `ADMIN_ONLY+COMMUNITY_MANAGEMENT`. **`getBoards`/`getBoardDetails` 무방비** (5-M, 5-N) → 일반 USER가 `boardType=PRODUCT`로 9,069건 노출, `filterBlind=false`로 블라인드 본문 노출. 검증 스크립트는 백엔드 docs `:1033-1047` (6-Z-7/6-Z-8).
  - `CommentController.getCommentMembers/toggleBlindStatus` `ADMIN_ONLY+COMMUNITY_MANAGEMENT` ✓
- **트랜잭션 경계** (`02-services.md:74`, `:298`, `:301`):
  - `BoardService.createBoardPost` REQUIRED — 게시글 INSERT + `BoardStatistics` row + 파일 + 알림이 하나의 트랜잭션 (NOTICE는 ADMIN 이상만, ANONYMOUS는 익명 닉네임 자동 생성 `BoardService.kt:332-334`)
  - 토글 메서드(`toggleBlindStatus`)는 메서드 REQUIRED — find→copy→save 단순 경로
  - 통계·푸시는 `TransactionalEventListener AFTER_COMMIT` + 코루틴 IO로 후속 처리 — 트랜잭션 롤백 시 큐 투입 안 됨(이벤트 발행 시점이 커밋 후) (`02-services.md:13`, `06-config.md:274-276`)
- **인메모리 큐 직렬화** (`06-config.md:257-268`, ingest `02-services.md:432-433`):
  - `LikeCommandQueue` `LinkedBlockingQueue<LikeCommand>` cap **50,000** → `LikeCommandConsumer` 단일 코루틴 소비. 좋아요/취소가 동일 (post,member) 키에서 경합 없도록 직렬화
  - `PostViewQueue` `LinkedBlockingQueue<RecordPostViewCommand>` cap **50,000** → `PostViewConsumer` 소비
  - 큐 초과 시 `LinkedBlockingQueue.put` 블로킹 → 요청 쓰레드 지연 가능(`06-config.md:431`). 메트릭/알람 미설정
- **MR_CSO_MATCHING 가시성** — 비관리자/비작성자는 댓글 본문 마스킹("작성자만 볼 수 있는 댓글입니다." + 닉네임 난수화) (`02-services.md:409`, 백엔드 docs `:117-126`). 답글이 게시글 작성자→부모 댓글 작성자 본인 응답이면 마스킹 예외.
- **소프트 삭제 시 블라인드 잔존** — `softDeleteSubtree`가 `is_blind`는 그대로 두므로 `findBlindPosts`(댓글측 `deleted` 조건 없음)에 유령 row 누출 가능 (5-Q).

## 5. 리스크 / 후속 액션

| ID | 영역 | 리스크 | 권장 액션 | 출처 |
|----|------|-------|-----------|------|
| 5-A | 문서 | 프론트 docs 5곳 경로가 실제 OpenAPI와 다름(`/board-members→/boards/members`, `/comment-members→/comments`, `/blind→/toggle-blind`×2, `POST /blinds/unblind→PUT /blind-posts/unblind`) | 프론트 docs 수정 (런타임은 자동생성 클라이언트라 영향 X) | 백엔드 docs §5-A |
| 5-B | 의미 | `filterDeleted/filterBlind` 서비스 계층 반전 (Board는 반전, Comment는 미반전) — 프론트는 `true=포함`으로 알지만 실제 `true=제외` | 의미 합의 + 서비스 반전 제거 + 댓글/보드 일관화 | 백엔드 docs §5-B |
| 5-D | 성능 | `getBoardDetails` 댓글/신고 트리 전량 반환, FE 페이지네이션도 `count={1}` 미구현 | `GET /v1/boards/{id}/comments` 분리 또는 페이징 | 백엔드 docs §5-D, 프론트 docs `:227-236` |
| 5-E | 데이터 | 상세 조회 1회당 `postViewPublisher.enqueue` + `increaseViewCount` 동시 호출 → 일반 사용자 조회수 2배 | 한쪽으로 통합 (큐만 권장) | 백엔드 docs §5-E |
| 5-G | 데이터 | `findBlindPosts`가 신고 N건일 때 row 부풀림 + `report_type` 랜덤 1건 노출 | 서브쿼리 집계 후 array_agg | 백엔드 docs §5-G |
| 5-H/I | API | `unblindPost` 둘 다 null/둘 다 값 보호 없음, 이름은 unblind지만 실제 toggle | `require()` validation + `setBlind(false)` idempotent로 변경 | 백엔드 docs §5-H, §5-I |
| 5-K/L | DB | `board_comment.content varchar(255)`, `report.post_id/comment_id` XOR 미강제 | TEXT로 ALTER + `CHECK ((post_id IS NULL) <> (comment_id IS NULL))` 추가 | 백엔드 docs §5-K, §5-L |
| 5-M/N | 보안 | `GET /v1/boards`, `GET /v1/boards/{id}`에 `@RequiredRole` 없음 → PRODUCT 9,069건/블라인드 본문 일반 USER 노출 가능 | `COMMUNITY_MANAGEMENT` 추가 또는 admin 엔드포인트 분리 | 백엔드 docs §5-M, §5-N (검증 6-Z-7/8) |
| 5-Q | 데이터 | `findBlindPosts` 댓글측 `deleted=false` 조건 누락 — 삭제된 블라인드 댓글 노출 | `AND bc.deleted = false` 추가 | 백엔드 docs §5-Q |
| FE-1 | UX | `for...of` 순차 처리는 안정성 우선이나 다건(N>20) 블라인드는 UX 느림 | 서버 측 bulk endpoint 신설 | 프론트 docs `:127-138` |
| FE-2 | UX | 포스트 상세 댓글/신고 탭이 `count={1} page={1}` 하드코딩 (미구현 표시 부재) | "전체 표시" 안내 또는 5-D 해소 후 활성화 | 프론트 docs `:227-236` |

## 6. 참조

- 프론트 화면 코드:
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityUserList.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityPostList.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityPostDetail.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityCommentList.tsx`
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-admin/MpAdminCommunityBlindList.tsx`
- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/08_COMMUNITY.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/08_COMMUNITY.md`
- 백엔드 코드:
  - `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/BoardController.kt:32`
  - `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/CommentController.kt:29`
  - `application/src/main/kotlin/kr/co/medipanda/portal/web/v1/BlindPostController.kt:25`
  - `application/src/main/kotlin/kr/co/medipanda/portal/service/BoardService.kt`
  - `application/src/main/kotlin/kr/co/medipanda/portal/service/CommentService.kt`
  - `application/src/main/kotlin/kr/co/medipanda/portal/service/BlindPostService.kt`
  - `application/src/main/kotlin/kr/co/medipanda/portal/repo/.../BoardPostRepository.kt`
  - `application/src/main/kotlin/kr/co/medipanda/portal/repo/.../BoardCommentRepository.kt`
  - `application/src/main/kotlin/kr/co/medipanda/portal/repo/.../ReportRepository.kt`
- 백엔드 ingest 매트릭스:
  - `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md:29-33` (BoardController/CommentController/BlindPostController/BlockController/ReportController)
  - `02-services.md:13`(이벤트 드리븐 개요), `:68-74`(BoardService), `:298-301`(Comment/BlindPost), `:407-409`(가시성 규칙), `:432-433`(인메모리 큐)
  - `03-repositories.md:16-24`(레포 개요), `:75-92`(JPQL/native/RECURSIVE), `:129`(BoardStatistics EAGER)
  - `04-domain.md:60-67`(BoardPost 외 엔티티), `:209-229`(관계), `:261-264`(Aggregate), `:371-390`(ER 다이어그램)
  - `05-security.md:64`(/v1/blind-posts ADMIN_ONLY), `:153-159`(메서드 권한 표)
  - `06-config.md:241`(조회 이력 정리 스케줄러), `:257-268`(LinkedBlockingQueue 4종), `:274-276`(AfterCommit 리스너), `:431`(큐 50k cap)
- 핵심 운영 패턴 요약: **좋아요·조회수의 LinkedBlockingQueue 직렬화** + **TransactionalEventListener AFTER_COMMIT 이벤트 드리븐 통계** — 동시성 충돌 방지와 DB 부하 평탄화의 두 축. 큐는 cap 50,000이며 메트릭/알람 미설정이라 운영 모니터링 필요.

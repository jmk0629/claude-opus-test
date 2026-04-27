# user-06 커뮤니티 (사용자) — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`/Users/jmk0629/keymedi/medipanda-web-test/docs/user/06_COMMUNITY.md`) / 백엔드 docs(`/Users/jmk0629/keymedi/medipanda-api/docs/user/06_COMMUNITY.md`) / 백엔드 ingest(`/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/`)

## 1. 화면 요약

- 라우트 4개 (로그인 필수, 익명게시판은 추가로 `CsoMemberGuard`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/MrCsoMatchingList.tsx` — 신규처 매칭 목록 (`/community/mr-cso-matching`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/AnonymousList.tsx` — 익명게시판 목록 (`/community/anonymous`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/CommunityDetail.tsx` — 게시글 상세(boardType prop, `/community/:slug/:id`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/CommunityEdit.tsx` — 작성/수정 (`/community/:slug/new` · `/community/:slug/:id/edit`)
- 핵심 사용자 액션 (프론트 docs `06_COMMUNITY.md`)
  1) 두 게시판 목록은 `getBoards` + `getFixedTopNotices` 두 API를 합쳐 `[...fixedNotices, ...contents]` 단일 렌더 (프론트 `:67-105`). `boardType` 은 `MR_CSO_MATCHING | ANONYMOUS`, 공지는 `boardType=NOTICE` + `noticeTypes=[MR_CSO_MATCHING|ANONYMOUS_BOARD]` (프론트 `:107-121`).
  2) `filterMine` 토글로 본인 글만 필터(`myUserId` 파라미터, 프론트 `:124-140`). 검색은 `searchType=boardTitle` 고정.
  3) 상세 = 본문 + 댓글 트리 + 첨부 + 신고가 단일 `getBoardDetails` 응답에 포함. 댓글은 `parentId === null` 필터로 최상위 추출, `as unknown as { replies }` 로 대댓글 접근(프론트 `:182-201`).
  4) 좋아요는 `toggleLike_1`(게시글)/`toggleLike`(댓글) — Swagger operationId 충돌로 `_1` suffix 발생(프론트 `:142-150`, 백엔드 docs `:29`).
  5) 신고는 `CommunityReportModal` 단일 컴포넌트가 `postId|commentId` 분기. 신고 유형 라벨→`ReportType` 객체 매핑 + `?? OTHER` 폴백(프론트 `:251-274`).
  6) 작성/수정은 `isNew = paramId === undefined`, 첨부파일은 `PostAttachmentType.ATTACHMENT`(폼) vs `EDITOR`(에디터 내부) 두 종류로 분리·합산(프론트 `:298-326`).

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 (호출부) | Controller | Service | Repository | 비고 |
|---|------|------|---------------------|------------|---------|------------|------|
| 1 | GET | `/v1/boards` | `getBoards` (`MrCsoMatchingList.tsx fetchContents`, `AnonymousList.tsx fetchContents`, 프론트 `:46`) | `BoardController.getBoards` (`web/v1/BoardController.kt:102`, ingest `01-controllers.md:234`) | `BoardService.getBoards` (`service/BoardService.kt:119-199`, ingest `02-services.md:74`) | `BoardPostRepository.findAllWithStatistics` (22 파라미터 동적 JPQL, ingest `03-repositories.md:75`) + `BoardPostFileRepository.findPostIdsWithImages` 후처리 | JWT 필요. `resolveAccessFilter` → `ANONYMOUS+USER+NONE`은 `allowed=false` 빈 페이지 / `MR_CSO_MATCHING+USER+(NONE\|CSO)`는 `loginUserIdExact` 셀프 스코프(백엔드 docs §2-1, ingest `02-services.md:407`). `MemberBlock` 양방향 NOT EXISTS 2개. |
| 2 | GET | `/v1/boards/notices/fixed-top` | `getFixedTopNotices` (`MrCsoMatchingList.tsx`, `AnonymousList.tsx`, 프론트 `:47`) | `BoardController.getFixedTopNotices` (`BoardController.kt:80`) | `BoardService.getFixedTopNotices` | `BoardPostRepository.findAllFixedTopNotices` (`:158-230`, `ORDER BY bp.id DESC` 하드코딩, ingest `03-repositories.md:76`) | Page 아닌 `List`. exposureRanges/drugCompany 필터 동일하지만 **MemberBlock 필터 누락**(백엔드 docs 5-B). |
| 3 | GET | `/v1/boards/{id}` | `getBoardDetails` (`CommunityDetail.tsx`, `CommunityEdit.tsx` 수정 시 사전 로드, 프론트 `:49`) | `BoardController.getBoardDetails` (`BoardController.kt:202`) | `BoardService.getBoardDetails` (`BoardService.kt:620-653`, 7 단계: 본문 → children → comments → reports → attachments → notice → view 큐) | `BoardPostRepository.findBoardDetails` + `findChildrenByParentId` + `BoardCommentRepository.findTopCommentsByBoardPostId` + `findRepliesByParentIds` + `BoardCommentLikeRepository.findAllByCommentIdIn` + `ReportRepository.findReportsByPostId` + `findAllReportByCommentIds` + `BoardPostFileRepository.findS3FilesByBoardPostId` + `BoardNoticeRepository.findByBoardPostId` + `MemberBlockRepository.findBlockedIdsByMemberId/findBlockerIdsByMemberId` | `applyVisibility`로 MR_CSO_MATCHING 외부인 댓글 마스킹("작성자만 볼 수 있는 댓글입니다.") + 닉네임 난수화(백엔드 docs §2-3, ingest `02-services.md:409`). 응답 후 `postViewPublisher.enqueue` + `boardStatisticsService.increaseViewCount` **이중 발사**(백엔드 docs 5-O). |
| 4 | POST | `/v1/boards` (multipart) | `createBoardPost` (`CommunityEdit.tsx isNew=true`, 프론트 `:50`) | `BoardController.createBoardPost` (`BoardController.kt:158`) | `BoardService.createBoardPost` (`BoardService.kt:294-386`, `@Transactional`) | `BoardPostRepository.save` + `BoardStatisticsRepository.insertIfAbsentInit` + `BoardPostFileRepository.save` × N + `BoardNoticeRepository.save`(NOTICE) | NOTICE는 ADMIN 이상만(USER 차단). `BoardType.CSO_A_TO_Z`/`INQUIRY`/`EVENT`는 role 체크 없음 → 클라이언트 신뢰(백엔드 docs 5-L). 신규 작성은 `isExposed=true`, `exposureRange=ALL` 고정(프론트 `:567`). |
| 5 | PUT | `/v1/boards/{id}` (multipart) | `updateBoardPost` (`CommunityEdit.tsx isNew=false`, 프론트 `:51`) | `BoardController.updateBoardPost` (`BoardController.kt:178`) | `BoardService.updateBoardPost` (`BoardService.kt:479-564`) | `BoardPostRepository.findById/save` + `S3File.softDelete` + `BoardPostFileRepository.save`(중복 INSERT) | `checkRole`(본인 또는 ADMIN). `keepFileIds = [...attachedFiles, ...editorAttachments]`로 유지 파일 명시. **`editorFileIds` 무조건 신규 INSERT — UNIQUE 없음 → 중복**(백엔드 docs 5-D). |
| 6 | DELETE | `/v1/boards/{id}` | `deleteBoardPost` (`CommunityDetail.tsx Popover→삭제`, 프론트 `:52`) | `BoardController.deleteBoardPost` (`BoardController.kt:168`) | `BoardService.softDeleteBy` (`BoardService.kt:247-264`) | `BoardPostRepository.softDeleteByPostId` + `softDeleteChildrenByParentId` + `S3FileRepository.softDeleteAllFilesByPostIdCascade` + `BoardCommentRepository.softDeleteByPostId` | 본인 또는 ADMIN. `board_statistics`/`board_post_like`/`board_notice`는 잔존 — `deleted=true` 필터 신뢰. |
| 7 | POST | `/v1/boards/{id}/like` | `toggleLike_1` (`CommunityDetail.tsx handleLike`, 프론트 `:53`) | `BoardController.toggleLike` (`BoardController.kt:221`) | `BoardService.togglePostLike` → `LikeCommandPublisher.enqueue(TogglePostLikeCommand)` | (큐 컨슈머) `BoardPostLikeRepository` + `BoardStatisticsService.likes_count ±1` | 200 즉시 반환, 실제 INSERT/DELETE는 비동기(백엔드 docs §2-7). `uk__board_post_like__member_board_post` UNIQUE로 중복 방어. |
| 8 | POST | `/v1/comments/{userId}` | `createComment` (`CommunityDetail.tsx CommentSection handleCommentSubmit`, 프론트 `:54`) | `CommentController.createComment` (`web/v1/CommentController.kt:32`, ingest `01-controllers.md:251`) | `CommentService.createComment` (`service/CommentService.kt:100-168`, ingest `02-services.md:357`) | `BoardPostRepository.findById` + `BoardCommentRepository.save` + `BoardStatisticsService.increaseCommentsCount` | **PathVariable userId 신뢰 — IDOR/스푸핑**(백엔드 docs 5-C). depth 상한 없음(프론트 2 레벨 제한만). 익명게시판이라도 댓글 닉네임은 실명 저장(백엔드 docs 5-E). |
| 9 | PUT | `/v1/comments` | `updateComment` (`CommunityDetail.tsx Comment editMode submit`, 프론트 `:55`) | `CommentController.updateComment` (`CommentController.kt:42`) | `CommentService.updateComment` (`CommentService.kt:37-49`) | `BoardCommentRepository.findById/save` | 본인 또는 ADMIN. `content`만 교체. |
| 10 | DELETE | `/v1/comments/{id}` | `deleteComment` (`CommunityDetail.tsx Comment 삭제`, 프론트 `:56`) | `CommentController.deleteComment` (`CommentController.kt:56`) | `CommentService.softDeleteBy` (`CommentService.kt:52-79`) | `BoardCommentRepository.countActiveInSubtree` + `softDeleteSubtree` (**RECURSIVE CTE native**, ingest `03-repositories.md:92`) + `BoardStatisticsService.decreaseCommentsCount(activeCount)` | 본인 또는 ADMIN. 서브트리 일괄 soft-delete, 복원 API 없음. |
| 11 | POST | `/v1/comments/{id}/like` | `toggleLike` (`CommunityDetail.tsx Comment 좋아요`, 프론트 `:57`) | `CommentController.toggleLike` (`CommentController.kt:70`) | `CommentService.toggleLike` → `LikeCommandPublisher.enqueue(ToggleCommentLikeCommand)` | (큐 컨슈머) `BoardCommentLikeRepository` | `uk__comment_like__member_comment` UNIQUE. 게시글 좋아요와 동일 비동기 패턴. |
| 12 | POST | `/v1/reports/{userId}` | `createReport` (`CommunityReportModal`, 프론트 `:58`) | `ReportController.createReport` (`web/v1/ReportController.kt:21`, ingest `01-controllers.md:279`) | `ReportService.createReport` (`service/ReportService.kt:22-38`) | `ReportRepository.save` | **PathVariable userId 신뢰 — IDOR/스푸핑**(5-C). postId/commentId 둘 다 null이면 조용히 200(5-F). `(member_id, post_id)` UNIQUE 부재 → 동일 사용자 중복 신고 누적(5-G). |

> 사용자 화면이 호출하지 않지만 동일 컨트롤러에 존재하는 ADMIN 전용: `GET /v1/boards/members`, `PUT /v1/boards/{id}/toggle-blind`, `GET /v1/comments`, `PUT /v1/comments/{id}/toggle-blind` (`@RequiredRole(ADMIN_ONLY, COMMUNITY_MANAGEMENT)`). 차단은 별도 `BlockController` 3엔드포인트(`GET /v1/blocks`, `PUT/DELETE /v1/blocks/{targetUserId}`, ingest `01-controllers.md:266-272`) — 본 화면에서 호출 안 하지만 댓글/게시글 가시성에 직접 영향.

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 핵심 컬럼 | ingest 출처 |
|--------|------|-------|----------|-------------|
| `board_post` | 모든 게시판 본문(공지·커뮤니티·INQUIRY·CSO_A_TO_Z·EVENT·PRODUCT 통합) | `member_id`, `parent_id` | `board_type`, `nickname`, `hidden_nickname`, `is_blind`, `is_exposed`, `exposure_range`, `deleted` | `04-domain.md:60` |
| `board_comment` | 댓글/대댓글 트리 | `post_id`, `parent_id`, `member_id` | `content`, `depth`, `is_blind`, `deleted` | `04-domain.md:64` |
| `board_statistics` | 1:1 집계(UNIQUE board_post_id) | `board_post_id` | `likes_count`, `views_count`, `comment_count` | `04-domain.md:211` (mappedBy) |
| `board_post_like` | 게시글 좋아요(UNIQUE member+post) | `board_post_id`, `member_id` | — | `04-domain.md:62` |
| `board_comment_like` | 댓글 좋아요(UNIQUE member+comment) | `comment_id`, `member_id` | — | `04-domain.md:65` |
| `board_post_view` | 사용자별 최근 열람(UNIQUE post+member, 14일 후 정리) | `board_post_id`, `member_id` | `last_viewed_at` | `04-domain.md:63` |
| `board_notice` | NOTICE 부가속성(1:1 UNIQUE board_post_id) | `board_post_id`, `drug_company_id` | `notice_type`, `drug_company_name`, `fixed_top` | (백엔드 docs §3) |
| `board_post_file` | 첨부/에디터 파일 매핑 | `board_post_id`, `s3_file_id` | `display_order` | `04-domain.md:61` |
| `report` | 게시글/댓글 신고(둘 중 하나 NOT NULL, **UNIQUE 부재**) | `post_id?`, `comment_id?`, `member_id` | `report_type`, `report_content` | `04-domain.md:227-228` |
| `member_block` | 상호 차단(member ↔ blocked_member) | `member_id`, `blocked_member_id` | — | `04-domain.md:29, 142` |

핵심 JOIN(목록 조회 — `findAllWithStatistics` 골격, 백엔드 docs §6-A):

```sql
SELECT bp.*, m.user_id, m.member_type,
       COALESCE(bs.likes_count,0), COALESCE(bs.views_count,0), COALESCE(bs.comment_count,0),
       bn.notice_type, bn.fixed_top,
       EXISTS (SELECT 1 FROM board_post c WHERE c.parent_id=bp.id AND c.deleted=false) AS has_children,
       (bv.id IS NOT NULL) AS viewed_by_me
FROM board_post bp
JOIN member m              ON m.id = bp.member_id
LEFT JOIN board_statistics bs ON bs.board_post_id = bp.id
LEFT JOIN board_notice bn   ON bn.board_post_id = bp.id
LEFT JOIN drug_company dc   ON dc.id = bn.drug_company_id
LEFT JOIN board_post_view bv ON bv.board_post_id = bp.id AND LOWER(bv_m.user_id)=LOWER(:viewerUserId)
WHERE bp.board_type IN (:boardTypes)
  AND bp.exposure_range IN (:exposureRanges)              -- ExposureRange.resolveExposureRanges(role, memberType)
  AND (bn.fixed_top IS NULL OR :ignoreFixedTop OR bn.fixed_top = false)
  AND (:myUserId IS NULL OR LOWER(m.user_id) = LOWER(:myUserId))   -- MR_CSO_MATCHING 셀프 스코프
  AND (bn.id IS NULL OR bn.drug_company_id IS NULL OR :role <> 'USER' OR EXISTS (
        SELECT 1 FROM partner p JOIN member pm ON pm.id=p.owner_id
        WHERE LOWER(pm.user_id)=LOWER(:viewerUserId) AND p.deleted=false AND p.drug_company_id=dc.id))
  AND NOT EXISTS (SELECT 1 FROM member_block mb JOIN member mb_m ON mb_m.id=mb.member_id
                  WHERE LOWER(mb_m.user_id)=LOWER(:viewerUserId) AND mb.blocked_member_id=m.id)
  AND NOT EXISTS (SELECT 1 FROM member_block mb2 JOIN member mb2_m ON mb2_m.id=mb2.blocked_member_id
                  WHERE mb2.member_id=m.id AND LOWER(mb2_m.user_id)=LOWER(:viewerUserId))
ORDER BY {bp.id|bs.views_count|bs.likes_count|bs.comment_count} DESC
LIMIT :size OFFSET :page*:size;
```

## 4. 권한·트랜잭션 (admin/08 과의 차이)

- **boardType 가시성 — `BoardService.resolveAccessFilter`** (`BoardService.kt:207-243`, 백엔드 docs §2-1, ingest `02-services.md:407`)
  - `ANONYMOUS + USER + memberType=NONE` → `allowed=false`, **빈 페이지** (프론트 `CsoMemberGuard`와 이중 차단)
  - `MR_CSO_MATCHING + USER + (NONE|CSO)` → `loginUserIdExact = loginUserId` (본인 작성분만, 5-J)
  - 그 외 USER → 해당 boardType 한정. ADMIN/SUPER_ADMIN → 전체 + `onlyCommunityBoards`(boardType null 시 자동으로 ANONYMOUS+MR_CSO_MATCHING).
- **`exposureRange` 자동 제한** — `ExposureRange.resolveExposureRanges(role, memberType)` (백엔드 docs §2-1):
  - ADMIN/SUPER_ADMIN: `[ALL, CONTRACTED, UNCONTRACTED]`
  - USER+계약(INDIVIDUAL/ORGANIZATION): `[ALL, CONTRACTED]`
  - USER+비계약(NONE/CSO): `[ALL, UNCONTRACTED]`
- **`drugCompany` 분기** — USER가 `bn.drug_company_id` 지정 공지 보려면 `EXISTS (Partner.owner == viewer AND drug_company_id 일치)` (백엔드 docs §2-1).
- **CSO_A_TO_Z 등 boardType 별 정책** — USER도 `createBoardPost` 시 role 체크 없이 `BoardType=CSO_A_TO_Z`로 작성 가능(5-L). 가시성은 `resolveAccessFilter` "기타 boardType" 분기로 단일 boardType 한정 조회.
- **댓글 가시성(MR_CSO_MATCHING)** — `applyVisibility`(`BoardService.kt:831-849`, ingest `02-services.md:409`): 게시글 작성자/댓글 작성자 본인이 아니면 본문은 "작성자만 볼 수 있는 댓글입니다." + 닉네임 난수화(`DEFAULT_NICK_NAME`). 게시글 주인의 "내 댓글에 단 대댓글"은 게시글 주인에게 원문 공개. ADMIN 이상이면 마스킹 없음.
- **트랜잭션 / 비동기** — 작성·수정·삭제·댓글은 `@Transactional REQUIRED`. 좋아요·조회수는 트랜잭션 밖에서 `LikeCommandPublisher`/`PostViewPublisher` → 인메모리 `LinkedBlockingQueue` 직렬 처리(컨슈머가 INSERT/DELETE + statistics ±1, ingest `02-services.md:13, 432-433`). 큐 cap **50,000**(ingest `06-config.md:265-266`) — 초과 시 producer 블로킹 → 응답 지연.
- **admin/08 과의 차이**:
  | 축 | user/06 | admin/08 |
  |---|---------|---------|
  | 라우트 가드 | `CsoMemberGuard`(익명만), 로그인만 | `AdminPermission.COMMUNITY_MANAGEMENT` |
  | `getBoards` 호출 | `boardType` 필수 | `boardType` 생략 시 `onlyCommunityBoards` 자동 |
  | `getBoardDetails` filterBlind | `true`(블라인드 글 숨김) | `false`(블라인드도 봄) |
  | 댓글 마스킹 | MR_CSO_MATCHING 외부인은 마스킹 | ADMIN 이상은 마스킹 없음 |
  | 블라인드/통계 EP | 호출 안 함 | `/toggle-blind`, `/v1/boards/members`, `/v1/comments`, `/v1/blind-posts` 사용 |
  | 신고 처리 | `createReport`만 | 없음(현재 admin도 신고 관리 UI 없음) |

## 5. 리스크 / 후속 액션

- **[CRIT-1] PathVariable userId 신뢰** — `POST /v1/comments/{userId}`, `POST /v1/reports/{userId}` 모두 `@AuthenticationPrincipal` 미사용. 로그인 A가 `{B}`로 호출하면 B 명의로 댓글/신고 생성(백엔드 docs 5-C). → 컨트롤러에서 `loginUser.userId`로 덮어쓰거나 ADMIN이 아닐 때 `loginUser.userId != userId` 거부.
- **[HIGH-1] `editorFileIds` 중복 INSERT** — `updateBoardPost`가 `keepFileIds`로 보존된 에디터 파일을 다시 신규 `BoardPostFile.save` (5-D). UNIQUE 제약 없음 → 진단 쿼리 Z-9로 검출, `(board_post_id, s3_file_id)` UNIQUE 추가 + 기존 행 재사용 로직 필요.
- **[HIGH-2] 익명게시판 댓글 실명 저장** — `CommentService.createComment`가 `member.nickname` 그대로 저장. `applyVisibility`로 화면만 마스킹, DB 덤프·관리자 통계(`/v1/comments`)에는 실명 노출(5-E). → `BoardType.ANONYMOUS` 댓글 저장 시 `hiddenNickname=true` 강제 또는 닉네임 난수화.
- **[MED-1] 신고 UNIQUE 부재** — `(member_id, post_id)` / `(member_id, comment_id)` UNIQUE 없음 → 동일 사용자 N회 신고 누적(5-G). 프론트 `reportedByMe`만 차단.
- **[MED-2] `findAllFixedTopNotices`에 MemberBlock 필터 누락** — 차단한 관리자가 올린 공지는 계속 노출(5-B). `findAllWithStatistics`와 동일하게 NOT EXISTS 2개 추가.
- **[MED-3] 조회수 이중 발사** — `getBoardDetails` 응답 직전 `postViewPublisher.enqueue` + `boardStatisticsService.increaseViewCount` 동시 실행(5-O). → 큐 컨슈머 한쪽으로 통일.
- **[MED-4] `comment_count` 드리프트** — 실 데이터 1건 어긋남(5-H, 백엔드 docs §4-5). `@Scheduled` 재집계 배치 부재. → 진단 쿼리 Z-3로 모니터링 후 보정 배치 도입.
- **[LOW-1] `createBoardPost` boardType 권한 공백** — NOTICE만 ADMIN 강제, 그 외(CSO_A_TO_Z, INQUIRY 등)는 클라이언트 신뢰(5-L).
- **[LOW-2] `ReportService` postId/commentId 둘 다 null 무시** — 조용히 200(5-F). → `IllegalArgumentException` 명시.
- **[LOW-3] LIKE 와일드카드 인덱스 무효** — `LOWER(m.user_id) LIKE '%...%'` 등(백엔드 docs §6-A). 사용자 화면은 영향 적지만 admin 통계 쿼리에서 시퀀셜 스캔.
- **[LOW-4] 인메모리 큐 cap 50,000** — 인스턴스 다운 시 손실, 다중 인스턴스 환경에서 좋아요/조회수 race(ingest `06-config.md:431`).

## 6. 참조

- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/06_COMMUNITY.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/user/06_COMMUNITY.md`
- 백엔드 ingest: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/01-controllers.md`(:29-33, 230-280) · `02-services.md`(:13, 68-74, 298-307, 351-359, 407-409, 432-433) · `03-repositories.md`(:16-44, 75-92) · `04-domain.md`(:29, 60-65, 142-143, 209-228) · `05-security.md`(:159, 407-409) · `06-config.md`(:257-267, 431)
- 프론트 페이지: `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/MrCsoMatchingList.tsx` · `AnonymousList.tsx` · `CommunityDetail.tsx` · `CommunityEdit.tsx`
- 관련 admin 매트릭스: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/bridge/admin-08-community-fullstack.md`
- 진단 쿼리: 백엔드 docs §6-Z (Z-1 ~ Z-12, 특히 Z-3 comment_count 드리프트 / Z-9 BoardPostFile 중복 / Z-11 익명 댓글 실명)

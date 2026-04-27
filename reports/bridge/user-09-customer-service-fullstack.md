# user-09 고객 지원 (사용자) — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: 프론트 docs(`/Users/jmk0629/keymedi/medipanda-web-test/docs/user/09_CUSTOMER_SERVICE.md`) / 백엔드 docs(`/Users/jmk0629/keymedi/medipanda-api/docs/user/09_CUSTOMER_SERVICE.md`) / 백엔드 ingest(`/Users/jmk0629/Downloads/homework/claude-opus-test/reports/backend-ingestion-20260427/`)

## 1. 화면 요약

- 라우트 7개(모두 로그인 필수, `@RequiredRole` 없음 — 인증만 검증)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/NoticeList.tsx` — 공지 목록 (`/customer-service/notice`), 일반 + 상단 고정 두 API 합산 렌더
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/NoticeDetail.tsx` — 공지 상세 (`/customer-service/notice/:id`)
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/FaqList.tsx` — FAQ 아코디언 (`/customer-service/faq`), expand 시 상세 추가 호출
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/InquiryList.tsx` — 본인 1:1 문의 목록 (`/customer-service/inquiry`), `myUserId=session.userId` 셀프 스코프
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/InquiryDetail.tsx` — 문의 상세 (`/customer-service/inquiry/:id`), `children[0]` = 관리자 답변
  - `/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/InquiryEdit.tsx` — 작성/수정 (`/inquiry/new` · `/inquiry/:id/edit`), `isNew = paramId === undefined`

- 핵심 사용자 액션(프론트 docs §1·§9, 백엔드 docs §1)
  1) NOTICE/FAQ/INQUIRY 모두 단일 `/v1/boards` API 재사용 — `boardType` 쿼리 파라미터로 분기. 별도 NoticeController/FaqController/InquiryController **없음**(백엔드 docs §1).
  2) 사용자 화면은 `isExposed=true`, `filterBlind=true`, `filterDeleted=true`를 항상 강제 전달. INQUIRY는 추가로 `myUserId=session.userId`로 본인 글만 조회(프론트 `InquiryList.tsx:73`, 백엔드 docs §2-1).
  3) 공지 상단 고정은 `getFixedTopNotices({boardType:NOTICE, noticeTypes:[5종 전체]})` 별도 호출 + `[...fixedNotices, ...contents]` 머지 렌더(프론트 `NoticeList.tsx:96-109`).
  4) FAQ는 아코디언 펼침 시점에만 `getBoardDetails(id)` lazy 호출, `expandedId=-1`(닫힘)/`expandedDetail=null`(데이터 없음) 두 상태 AND로 펼침 제어(프론트 `FaqList.tsx:92-96, 167-168`).
  5) 1:1 문의: 신규 작성 → SES 이메일(`QNA_SUBMITTED`, 관리자 수신) → 관리자 답변(별도 admin/10) → `QNA_ANSWERED` 푸시(질문자 수신). 답변은 `parent_id`로 자식 row 1건. `answer = detail?.children?.[0] ?? null` 로 접근(프론트 `InquiryDetail.tsx:20`).
  6) `nickname=session!.userId` 재사용 — 1:1 문의는 닉네임 미표시이므로 빈 자리에 userId 삽입(프론트 `InquiryEdit.tsx:75-77`).

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 (호출부) | Controller | Service | Repository | 비고 |
|---|------|------|---------------------|------------|---------|------------|------|
| 1 | GET | `/v1/boards` | `getBoards` (`NoticeList.tsx:67-77`, `FaqList.tsx:fetchContents`, `InquiryList.tsx:69-78`) | `BoardController.getBoards` (`web/v1/BoardController.kt:102`, ingest `01-controllers.md:29/234`) | `BoardService.getBoards` (`service/BoardService.kt:119-199`, ingest `02-services.md:74`) | `BoardPostRepository.findAllWithStatistics` (22 파라미터 동적 JPQL, ingest `03-repositories.md:75`) + `BoardPostFileRepository.findPostIdsWithImages` 후처리 | JWT만 (`@RequiredRole` 없음, 백엔드 docs §1, ingest `05-security.md:159`). `resolveAccessFilter` → INQUIRY는 `myUserId` 셀프 스코프, NOTICE는 USER+role 기반 `exposureRanges` + 파트너 계약 EXISTS 필터(`drug_company_id`, 백엔드 docs §2-1-a). `MemberBlock` 양방향 NOT EXISTS 2개. `parent IS NULL` 강제로 INQUIRY 답변 자식 row 목록 제외. |
| 2 | GET | `/v1/boards/notices/fixed-top` | `getFixedTopNotices` (`NoticeList.tsx:96-109`) | `BoardController.getFixedTopNotices` (`BoardController.kt:80`) | `BoardService.getFixedTopNotices:90-117` (컨트롤러 `exposureRanges` 파라미터 **shadow**로 무시, 백엔드 docs §5-B) | `BoardPostRepository.findAllFixedTopNotices` (`:158-230`, `ORDER BY bp.id DESC` 하드코딩, ingest `03-repositories.md:76`) | Page 아닌 `List`. **`MemberBlock` 양방향 필터 누락**(백엔드 docs §5-C). 실 데이터 NOTICE의 `fixed_top=true` 0건 → 사용자 화면 항상 빈 배열(백엔드 docs §5-L, 기능 플레이스홀더). |
| 3 | GET | `/v1/boards/{id}` | `getBoardDetails` (`NoticeDetail.tsx`, `FaqList.tsx fetchDetail`, `InquiryDetail.tsx`, `InquiryEdit.tsx` 수정 사전로드) | `BoardController.getBoardDetails` (`BoardController.kt:202-219`) | `BoardService.getBoardDetails:620-653` (본문 → buildChildren → buildComments → buildReports → buildAttachments → buildNoticeProperties + `postViewPublisher.enqueue`) | `BoardPostRepository.findBoardDetails` + `findChildrenByParentId` + `BoardPostFileRepository.findActiveFilesByBoardPostId` + `BoardNoticeRepository.findByBoardPostId` | `filterBlind`/`filterDeleted` 쿼리 파라미터 그대로 신뢰 → **삭제·블라인드 우회 가능**(백엔드 docs §5-D). 5~6회 DB round-trip(N+1, §5-N). INQUIRY 답변 본문은 `children[0]`로 동일 응답에 동봉. |
| 4 | POST | `/v1/boards` (multipart) | `createBoardPost` (`InquiryEdit.tsx:75-91 isNew=true`) | `BoardController.createBoardPost` (`BoardController.kt:158-166`) | `BoardService.createBoardPost:295-386` | `BoardPostRepository.save` + `BoardStatisticsRepository.save` + `BoardPostFileRepository.save × N`(첨부+`editorFileIds`) | INQUIRY 신규는 `parentId=null`, `exposureRange=ALL`, `nickname=session.userId` 고정. **`request.userId`를 인증 주체와 비교 안 함 — 타인 명의 생성 가능**(백엔드 docs §5-G CRITICAL). NOTICE 권한 체크가 `save` **이후**에 위치 → role<ADMIN 시 BoardPost+BoardStatistics 부분 쓰기 잔류 가능(§5-E). |
| 5 | PUT | `/v1/boards/{id}` (multipart) | `updateBoardPost` (`InquiryEdit.tsx:75-91 isNew=false`) | `BoardController.updateBoardPost` (`BoardController.kt:178-188`) | `BoardService.updateBoardPost:479-540+` (`checkRole` = 본인 또는 ADMIN) | `BoardPostRepository.findById/save` + `S3File.softDelete` + `BoardPostFileRepository.save`(중복 INSERT) | `keepFileIds=[...attachedFiles, ...editorAttachments]`로 보존 명시. **답변 달린 INQUIRY도 수정 가능 — 서버 가드 부재**(백엔드 docs §5-H, FE는 `children.length===0`일 때만 버튼 노출). `editorFileIds` UNIQUE 부재로 동일 파일 다중 행 누적(§5-I). `isBlind/isExposed/exposureRange=null` 전송으로 INQUIRY는 노출속성 불변. |
| 6 | DELETE | `/v1/boards/{id}` | `deleteBoardPost` (`InquiryDetail.tsx handleDelete`) | `BoardController.deleteBoardPost` (`BoardController.kt:168-176`) | `BoardService.softDeleteBy:247-264` (`@Transactional` 명시, `checkRole` = 본인 또는 ADMIN) | `BoardPostRepository.softDeleteByPostId` + **`softDeleteChildrenByParentId`** + `S3FileRepository.softDeleteAllFilesByPostIdCascade` + `BoardCommentRepository.softDeleteByPostId` | **사용자가 본인 문의 삭제 시 관리자 답변(자식 row)도 동반 soft-delete** — 감사 로그 관점 답변 이력 분실(백엔드 docs §5-J). FE는 `children.length===0`이어야만 버튼 노출하지만 API 직접 호출로 우회 가능. |
| 7 | POST | `/v1/boards/uploads` | `uploadEditorFile` (`InquiryEdit.tsx` Tiptap 본문 이미지) | `BoardController.uploadEditorFile` (`BoardController.kt:231-237`) | `BoardService.uploadEditorFileSync:266-291` (`runBlocking` + `S3FileService.uploadAttachmentAsync`) | `S3FileRepository.save`(`FileStatus.UPLOADING` 선저장) | JWT만. 업로드 실패 시 `s3_file` orphan 잔존 가능(admin/10 §5-G와 동일). 업로드 결과 `s3FileId`를 `editorFileIds`로 후속 createBoardPost에 전달. |

비동기 부가효과(`BoardService.publishQnaSubmittedEmailEvent` + `publishPushEvent:425-437`):
- **신규 INQUIRY (parentId=null) → SES 이메일** : `emailEventPublisher.enqueue(NotificationEmailEvent.QNA_SUBMITTED)` → `emailEventQueue`(`BlockingQueue<NotificationEmailEvent>`, ingest `06-config.md:264`) → `EmailEventConsumer` → AWS SES → **관리자 수신**(`06-config.md:175`).
- 관리자 답변(parentId≠null, admin/10 흐름) → `NotificationPushEvent(QNA_ANSWERED)` → 원글 작성자 푸시. 이 이벤트의 `request.userId`는 답변 등록 시 admin이 입력한 원글 작성자 userId.
- 두 이벤트 모두 `@Transactional` 커밋 후 (admin/10에서 확인된 `PushEventAfterCommitListener` 패턴) 발사 — 작성·답변 트랜잭션 롤백 시 미발송.

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 핵심 컬럼 | ingest 출처 |
|--------|------|-------|----------|-------------|
| `board_post` | NOTICE/FAQ/INQUIRY 통합 본문 (총 52행: NOTICE 44/FAQ 5/INQUIRY 3) | `member_id`, `parent_id`(자기참조 — INQUIRY 답변 연결) | `board_type`(CHECK), `title`, `nickname`, `hidden_nickname`, `is_blind`, `is_exposed`, `exposure_range`, `deleted`, `posted_date` | `04-domain.md:60`, 백엔드 docs §3-1·§4-1 |
| `board_notice` | NOTICE/커뮤니티 고정글 부가속성 (1:1 UNIQUE board_post_id) | `board_post_id`, `drug_company_id` | `notice_type`(CHECK 7종 — `PRODUCT_STATUS`/`MANUFACTURING_SUSPENSION`/`NEW_PRODUCT`/`POLICY`/`GENERAL`/`ANONYMOUS_BOARD`/`MR_CSO_MATCHING`), `drug_company_name`(스냅샷), `fixed_top` | 백엔드 docs §3-2 |
| `board_statistics` | 1:1 집계(UNIQUE board_post_id) — NOTICE/FAQ는 likes/comment 항상 0 | `board_post_id` | `views_count`(의미 있는 유일 컬럼) | 백엔드 docs §3-4 |
| `board_post_file` | 첨부 + 에디터 이미지 매핑 (`type=ATTACHMENT|EDITOR`로 분리) | `board_post_id`, `s3_file_id` | `display_order` | 백엔드 docs §3-3 |
| `board_post_view` | 사용자별 열람 기록 (USER priority 미만만 viewCount 증가) | `board_post_id`, `member_id` | `last_viewed_at` | 백엔드 docs §3-5 |
| `member_block` | 양방향 차단 — 일반 목록 NOT EXISTS, **고정공지 미적용**(§5-C) | `member_id`, `blocked_member_id` | — | 백엔드 docs §3-6 |
| `partner` | 파트너 계약 — NOTICE 가시성 EXISTS 필터(USER만) | `owner_user_id`, `drug_company_id` | `deleted` | 백엔드 docs §2-1-a |
| `s3_file` | 첨부 원본 (orphan 누적 가능) | — | `status`, `original_file_name` | 백엔드 docs §3-3 |

핵심 JOIN(INQUIRY 본인 목록 + 답변 여부 — `findAllWithStatistics`의 USER 시나리오 응축, 백엔드 docs §6-1):

```sql
SELECT bp.id, bp.title, bp.created_at,
       COALESCE(bs.views_count,0) AS views,
       CASE WHEN EXISTS (
         SELECT 1 FROM board_post c
         WHERE c.parent_id = bp.id AND NOT c.deleted
       ) THEN true ELSE false END AS has_children   -- InquiryStatusChip
FROM board_post bp
JOIN member m ON m.id = bp.member_id
LEFT JOIN board_statistics bs ON bs.board_post_id = bp.id
WHERE bp.board_type = 'INQUIRY'
  AND bp.parent_id IS NULL                          -- 답변(자식) 제외
  AND bp.deleted = false                            -- filterDeleted=true
  AND bp.is_blind = false                           -- filterBlind=true
  AND LOWER(m.user_id) = LOWER(:viewer)             -- myUserId 셀프 스코프
  AND NOT EXISTS (SELECT 1 FROM member_block mb
                  WHERE LOWER(mb.member_user_id)=LOWER(:viewer)
                    AND mb.blocked_member_id=m.id)
  AND NOT EXISTS (SELECT 1 FROM member_block mb2
                  WHERE mb2.member_id=m.id
                    AND LOWER(mb2.blocked_member_user_id)=LOWER(:viewer))
ORDER BY bp.created_at DESC
LIMIT :size OFFSET :offset;
-- LOWER() 사용으로 member.user_id btree 인덱스 미적용 — 함수 인덱스 권장(백엔드 docs §5-K)
```

## 4. 권한·트랜잭션 (admin/10 과의 차이)

| 항목 | user/09 | admin/10 | 차이 |
|---|---|---|---|
| 진입 권한 | 로그인 USER (모든 멤버 타입) | `@RequiredRole(ADMIN_ONLY, COMMUNITY_MANAGEMENT)` 일부 적용(`getBoardMembers`, `toggleBlindStatus`만) | user/09는 게시판 라우트 전체 USER 노출, admin/10은 `/admin/*`이므로 라우터 가드 + 일부 엔드포인트만 RBAC |
| 작성 (POST `/v1/boards`) | INQUIRY만(NOTICE는 서비스 내부에서 USER 차단) | NOTICE/FAQ 모두 작성, INQUIRY는 답변(parentId=원글) 작성 | **공통 결함**: FAQ/INQUIRY 쓰기에 컨트롤러·서비스 RBAC 가드 없음 — UI 분리만으로 차단(admin/10 보고 §3) |
| 수정/삭제 가드 | `checkRole` 본인 또는 ADMIN | `checkRole` 동일 | user는 본인 글만, admin은 모두 가능. **양쪽 모두 `hasChildren` 검사 없음 → 답변 후 수정/삭제 우회**(백엔드 docs §5-H/§5-J) |
| 목록 가시성 | `exposureRanges = resolveExposureRanges(USER, memberType)` → `[ALL, UNCONTRACTED]` 또는 `[ALL, CONTRACTED]`. 파트너 계약 EXISTS 적용 | role≠USER 분기 → 파트너 계약 EXISTS 우회, `onlyCommunityBoards` 옵션 사용 가능 | NOTICE의 `drug_company_id` 필터가 USER에서만 동작. admin/10은 모든 NOTICE 노출 |
| `filterBlind`/`filterDeleted` | FE가 항상 `true` 강제 (블라인드·삭제 제외) | FE가 `null` 또는 `false`도 사용 (관리자 뷰) | **공통 결함**: 서버가 클라이언트 파라미터 신뢰 → USER가 `false` 직접 호출로 우회 가능(백엔드 docs §5-D) |
| `myUserId` | INQUIRY 항상 `session.userId` (본인 문의) | 비고정 — 모든 사용자 문의 조회 | user/09 INQUIRY 목록 SQL의 `LOWER(m.user_id)=LOWER(:viewer)` 절이 사용자 보호의 사실상 유일 장벽 |
| 알림 흐름 발신자 | INQUIRY 작성 → `QNA_SUBMITTED` 이메일 전송 (수신자: 관리자) | 답변 작성 → `QNA_ANSWERED` 푸시 전송 (수신자: 원글 작성자 = user) | **양방향 큐 한 쌍**: user→admin은 SES 이메일, admin→user는 push. 큐는 모두 `@Transactional` AFTER_COMMIT |
| 트랜잭션 어노테이션 | `softDeleteBy`는 명시(`@Transactional`, L246), `createBoardPost`는 **함수 레벨 `@Transactional` 미선언**(백엔드 docs §5-E) — 클래스 레벨 의존 | 동일 코드 경로 공유 | NOTICE 작성 시 부분 쓰기(BoardPost+BoardStatistics 잔류) 가능 — admin/10에서 더 자주 발현되지만 user에서 NOTICE 시도해도 동일 |

## 5. 리스크 / 후속 액션

1. **CRITICAL — `createBoardPost` request.userId 신뢰(백엔드 docs §5-G)**: 로그인 USER가 다른 사용자의 userId로 INQUIRY 작성 가능. `session.userId == request.userId` 비교 또는 컨트롤러에서 `@AuthenticationPrincipal`로 강제 주입 필요. user/09에선 자기 InquiryList에 안 보여 탐지 어려움 → 관리자 측 admin/10 InquiryList에서 발견.
2. **HIGH — `filterBlind`/`filterDeleted` 클라이언트 신뢰(§5-D)**: USER 호출 시 서버가 강제로 `true` 적용해야. 현재 악성 호출자가 `filterDeleted=false`로 soft-deleted 본문·첨부 URL 조회 가능.
3. **HIGH — 답변 달린 INQUIRY 수정/삭제 우회(§5-H/§5-J)**: 본인 인증만 통과하면 답변 후 본문 변조(맥락 왜곡) 또는 삭제 → 답변 동반 soft-delete로 답변 이력 분실. 서비스 `updateBoardPost`/`softDeleteBy`에 `boardType==INQUIRY && hasChildren && role<ADMIN` 차단 추가.
4. **MEDIUM — `getFixedTopNotices` MemberBlock 누락(§5-C) + NOTICE fixed_top 0건(§5-L)**: 현재 NOTICE 고정공지 운영 데이터 없음(실 fixed_top 3건은 모두 `MR_CSO_MATCHING`/`ANONYMOUS_BOARD` boardType). 화면은 빈 결과로 동작하지만 향후 NOTICE 고정공지가 추가되면 차단한 사용자 글이 fixed_top으로 승격 시 차단 회피.
5. **MEDIUM — `editorFileIds` 중복 INSERT(§5-I)**: `board_post_file (post_id, s3_file_id) UNIQUE` 부재. user 측 InquiryEdit는 사용 빈도 낮지만 동일 코드 경로.
6. **MEDIUM — `createBoardPost` `@Transactional` 미선언(§5-E)**: NOTICE 작성 시 권한 실패하면 BoardPost+BoardStatistics 부분 쓰기 잔류 가능. user는 NOTICE 작성 시도가 일반적이지 않지만 코드 위생 차원에서 명시 필요.
7. **LOW — N+1 in `getBoardDetails`(§5-N)**: 5~6회 round-trip. 현재 데이터량에선 체감 없음. NOTICE 첨부 많은 케이스만 모니터링.
8. **LOW — `findPostIdsWithImages` 무용 호출(§5-O)**: NOTICE/FAQ/INQUIRY 모두 `hasImage` 미사용인데 목록 후처리 1회 추가. boardType별 조건부 실행으로 1쿼리 절약.
9. **LOW — INQUIRY title 공백 허용(§5-M)**: 서버 검증 부재. 실 데이터 id=412 "저기요" 존재. `@NotBlank` 추가.
10. **LOW — `LOWER(user_id)` 인덱스 미적용(§5-K)**: 현재 member 규모 작음. 사용자 수만 확장 시 INQUIRY 목록 시퀀스 스캔 위험. `CREATE INDEX ON member (LOWER(user_id))` 함수 인덱스 적용.
11. **DOCS — NoticeList 제약사 분류 4/5 빈 데이터**: `PRODUCT_STATUS`/`MANUFACTURING_SUSPENSION`/`NEW_PRODUCT`/`POLICY` 모두 0건, `GENERAL` 41건만 운영. UI 탭 4개가 항상 빈 결과. admin/10에서 분류 입력 활성화 또는 user UI 단순화 검토.

## 6. 참조

- 프론트 문서: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/09_CUSTOMER_SERVICE.md`
- 백엔드 문서: `/Users/jmk0629/keymedi/medipanda-api/docs/user/09_CUSTOMER_SERVICE.md`
- 프론트 소스(`/Users/jmk0629/keymedi/medipanda-web-test/src/pages-user/`): `NoticeList.tsx`, `NoticeDetail.tsx`, `FaqList.tsx`, `InquiryList.tsx`, `InquiryDetail.tsx`, `InquiryEdit.tsx`
- 인제스트:
  - `reports/backend-ingestion-20260427/01-controllers.md` BoardController(§29/L102/L158/L168/L178/L202/L221/L231/L234), TermsController(:40/L349)
  - `reports/backend-ingestion-20260427/02-services.md` BoardService(L68-83) — `createBoardPost` 트랜잭션 + `QNA_SUBMITTED` 이메일 + `QNA_ANSWERED` 푸시(L83), MR_CSO_MATCHING 셀프 스코프(L407)
  - `reports/backend-ingestion-20260427/03-repositories.md` BoardPostRepository(:35 `findAllWithStatistics`, :158 `findAllFixedTopNotices`), `LOWER(user_id)` 인덱스 노트(:139)
  - `reports/backend-ingestion-20260427/04-domain.md` board_post(:60), board_notice/board_statistics/board_post_file 관계
  - `reports/backend-ingestion-20260427/05-security.md` BoardController `@RequiredRole` 부분 적용(:159), `/v1/boards/**` 가드 부재(L58 표 외)
  - `reports/backend-ingestion-20260427/06-config.md` AWS SES(:175), `emailEventQueue` `BlockingQueue<NotificationEmailEvent>`(:264)
- 형제 풀스택 지도(공통 BoardController 계층):
  - `reports/bridge/admin-10-customer-service-fullstack.md` — admin 답변·관리 측. user/09와 동일 컨트롤러 공유, 작성→답변 큐 한 쌍 형성
  - `reports/bridge/user-06-community-fullstack.md` — 동일 `BoardController` MR_CSO_MATCHING/ANONYMOUS 분기, 좋아요·댓글·신고 흐름 추가

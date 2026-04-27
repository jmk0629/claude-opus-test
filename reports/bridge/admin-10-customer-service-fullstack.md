# admin-10 고객 지원 — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력 문서: 프론트 `medipanda-web-test/docs/admin/10_CUSTOMER_SERVICE.md`, 백엔드 `medipanda-api/docs/admin/10_CUSTOMER_SERVICE.md`
> 인제스트: `reports/backend-ingestion-20260427/01-controllers.md … 06-config.md`

## 1. 화면 요약

| Route | 컴포넌트 | 역할 |
|---|---|---|
| `/admin/notices` | `MpAdminNoticeList.tsx` | 공지 목록·검색·삭제(다중) + 마운트 시 제약사 드롭다운 로드 |
| `/admin/notices/new`, `/:boardId` | `MpAdminNoticeEdit.tsx` | 공지 등록/수정 (`isNew` 패턴), `noticeProperties` 필수, 제약사 모달 |
| `/admin/faqs` | `MpAdminFaqList.tsx` | FAQ 목록·삭제. 제약사 필터/노출범위 없음 |
| `/admin/faqs/new`, `/:boardId` | `MpAdminFaqEdit.tsx` | FAQ 등록/수정. `noticeProperties=null`, `exposureRange=ALL` 고정 |
| `/admin/inquiries` | `MpAdminInquiryList.tsx` | 1:1 문의 목록. `hasChildren`으로 답변상태 표시 — N+1 발생 |
| `/admin/inquiries/:boardId` | `MpAdminInquiryDetail.tsx` | 문의 상세 + 회원/계약 정보 + 답변 에디터(2 인스턴스: 읽기 전용 + 편집) |

세 게시판 모두 백엔드 단일 컨트롤러(`/v1/boards`)를 `boardType` 파라미터(NOTICE/FAQ/INQUIRY)로 분기 재사용. 부가 API는 공지에서 제약사 드롭다운(`/v1/drug-companies`), 문의 상세에서 회원(`/v1/members/{userId}/details`)·계약(`/v1/partner-contracts/{userId}`) 두 건.

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| FE 호출 | HTTP · 실 Path | Controller (file:line) | Service 메서드 | Repository / JPQL | 인제스트 출처 |
|---|---|---|---|---|---|
| `getBoards({boardType:NOTICE/FAQ/INQUIRY, …})` | GET `/v1/boards` | `BoardController.kt:102` (`getBoards`) | `BoardService.findBoards` | `BoardPostRepository.findAllWithStatistics`(JPQL 22 파라미터, `BoardPostRepository.kt:35`) + `findAllFixedTopNotices`(:158) | 01:234, 03:16/75 |
| `getBoardDetails(id)` | GET `/v1/boards/{id}` | `BoardController.kt:202` | `BoardService.getBoardDetails:620-653` (children/comments/reports/attachments/noticeProps) | `findBoardDetails`, `findChildrenByParentId`, `BoardCommentRepository.findTopCommentsByBoardPostId`, `findRepliesByParentIds`, `BoardPostFileRepository.findActiveFilesByBoardPostId`, `BoardNoticeRepository.findByBoardPostId` | 01:237, 03:17/23 |
| `createBoardPost({request, files})` | POST `/v1/boards` (multipart) | `BoardController.kt:158` | `BoardService.createBoardPost:294-386` | `BoardPostRepository.save` + `BoardStatisticsRepository.insertIfAbsentInit`(`ON CONFLICT DO NOTHING`, :14) + `BoardPostFileRepository.save` + (NOTICE) `BoardNoticeRepository.save` + `DrugCompanyRepository.findByName` | 01:238, 02:74-83, 03:20/22/23/53 |
| `updateBoardPost(id, {updateRequest, newFiles})` | PUT `/v1/boards/{id}` (multipart) | `BoardController.kt:178` | `BoardService.updateBoardPost:490-560` (keepFileIds 외 파일 soft delete) | `BoardPostRepository.save`, `BoardPostFileRepository.softDeleteS3FilesByBoardPostId`, `BoardNoticeRepository` upsert, `DrugCompanyRepository.findByName` | 01:239 |
| `deleteBoardPost(id)` | DELETE `/v1/boards/{id}` | `BoardController.kt:168` (`@RequiredRole` 없음) | `BoardService.deleteBoardPost` (자식 cascade) | `BoardPostRepository.softDeleteByPostId`·`softDeleteChildrenByParentId`, `BoardCommentRepository.softDeleteByPostId`·`softDeleteSubtree`(WITH RECURSIVE, :67) | 01:240, 03:92 |
| `uploadEditorFile(file)` | POST `/v1/boards/uploads` | `BoardController.kt:231` | `BoardService` → `S3FileService` | `S3FileRepository.save` | 01:243 |
| `getAllDrugCompanies()` | GET `/v1/drug-companies` (FE 문서엔 `/all`로 오기) | `DrugCompanyController.kt:24` (`@RequiredRole(ADMIN_ONLY, CONTRACT_MANAGEMENT)`) | `DrugCompanyService.getAllDrugCompanies:11-15` | `DrugCompanyRepository.findAll()` | 01:346, 03:53 |
| `getMemberDetails(userId)` | GET `/v1/members/{userId}/details` (FE 문서엔 `/details` 누락) | `MemberController.kt:158` (`ADMIN_OR_SELF`/`MEMBER_MANAGEMENT`) | `MemberService.getMemberDetails:84-86` | `MemberRepository.findByUserId`(:107, JPQL `WHERE m.userId=:userId` — **deleted 필터 없음**) | 03:15 |
| `getContractDetails(userId)` | GET `/v1/partner-contracts/{userId}` (FE 문서엔 `/v1/contracts/{userId}`로 오기) | `PartnerContractController.kt:31` (**`@RequiredRole` 없음 → P0**) | `PartnerContractService.getContractDetails:245-275` | `MemberRepository.findActivateMemberByUserId`(:104) → `PartnerContractRepository.findLatestByMemberId`(native, :15, `ORDER BY contract_date DESC, id DESC LIMIT 1`) | 01:143, 03:26/94 |

**비동기 부가효과**(`BoardService.publishPushEvent:425-437` + 이메일 큐):
- `INQUIRY && parentId == null` (회원이 새 문의 작성) → `EmailEventPublisher` → `emailEventQueue` (`NotificationQueueConfig.kt:19`) → SES 발송 (`QNA_SUBMITTED`, 관리자 수신).
- `INQUIRY && parentId != null` (관리자 답변) → `NotificationPushEvent(QNA_ANSWERED)` → 질문자 푸시.
- `NOTICE && drugCompany != null && isExposed` → `PHARMA_ISSUE` 푸시(해당 제약사 PARTNER 그룹).
- `update` 경로엔 `publishPushEvent` 호출 없음 → 신규 등록만 알림.

## 3. DB 테이블

| 테이블 | 용도 | 핵심 컬럼 | 출처 |
|---|---|---|---|
| `board_post` | 모든 게시판 통합 (9,159행, 고객센터 NOTICE 44 / FAQ 5 / INQUIRY 3) | `board_type`(CHECK 9종), `parent_id`(자기참조, 답변 연결), `title`/`content`/`nickname`, `is_exposed`/`is_blind`/`deleted`, `exposure_range`, `posted_date` | 04:60 |
| `board_notice` | NOTICE 전용 부가 속성 (44행) | `board_post_id`(UNIQUE FK), `notice_type`(CHECK 7종), `drug_company_name`(스냅샷), `drug_company_id`(전수 NULL — dead column), `fixed_top` | 04:67 |
| `board_statistics` | 좋아요·조회·댓글수 (1:1 mappedBy) | `board_post_id`(unique), `likes_count`, `views_count`, `comment_count` | 04:66/211, 03:91 |
| `board_post_file` | 첨부파일 매핑 (ATTACHMENT/EDITOR 분리) | `board_post_id`, `s3_file_id` | 04:62/219-220 |
| `board_comment` / `board_comment_like` | 댓글·좋아요 (재귀 CTE 트리) | - | 04:64-65 |
| `drug_company` | 제약사 마스터 (9행) | `id`, `code`, `name`(UNIQUE) | 04:34 |
| `partner_contract` | 파트너 계약 (최신 1건 lookup) | `member_id`, `contract_date`, 첨부파일들 | 04:36 |
| `member` | 문의자/관리자 | `user_id`, `name`, `member_type`, `deleted` | 04:60 어귀 |
| `s3_file` | 첨부 원본 (orphan 가능 — 5-G) | `status`, `original_file_name` | 04:71 |

핵심 JOIN(인제스트 §6-Z-6 “답변일 N+1 회피”):
```sql
SELECT q.id, q.title, q.nickname AS asker,
       a.id AS answer_id,
       TO_CHAR(a.created_at, 'YYYY-MM-DD') AS answered_at
FROM board_post q
LEFT JOIN board_post a
       ON a.parent_id = q.id AND a.deleted = false
WHERE q.board_type = 'INQUIRY'
  AND q.parent_id IS NULL
  AND q.deleted = false
ORDER BY q.id DESC
LIMIT 20;
-- (board_type, parent_id, deleted) 복합 인덱스 권장
```

NOTICE 상세 가시성 분기 (현재 dead branch — `drug_company_id` 100% NULL):
```sql
SELECT bp.*, bn.notice_type, bn.drug_company_name, bn.fixed_top
FROM board_post bp
LEFT JOIN board_notice bn ON bn.board_post_id = bp.id
LEFT JOIN drug_company dc ON dc.id = bn.drug_company_id
WHERE bp.board_type = 'NOTICE' AND bp.deleted = false;
```

## 4. 권한·트랜잭션

| 항목 | 현재 정책 | 비고 |
|---|---|---|
| GET `/v1/boards` (목록) | JWT만 (`@RequiredRole` 없음) | 08 COMMUNITY와 동일 결함. 누구나 NOTICE/FAQ/INQUIRY 목록 조회. 05:159 |
| POST/PUT `/v1/boards` | JWT만 + 서비스 내부 `boardType==NOTICE && role<ADMIN → UnauthorizedException` (`BoardService.kt:332-334`) | FAQ·INQUIRY 쓰기는 **컨트롤러·서비스 모두 ADMIN 가드 없음**. 운영상 UI에서만 차단. 02:74 |
| DELETE `/v1/boards/{id}` | 서비스 `checkRole(requestUserId, role, boardPost.member.userId)` — ADMIN 또는 작성자 본인 | 컨트롤러 어노테이션 누락 → 감사 로그 어려움. 답변 cascade 삭제(`softDeleteChildrenByParentId`)로 답변 동시 분실 위험 |
| POST `/v1/boards/uploads` | JWT만 | 누구나 S3 업로드 가능, orphan s3file 누적 (5-G) |
| GET `/v1/drug-companies` | `ADMIN_ONLY` + `CONTRACT_MANAGEMENT` | **공지관리(`CONTENT_MANAGEMENT`) 화면에서 호출 → 권한 부정합으로 드롭다운 403** (5-E) |
| GET `/v1/members/{userId}/details` | `ADMIN_OR_SELF` + `MEMBER_MANAGEMENT` | 정상. 단 탈퇴 회원도 조회됨(`findByUserId`엔 `deleted` 필터 없음) |
| GET `/v1/partner-contracts/{userId}` | **어노테이션 전무 — P0** | 로그인만 되면 타인 사업자번호·은행계좌·세금정보 조회 가능 |

트랜잭션:
- `createBoardPost`/`updateBoardPost`/`deleteBoardPost` 모두 `@Transactional REQUIRED`. `board_post` save → `board_statistics insertIfAbsentInit`(`ON CONFLICT DO NOTHING`) → file 저장 → `board_notice` upsert를 한 트랜잭션에서 처리.
- 알림(`publishPushEvent` / `EmailEventPublisher.publish`)은 `PushEventAfterCommitListener` + 별도 인메모리 큐(`emailEventQueue`)로 **AFTER_COMMIT 비동기**(02:269, 06:264). 트랜잭션 롤백 시 푸시·이메일 미발송 보장.
- 단, **DELETE→POST 재작성 케이스에서는 `notification_log` 멱등성 체크가 없어 `QNA_ANSWERED` 푸시가 중복 발송**(5-K).

## 5. 리스크 / 후속 액션

1. **P0 — `GET /v1/partner-contracts/{userId}` RBAC 부재**: 백엔드 문서 5-F. `@RequiredRole(ADMIN_OR_SELF, CONTRACT_MANAGEMENT)` 즉시 추가, 운영 access log 기준 비정상 패턴(같은 IP가 다른 userId 다수 조회) 헌팅 필요.
2. **권한 매핑 부정합 — `getAllDrugCompanies`**: 공지관리 권한(`CONTENT_MANAGEMENT`)만 보유한 서브관리자는 제약사 드롭다운 자체가 비어 검색 불가. 권한을 `CONTENT_MANAGEMENT` 또는 무권한으로 조정.
3. **FAQ/INQUIRY 쓰기 RBAC 부재**: 컨트롤러·서비스 양쪽에 ADMIN 가드 추가(현재 NOTICE만 서비스 내부에서 방어).
4. **`board_notice.drug_company_id` 100% NULL — dead branch**: FE는 `noticeType=GENERAL`만 쓰고 제목에 `[회사명]` 수기 프리픽스. 가시성 JPQL의 `LEFT JOIN dc … EXISTS Partner …` 분기 무용. 기능 살리려면 정규식으로 백필 마이그레이션(§6-Z-5).
5. **`drug_company_name` 스냅샷 미동기화**: 제약사 개명 후엔 옛 이름으로만 검색됨(5-O). 필터 살아나면 즉시 표면화.
6. **INQUIRY 목록 N+1**: FE가 페이지당 20회 `getBoardDetails(id)` 추가 호출. 백엔드 응답 DTO에 `answeredAt` 필드 추가 + JOIN 1회로 제거(§4-6/§6-Z-6).
7. **`QNA_ANSWERED` 푸시 멱등성 결여**: 답변 DELETE→POST 재작성 시 `notification_log` 중복 검사 없이 매번 재발송(5-K).
8. **답변 cascade 분실**: 문의 삭제 한 번에 답변 같이 soft delete. 복구 UI 없음 → ADMIN 전용 복구 엔드포인트 또는 `board_post_audit` 도입.
9. **PartnerContract 404→500 매핑**: `NoSuchElementException`이 GlobalHandler에서 500으로 매핑되어 “계약 없는 회원” 정상 케이스가 에러 로그를 오염(5-H). `ResponseEntity.notFound()`로 정정.
10. **에디터 업로드 RBAC 부재 + S3 orphan**: `POST /v1/boards/uploads`에 인증 외 가드 없음, 실패시 `s3_file` 레코드 잔존(5-G). 주기 클린업 필요.
11. **FE 문서 경로 3건 오기**: `/v1/drug-companies/all`, `/v1/members/{userId}`, `/v1/contracts/{userId}` — `backend.ts`는 OpenAPI 생성으로 정상 동작하지만 보안 리뷰·gateway 매핑 시 혼선.
12. **`filterDeleted` 의미 반전**: `true=살아있는 것만` — 08 COMMUNITY와 동일 함정. `includeDeleted=false`로 리네이밍 권장.

## 6. 참조

- 프론트 문서: `/Users/jmk0629/keymedi/medipanda-web-test/docs/admin/10_CUSTOMER_SERVICE.md`
- 백엔드 문서: `/Users/jmk0629/keymedi/medipanda-api/docs/admin/10_CUSTOMER_SERVICE.md`
- 인제스트:
  - `reports/backend-ingestion-20260427/01-controllers.md` §2-6, §2-11, §2-21 (BoardController/PartnerContract/DrugCompany)
  - `reports/backend-ingestion-20260427/02-services.md` BoardService(line 68-83), PartnerContractService(133), MemberService, EmailEventPublisher 흐름(269-272, 327-363)
  - `reports/backend-ingestion-20260427/03-repositories.md` BoardPostRepository(:35/:158), BoardStatisticsRepository(:14), BoardCommentRepository(:38/:67), DrugCompanyRepository(:53), PartnerContractRepository(:15)
  - `reports/backend-ingestion-20260427/04-domain.md` board_post/board_notice/board_statistics 관계(60-67, 211-220), drug_company/partner_contract(34-36)
  - `reports/backend-ingestion-20260427/05-security.md` BoardController·PartnerContractController @RequiredRole 부재(146-159)
  - `reports/backend-ingestion-20260427/06-config.md` AWS SES(175), `emailEventQueue`(264), `EmailEventConsumer`(268)
- 형제 풀스택 지도(공통 BoardController 계층): `reports/bridge/admin-08-community-fullstack.md`(존재 시), `reports/bridge/admin-03-partner-fullstack.md`(PartnerContract 공유)

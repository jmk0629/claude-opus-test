# 02-services.md — Medipanda API 서비스 계층 분석

> 분석 기준일: 2026-04-27
> 대상 경로: `/Users/jmk0629/keymedi/medipanda-api/application/src/main/kotlin/kr/co/medipanda/portal/`
> @Service 총수: 27개 (service/* 22 + security/* 3 + support/* 1 + statistics/* 일부)

---

## 서비스 계층 요약

- **트랜잭션 관리**: 선언적 (`@Transactional`) 혼용. `jakarta.transaction.Transactional`(클래스 트랜잭션 참여 default REQUIRED)과 `org.springframework.transaction.annotation.Transactional`(readOnly 지원)이 **혼재**. 파일마다 import 출처가 다름.
- **readOnly 클래스**: `SettlementMemberMonthlyService`만 클래스 레벨 `@Transactional(readOnly = true)` 사용.
- **아키텍처 특이사항**: 이벤트 기반 비동기 통계/알림 파이프라인(ApplicationEventPublisher → TransactionalEventListener AFTER_COMMIT → Coroutine IO) 패턴이 좋아요·조회수·푸시 전역에 적용됨. S3 업로드도 이벤트 드리븐. 인메모리 BlockingQueue(LikeCommandQueue, PostViewQueue)로 좋아요·조회수를 직렬화 처리.

---

## 도메인별 서비스 맵

### 1. 인증 (Auth)

**파일**: `service/AuthService.kt`

**책임**: 로그인·로그아웃·JWT 발급/갱신, RSA 비밀번호 복호화, SMS 인증코드 발행/검증, 비밀번호 변경, 프로모션 토큰 생성.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `login` | 비밀번호 검증 후 JWT 발급, MemberDevice 저장/갱신 | REQUIRED | BLOCKED 계정 거부, 비밀번호 불일치 시 IllegalArgumentException |
| `logout` | refreshToken null화, 디바이스 loggedOut=true | REQUIRED | 토큰 유효할 때만 DB 갱신 |
| `refreshToken` | Refresh token 검증 후 재발급 | REQUIRED | BLOCKED 계정 거부, 만료/형식 오류 거부 |
| `changePassword` | 현재 비밀번호 확인 후 변경 | REQUIRED | 현재 비밀번호 불일치 시 IllegalArgumentException |
| `changePasswordForFindAccount` | SMS 인증 후 비밀번호 변경 | REQUIRED | 캐시 인증 코드·userId·phoneNumber 3중 일치 검증 |
| `issueAuthCode` | SMS 인증코드 발송 (AuthCodeCache TTL 3분) | 없음 | 활성 회원만 허용 |
| `verifyAuthCode` | 인증코드 검증 후 캐시 제거 | 없음 | — |
| `createPromotionToken` | XOR+Base64 URL-safe 프로모션 토큰 생성 | 없음 | promotionConfig.tokenExpiryMinutes 기반 만료 |

**의존성**: `MemberRepository`, `PartnerContractRepository`, `MemberDeviceRepository`, `JwtService`, `RsaUtil`, `PasswordEncoder`, `AuthCodeCache`, `AuthCodeCacheForFindAccount`, `SmsSender`

**참고**: `login` 내 deviceUuid 소유 검증 없음 → 다른 멤버 UUID로도 새 디바이스 생성 가능 (AuthService.kt:380-394). 프로모션 토큰 암호화 알고리즘이 XOR+Base64이므로 키 노출 시 복호화 가능 (AuthService.kt:474-497).

---

### 2. 회원 관리 (Member)

**파일**: `service/MemberService.kt`

**책임**: 회원 가입·수정·탈퇴, 관리자 계정 생성, CSO 인증서 승인/반려, FCM 토큰 갱신, 닉네임 중복 확인, 추천인 포인트.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `signup` | 일반 회원가입, referralCode 자동 생성 | REQUIRED | userId/phoneNumber 중복 불가, 최대 10회 referralCode 생성 시도 |
| `signupByAdmin` | 관리자 계정 생성 | REQUIRED | userId/phoneNumber 중복 불가, Role=ADMIN 고정 |
| `update` | 회원 정보 수정 (재활성화 포함) | REQUIRED | 재활성화 시 userId/phoneNumber 재중복 확인, 닉네임 변경 1개월 쿨다운 |
| `updateByAdmin` | 관리자가 회원 수정 | REQUIRED | phoneNumber/userId 중복 검사, 권한 맵 갱신 |
| `softDeleteBy` | 회원 소프트 삭제 + 닉네임 null화 | REQUIRED | 두 번 softDelete 불가 (updated==0이면 예외) |
| `approveCsoCertificate` | CSO 인증서 승인 + 푸시 발송 | REQUIRED | — |
| `rejectCsoCertificate` | CSO 인증서 반려 + 파일 삭제 + 푸시 발송 | REQUIRED | — |
| `updateFcmToken` | FCM 토큰 갱신 또는 신규 디바이스 생성 | REQUIRED | 빈 토큰 거부 |
| `ensureReferralCodeAssigned` | 중복 없는 추천인 코드 생성 | REQUIRED | 10회 내 실패 시 RuntimeException |

**의존성**: `MemberRepository`, `MemberFileRepository`, `S3FileRepository`, `AdminPermissionMetaRepository`, `AdminPermissionMappingRepository`, `ApplicationEventPublisher`, `MemberDeviceRepository`, `MemberPushPreferenceRepository`, `EmailEventPublisher`

**이벤트 발행**: `NotificationPushEvent`(CSO_CERT_APPROVED/REJECTED), `S3FileUploadEvent`, `NotificationEmailEvent`(CSO_CERT_SUBMITTED)

---

### 3. 게시판 (Board)

**파일**: `service/BoardService.kt`

**책임**: 게시글 CRUD, 좋아요/조회수 큐 위임, 블라인드, 접근 권한 필터, 댓글+차단 조합 가시성 처리, 공지 속성 관리.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `createBoardPost` | 게시글 생성 + 통계 row 생성 + 파일 + 알림 | REQUIRED | NOTICE 타입은 ADMIN 이상만 작성 가능 (BoardService.kt:332-334), ANONYMOUS는 익명 닉네임 자동 생성 |
| `updateBoardPost` | 게시글 수정 + 파일 관리 + 공지 속성 갱신 | REQUIRED | 본인 또는 ADMIN 이상만 수정 가능 |
| `softDeleteBy` | 게시글 + 자식글 + 파일 + 댓글 소프트 삭제 | REQUIRED | 본인 또는 ADMIN 이상만 삭제 |
| `getBoardDetails` | 상세 조회 + 댓글 트리 + 차단 필터 + 조회수 큐 | 없음 | 차단 집합(내가 차단 + 나를 차단) 합집합으로 댓글 필터링 |
| `getBoards` | 목록 조회 (접근 필터 적용) | 없음 | ANONYMOUS는 MemberType.NONE 접근 불가, MR_CSO_MATCHING은 본인 글만 조회 가능 |
| `toggleBlindStatus` | 블라인드 토글 | REQUIRED | — |

**의존성**: `MemberRepository`, `BoardPostRepository`, `MemberBlockRepository`, `BoardCommentRepository`, `BoardCommentLikeRepository`, `BoardStatisticsRepository`, `LikeCommandPublisher`, `BoardPostFileRepository`, `BoardNoticeRepository`, `DrugCompanyRepository`, `S3FileRepository`, `ReportRepository`, `PostViewPublisher`, `BoardStatisticsService`, `EmailEventPublisher`, `S3FileService`

**이벤트 발행**: `S3FileUploadEvent`, `NotificationPushEvent`(QNA_ANSWERED, PHARMA_ISSUE, CSO_ATOZ_CONTENT), `NotificationEmailEvent`(QNA_SUBMITTED)

---

### 4. 처방전 (Prescription)

**파일**: `service/PrescriptionService.kt`

**책임**: EDI 처방전 제출(개별/ZIP), 처방전 상태 전이(PENDING→IN_PROGRESS→COMPLETED), 파트너별 처방 품목 관리, EDI ZIP 다운로드.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `createPrescriptionWithFiles` | 처방전 + 파트너 생성, EDI 파일 업로드 | REQUIRED | 파일 1~30개, 허용 확장자(jpg/jpeg/png/gif/heif/heic) 검증 |
| `updatePrescriptionWithFiles` | 처방전·파트너 정보 수정, 파일 교체 | REQUIRED | 파일 총 1~5개 제한, keepFileIds 유효성 확인 |
| `prescriptionZipUploadV2` | ZIP 해제 후 일괄 업로드 | REQUIRED | Zip Bomb 가드(5000 entries, 500MB), 임시파일 정리 보장, MS949/UTF-8 자동 감지 |
| `confirmPrescription` | 처방전 상태 PENDING→IN_PROGRESS | REQUIRED | — |
| `completePartner` | 파트너 상태 COMPLETED + 전체 완료 시 Prescription COMPLETED + 푸시 | REQUIRED | — |
| `softDeletePartner` | 파트너 소프트 삭제 | REQUIRED | PENDING이거나 (IN_PROGRESS+Admin)만 삭제 가능, COMPLETED 상태 삭제 불가 |
| `upsertPatchPartnerProducts` | 처방 품목 생성/수정/삭제 + OCR원본 관리 | REQUIRED | 신규 품목은 필수 필드 검증(reflection 사용), productCode 유효성 확인 |

**의존성**: `DealerRepository`, `PartnerRepository`, `PrescriptionRepository`, `PrescriptionPartnerRepository`, `PrescriptionEdiFileRepository`, `ApplicationEventPublisher`, `DrugCompanyRepository`, `ProductRepository`, `PrescriptionPartnerProductRepository`, `PrescriptionPartnerProductOcrRepository`, `PrescriptionMonthlyStatsService`, `S3FileRepository`, `S3FileService`

**부수 효과**: 커밋 후 `PrescriptionMonthlyStatsService.refreshByUserId` 비동기 실행 (`TransactionSynchronizationManager.registerSynchronization` + `@Async`)

**이벤트 발행**: `S3FileUploadEvent`, `NotificationPushEvent`(EDI_COMPLETE)

---

### 5. 정산 (Settlement)

**파일**: `service/SettlementService.kt`

**책임**: 정산 목록/상세 조회, 정산 엑셀 업로드(파싱→Settlement+SettlementPartner+SettlementPartnerProduct 생성), 실적 통계 집계, XLSX/ZIP 내보내기.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `uploadSettlementExcel` | 엑셀 파싱 → 딜러 매칭 → Settlement 계층 저장 | REQUIRED | DrugCompany/Dealer/Partner/Product 누락 시 IllegalStateException |
| `notifyAdminForSettlements` | 상태 REQUEST로 변경 + 관리자 이메일 알림 | REQUIRED | — |
| `notifyAdminForObjections` | 상태 OBJECTION으로 변경 + 이메일 알림 | **없음** (리스크 참조) | — |
| `getStatsByDrugCompany` | 제약사별 실적 + 추가수수료 합산 | 없음 | SettlementMemberMonthly.extraFeeAmount 합산 |
| `createGroupedExcelZip` | 딜러+제약사+정산월 그룹별 XLSX→ZIP | 없음 | — |

**의존성**: `PrescriptionRepository`, `SettlementRepository`, `DrugCompanyRepository`, `MemberRepository`, `SettlementPartnerRepository`, `DealerRepository`, `PartnerRepository`, `ProductRepository`, `EmailEventPublisher`, `SettlementPartnerProductRepository`, `SettlementMemberMonthlyRepository`

**이벤트 발행**: `NotificationEmailEvent`(SETTLEMENT_REQUESTED, OBJECTION_SUBMITTED)

---

### 6. 파트너 계약 (PartnerContract)

**파일**: `service/PartnerContractService.kt`

**책임**: 계약 신청/수정/승인/반려, S3 파일 첨부 관리.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `applyContract` | 계약 신청 (REJECTED/CANCELLED면 재사용, 없으면 신규) | REQUIRED | PENDING/APPROVED 상태에서 재신청 불가 |
| `approveContract` | 계약 승인 → Dealer 생성(최초 1회) → memberType 변경 → 푸시 | REQUIRED | 이력 없을 때만 Dealer 생성, contractType으로 INDIVIDUAL/ORGANIZATION 분기 |
| `rejectAndCancelContract` | 반려/취소 → 이력 있으면 CANCELLED, 없으면 REJECTED | REQUIRED | 이력 있으면 approvedMemberType으로 롤백 |
| `updateContract` | 계약 정보 + 파일 갱신, MD5 기반 파일 재사용 | REQUIRED | — |

**의존성**: `MemberRepository`, `PartnerContractRepository`, `PartnerContractFileRepository`, `MemberFileRepository`, `S3FileRepository`, `ApplicationEventPublisher`, `PartnerContractApprovalHistoryRepository`, `DealerRepository`, `EmailEventPublisher`

**이벤트 발행**: `S3FileUploadEvent`, `NotificationPushEvent`(PARTNER_APPROVED), `NotificationEmailEvent`(PARTNER_REQUESTED)

---

### 7. 파트너 (Partner)

**파일**: `service/PartnerService.kt`

**책임**: 거래처 CRUD, 엑셀 업로드(업서트), DealerDrugCompany 매핑 자동 관리.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `createPartner` | 거래처 생성 | REQUIRED | ContractStatus.NON_CONTRACT 멤버 불가, (owner+drugCompany+institutionCode) 중복 불가 |
| `updatePartner` | 거래처 수정 + 약국 목록 갱신 | REQUIRED | pharmacyStatus=DELETED 이면 약국명/주소 null 처리 |
| `deletePartner` | 소프트 삭제 (연결 약국 포함) | REQUIRED | — |
| `uploadExcel` | 엑셀 행 파싱 → 기존 존재 시 update, 없으면 insert | REQUIRED | drugCompanyId null/미존재 행 전체 실패, ContractStatus 기반 멤버 검증 |

**의존성**: `PartnerRepository`, `PartnerContractRepository`, `DealerRepository`, `DealerDrugCompanyRepository`, `DrugCompanyRepository`, `PartnerPharmacyService`, `MemberRepository`, `PartnerPharmacyRepository`

---

### 8. 딜러 (Dealer)

**파일**: `service/DealerService.kt`

**책임**: 딜러 생성, 목록 조회.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `createDealer` | 딜러 + DealerDrugCompany 매핑 생성 | REQUIRED | dealerName 빈값 불가, drugCompanyIds 비어있으면 불가, owner 소유 DrugCompany만 허용, 이름 중복 불가 |

**의존성**: `DealerRepository`, `MemberRepository`, `PartnerRepository`, `DealerDrugCompanyRepository`

---

### 9. 통계-게시판 (BoardStatistics)

**파일**: `service/BoardStatisticsService.kt`, `service/statistics/BoardStatsAfterCommitListener.kt`, `service/statistics/BoardStatsApplier.kt`

**책임**: 좋아요/조회수/댓글수 변경 이벤트 발행, AFTER_COMMIT 이후 코루틴 IO에서 DB 반영.

- `BoardStatisticsService` — 이벤트 발행 전용 (트랜잭션 없음)
- `BoardStatsAfterCommitListener` — `@TransactionalEventListener(AFTER_COMMIT)` → Coroutine 비동기 적용
- `LikeCommandExecutor` — BlockingQueue consumer가 순차 처리 (`@Transactional REQUIRED`)
- `PostViewConsumer` — 동일 패턴

---

### 10. 처방전 월별 통계 캐시 (PrescriptionMonthlyStats)

**파일**: `service/PrescriptionMonthlyStatsService.kt`

**책임**: 처방건수/수수료합계의 인메모리 Caffeine 캐시 관리, 처방 변경 후 `@Async`로 캐시 갱신.

- 캐시 TTL: 1일, 최대 1000 키 (userId + yyyyMM)
- `@Async` `refreshByUserId`: 커밋 후 TransactionSynchronization.afterCommit()에서 호출됨

---

### 11. 정산 월별 (SettlementMemberMonthly)

**파일**: `service/SettlementMemberMonthlyService.kt`

**책임**: 월별 회원-제약사 정산 집계 조회, 추가수수료 수정.

- 클래스 레벨 `@Transactional(readOnly = true)` (org.springframework)
- `update` 메서드만 `@Transactional` 오버라이드 (쓰기)
- `supplyAmount = totalFee / 1.1` — 부가세 역산 로직 (SettlementMemberMonthlyService.kt:71)

---

### 12. 병원 (Hospital)

**파일**: `service/HospitalService.kt`

**책임**: 병원 검색, 시도/시군구 목록 제공, 일괄 업서트(엑셀/TSV), TRUNCATE.

| 메서드 | 한줄 요약 | @Transactional | 주요 규칙 |
|---|---|---|---|
| `deleteAll` | TRUNCATE + 시퀀스 초기화 | REQUIRED (spring) | NativeQuery 직접 실행 |
| `bulkUpsert` | 병원 대량 저장 + RegionCategory 매핑 | REQUIRED (spring) | sido/sigungu 미매핑 병원도 저장됨(unmapped 카운트만 반환) |
| `softDeleteHospital` | 소프트 삭제 | **없음** | — |

**의존성**: `HospitalRepository`, `RegionCategoryRepository`, `HospitalSidoCountCacheService`

---

### 13. 병원 시도 카운트 캐시 (HospitalSidoCountCache)

**파일**: `service/HospitalSidoCountCacheService.kt`

**책임**: 시도별 병원수를 AtomicReference 인메모리 캐시로 관리. 스케줄러에 의해 주기적 갱신.

- `refresh()` — `@Transactional` (hospital 전체 로드 후 메모리 집계)
- `cacheRef: AtomicReference<Map<String, Int>>` — 스레드 세이프 swap

---

### 14. KMC 본인인증 (KmcAuth)

**파일**: `service/KmcAuthService.kt`

**책임**: KSEED 암호화로 인증 세션 생성, KMC 서버 HTTP 호출로 콜백 검증, 성명/생년월일/성별/전화 파싱.

- `@Profile("local", "dev", "prod", "local-kmc-test")`
- `decryptAndVerify`: 동기 `HttpURLConnection` POST (timeout 5초) — 외부 KMC API 직호출 (KmcAuthService.kt:120-128)
- 트랜잭션: 없음

---

### 15. 지출보고서 (ExpenseReport)

**파일**: `service/ExpenseReportService.kt`

**책임**: 견본품 제공·제품 설명회(개별/복수기관) 보고서 CRUD, XLSX 생성, ZIP 다운로드.

- 서명 파일 수 == 의료인 수 강제 검증 (ExpenseReportService.kt:706, 777)
- `@Transactional` 적용 메서드: create/update/delete/buildXlsx

---

### 16. 알림 (Push/Email)

**파일**: `notification/push/PushEventAfterCommitListener.kt`, `notification/email/EmailEventConsumer.kt`

- `PushEventAfterCommitListener` — AFTER_COMMIT 후 Coroutine IO로 FCM 수신자 팬아웃. `policy.isAllowed` + `marketingAgreement.push` 이중 필터.
- `EmailEventConsumer` — 별도 인메모리 큐 소비자
- `SmsSender` — Aligo SMS API 직호출

---

### 17. 보안 유틸 (Security)

**파일**: `security/JwtService.kt`, `security/MemberSecurityCacheService.kt`

- `JwtService`: access=30분, refresh=14일, HMAC-SHA256. 쿠키명 `AUTH_TOKEN`, `secure=false` (JwtService.kt:103 — HTTPS 적용 시 수정 필요)
- `MemberSecurityCacheService`: `@Cacheable` 두 개(`activeAuthMemberByUserId`, `memberRoleByUserId`). 캐시 evict 로직 없음 → 회원 상태 변경 즉시 미반영 가능.

---

### 18. S3 파일 (S3FileService)

**파일**: `support/S3FileService.kt`

**책임**: S3 직접 업로드/다운로드, ZIP 스트리밍, Cloudfront URL 갱신. `@Component`.

---

### 19. 기타 소형 서비스

| 서비스 | 파일 | 책임 | @Transactional |
|---|---|---|---|
| `CommentService` | `service/CommentService.kt` | 댓글 CRUD, 좋아요 큐 위임, 통계 감소 | 메서드 REQUIRED |
| `ReportService` | `service/ReportService.kt` | 게시글/댓글 신고 저장 | REQUIRED |
| `BlockService` | `service/BlockService.kt` | 회원 차단/해제, 차단 목록 조회 | REQUIRED |
| `BlindPostService` | `service/BlindPostService.kt` | 블라인드 목록 조회, 토글 위임 | 없음 |
| `BannerService` | `service/BannerService.kt` | 배너 CRUD, S3 이벤트 발행 | REQUIRED |
| `TermsService` | `service/TermsService.kt` | 약관/개인정보처리방침 최신/버전 조회 | 없음 |
| `ProductService` | `service/ProductService.kt` | 제품 상세 조회, 부가정보 등록(BoardPost 연동), TSV export | REQUIRED |
| `DrugCompanyService` | `service/DrugCompanyService.kt` | 제약사 CRUD | — |
| `SalesAgencyProductBoardService` | `service/SalesAgencyProductBoardService.kt` | 영업사 제품 게시판 | — |
| `EventBoardService` | `service/EventBoardService.kt` | 이벤트 게시판 | — |
| `PartnerPharmacyService` | `service/PartnerPharmacyService.kt` | 파트너 약국 관리 | — |

---

## 서비스 의존 그래프

```
AuthService
  ├── MemberRepository
  ├── PartnerContractRepository
  ├── JwtService
  ├── RsaUtil
  ├── SmsSender                          [외부: Aligo SMS]
  ├── AuthCodeCache / AuthCodeCacheForFindAccount [인메모리]
  └── MemberDeviceRepository

MemberService
  ├── MemberRepository
  ├── ApplicationEventPublisher ─── PushEventAfterCommitListener (AFTER_COMMIT)
  └── EmailEventPublisher ──────── EmailEventConsumer (인메모리 큐)

PartnerContractService
  ├── MemberRepository
  ├── PartnerContractRepository
  ├── DealerRepository              (승인 시 Dealer 생성)
  ├── ApplicationEventPublisher
  └── EmailEventPublisher

PartnerService
  └── PartnerPharmacyService        (내부 서비스 호출)

PrescriptionService
  ├── PrescriptionMonthlyStatsService  (@Async afterCommit)
  ├── ApplicationEventPublisher
  └── S3FileService                   [AWS S3]

ProductService
  └── BoardService                  (createBoardPost 내부 호출)

BlindPostService
  ├── BoardService                  (toggleBlindStatus)
  └── CommentService                (toggleBlindStatus)

BoardService
  ├── LikeCommandPublisher ────── LikeCommandConsumer (BlockingQueue) ── LikeCommandExecutor
  ├── PostViewPublisher ─────── PostViewConsumer (BlockingQueue) ── PostViewExecutor
  ├── BoardStatisticsService ── BoardStatsAfterCommitListener (AFTER_COMMIT, Coroutine IO)
  └── S3FileService

CommentService
  ├── LikeCommandPublisher
  └── BoardStatisticsService

SettlementService
  ├── SettlementMemberMonthlyRepository
  └── EmailEventPublisher

KmcAuthService
  └── [외부 KMC HTTP API 직접 호출]  (HttpURLConnection, KmcAuthService.kt:120)

EdiMonthlyReminderScheduler (@Scheduled 매월 7일 10:00 KST)
  └── ApplicationEventPublisher ─── NotificationPushEvent(EDI_MISSING)

BoardPostViewCleanupScheduler (@Scheduled 매일 00:00)
  └── BoardPostViewRepository.deleteOlderThan14Days()

HospitalSidoCountScheduler (별도 스케줄러)
  └── HospitalSidoCountCacheService.refresh()
```

---

## 트랜잭션 레드 플래그

**[RISK-1]** `SettlementService.notifyAdminForObjections` — `@Transactional` 누락 상태에서 `settlementRepository.saveAll`과 다중 이메일 이벤트 발행 수행.
- 파일: `service/SettlementService.kt:47-71`
- 이메일 발행 후 saveAll 실패 시 상태 롤백 불가, 이메일만 발송된 채로 상태 미변경 가능.

**[RISK-2]** `HospitalService.softDeleteHospital` — `@Transactional` 없이 `hospitalRepository.save` 호출.
- 파일: `service/HospitalService.kt:111-117`
- 단일 save이므로 실용적 위험은 낮지만 일관성 없음.

**[RISK-3]** `MemberSecurityCacheService` — `@CacheEvict` 없음. 회원 상태(BLOCKED, role) 변경 후 캐시 만료 전까지 이전 상태로 인증 통과 가능.
- 파일: `security/MemberSecurityCacheService.kt:12-26`
- `MemberService.update`/`updateByAdmin`/`softDeleteBy` 등에서 캐시 무효화가 전혀 호출되지 않음.

**[RISK-4]** `MemberService.signup` 내 `ensureReferralCodeAssigned` — 별도 `@Transactional`로 선언되어 REQUIRED로 부모 트랜잭션에 참여. 코드 생성 루프 실패 시 `RuntimeException`이 부모 트랜잭션 전체를 rollback.
- 파일: `service/MemberService.kt:584-595`

**[RISK-5]** `PrescriptionService` 내 `@Transactional` + `TransactionSynchronizationManager.registerSynchronization` 패턴 — `prescriptionZipUploadV2`에서 트랜잭션 미활성 상황을 감지해 즉시 `refreshByUserId` 호출하는 방어 로직이 있으나(PrescriptionService.kt:777-786), 해당 상황이 실제 발생할 경우 `@Async` 아닌 동기 실행으로 응답 지연 발생 가능.

---

## 핵심 비즈니스 규칙

1. **회원 타입 = 계약 상태**: `MemberType`(NONE/CSO/INDIVIDUAL/ORGANIZATION)이 게시판 접근, 파트너 생성 가능 여부, 통계 수수료 계산 등 전 도메인에서 권한 분기의 핵심 기준. 변경 시 PartnerContractService.approveContract/rejectAndCancelContract 참조 (PartnerContractService.kt:271-335).

2. **처방전 상태 흐름**: `PENDING → IN_PROGRESS → COMPLETED`. PENDING이 아닌 처방파트너는 일반 사용자 삭제 불가 (PrescriptionService.kt:271-279). 모든 파트너 COMPLETED 시 처방전 전체 COMPLETED + 푸시.

3. **게시판 접근 규칙**: `ANONYMOUS` 게시판은 MemberType=NONE 접근 불가. `MR_CSO_MATCHING`은 MemberType=NONE/CSO이면 본인 글만 조회 (BoardService.kt:207-242).

4. **MR_CSO_MATCHING 댓글 가시성**: 게시글·댓글 작성자 본인이 아닌 일반 사용자는 내용이 "작성자만 볼 수 있는 댓글입니다."로 마스킹 (BoardService.kt:844-848).

5. **파트너 계약 중복 방지**: PENDING/APPROVED 상태에서 재신청 불가. REJECTED/CANCELLED 상태이면 기존 contract row 업데이트 (PartnerContractService.kt:51-78).

6. **Partner 중복 방지**: (owner + drugCompany + institutionCode) 복합 유니크. 엑셀 업로드 시 동일 키 → update, 신규 → insert (PartnerService.kt:131-139, 313-338).

7. **닉네임 변경 쿨다운**: 변경 후 1개월 이내 재변경 불가 (MemberService.kt:429-438).

8. **추천인 포인트**: 회원가입 시 입력한 referralCode 소유자 referralPoints +1 (MemberService.kt:568-582). 자기 자신 코드 입력 시 분기 없음 → 자기 자신을 추천할 수 없음은 code 불일치 조건으로 간접 방어.

9. **정산 수수료 역산**: `supplyAmount = totalFee / 1.1` (부가세 10% 역산, SettlementMemberMonthlyService.kt:71). 정수 truncation 발생.

10. **EDI 파일 건수 제한**: 개별 처방 1~30개, 수정 시 1~5개 (PrescriptionService.kt:610, 558).

---

## 부수 효과 목록

| 분류 | 내용 | 기준 파일:라인 |
|---|---|---|
| **외부 API** | KMC 본인인증 HTTP POST (동기) | KmcAuthService.kt:120 |
| **외부 API** | Aligo SMS 발송 | SmsSender.kt |
| **외부 저장소** | AWS S3 업로드/다운로드 (S3FileUploadEvent → S3FileUploadListener) | S3FileService.kt, support/S3FileUploadListener.kt |
| **인메모리 큐** | LikeCommandQueue (BlockingQueue) — 좋아요 직렬 처리 | statistics/LikeQueueConfig.kt |
| **인메모리 큐** | PostViewQueue (BlockingQueue) — 조회수 직렬 처리 | statistics/PostViewQueueConfig.kt |
| **인메모리 캐시** | PrescriptionMonthlyStats (Caffeine, 1일 TTL) | PrescriptionMonthlyStatsService.kt:30-38 |
| **인메모리 캐시** | HospitalSidoCount (AtomicReference) | HospitalSidoCountCacheService.kt:18 |
| **인메모리 캐시** | MemberSecurity (Spring @Cacheable, evict 없음) | MemberSecurityCacheService.kt:12-26 |
| **스케줄러** | 매월 7일 10:00(KST) EDI 미접수 회원 푸시 | EdiMonthlyReminderScheduler.kt:25 |
| **스케줄러** | 매일 00:00 BoardPostView 14일 초과 삭제 | BoardPostViewCleanupScheduler.kt:16 |
| **스케줄러** | HospitalSidoCount 캐시 갱신 (주기 별도 확인 필요) | HospitalSidoCountScheduler.kt |
| **이벤트 발행** | NotificationPushEvent (FCM 팬아웃, AFTER_COMMIT 비동기) | PushEventAfterCommitListener.kt:35 |
| **이벤트 발행** | NotificationEmailEvent (인메모리 큐, 비동기) | EmailEventPublisher.kt |
| **이벤트 발행** | S3FileUploadEvent (동일 트랜잭션 내 리스너 처리) | S3FileUploadListener.kt |

# 01 — Controllers (REST API 표면)
생성: 2026-04-27 / 분석 대상: /Users/jmk0629/keymedi/medipanda-api

---

## 0. 요약

- 컨트롤러 클래스 **23개**, 엔드포인트 **약 130개**
- HTTP 메서드 분포: GET 약 62 / POST 약 37 / PATCH 약 16 / PUT 약 10 / DELETE 약 15 (일부 GET+POST 공용 1개 포함)
- 베이스 경로 패턴: 전체 `/v1/*` 단일 버전 체계
- 인증·권한: Spring Security JWT 필터(전역) + 커스텀 `@RequiredRole(mode, permission)` 어노테이션 방식. `@PreAuthorize`/`@Secured` 미사용. `ADMIN_ONLY` / `ADMIN_OR_SELF` 두 모드.

---

## 1. 컨트롤러 카탈로그

| Controller | 파일:라인 | 베이스 경로 | EP 수 | 주요 책임 |
|---|---|---|---|---|
| AuthController | `web/v1/AuthController.kt:22` | `/v1/auth` | 11 | 로그인·로그아웃·토큰·인증번호 |
| MemberController | `web/v1/MemberController.kt:37` | `/v1/members` | 20 | 회원 CRUD·권한·푸시설정 |
| KmcAuthController | `web/v1/KmcAuthController.kt:16` | `/v1/kmc/auth` | 5 | KMC 본인인증(외부연동) |
| ProductController | `web/v1/ProductController.kt:30` | `/v1/products` | 10 | 제품 CRUD·엑셀·업로드 |
| PartnerController | `web/v1/PartnerController.kt:34` | `/v1/partners` | 12 | 거래선·문전약국 CRUD |
| PartnerContractController | `web/v1/PartnerContractController.kt:28` | `/v1/partner-contracts` | 5 | 파트너 계약 신청·승인·거절 |
| PrescriptionController | `web/v1/PrescriptionController.kt:34` | `/v1/prescriptions` | 18 | 처방 접수·EDI·통계·캐시 |
| SettlementController | `web/v1/SettlementController.kt:35` | `/v1/settlements` | 16 | 정산내역·실적·엑셀·알림 |
| SettlementMemberMonthlyController | `web/v1/SettlementMemberMonthlyController.kt:20` | `/v1/settlements-member-monthly` | 3 | 회원별 월별 정산 |
| ExpenseReportController | `web/v1/ExpenseReportController.kt:32` | `/v1/expense-reports` | 12 | 지출보고(견본품·제품설명회) |
| BoardController | `web/v1/BoardController.kt:32` | `/v1/boards` | 10 | 게시판 CRUD·좋아요·에디터파일 |
| CommentController | `web/v1/CommentController.kt:29` | `/v1/comments` | 5 | 댓글 CRUD·블라인드·좋아요 |
| BlindPostController | `web/v1/BlindPostController.kt:25` | `/v1/blind-posts` | 2 | 블라인드 게시글·댓글 관리 |
| BlockController | `web/v1/BlockController.kt:17` | `/v1/blocks` | 3 | 사용자 차단·해제·목록 |
| ReportController | `web/v1/ReportController.kt:18` | `/v1/reports` | 1 | 신고하기 |
| BannerController | `web/v1/BannerController.kt:29` | `/v1/banners` | 3 | 배너 CRUD |
| EventBoardController | `web/v1/EventBoardController.kt:33` | `/v1/events` | 5 | 이벤트 게시글 CRUD |
| SalesAgencyProductBoardController | `web/v1/SalesAgencyProductBoardController.kt:32` | `/v1/sales-agency-products` | 10 | 영업대행 상품·신청자 |
| HospitalController | `web/v1/HospitalController.kt:26` | `/v1/hospitals` | 6 | 개원병원·지역 조회 |
| DealerController | `web/v1/DealerController.kt:17` | `/v1/dealers` | 3 | 딜러 생성·조회 |
| DrugCompanyController | `web/v1/DrugCompanyController.kt:17` | `/v1/drug-companies` | 1 | 제약사 목록 |
| TermsController | `web/v1/TermsController.kt:16` | `/v1/terms` | 4 | 약관·개인정보처리방침 |
| TestController | `web/v1/TestController.kt:18` | `/v1/test` | 3 | 개발테스트(push·sms·email) |

---

## 2. 엔드포인트 전수표 (도메인별 그룹)

### 2-1. /v1/auth (인증)
파일: `web/v1/AuthController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/auth/me | JWT필요 | - | `MemberDetailsResponse` | :29 |
| GET | /v1/auth/logout | JWT필요 | `?deviceUuid` | 204 | :43 |
| POST | /v1/auth/login | **PUBLIC** | `LoginRequest` | `LoginResponse` | :59 |
| POST | /v1/auth/fcm-token | JWT필요 | `FcmTokenRequest` | 200 | :74 |
| POST | /v1/auth/token/refresh | **PUBLIC** | `RefreshTokenRequest` | `LoginResponse` | :87 |
| POST | /v1/auth/promotion-token | JWT필요 | - | `PromotionTokenResponse` | :102 |
| GET | /v1/auth/public-key | **PUBLIC** | - | `{publicKey:String}` | :117 |
| POST | /v1/auth/verification-code/send/{userId} | **PUBLIC** | `?phoneNumber` | 200 | :123 |
| POST | /v1/auth/verification-code/account/send | **PUBLIC** | `?phoneNumber` | 200 / 404 | :133 |
| POST | /v1/auth/verification-code/verify/{userId} | **PUBLIC** | `?verificationCode` | `Boolean` | :150 |
| POST | /v1/auth/verification-code/id/verify | **PUBLIC** | `?phoneNumber,verificationCode` | `String?` | :159 |
| POST | /v1/auth/verification-code/password/verify | **PUBLIC** | `?userId,phoneNumber,verificationCode` | `LoginResponse` | :178 |

### 2-2. /v1/members (회원)
파일: `web/v1/MemberController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/members | ADMIN_ONLY/MEMBER_MANAGEMENT | `?memberId,userId,roles,name,...,page,size` | `Page<MemberResponse>` | :44 |
| GET | /v1/members/excel-download | ADMIN_ONLY/MEMBER_MANAGEMENT | 동일 필터 | `ByteArray(xlsx)` | :86 |
| POST | /v1/members | **PUBLIC** | `MemberSignupRequest`+`MultipartFile?` | 200 | :169 multipart |
| POST | /v1/members/check-password | JWT필요 | `?password` | `Boolean` | :207 |
| POST | /v1/members/available-phone | **PUBLIC** | `?phone` | `Boolean` | :217 |
| POST | /v1/members/available-nickname | JWT필요 | `NicknameCheckRequest` | `NicknameCheckResponse` | :264 |
| POST | /v1/members/admins | ADMIN_ONLY/PERMISSION_MANAGEMENT | `AdminCreateRequest` | 200 | :241 |
| GET | /v1/members/me/push-preferences | ADMIN_OR_SELF/MEMBER_MANAGEMENT | - | `PushPreferenceResponse` | :321 |
| PATCH | /v1/members/me/push-preferences | ADMIN_OR_SELF/MEMBER_MANAGEMENT | `PushPreferenceUpdateRequest` | `PushPreferenceResponse` | :334 |
| GET | /v1/members/{userId}/available | **PUBLIC** | - | `Boolean` | :316 |
| GET | /v1/members/{userId}/details | ADMIN_OR_SELF/MEMBER_MANAGEMENT | - | `MemberDetailsResponse` | :152 |
| PATCH | /v1/members/{userId} | ADMIN_OR_SELF/MEMBER_MANAGEMENT | `MemberUpdateRequest`+`MultipartFile?` | 200 | :183 multipart |
| DELETE | /v1/members/{userId} | ADMIN_OR_SELF/MEMBER_MANAGEMENT | - | 200 | :198 |
| PATCH | /v1/members/{userId}/cso-approval | ADMIN_ONLY/MEMBER_MANAGEMENT | `?isApproved` | 200 | :134 |
| PATCH | /v1/members/{userId}/password | ADMIN_OR_SELF/MEMBER_MANAGEMENT | `ChangePasswordRequest` | 200 / 400 | :283 |
| PATCH | /v1/members/{userId}/password-for-find-account | 권한어노테이션없음 | `ChangePasswordForFindAccountRequest` | 200 / 400 | :301 |
| POST | /v1/members/{userId}/nickname | JWT필요 | `NicknameUpdateRequest` | - | :274 |
| GET | /v1/members/admins/{userId}/permissions | ADMIN_ONLY/PERMISSION_MANAGEMENT | - | `AdminPermissionResponse` | :226 |
| PATCH | /v1/members/admins/{userId} | ADMIN_ONLY/PERMISSION_MANAGEMENT | `AdminUpdateRequest` | 200 | :252 |

### 2-3. /v1/kmc/auth (KMC 본인인증)
파일: `web/v1/KmcAuthController.kt` | @Profile: local, dev, prod, local-kmc-test

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| POST | /v1/kmc/auth/request | **PUBLIC** | `KmcAuthRequest` | `KmcAuthResponse` | :21 |
| GET+POST | /v1/kmc/auth/callback-page | **PUBLIC** | `?certNum` | `text/html` | :24 KMC 리다이렉트 수신 |
| GET | /v1/kmc/auth/launch | **PUBLIC** | `?certNum` | `text/html` | :76 앱 WebView 진입점 |
| POST | /v1/kmc/auth/callback | **PUBLIC** | `?apiToken,certNum` | `text/html` | :85 KMC 서버 콜백 |
| GET | /v1/kmc/auth/result | **PUBLIC** | `?certNum` | `Map<String,Any?>` | :127 앱 폴링 |

### 2-4. /v1/products (상품)
파일: `web/v1/ProductController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/products | JWT필요 | `?productName,composition,...,page,size` | `Page<ProductSummaryResponse>` | :96 |
| GET | /v1/products/excel-download | JWT필요 | 동일 필터 | `ByteArray(xlsx)` | :59 |
| GET | /v1/products/{id}/details | JWT필요 | `?month` | `ProductDetailsResponse` | :135 |
| GET | /v1/products/code/{productCode}/details | JWT필요 | `?month` | `ProductDetailsResponse` | :146 |
| POST | /v1/products/extra-info | JWT필요 | multipart: `BoardPostCreateRequest`+`ProductExtraInfoRequest`+files | 200 | :39 |
| PATCH | /v1/products/{id}/extra-info | JWT필요 | multipart: `BoardPostUpdateRequest`+`ProductExtraInfoRequest`+newFiles | 200 | :162 |
| DELETE | /v1/products/{id}/extra-info | JWT필요 | - | 200 | :50 |
| DELETE | /v1/products/{id} | JWT필요 | - | 204 | :128 |
| PUT | /v1/products/export-to-root-tsv | JWT필요 | - | `String` | :33 관리배치용 |
| POST | /v1/products/upload-kims-from-s3 | JWT필요 | `?prefix` | `String` | :182 |
| POST | /v1/products/product-extra-info/upload-json | JWT필요 | `List<ProductExtraInfoUploadRequest>`+`?month` | 200 | :188 |
| POST | /v1/products/product-extra-info/upload | JWT필요 | multipart: file+`?month` | 200 | :205 |

### 2-5. /v1/partners (거래선)
파일: `web/v1/PartnerController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/partners | JWT필요 | `?companyName,institutionName,...,page,size` | `Page<PartnerResponse>` | :72 |
| GET | /v1/partners/export-excel | JWT필요 | 동일 필터 | `ByteArray(xlsx)` | :101 |
| POST | /v1/partners | JWT필요 | `PartnerCreateRequest` | 200 | :131 |
| PUT | /v1/partners/{id} | JWT필요 | `PartnerUpdateRequest` | 200 | :138 |
| DELETE | /v1/partners/{id} | JWT필요 | - | 200 | :149 |
| GET | /v1/partners/{id} | JWT필요 | - | `PartnerResponse` | :162 |
| GET | /v1/partners/drug-companies | JWT필요 | - | `List<DrugCompanyResponse>` | :155 |
| POST | /v1/partners/upload/{userId} | JWT필요 | multipart: file | 200 | :168 |
| GET | /v1/partners/ids/{userId} | JWT필요 | - | `List<Long>` | :181 @TestOnly |
| GET | /v1/partners/{partnerId}/pharmacies | JWT필요 | - | `List<PartnerPharmacyResponse>` | :39 |
| POST | /v1/partners/{partnerId}/pharmacies | JWT필요 | `PartnerPharmacyCreateRequest` | `List<PartnerPharmacyResponse>` | :45 |
| PUT | /v1/partners/{partnerId}/pharmacies | JWT필요 | `PartnerPharmacyUpdateRequest` | `List<PartnerPharmacyResponse>` | :54 |
| DELETE | /v1/partners/{partnerId}/pharmacies | JWT필요 | `PartnerPharmacyDeleteRequest` | - | :63 |

### 2-6. /v1/partner-contracts (파트너 계약)
파일: `web/v1/PartnerContractController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/partner-contracts/{userId} | JWT필요 | - | `PartnerContractDetailsResponse` | :31 |
| POST | /v1/partner-contracts | JWT필요 | multipart: request+4종 파일 | 200 | :39 |
| POST | /v1/partner-contracts/{contractId}/update | JWT필요 | multipart: request+파일(선택) | 200 | :62 |
| POST | /v1/partner-contracts/{contractId}/approve | ADMIN_ONLY/CONTRACT_MANAGEMENT | - | 200 | :90 |
| POST | /v1/partner-contracts/{contractId}/reject | ADMIN_ONLY/CONTRACT_MANAGEMENT | - | 200 | :104 |

### 2-7. /v1/prescriptions (처방)
파일: `web/v1/PrescriptionController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/prescriptions | JWT필요 | `?status,companyName,...,page,size` | `Page<PrescriptionResponse>` | :162 |
| GET | /v1/prescriptions/partners | JWT필요 | `?status,companyName,...,page,size` | `Page<PrescriptionPartnerResponse>` | :72 |
| GET | /v1/prescriptions/partners/{prescriptionPartnerId} | JWT필요 | - | `PrescriptionPartnerResponse` | :64 |
| GET | /v1/prescriptions/partners/{prescriptionPartnerId}/products | JWT필요 | - | `List<PrescriptionPartnerProductResponse>` | :144 |
| GET | /v1/prescriptions/partners/{prescriptionPartnerId}/products/ocr-original-diff | JWT필요 | - | `List<OcrOriginalDiffRowResponse>` | :193 |
| GET | /v1/prescriptions/partners/{prescriptionPartnerId}/edi-files/attached | JWT필요 | - | `List<AttachmentResponse>` | :38 |
| GET | /v1/prescriptions/partners/{prescriptionId}/edi-files/download | JWT필요 | - | `application/zip` | :46 |
| GET | /v1/prescriptions/partners/export-excel | JWT필요 | 필터 파라미터 | `ByteArray(xlsx)` | :280 |
| GET | /v1/prescriptions/export-zip | JWT필요 | `?prescriptionIds` | `application/zip` | :264 |
| GET | /v1/prescriptions/monthly-count | JWT필요 | `?referenceDate` | `MonthlyPrescriptionCountResponse` | :314 |
| GET | /v1/prescriptions/monthly-total-amount | JWT필요 | `?referenceDate` | `MonthlyTotalAmountResponse` | :324 |
| POST | /v1/prescriptions/partner-files | JWT필요 | multipart: request+files | 200 | :202 |
| POST | /v1/prescriptions/partner-files/update | JWT필요 | multipart: request+files? | 200 | :221 |
| POST | /v1/prescriptions/partner-products | JWT필요 | `PrescriptionPartnerProductCreateRequest` | 200 | :153 |
| POST | /v1/prescriptions/zip | JWT필요 | multipart: dealerId,partnerId,months,file | `PrescriptionZipUploadResult` | :239 |
| POST | /v1/prescriptions/cache/evict | JWT필요 | - | 200 | :334 |
| PATCH | /v1/prescriptions/partners/{prescriptionPartnerId}/products | JWT필요 | `PrescriptionPartnerProductUpsertRequest` | 204 | :103 |
| PATCH | /v1/prescriptions/{id}/confirm | JWT필요 | - | 200 | :116 |
| PATCH | /v1/prescriptions/partners/{prescriptionPartnerId}/complete | JWT필요 | - | 200 | :125 |
| DELETE | /v1/prescriptions/partners/{prescriptionPartnerId} | JWT필요 | - | 200 | :134 |

### 2-8. /v1/settlements (정산)
파일: `web/v1/SettlementController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/settlements | JWT필요 | `?dealerName,...,page,size` | `Page<SettlementResponse>` | :145 |
| GET | /v1/settlements/total-prescription-amount | JWT필요 | 동일 필터 | `Long` | :172 |
| GET | /v1/settlements/{id} | JWT필요 | - | `SettlementResponse` | :197 |
| GET | /v1/settlements/excel-download | ADMIN_ONLY/SETTLEMENT_MANAGEMENT | 동일 필터 | `ByteArray(xlsx)` | :311 |
| GET | /v1/settlements/partners | JWT필요 | `?settlementId,...,page,size` | `Page<SettlementPartnerResponse>` | :205 |
| GET | /v1/settlements/partners/{settlementPartnerId} | JWT필요 | - | `SettlementPartnerResponse` | :230 |
| GET | /v1/settlements/partners/{settlementPartnerId}/products | JWT필요 | - | `List<SettlementPartnerProductResponse>` | :137 |
| GET | /v1/settlements/partners/excel-download | ADMIN_ONLY/SETTLEMENT_MANAGEMENT | 동일 필터 | `ByteArray(xlsx)` | :372 |
| GET | /v1/settlements/export-zip | JWT필요 | `?startMonth,endMonth,...` | `application/zip` | :252 |
| GET | /v1/settlements/performance | JWT필요 | `?drugCompany,...,page,size` | `Page<PerformanceStatsResponse>` | :64 |
| GET | /v1/settlements/performance/total-prescription-amount | JWT필요 | 동일 필터 | `Long` | :39 |
| GET | /v1/settlements/performance/by-institution | JWT필요 | `?startMonth,endMonth` | `List<PerformanceStatsByInstitution>` | :91 |
| GET | /v1/settlements/performance/by-drug-company | JWT필요 | `?institutionCode,...` | `List<PerformanceStatsByDrugCompany>` | :105 |
| GET | /v1/settlements/performance/by-drug-company/monthly | JWT필요 | `?institutionCode,...` | `List<PerformanceStatsByDrugCompanyMonthly>` | :121 |
| GET | /v1/settlements/performance/excel-download | JWT필요 | 동일 필터 | `ByteArray(xlsx)` | :279 |
| POST | /v1/settlements/upload | JWT필요 | multipart: file | 202 | :238 |
| POST | /v1/settlements/notify-admin/objections | JWT필요 | `SettlementNotifyRequest` | 200 | :348 |
| POST | /v1/settlements/notify-admin | JWT필요 | `SettlementNotifyRequest` | 200 | :358 |

### 2-9. /v1/settlements-member-monthly (회원별 정산)
파일: `web/v1/SettlementMemberMonthlyController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/settlements-member-monthly | JWT필요 | `?drugCompanyName,companyName,startMonth,endMonth,pageable` | `Page<SettlementMemberMonthlyResponse>` | :23 |
| PUT | /v1/settlements-member-monthly/{id} | JWT필요 | `SettlementMemberMonthlyUpdateRequest` | `SettlementMemberMonthlyResponse` | :43 |
| GET | /v1/settlements-member-monthly/excel-download | JWT필요 | 동일 필터 | `ByteArray(xlsx)` | :51 |

### 2-10. /v1/expense-reports (지출보고)
파일: `web/v1/ExpenseReportController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/expense-reports | JWT필요 | `?status,userId,...,page,size` | `Page<ExpenseReportResponse>` | :72 |
| GET | /v1/expense-reports/excel-download | JWT필요 | 동일 필터 | `ByteArray(xlsx)` | :98 |
| GET | /v1/expense-reports/{id}/download | JWT필요 | - | `application/zip` | :35 |
| GET | /v1/expense-reports/{expenseReportId}/files/download | JWT필요 | - | `application/zip` | :219 |
| GET | /v1/expense-reports/files/download | JWT필요 | `?ids` | `application/zip` | :41 |
| DELETE | /v1/expense-reports/{id} | JWT필요 | `?softDeleteS3=true` | 204 | :62 |
| POST | /v1/expense-reports/sample-provide | JWT필요 | multipart: request+attachmentFiles? | 200 | :129 |
| PATCH | /v1/expense-reports/sample-provide/{id} | JWT필요 | multipart: request+newFiles? | 200 | :140 |
| GET | /v1/expense-reports/sample-provide/{id} | JWT필요 | - | `SampleProvideReportDetailResponse` | :152 |
| POST | /v1/expense-reports/product-briefing/multi | JWT필요 | multipart: request+attachmentFiles? | 200 | :157 |
| PATCH | /v1/expense-reports/product-briefing/multi/{id} | JWT필요 | multipart: request+newFiles? | 200 | :168 |
| GET | /v1/expense-reports/product-briefing/multi/{id} | JWT필요 | - | `ProductBriefingMultiDetailResponse` | :179 |
| POST | /v1/expense-reports/product-briefing/single | JWT필요 | multipart: request+signatureFiles+attachmentFiles? | 200 | :185 |
| PATCH | /v1/expense-reports/product-briefing/single/{id} | JWT필요 | multipart: request+signatureFiles+newFiles? | 200 | :202 |
| GET | /v1/expense-reports/product-briefing/single/{id} | JWT필요 | - | `ProductBriefingSingleDetailResponse` | :238 |

### 2-11. /v1/boards (게시판)
파일: `web/v1/BoardController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/boards | JWT필요 | `?page,size,sortType,boardType,...` | `Page<BoardPostResponse>` | :102 |
| GET | /v1/boards/notices/fixed-top | JWT필요 | `?boardType,noticeTypes,...` | `List<BoardPostResponse>` | :80 |
| GET | /v1/boards/members | ADMIN_ONLY/COMMUNITY_MANAGEMENT | `?userId,memberId,...,page,size` | `Page<BoardMemberStatsResponse>` | :35 |
| GET | /v1/boards/{id} | JWT필요 | `?filterBlind,filterDeleted` | `BoardDetailsResponse` | :202 |
| POST | /v1/boards | JWT필요 | multipart: request+files? | `String` | :158 |
| PUT | /v1/boards/{id} | JWT필요 | multipart: updateRequest+newFiles? | `String` | :178 |
| DELETE | /v1/boards/{id} | JWT필요 | - | 200 | :168 |
| PUT | /v1/boards/{id}/toggle-blind | ADMIN_ONLY/COMMUNITY_MANAGEMENT | - | `Boolean` | :190 |
| POST | /v1/boards/{id}/like | JWT필요 | - | 200 | :221 |
| POST | /v1/boards/uploads | JWT필요 | multipart: file | `AttachmentResponse` | :231 |

### 2-12. /v1/comments (댓글)
파일: `web/v1/CommentController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/comments | ADMIN_ONLY/COMMUNITY_MANAGEMENT | `?userId,nickname,...,page,size` | `Page<CommentMemberResponse>` | :91 |
| POST | /v1/comments/{userId} | JWT필요 | `CommentCreateRequest` | `String` | :32 |
| PUT | /v1/comments | JWT필요 | `CommentUpdateRequest` | `String` | :42 |
| DELETE | /v1/comments/{id} | JWT필요 | - | 200 | :56 |
| PUT | /v1/comments/{id}/toggle-blind | ADMIN_ONLY/COMMUNITY_MANAGEMENT | - | `Boolean` | :83 |
| POST | /v1/comments/{id}/like | JWT필요 | - | 200 | :70 |

### 2-13. /v1/blind-posts (블라인드 게시글)
파일: `web/v1/BlindPostController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/blind-posts | ADMIN_ONLY/COMMUNITY_MANAGEMENT | `?postType,...,page,size` | `Page<BlindPostResponse>` | :28 |
| PUT | /v1/blind-posts/unblind | ADMIN_ONLY/COMMUNITY_MANAGEMENT | `BlindUpdateRequest` | 204 | :56 |

### 2-14. /v1/blocks (차단)
파일: `web/v1/BlockController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/blocks | JWT필요 | - | `List<BlockResponse>` | :39 |
| PUT | /v1/blocks/{targetUserId} | JWT필요 | - | 204 | :20 |
| DELETE | /v1/blocks/{targetUserId} | JWT필요 | - | 204 | :30 |

### 2-15. /v1/reports (신고)
파일: `web/v1/ReportController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| POST | /v1/reports/{userId} | JWT필요 | `ReportCreateRequest` | `String` | :21 |

### 2-16. /v1/banners (배너)
파일: `web/v1/BannerController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/banners | JWT필요 | `?page,size,isExposed,bannerPositions,...` | `Page<BannerResponse>` | :70 |
| GET | /v1/banners/{id} | JWT필요 | - | `BannerResponse` | :32 |
| POST | /v1/banners | ADMIN_ONLY/BANNER_MANAGEMENT | multipart: request+imageFile | `String` | :41 |
| PATCH | /v1/banners/{id} | ADMIN_ONLY/BANNER_MANAGEMENT | multipart: request+imageFile? | 200 | :55 |

### 2-17. /v1/events (이벤트 게시판)
파일: `web/v1/EventBoardController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/events | JWT필요 | `?status,isExposed,...,page,size` | `Page<EventBoardSummaryResponse>` | :94 |
| GET | /v1/events/{id} | JWT필요 | - | `EventBoardDetailsResponse` | :120 |
| POST | /v1/events | JWT필요 | multipart: request+eventRequest+thumbnail+files? | `String` | :36 |
| PATCH | /v1/events/{id} | JWT필요 | multipart: (선택적) request+eventRequest+thumbnail+newFiles? | 200 | :68 |
| DELETE | /v1/events/{id} | JWT필요 | - | 200 | :57 |

### 2-18. /v1/sales-agency-products (영업대행 상품)
파일: `web/v1/SalesAgencyProductBoardController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/sales-agency-products | JWT필요 | `?productName,clientName,...,page,size` | `Page<SalesAgencyProductSummaryResponse>` | :35 |
| GET | /v1/sales-agency-products/excel-download | JWT필요 | 동일 필터 | `ByteArray(xlsx)` | :81 |
| GET | /v1/sales-agency-products/{id} | JWT필요 | - | `SalesAgencyProductDetailsResponse` | :113 |
| GET | /v1/sales-agency-products/{id}/applicants | JWT필요 | `?userId,name,page,size` | `Page<SalesAgencyProductApplicantResponse>` | :123 |
| GET | /v1/sales-agency-products/{id}/applicants/excel-download | JWT필요 | 동일 필터 | `ByteArray(xlsx)` | :141 |
| POST | /v1/sales-agency-products | JWT필요 | multipart: boardPostCreateRequest+salesAgencyProductCreateRequest+thumbnail+files? | `String` | :174 |
| PATCH | /v1/sales-agency-products/{id} | JWT필요 | multipart: (선택적 부분) | 200 | :198 |
| PATCH | /v1/sales-agency-products/applicants/notes | JWT필요 | `SalesAgencyProductNoteUpdateRequest` | 200 | :165 |
| DELETE | /v1/sales-agency-products/{id} | JWT필요 | - | 200 | :72 |
| DELETE | /v1/sales-agency-products/{applicantUserId}/applicant | JWT필요 | `?productBoardId` | 200 | :62 |
| POST | /v1/sales-agency-products/{id}/apply | JWT필요 | - | 200 | :230 |

### 2-19. /v1/hospitals (개원병원)
파일: `web/v1/HospitalController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/hospitals | JWT필요 | `?regionCategoryId,hospitalName,...,page,size` | `Page<HospitalResponse>` | :56 |
| GET | /v1/hospitals/regions/sido | JWT필요 | - | `List<RegionCategoryResponse>` | :29 |
| GET | /v1/hospitals/regions/sido/{sidoId}/sigungu | JWT필요 | - | `List<RegionCategoryResponse>` | :36 |
| GET | /v1/hospitals/opened/count | JWT필요 | `?referenceDate` | `Long` | :45 |
| DELETE | /v1/hospitals/{id} | JWT필요 | - | 204 | :77 |
| DELETE | /v1/hospitals/all | **PUBLIC** | - | 200 | :87 (`WebSecurityConfig.kt:44`) |
| POST | /v1/hospitals/bulk-upsert | **PUBLIC** | `List<HospitalUpsertRequest>` | `HospitalBulkUpsertResponse` | :95 (`WebSecurityConfig.kt:43`) |

### 2-20. /v1/dealers (딜러)
파일: `web/v1/DealerController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/dealers | JWT필요 | `?dealerName,drugCompanyName` | `List<DealerResponse>` | :29 |
| POST | /v1/dealers | JWT필요 | `DealerCreateRequest` | - | :20 |
| GET | /v1/dealers/id/{userId} | JWT필요 | - | `Long` | :44 @TestOnly |

### 2-21. /v1/drug-companies (제약사)
파일: `web/v1/DrugCompanyController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/drug-companies | ADMIN_ONLY/CONTRACT_MANAGEMENT | - | `List<DrugCompanyResponse>` | :24 |

### 2-22. /v1/terms (약관)
파일: `web/v1/TermsController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/terms/latest | **PUBLIC** | - | `text/html` | :19 |
| GET | /v1/terms/{version} | **PUBLIC** | - | `text/html` | :25 |
| GET | /v1/terms/privacy/latest | **PUBLIC** | - | `text/html` | :31 |
| GET | /v1/terms/privacy/{version} | **PUBLIC** | - | `text/html` | :37 |

### 2-23. /v1/test (개발 테스트)
파일: `web/v1/TestController.kt`

| HTTP | Path | 권한 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| GET | /v1/test/push | **PUBLIC** | `?token` | - | :23 TODO: 운영 제거 예정 |
| GET | /v1/test/sms | **PUBLIC** | `?message,phoneNumber` | - | :31 TODO: 운영 제거 예정 |
| GET | /v1/test/email | **PUBLIC** | `?to,subject,body` | - | :40 TODO: 운영 제거 예정 |

---

## 3. 공통 패턴

**페이지네이션**
- 대부분의 목록 API: `?page=0&size=N` (N=20~50) + `Sort.Direction.DESC` 고정
- `SettlementMemberMonthlyController`만 Spring `@PageableDefault` 방식 사용 (`SettlementMemberMonthlyController.kt:31`)
- 엑셀 다운로드는 동일 필터로 `Pageable.unpaged()` 호출

**에러 응답 표준**
파일: `GlobalExceptionHandler.kt:14`

| 예외 | HTTP | Body 형식 |
|---|---|---|
| `DataIntegrityViolationException` (파트너 중복키) | 409 | `ErrorResponse(code, message)` |
| `DataIntegrityViolationException` (기타) | 400 | `ErrorResponse` |
| `IllegalArgumentException` | 400 | `String` |
| `NoSuchElementException` | 404 | `String` |
| `DataAccessException` | 500 | `ErrorResponse` |
| `IllegalStateException` | 409 | `ErrorResponse` |
| `UnauthorizedException` | 401 | `String` |
| `BadRequestException` | 400 | `String` |
| `Exception` (catch-all) | 500 | `ErrorResponse` |

응답 Body 형식이 `ErrorResponse(code,message)` 와 `String` 혼용. 프론트 팀 주의 필요.

**DTO 위치**
- 요청 DTO: `domain/model/request/*.kt`
- 응답 DTO: `domain/model/response/*.kt`

**파일 업로드**
- 대부분 `MediaType.MULTIPART_FORM_DATA_VALUE`, `@RequestPart` 방식

---

## 4. 리스크 / 의문점

- [ ] **운영 환경 노출 위험**: `TestController` (`/v1/test/push|sms|email`) 3개가 `WebSecurityConfig.kt:31`에서 `permitAll` 처리되며 코드 주석에 "TODO: 운영 배포시 제거" 명시. 인증 없이 SMS/PUSH 발송 트리거 가능.
- [ ] **미인증 민감 엔드포인트**: `/v1/hospitals/bulk-upsert` (POST, 병원 대량 upsert) 및 `/v1/hospitals/all` (DELETE, 전체 삭제)가 `WebSecurityConfig.kt:43-44`에서 `permitAll`. 인증 없이 병원 데이터 전체 삭제 가능 - 즉시 보안 검토 필요.
- [ ] **`@RequiredRole` 누락 의심**: 대부분의 관리·변경 엔드포인트가 JWT 인증만 확인하며 세부 역할 검사 없음. 예를 들어 `ProductController` 전체, `PrescriptionController` 전체, `EventBoardController` 전체에 `@RequiredRole` 미적용. 역할(Role) 분리가 서비스 레이어에서 이루어지는지 별도 확인 필요.
- [ ] **`/v1/members/{userId}/password-for-find-account` 권한 누락**: `MemberController.kt:301` PATCH 메서드에 `@RequiredRole` 어노테이션 없음. 비밀번호 변경이 미인증 상태에서 가능할 수 있음 (JWT 필터는 통과 필요하나 본인 검증 로직 별도 확인 필요).
- [ ] **`@TestOnly` 엔드포인트 운영 노출**: `PartnerController.kt:181` (`GET /v1/partners/ids/{userId}`), `DealerController.kt:44` (`GET /v1/dealers/id/{userId}`) - `@TestOnly`(JetBrains 어노테이션)는 런타임 제한 없음. 운영에서도 접근 가능.
- [ ] **KMC 콜백 경로 인증 없음**: `/v1/kmc/auth/callback` (POST)이 KMC 서버 콜백을 `?apiToken,certNum` 쿼리 파라미터로 수신하며 `permitAll` 처리됨(`WebSecurityConfig.kt:34`). `apiToken` 검증 로직이 `KmcAuthService.decryptAndVerify`에 있는지 서비스 레이어 확인 필요.
- [ ] **응답 Body 형식 불일치**: `GlobalExceptionHandler`에서 일부 예외는 `ErrorResponse(code,message)`, 일부는 `String` 반환. 프론트엔드 에러 파싱 로직 통일 필요.
- [ ] **Swagger UI 운영 노출**: `WebSecurityConfig.kt:29-30` `"/swagger-ui/**"`, `"/api-docs/**"` 주석에 "TODO: 운영 배포시 제거" 명시. 현재 운영 환경 노출 여부 확인 필요.
- [ ] **`PUT /v1/products/export-to-root-tsv`**: `ProductController.kt:33` 권한 어노테이션 없고 운영 배치용으로 보이는 엔드포인트. 의도적 공개 여부 확인 필요.

# user-04 처방 관리 (사용자) — 풀스택 지도

> 생성: 2026-04-27 by /ingest-medipanda-backend (cross-ref-writer)
> 입력: `docs/user/04_PRESCRIPTION_MANAGEMENT.md` (FE/BE), `reports/backend-ingestion-20260427/01~06`

## 1. 화면 요약

- 라우트: `/prescriptions` (실적입력/EDI), `/dealers` (소속딜러). 출처: `medipanda-web-test/src/pages-user/PrescriptionList.tsx`, `DealerList.tsx`.
- 가드: 클라이언트 측 `ContractMemberGuard` (로그인 + 파트너 계약). 서버 측에는 `@RequiredRole` 없음(추후 §4 참조).
- 레이아웃: 좌측 목록 + 우측 폼/오버레이. `PrescriptionList`는 `EdiIndividualUploadForm`(신규)과 `EdiDetailOverlay`(상세/수정)를 절대위치 오버레이로 전환. `DealerList`는 좌측 전체 딜러 목록 + 우측 `DealerCreateForm`.
- 핵심 사용자 액션:
  1. 처방 목록 검색/페이징 (`getPrescriptionPartnerList`, size=10).
  2. 거래처명 클릭 → 단건 조회 (`getPrescriptionPartner`).
  3. EDI 신규 등록 (`uploadPartnerEdiFiles`, multipart, 1~30개, png/jpg/jpeg).
  4. 수정 (`updatePartnerEdiFiles`, `keepFileIds` 차등 + 새 파일, status===`PENDING`일 때만 UI 노출).
  5. 삭제 (`deletePrescriptionPartner`, soft-delete).
  6. 딜러 전체 목록 (`listDealers`), 딜러 생성 (`createDealer`, `bankName/accountNumber=null` 고정).

## 2. API ↔ Controller ↔ Service ↔ Repository 매트릭스

| # | HTTP | Path | 프론트 함수 | Controller | Service | Repository | 비고 |
|---|------|------|-------------|------------|---------|------------|------|
| 1 | GET | `/v1/prescriptions/partners` | `getPrescriptionPartnerList` (FE docs §3-1) | `PrescriptionController.getPrescriptionPartnerList` (`web/v1/PrescriptionController.kt:72-101`, 01-controllers.md:155) | `PrescriptionService.getPrescriptionPartnerList` (`service/PrescriptionService.kt:192-218`) | `PrescriptionPartnerRepository.searchPrescriptionPartnerList` (`repo/postgresql/PrescriptionPartnerRepository.kt:91-150`, 03-repositories.md:78) | JPQL DTO projection 17필드, ORDER BY pp.id DESC 하드코딩 (BE docs §5-C) |
| 2 | GET | `/v1/prescriptions/partners/{id}` | `getPrescriptionPartner` | `PrescriptionController.getPrescriptionPartner:64-70` (01-controllers.md:156) | `PrescriptionService.getPrescriptionPartner:56-71` | `PrescriptionPartnerRepository.findOneById:54-89` + `PrescriptionEdiFileRepository.findActiveS3FilesByPrescriptionPartnerId:54-66` | 소유권 검증 누락 → IDOR (BE docs §5-E-1) |
| 3 | POST | `/v1/prescriptions/partner-files` | `uploadPartnerEdiFiles` | `PrescriptionController.uploadPartnerEdiFiles:202-219` | `PrescriptionService.createPrescriptionWithFiles:601-661` (02-services.md:95) | `DealerRepository.findOwnerDealerByUserId` + `Prescription/PartnerRepository.save` + `S3FileService` | multipart, 1~30 files, jpg/jpeg/png/gif/heif/heic; afterCommit `refreshByUserId` |
| 4 | POST | `/v1/prescriptions/partner-files/update` | `updatePartnerEdiFiles` | `PrescriptionController.updatePartnerEdiFiles:221-237` | `PrescriptionService.updatePrescriptionWithFiles:507-598` (02-services.md:96) | `PrescriptionEdiFileRepository.findActiveS3FilesByPrescriptionPartnerId` + `S3FileRepository.softDeleteByIds` | `finalCount in 1..5` 강제(신규 30과 불일치, BE docs §5-G); `loginUser` 미수신 → IDOR (§5-E-2) |
| 5 | DELETE | `/v1/prescriptions/partners/{id}` | `deletePrescriptionPartner` | `PrescriptionController.deletePrescriptionPartner:134-142` | `PrescriptionService.softDeletePartner:266-286` (02-services.md:97 추정) | `PrescriptionEdiFileRepository.softDeleteByPrescriptionPartnerId:69-84` (native UPDATE ... FROM) | 일반사용자=PENDING만, admin=PENDING+IN_PROGRESS; 부모 prescription 상태 재계산 없음 (§5-I) |
| 6 | GET | `/v1/dealers` | `listDealers` | `DealerController.listDealers:29-41` (01-controllers.md:337) | `DealerService.listMyDealers:81-96` | `MemberRepository.findActivateMemberByUserId` + `DealerRepository.searchDealerResponses:32-54` | LEFT JOIN N:M로 dealer×drugCompany 중복행 가능 (BE docs §5-J) |
| 7 | POST | `/v1/dealers` | `createDealer` | `DealerController.createDealer:20-27` (01-controllers.md:338) | `DealerService.createDealer:25-79` (02-services.md:175) | `DealerRepository.existsByOwnerIdAndDealerName` + `PartnerRepository.findDistinctDrugCompanyByOwnerId` + `DealerRepository/DealerDrugCompanyRepository.save` | 중복 dealer 이름 409, 미보유 drugCompany 400 |

## 3. DB 테이블

| 테이블 | 역할 | 주 FK | 비고 (출처) |
|--------|------|-------|-------------|
| `prescription` | 처방 루트 (2,638 rows) | `registered_dealer_id`→dealer, `drug_company_id`→drug_company | `*_month`이 integer YYYYMMDD; PK 외 인덱스 없음 (BE docs §3-1, §5-K; 04-domain.md:40,164) |
| `prescription_partner` | 거래처별 처방 (alive 2,579) | `prescription_id`, `partner_id`, `dealer_id` | `deleted` boolean, `BaseEntity` 비상속(이력 부재, 03-repositories.md:182) |
| `prescription_edi_file` | EDI 파일 ↔ S3 1:1 (3,191 rows) | `prescription_partner_id`, `s3_file_id` UK | 자체 `deleted` 컬럼 없음 → `s3_file.deleted`만 토글 (§5-L) |
| `dealer` | 딜러 (86 rows) | `owner_member_id` NOT NULL, `member_id` NULL UNIQUE | `member_id` NULL 시 신규 등록 실패 위험 (§5-F; 04-domain.md:150-152) |
| `dealer_drug_company` | 딜러-제약사 N:M (119 rows) | `dealer_id`, `drug_company_id` | `searchDealerResponses` LEFT JOIN으로 중복행 노출 (§5-J) |
| `s3_file` | 첨부 메타 (cross-ref) | (단독) | EDI soft-delete가 여기서만 일어남 |

핵심 JOIN (BE docs §6-A, `repo/postgresql/PrescriptionPartnerRepository.kt:91-150` 인용):

```sql
-- 일반 사용자 owner-scope 처방 목록
SELECT pp.id, p.company_name, dc.name AS drug_company, pp.prescription_month,
       pp.settlement_month, COALESCE(SUM(ppp.total_price),0), pp.prescription_partner_status,
       d.dealer_name, p.business_number
FROM prescription_partner pp
JOIN prescription pr ON pr.id = pp.prescription_id
JOIN partner       p ON p.id  = pp.partner_id
JOIN drug_company dc ON dc.id = p.drug_company_id
JOIN dealer        d ON d.id  = pp.dealer_id
JOIN dealer       rd ON rd.id = pr.registered_dealer_id     -- registeredDealer 경로
JOIN member       om ON om.id = rd.owner_member_id          -- owner.userId 검증
LEFT JOIN prescription_partner_product ppp
       ON ppp.prescription_partner_id = pp.id
WHERE pp.deleted = false
  AND ( :queryUserId IS NOT NULL OR pp.prescription_partner_status <> 'PENDING' )
  AND (:queryUserId IS NULL OR om.user_id = :queryUserId)
GROUP BY pp.id, p.company_name, dc.id, dc.name, ...
ORDER BY pp.id DESC LIMIT :size OFFSET :offset;
```

```sql
-- listDealers (LEFT JOIN N:M으로 1행 dealer가 N행으로 분리될 수 있음)
SELECT d.id, d.dealer_name, TO_CHAR(d.created_at,'YYYY-MM-DD"T"HH24:MI:SS.MS'), dc.id, dc.name
FROM dealer d
LEFT JOIN dealer_drug_company ddc ON ddc.dealer_id = d.id
LEFT JOIN drug_company dc         ON dc.id = ddc.drug_company_id
WHERE d.owner_member_id = :ownerId
ORDER BY d.id DESC, dc.id DESC;
```

## 4. 권한·트랜잭션 (admin/05 와의 차이 포함)

- **권한 모델 (사용자 메뉴 vs admin/05)**:
  - 두 컨트롤러 모두 `@RequiredRole` 전무 (05-security.md:60-61, 161; 01-controllers.md:406). URL 단계는 `authenticated`만 강제.
  - 서비스 계층 `userIdForQuery(loginUser)` 분기로 권한 분리 (BE docs §1, §2-1):
    - **DEALER/HOSPITAL (이 사용자 메뉴)**: `Role.priority < ADMIN.priority` → `loginUser.userId` 반환 → JPQL `om.user_id = :queryUserId`로 owner 본인 데이터만 노출. 본인 PENDING 포함.
    - **ADMIN 이상 (admin/05)**: `null` 반환 → 전체 조회. 단 동일 JPQL의 `(:queryUserId IS NOT NULL OR pp.prescriptionPartnerStatus != PENDING)` 분기로 admin은 PENDING 제외 (BE docs §5-B, 의도 불명).
  - **소속 데이터 범위**: 사용자는 자기 owner 소유 dealer 경유 prescription만 보인다. admin/05는 전 회사 데이터 + status 변경(`confirmPrescription`, `completePartner`, OCR, ZIP, 엑셀 다운로드 등 18개 엔드포인트 중 추가 13개) 전부 가능 (01-controllers.md:155-170).
  - **삭제 범위 차이**: 사용자=PENDING만, admin=PENDING+IN_PROGRESS (BE docs §2-5; 02-services.md:405). COMPLETED는 누구도 삭제 불가.
  - **클라 가드 vs 서버**: 프론트 `ContractMemberGuard`는 백엔드 강제 아님 (BE docs §1 footnote). 다른 owner의 `prescriptionPartnerId` 직접 호출 시 §2의 #2/#4가 IDOR로 노출 (§5-E).
- **트랜잭션**: 모든 변경 메서드 `@Transactional REQUIRED` (02-services.md:89-99). `createPrescriptionWithFiles`/`softDeletePartner`는 커밋 후 `prescriptionMonthlyStatsService.refreshByUserId(userId)`를 `TransactionSynchronizationManager.afterCommit + @Async`로 실행 (02-services.md:105, 339-340; 06-config.md:254). Caffeine `monthlyCountCache/monthlyFeeCache` 1일 TTL 무효화로 user/02 home 통계가 자동 갱신.
- **상태 노출 필드 차이**: 사용자 화면 응답(`PrescriptionPartnerResponse` 17필드)은 거래처/딜러/금액 합계 위주. admin/05는 추가로 `confirmedAt`, `checkedAt`, OCR 결과, 엑셀 export 등 운영 필드 노출(01-controllers.md:155-170 cross-ref).

## 5. 리스크 / 후속 액션

| ID | 위험도 | 내용 | 출처 |
|----|--------|------|------|
| R1 | High | `getPrescriptionPartner`/`updatePrescriptionWithFiles` 소유권 검증 누락 IDOR | BE docs §5-E |
| R2 | High | `PrescriptionController` 전체 `@RequiredRole` 부재 — admin 전용 액션도 인증만으로 호출 가능 | 05-security.md:161,316; 01-controllers.md:406 |
| R3 | Med | 신규 30개 vs 수정 1..5개 한도 불일치, 30개 등록 건은 수정 시 항상 reject | BE docs §5-G; 02-services.md:421 |
| R4 | Med | `updatePrescriptionWithFiles` 상태 미검증 — 서버 직호출 시 COMPLETED도 수정 가능 | BE docs §5-H |
| R5 | Med | `dealer.member_id` NULL이면 신규 EDI 등록 실패 (`findOwnerDealerByUserId` INNER JOIN) | BE docs §5-F, §6-H |
| R6 | Med | `softDeletePartner`가 부모 `prescription.status` 재계산 안 함 → orphan PENDING 누적 | BE docs §5-I |
| R7 | Low | `listDealers` LEFT JOIN N:M 중복 행 (dealer당 평균 1.4 drug_company) | BE docs §5-J |
| R8 | Low | admin에 PENDING 숨김 분기(`!= PENDING`) 의도 불명 | BE docs §5-B |
| R9 | Low | `prescription*` 보조 인덱스 부재(현재 2.5k rows로 미체감, 수만 진입 전 선제 필요) | BE docs §5-K; 03-repositories.md:142-144 |
| R10 | Low | `prescription_edi_file.deleted` 컬럼 부재 + `BaseEntity` 미상속(이력 추적 부재) | BE docs §5-L; 03-repositories.md:182,200 |

## 6. 참조

- 프론트: `medipanda-web-test/src/pages-user/PrescriptionList.tsx`, `medipanda-web-test/src/pages-user/DealerList.tsx`
- 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/user/04_PRESCRIPTION_MANAGEMENT.md`
- 백엔드 docs: `/Users/jmk0629/keymedi/medipanda-api/docs/user/04_PRESCRIPTION_MANAGEMENT.md`
- 백엔드 코드: `web/v1/PrescriptionController.kt:34`, `web/v1/DealerController.kt:17`, `service/PrescriptionService.kt`, `service/DealerService.kt`, `repo/postgresql/PrescriptionPartnerRepository.kt:91-150,54-89`, `repo/postgresql/PrescriptionEdiFileRepository.kt:54-84`, `repo/postgresql/DealerRepository.kt:22-54`
- ingest 6종: `reports/backend-ingestion-20260427/01-controllers.md:25,38,150-170,333-338,406`, `02-services.md:87-105,167-177,194-196,397,405,421`, `03-repositories.md:27-31,78,93,103-104,142-144,168,182,200`, `04-domain.md:32-44,93-95,150-174,242-245`, `05-security.md:15,60-63,146-174,316-355`, `06-config.md:172,254,270,301-306`
- cross-ref: admin/05 처방 관리(미작성, 동일 컨트롤러의 잔여 13개 엔드포인트), user/02 home 통계(`refreshByUserId` 캐시 의존)

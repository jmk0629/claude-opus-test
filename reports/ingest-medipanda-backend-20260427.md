# /ingest-medipanda-backend 리포트 — 2026-04-27

> 명령: `/ingest-medipanda-backend`
> 대상 백엔드: `/Users/jmk0629/keymedi/medipanda-api`
> 대상 프론트 docs: `/Users/jmk0629/keymedi/medipanda-web-test/docs/{admin,user}/*.md`
> Phase 1 (6-agent 병렬 백엔드 분석) + Phase 2 (대표 메뉴 3건 cross-ref) 완료.

---

## 0. 한 장 요약

### 백엔드 규모
| 항목 | 수치 | 출처 |
|------|-----:|------|
| Controller | 23 | `01-controllers.md:7` |
| 엔드포인트 | ~130 (`/v1/*` 단일 버전) | `01-controllers.md:8` |
| @Service | 27 | `02-services.md:5` |
| JPA Repository | 47 | `03-repositories.md` |
| @Entity | 45 (+ BaseEntity) | `04-domain.md:11` |
| Enum | 38 | `04-domain.md:15` |
| 추정 Aggregate | 6 (Member / Prescription / Settlement / PartnerContract / ExpenseReport / BoardPost) | `04-domain.md:16` |

### 스택
- **Spring Boot 3.1.4 + Kotlin 1.9.21 + JDK 17 (Amazon Corretto)** / Gradle Kotlin DSL 멀티모듈 / 포트 **18080** (`06-config.md:1`)
- **PostgreSQL** (RDS, prod 호스트 `medipanda.cp6gkgc82mif.ap-northeast-2.rds.amazonaws.com`) — JPA/Hibernate, **QueryDSL·Specification 미사용**
- **인증**: 자체 JWT(HMAC-SHA256, access 30분 / refresh 14일) + 커스텀 `@RequiredRole(mode, permission)` AOP (`@PreAuthorize` 미사용)
- **외부 연동 11종**: AWS S3/SES/SSM/SNS, Firebase FCM, Aligo SMS, KIMS, HIRA, KMC 본인인증
- **메시징**: 인메모리 `LinkedBlockingQueue` × 4 (push/email/postView/likeCommand). **Redis 미사용**, 캐시는 Caffeine + AtomicReference
- **스케줄러**: `@Scheduled` 3개 (월 7일 EDI 미접수 알림 외)

### 즉시 대응 필요 Top 5
| 순위 | 항목 | 심각도 | 출처 |
|---:|------|:----:|------|
| 1 | **Refresh Token DB 비교 미수행** — JWT 서명만 검증하고 DB 저장된 refresh token 과 비교하지 않아 탈취 시 무효화 불가 | HIGH | `05-security.md:286` |
| 2 | **`/v1/hospitals/bulk-upsert` 무인증 개방** — Spring Security permitAll 화이트리스트에 포함, 대량 쓰기 가능 | HIGH | `05-security.md:267, 310` |
| 3 | **Swagger / TestController 운영 노출** — `permitAll`, BasicAuth 자격증명(`q1w2e3` 등)이 application.yml 평문 커밋 | HIGH | `05-security.md:245, 304` |
| 4 | **`SettlementService.notifyAdminForObjections` @Transactional 누락** — N+1 + 부분 실패 시 일관성 깨짐 | Medium | `02-services.md:382-384` |
| 5 | **프로모션 토큰 XOR 암호화** — PII(휴대폰/이름) 포함, AES-GCM 미사용 | HIGH | `05-security.md:292` |

> 그 외 5건의 Medium 리스크(쿠키 Secure=false, application.yml 시크릿 커밋, CORS `*`, BCrypt strength=10, ExpenseReport/Prescription Controller 권한 부재)는 `05-security.md:284-348` 참조.

---

## 1. Phase 1 산출물 (6-agent 병렬 백엔드 분석)

| # | 영역 | 파일 | 핵심 발견 |
|---|------|------|----------|
| 1 | Controllers | [`backend-ingestion-20260427/01-controllers.md`](backend-ingestion-20260427/01-controllers.md) | 23 컨트롤러 / ~130 엔드포인트 / `/v1/*` 단일 버전 / `@RequiredRole` 적용 분포 |
| 2 | Services | [`backend-ingestion-20260427/02-services.md`](backend-ingestion-20260427/02-services.md) | 27 서비스 / 트랜잭션 누락 Top 5 / 이벤트 드리븐 통계 파이프라인 |
| 3 | Repositories | [`backend-ingestion-20260427/03-repositories.md`](backend-ingestion-20260427/03-repositories.md) | 47 레포지토리 / N+1 핫스팟 10건 / 인덱스 권고 10건 / native UNION/RECURSIVE 사용처 |
| 4 | Domain | [`backend-ingestion-20260427/04-domain.md`](backend-ingestion-20260427/04-domain.md) | 45 엔티티 + 38 Enum / 6 Aggregate / Mermaid ERD / 소프트삭제 패턴 |
| 5 | Security | [`backend-ingestion-20260427/05-security.md`](backend-ingestion-20260427/05-security.md) | 보안 리스크 Top 10 (HIGH 5 / Medium 5) / JWT·CORS·BCrypt 분석 |
| 6 | Config | [`backend-ingestion-20260427/06-config.md`](backend-ingestion-20260427/06-config.md) | 6 프로파일 / 11 외부 연동 / 4 큐 / 5 캐시 / Dockerfile·CI·SSM 키 매핑 |

---

## 2. Phase 2 산출물 (메뉴별 풀스택 지도)

처리 메뉴: **23 / 23** (전체).

| 메뉴 | 풀스택 지도 | 매트릭스 | 리스크 |
|------|------------|---:|---:|
| `admin/01` 회원 관리 | [`bridge/admin-01-member-fullstack.md`](bridge/admin-01-member-fullstack.md) | 9 | 7 |
| `admin/02` 제품 관리 | [`bridge/admin-02-product-fullstack.md`](bridge/admin-02-product-fullstack.md) | 10 | 5 |
| `admin/03` 거래처 관리 | [`bridge/admin-03-partner-fullstack.md`](bridge/admin-03-partner-fullstack.md) | 17 | 12 |
| `admin/04` 영업대행 상품 | [`bridge/admin-04-sales-agency-fullstack.md`](bridge/admin-04-sales-agency-fullstack.md) | 11 | 5+ |
| `admin/05` 처방 관리 | [`bridge/admin-05-prescription-fullstack.md`](bridge/admin-05-prescription-fullstack.md) | 15 | 6 (Critical 1) |
| `admin/06` 정산 관리 | [`bridge/admin-06-settlement-fullstack.md`](bridge/admin-06-settlement-fullstack.md) | 16 | 8 |
| `admin/07` 지출 보고서 | [`bridge/admin-07-expense-report-fullstack.md`](bridge/admin-07-expense-report-fullstack.md) | 15 | 4+ |
| `admin/08` 커뮤니티 관리 | [`bridge/admin-08-community-fullstack.md`](bridge/admin-08-community-fullstack.md) | — | — |
| `admin/09` 콘텐츠 관리 | [`bridge/admin-09-content-fullstack.md`](bridge/admin-09-content-fullstack.md) | 17 | P0 1건 (`DELETE /v1/hospitals/all` 무인증 TRUNCATE) |
| `admin/10` 고객 지원 | [`bridge/admin-10-customer-service-fullstack.md`](bridge/admin-10-customer-service-fullstack.md) | — | P0 1건 (IDOR `/partner-contracts/{userId}`) |
| `admin/11` 배너 관리 | [`bridge/admin-11-banner-fullstack.md`](bridge/admin-11-banner-fullstack.md) | 4 | 5 (GET 권한 부재) |
| `admin/12` 관리자 권한 | [`bridge/admin-12-permission-fullstack.md`](bridge/admin-12-permission-fullstack.md) | — | P1 4건 (RBAC 모델 신뢰성) |
| `user/01` 인증 | [`bridge/user-01-auth-fullstack.md`](bridge/user-01-auth-fullstack.md) | 17 | HIGH 4 + P0 1 (비번변경 인증 누락) |
| `user/02` 홈 | [`bridge/user-02-home-fullstack.md`](bridge/user-02-home-fullstack.md) | 6 | 8 |
| `user/03` 제품 검색 | [`bridge/user-03-product-search-fullstack.md`](bridge/user-03-product-search-fullstack.md) | 2 | 8 |
| `user/04` 처방 관리 | [`bridge/user-04-prescription-fullstack.md`](bridge/user-04-prescription-fullstack.md) | 7 | 10 (High 2) |
| `user/05` 정산 | [`bridge/user-05-settlement-fullstack.md`](bridge/user-05-settlement-fullstack.md) | 12 | 12 (IDOR 2건) |
| `user/06` 커뮤니티 | [`bridge/user-06-community-fullstack.md`](bridge/user-06-community-fullstack.md) | 12 | CRIT 1 + HIGH 2 |
| `user/07` 영업대행 상품 | [`bridge/user-07-sales-agency-fullstack.md`](bridge/user-07-sales-agency-fullstack.md) | 3 | 5 |
| `user/08` 이벤트 | [`bridge/user-08-event-fullstack.md`](bridge/user-08-event-fullstack.md) | 3 | P0 2 (RBAC, XOR/PII) |
| `user/09` 고객 지원 | [`bridge/user-09-customer-service-fullstack.md`](bridge/user-09-customer-service-fullstack.md) | 7 | CRIT 1 (타인 명의 작성) |
| `user/10` 마이페이지 | [`bridge/user-10-mypage-fullstack.md`](bridge/user-10-mypage-fullstack.md) | 9 | 6 (RSA 우회·SELF 상태 임의 변경) |
| `user/11` 파트너 계약 | [`bridge/user-11-partner-contract-fullstack.md`](bridge/user-11-partner-contract-fullstack.md) | 2 | 10 (IDOR 2건) |

### 전 메뉴 횡단으로 반복 발견된 패턴

1. **`@RequiredRole` 미적용 컨트롤러 다수** — `Banner` GET, `EventBoard`, `SalesAgencyProductBoard`, `PartnerContract` 사용자 EP, `ExpenseReport`, `Prescription`, `Hospital` 등에서 클라이언트 가드만 권한을 강제. `05-security.md:153-164` 표와 일치.
2. **프론트 docs ↔ 실서버 경로 drift** — `/v1/prescription-partners` vs `/v1/prescriptions/partners`, `excel` vs `excel-download`, `event-boards` 4건, banner PUT vs PATCH 등. `/sync-api-docs` 재실행 필요.
3. **owner-scope 미강제 IDOR** — `admin-10` `/partner-contracts/{userId}`, `user-05` `/settlements/partners`·`/products`, `user-06` `/comments/{userId}`·`/reports/{userId}`, `user-09` 타인 명의 작성, `user-11` `GET /partner-contracts/{userId}` 등.
4. **BaseEntity 미상속 거래 테이블** — `prescription_partner`, `partner_contract_file`, `banner_file` 등 감사 컬럼 부재.
5. **인메모리 큐·캐시 분산 부정합** — Caffeine·AtomicReference·LinkedBlockingQueue 가 multi-replica·운영 모니터링 부재. `user/02` 홈 위젯, `user/06` 좋아요·조회수가 직접 영향.
6. **소프트 삭제 / 고아 S3 파일 누수** — `admin/11` 배너 이미지 교체, `admin/04` 썸네일 교체, `admin/07` 지출보고 첨부 등에서 구 S3 객체 방치.
7. **Enum drift (FE↔BE)** — `PartnerContractStatus`(admin/01·user/11), `ExpenseReport status`(admin/07), `BannerScope`(admin/11), `exposureRange`(admin/04) 등.

---

## 3. 다음 단계

1. **HIGH/CRIT 리스크 우선순위 처리** — 메뉴 횡단으로 동일 패턴(IDOR · @RequiredRole 미적용 · TRUNCATE 무인증) 이 반복되므로 보안 픽스를 묶어서 PR. 특히 다음은 외주사 인계 즉시 합의 필요:
   - 보안 Top 5 (Phase 1 §0): Refresh Token DB 미비교, `/v1/hospitals/bulk-upsert` 무인증, Swagger/BasicAuth 평문, Settlement 트랜잭션 누락, 프로모션 토큰 XOR.
   - Phase 2 추가 발견: `DELETE /v1/hospitals/all` 무인증 TRUNCATE (admin/09), `/partner-contracts/{userId}` IDOR (admin/10·user/11), `/comments/{userId}` & `/reports/{userId}` IDOR (user/06), 타인 명의 게시글 (user/09).
2. **`/sync-api-docs` 재실행** — 23개 메뉴 cross-ref 에서 경로 drift 가 거의 모든 메뉴에서 발견됨. backend.ts 재생성 후 docs 측 일괄 보정 필요.
3. **Enum 드리프트 정리** — `PartnerContractStatus`/`ExpenseReportStatus`/`BannerScope`/`exposureRange` 등 프론트 ↔ 백엔드 enum 합의. `/verify-frontend-contract` 정기 실행으로 유지.
4. **메뉴별 cross-ref 정기화** — 백엔드 PR 머지 후 영향 메뉴만 재생성하는 운영 패턴(`/ingest-medipanda-backend |...|메뉴 필터`)으로 격상.

---

## 4. 메타

- **에이전트 호출**: Phase 1 = 6 에이전트 병렬 (controller-/service-/repository-/domain-/security-/config-analyzer), Phase 2 = 23 에이전트 (대표 3 + 후속 20, 4-병렬 × 5 배치). cross-ref-writer 서브에이전트가 본 세션에 미등록되어 general-purpose 폴백 사용.
- **읽기 전용**: medipanda-api / medipanda-web-test 어느 쪽에도 Write 하지 않음. 모든 산출물은 `claude-opus-test/reports/` 하위.
- **민감정보 마스킹**: DB 비밀번호, JWT secret, BasicAuth 자격증명, RSA private key 모두 `***` 처리.

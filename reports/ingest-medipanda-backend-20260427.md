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

처리 메뉴: **3 / 23** (대표 메뉴 샘플 — 전체는 후속 실행).

| 메뉴 | 풀스택 지도 | 매트릭스 행 | 리스크 |
|------|------------|---:|---:|
| `admin/05` 처방 관리 | [`bridge/admin-05-prescription-fullstack.md`](bridge/admin-05-prescription-fullstack.md) | 15 | 6 (Critical 1) |
| `admin/06` 정산 관리 | [`bridge/admin-06-settlement-fullstack.md`](bridge/admin-06-settlement-fullstack.md) | 16 | 8 |
| `user/04` 처방 관리 (사용자) | [`bridge/user-04-prescription-fullstack.md`](bridge/user-04-prescription-fullstack.md) | 7 | 10 (High 2) |

세 지도에서 **공통적으로 발견된 패턴**:
- **프론트 docs vs 실제 컨트롤러 경로 drift** — 예: 프론트 docs는 `/v1/prescription-partners`, 실서버는 `/v1/prescriptions/partners` (admin/05 R3, admin/06 정규화 6건).
- **클라이언트 가드 의존** — `user/04` 의 처방 메뉴는 `@RequiredRole` 부재로 owner-scope 강제가 서버에 없고 프론트 가드만 차이를 만든다 (`user-04-...md:§4`).
- **BaseEntity 미상속 엔티티** — `prescription_partner` 등 핵심 거래 테이블이 `created_at/modified_at` 미보유 (admin/05 R4, admin/06 R6).

---

## 3. 다음 단계

1. **나머지 20개 메뉴 cross-ref**: `/ingest-medipanda-backend |admin/01,admin/02,...` 처럼 필터 호출. (대표 3건으로 패턴 검증 완료, 나머지는 동일 파이프라인 재사용.)
2. **HIGH 리스크 5건 → 이슈/PR**: 특히 RISK-01(Refresh Token), RISK-05(`/v1/hospitals/bulk-upsert`), RISK-04(Swagger 평문)는 외주사 인계 즉시 합의 필요. 응답 임시 차단(WAF) 후 백엔드 수정.
3. **`/sync-api-docs` 재실행**: 백엔드 `backend.ts` 재생성 → 프론트 docs 경로 drift 자동 보정 (admin/05·06 에서 발견된 경로 불일치는 docs 측 수정 필요).
4. **메뉴별 cross-ref 정기화**: 백엔드 PR 머지 후 영향 메뉴만 cross-ref 재생성하는 운영 패턴으로 격상.

---

## 4. 메타

- **에이전트 호출**: Phase 1 = 6 에이전트 병렬 (controller-/service-/repository-/domain-/security-/config-analyzer), Phase 2 = 3 에이전트 병렬 (cross-ref-writer 폴백 = general-purpose, 본 세션 시작 시점에 cross-ref-writer 심볼릭 링크 미등록 상태였음).
- **읽기 전용**: medipanda-api / medipanda-web-test 어느 쪽에도 Write 하지 않음. 모든 산출물은 `claude-opus-test/reports/` 하위.
- **민감정보 마스킹**: DB 비밀번호, JWT secret, BasicAuth 자격증명, RSA private key 모두 `***` 처리.

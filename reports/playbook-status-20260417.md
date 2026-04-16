# /playbook-status 리포트 — 2026-04-17

> 대상: `/Users/jmk0629/keymedi/medipanda-web`
> 보조 검색 루트: `/Users/jmk0629/keymedi/` (kotlin-test, db-backups, harness-engineering-test)
> 실행: evidence-collector 3-병렬 (P0 / P1 / P2)

---

## 플레이북 상태 요약

| 섹션 | ✅ 있음 | ⚠️ 부분 | ⬜ 미수령 | ❓ 확인 필요 | 충족률 |
|------|--------|--------|----------|------------|-------|
| P0 (8개) | 0 | 4 | 4 | 0 | **0%** |
| P1 (6개) | 1 | 5 | 0 | 0 | **17%** |
| P2 (4개) | 1 | 3 | 0 | 0 | **25%** |
| **총합(18개)** | **2** | **12** | **4** | **0** | **11%** |

### 핵심 판정
- **P0 ✅ 0건 → 내재화 시작 불가 상태**. 외주사로부터 정식 수령 전.
- **`kotlin-test/` 디렉토리의 `com.keymedi` Spring Boot 프로젝트는 학습용 POC일 가능성** (README가 "Spring Boot 학습 프로젝트"로 자칭). 실제 medipanda BE 소스와 구분 필요 — 미팅 최우선 확인 항목.
- 프론트엔드 `docs/`에 BATCH_ANALYSIS, INTERNALIZATION_PLAYBOOK 등 분석 문서는 풍부하지만, 운영 명세(외부 연동/S3/CloudWatch/계정 체계)는 "요구 리스트"일 뿐 **실제 스펙은 미수령**.

---

## 섹션별 체크리스트

### P0 미수령 시 내재화 시작 불가

| ID | 항목 | 상태 | 증거 | 비고 |
|----|------|------|------|------|
| P0-01 | 백엔드 전체 소스 | ⚠️ | `kotlin-test/src/main/kotlin/com/keymedi/` | **"test" 이름, 학습 프로젝트로 자칭** — 실 medipanda BE 원본 여부 확인 필요 |
| P0-02 | build.gradle.kts + Gradle Wrapper | ⚠️ | `kotlin-test/build.gradle.kts`, `kotlin-test/gradlew` | P0-01과 동일 사유 |
| P0-03 | application-{local,dev,prod}.yml | ⬜ | `kotlin-test/src/main/resources/application.yml` 단일본만 | 프로파일별 분리본 없음 |
| P0-04 | 로컬 실행 가이드 | ⚠️ | `kotlin-test/README.md:11` (`./gradlew bootRun`) | JDK 버전/docker-compose 의존성 미기재, 학습용 README |
| P0-05 | DB 마이그레이션 이력 | ⬜ | — | Flyway/Liquibase/V*__*.sql 전무. `db-backups/medipanda_20260415_161507.dump` 스냅샷만 존재 (이력 ≠ 스냅샷) |
| P0-06 | DB 접속 정보 가이드 | ⬜ | `medipanda-web/.env.example` (프론트 전용 VITE_*) | BE용 DB_URL/POSTGRES 키 없음 |
| P0-07 | 배포 파이프라인 | ⚠️ | `medipanda-web/deploy.sh` (프론트 SSH 배포) | `.github/workflows/` 부재, BE CI/CD 증거 없음 |
| P0-08 | AWS 접근 권한 가이드 | ⬜ | `docs/INTERNALIZATION_PLAYBOOK.md:62-63` (요구 리스트 자체) | 실제 접근 가이드 문서는 없음 |

### P1 운영 안정화 필수

| ID | 항목 | 상태 | 증거 | 비고 |
|----|------|------|------|------|
| P1-01 | OCR/AI 서버 코드·흐름 | ⚠️ | `INTERNALIZATION_PLAYBOOK.md` 산발 언급, `src/backend/ocr.ts` (프론트 래퍼만) | 전용 OCR 문서·소스 부재 |
| P1-02 | 외부 연동 명세 (KIMS/KMC/FCM/이메일/SMS) | ⚠️ | `BACKEND_INTEGRATION.md`에 KIMS/KMC 매칭 0건. 본인인증 87회, FCM 48회 언급만 | **통합 명세서 부재** |
| P1-03 | 배치 목록 | ✅ | `docs/BATCH_ANALYSIS.md` | 단독 문서 존재, 22개 배치 항목 카운트 |
| P1-04 | 로그 위치 | ⚠️ | `INTERNALIZATION_PLAYBOOK.md:63,72` 1줄씩 | CloudWatch 그룹명/retention/수신자 명세 부재 |
| P1-05 | S3 버킷/경로 규칙 | ⚠️ | `INTERNALIZATION_PLAYBOOK.md` 14회 | 버킷명·prefix·퍼블릭 정책 문서 부재 |
| P1-06 | 계정 체계 (GitHub/Firebase/App Store/Google Play) | ⚠️ | `INTERNALIZATION_PLAYBOOK.md:76` 한 줄 나열 | 소유자·이관 계획 문서 부재 |

### P2 품질 판단에 중요

| ID | 항목 | 상태 | 증거 | 비고 |
|----|------|------|------|------|
| P2-01 | 테스트 코드 + 커버리지 | ⚠️ | `kotlin-test/src/test/kotlin/com/keymedi/KeymediApplicationTests.kt` (스켈레톤 1개) | 프론트 `*.test.*`/`*.spec.*` 0개, e2e 인프라 부재 |
| P2-02 | 장애/TODO/기술부채 문서 | ⚠️ | `INTERNALIZATION_PLAYBOOK.md` 요구 항목, `docs/admin/analysis/09_*` 산발 TODO | **통합 레지스터 부재** |
| P2-03 | 정산 월마감 절차서 | ⚠️ | `BATCH_ANALYSIS.md:81,84,95` ("추정" 배치), `SETTLEMENT` 문서 | 월마감 SOP·재실행 가이드 부재 |
| P2-04 | 지출보고 기능 상태 | ✅ | `docs/admin/07_EXPENSE_REPORT.md`, `analysis/07_*_CLAUDE.md:471-472`, `analysis/07_*_CODEX.md:264-266`, `API_USAGE_STATS.md:196` | **운영 중단/폐기 추정 근거 복수 문서에 명시** |

---

## 다음 미팅 아젠다 (⬜/⚠️ 총 16건 기반)

### 🔴 필수 (P0 — 내재화 시작 블로커)
1. **`kotlin-test/`가 실제 medipanda BE인가, 학습 POC인가?** 실 BE 소스 수령 시점?
2. `application-local/dev/prod.yml` 프로파일별 분리본 수령 시점
3. JDK 버전, `docker-compose` 로컬 의존성(Postgres/Redis 등) 가이드
4. Flyway/Liquibase 마이그레이션 스크립트 이력 일체 수령 가능 여부
5. BE용 DB 접속 템플릿(`.env.example` 또는 secrets 가이드)
6. BE CI/CD 파이프라인(`.github/workflows/` 또는 Jenkinsfile) 존재 여부
7. AWS IAM (EC2 43.202.151.248 / 3.39.216.231, RDS, S3, Route53/ACM) 이관 일정

### 🟡 운영 (P1 — 운영 전환 리스크)
8. OCR/AI 추론 서버 소스 저장소 위치 및 호출 시퀀스도
9. KIMS·KMC·FCM·이메일·SMS **통합 외부 연동 명세서**
10. CloudWatch 로그 그룹/retention/알람 수신자 리스트
11. S3 버킷 목록·prefix 규칙·퍼블릭 노출 정책
12. GitHub org·Firebase·App Store Connect·Google Play Console **현재 소유자 + 이관 일정** (결제 포함)

### 🟢 품질 (P2 — 후순위)
13. BE `src/test/` 커버리지 및 CI 실행 여부
14. 운영 장애 포스트모템/기술부채 레지스터 수령 가능 여부
15. 월마감 실행 주체·트리거 시각·실패 시 재실행 SOP
16. 지출보고 — **폐기 / 숨김 / 미완성** 중 공식 결정

---

## 위험 평가

- 🔴 **P0 ⬜/⚠️ 8건** — 모두 내재화 시작 차단 요소. B1 `/ingest-medipanda-backend` 착수 조건(✅ ≥ 6) 미충족.
- 🟡 **P1 ⚠️ 5건** — 단독 명세 없이 플레이북 나열만. 운영 전환 시점 장애 대응 가시화 필요.
- 🟢 **P2 ⚠️ 3건** — 지출보고는 이미 문서상 "폐기 추정" 결론. 나머지는 품질 판단용이므로 후순위.

---

## 다음 실행 트리거

- **주 1회 재실행**: P0 충족률이 `50%` 넘는 시점이 B1 준비 신호
- **P0-01 ✅ 달성 직후**: 즉시 `/ingest-medipanda-backend`(B1) 착수 가능
- **미팅 직후 재실행**: 위 16개 아젠다가 얼마나 해소됐는지 차분(delta) 확인용

---

## 자동화 관점 회고 (B2 자체 검증)

### 작동한 것
- 3에이전트 병렬 ~65초 (직렬이면 ~200초 추정)
- `kotlin-test/`라는 애매한 증거를 **⚠️ + "학습 프로젝트로 자칭"** 비고로 정확히 처리 (추측 금지 규칙 지켜짐)
- 플레이북의 "요구 항목 언급"과 "실제 스펙 문서"를 구분 (P1-04 CloudWatch, P1-05 S3, P0-08 AWS 접근)
- 각 항목에 **구체적 미팅 질문**을 자동 파생 → 외주사 미팅 아젠다로 즉시 복붙 가능

### 한계 / 개선 여지
- **정식 ~/.claude 에이전트 등록 전 세션에선 즉시 사용 불가**: 심링크 직후에는 `general-purpose`로 우회 실행해야 함. 재시작 후 `evidence-collector`로 직접 호출 가능.
- **증거 패턴이 B2 커맨드에 하드코딩**: 플레이북이 업데이트되면 커맨드도 같이 손봐야 함. 차기 개선: 플레이북 자체를 파서가 읽고 패턴을 메타데이터로 추출.
- **DB 마이그레이션 탐지 약함**: Flyway/Liquibase 외 `schemas.sql` 같은 단일 파일 형태는 놓칠 수 있음. P0-05 재검토 시 `db-backups/medipanda_20260415_161507_schema.sql`을 "스냅샷(이력 아님)"으로 분류한 것이 맞는지 확인 필요.

---

**실행 명령**: `/playbook-status` (medipanda-web 기본)
**차기 실행 권장**: 2026-04-24 (주 1회) 또는 외주사 미팅 직후

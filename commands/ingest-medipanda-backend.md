---
description: medipanda-api (Spring Boot + Kotlin) 백엔드 소스를 한 번에 인수 — 6-에이전트 병렬 분석 + 메뉴별 풀스택 지도(cross-ref-writer) 생성
argument-hint: "백엔드 루트 (생략 시 /Users/jmk0629/keymedi/medipanda-api) [|menu_filter]"
---

# /ingest-medipanda-backend

medipanda 외주 백엔드 인수 디데이용 1회성 파이프라인. 글로벌 `/ingest-backend` 의 6-agent 분석 위에 **medipanda-web-test 프론트 문서와의 cross-ref** 를 자동으로 얹어 메뉴별 풀스택 지도를 만든다.

기본 입력:
- 백엔드 루트: `/Users/jmk0629/keymedi/medipanda-api`
- 프론트 루트: `/Users/jmk0629/keymedi/medipanda-web-test`
- 출력 루트: `reports/backend-ingestion-YYYYMMDD/` (Phase 1) + `reports/bridge/` (Phase 2)

`$ARGUMENTS` 파싱:
- 첫 토큰: 백엔드 루트 (선택)
- `|menu_filter`: `admin/05,user/04` 처럼 콤마로 메뉴 한정 (생략 시 전체 23개)

---

## Phase 0: 사전 확인

1. 백엔드 루트 존재 확인 + `build.gradle.kts` / `settings.gradle.kts` 확인.
2. `application/src/main/kotlin/**/*.kt` 가 100건 이상 있는지 Glob.
3. 프론트 루트 `docs/admin/01_*.md` 존재 확인 (cross-ref 입력).
4. 출력 디렉토리 (`reports/backend-ingestion-<YYYYMMDD>/`, `reports/bridge/`) 가 없으면 생성 안내 (Write 시 자동 생성).
5. 어느 하나라도 실패하면 즉시 중단 + 사용자 안내.

---

## Phase 1: 6-에이전트 병렬 백엔드 분석

**반드시 한 메시지 안에서 6개 Agent 호출을 동시에 보낸다** (순차 실행 금지 — 병렬 효과가 핵심).

각 에이전트에게 동일한 헤더로 전달:

> 대상 디렉토리: `<백엔드 루트>`
> 분석 범위는 이 디렉토리 하위로 한정.
> 출력은 단일 마크다운 파일 1개로 작성. 모든 주장에 파일:라인 근거 첨부.
> 출력 경로: `<리포트 루트>/<NN-역할>.md`

| # | subagent_type | 출력 파일 |
|---|---------------|-----------|
| 1 | controller-analyzer | 01-controllers.md |
| 2 | service-analyzer | 02-services.md |
| 3 | repository-analyzer | 03-repositories.md |
| 4 | domain-extractor | 04-domain.md |
| 5 | security-auditor | 05-security.md |
| 6 | config-analyzer | 06-config.md |

각 에이전트는 **읽기 전용**. 본인 보고서 1개만 Write.

병렬 호출이 모두 끝날 때까지 대기 → 6개 산출물 존재 검증.

---

## Phase 2: 메뉴별 cross-ref (풀스택 지도 생성)

**메뉴 목록** (전체 23개):

```
admin/01_MEMBER_MANAGEMENT
admin/02_PRODUCT_MANAGEMENT
admin/03_PARTNER_MANAGEMENT
admin/04_SALES_AGENCY_PRODUCT
admin/05_PRESCRIPTION_MANAGEMENT
admin/06_SETTLEMENT_MANAGEMENT
admin/07_EXPENSE_REPORT
admin/08_COMMUNITY
admin/09_CONTENT_MANAGEMENT
admin/10_CUSTOMER_SERVICE
admin/11_BANNER
admin/12_ADMIN_PERMISSION
user/01_AUTH_PAGES
user/02_HOME
user/03_PRODUCT_SEARCH
user/04_PRESCRIPTION_MANAGEMENT
user/05_SETTLEMENT
user/06_COMMUNITY
user/07_SALES_AGENCY_PRODUCT
user/08_EVENT
user/09_CUSTOMER_SERVICE
user/10_MYPAGE
user/11_PARTNER_CONTRACT
```

`menu_filter` 가 주어졌으면 그 부분집합만 처리. 생략 시 전체.

각 메뉴마다 **cross-ref-writer** 에이전트 1회 호출. 동시 호출 한도: 한 메시지에서 최대 4개 병렬 (백엔드 ingest 결과 동일 파일 다수 Read 충돌 방지 + context 폭주 방지).

cross-ref-writer 입력:
- menu_id: `admin-05`
- menu_name: `처방 관리`
- frontend_docs_path: `<프론트 루트>/docs/admin/05_PRESCRIPTION_MANAGEMENT.md`
- backend_docs_path: `<백엔드 루트>/docs/admin/05_PRESCRIPTION_MANAGEMENT.md` (없으면 "(없음)")
- ingest_dir: `<리포트 루트>`
- output_path: `reports/bridge/admin-05-prescription-fullstack.md`

각 cross-ref 산출물 존재 검증.

---

## Phase 3: Executive Summary 작성

`reports/ingest-medipanda-backend-YYYYMMDD.md` 에 다음 구조로 Write:

```markdown
# /ingest-medipanda-backend 리포트 — YYYY-MM-DD

## 0. 한 장 요약
- 백엔드 규모: Controllers N / Services M / Entities K / 총 .kt 파일 X
- 스택: Spring Boot 3.x / Kotlin 1.9 / PostgreSQL / Redis 등 (config-analyzer 결과)
- 즉시 대응 필요 Top 5 (security-auditor + repository-analyzer 발췌)

## 1. Phase 1 산출물 (6-agent)
- [Controllers](backend-ingestion-YYYYMMDD/01-controllers.md)
- [Services](backend-ingestion-YYYYMMDD/02-services.md)
- [Repositories](backend-ingestion-YYYYMMDD/03-repositories.md)
- [Domain](backend-ingestion-YYYYMMDD/04-domain.md)
- [Security](backend-ingestion-YYYYMMDD/05-security.md)
- [Config](backend-ingestion-YYYYMMDD/06-config.md)

## 2. Phase 2 산출물 (메뉴별 풀스택 지도)
| 메뉴 | 풀스택 지도 |
|------|------------|
| admin/05 처방 관리 | [bridge/admin-05-prescription-fullstack.md](bridge/admin-05-prescription-fullstack.md) |
| ... | ... |

처리 메뉴: N/23 (filter 적용 시 X/23)

## 3. 다음 단계
- 풀스택 지도에서 발견된 리스크 항목 → 이슈/PR 로
- backend.ts 재생성 (`npm run gen:backend` 등) 후 `/sync-api-docs` 로 drift 점검
- 정기 운영: 백엔드 PR 머지 후 영향 메뉴만 cross-ref 재생성
```

---

## Phase 4: 사용자 안내

```
## B1 /ingest-medipanda-backend 결과
- Phase 1: 6-agent 분석 완료 → reports/backend-ingestion-YYYYMMDD/
- Phase 2: N개 메뉴 풀스택 지도 → reports/bridge/
- Executive summary: reports/ingest-medipanda-backend-YYYYMMDD.md

### 권장 후속
- 풀스택 지도 §5 리스크 항목 검토
- 미처리 메뉴(전체 - N) 는 다음 명령으로 추가 실행:
  /ingest-medipanda-backend <백엔드 루트>|admin/07,user/08

### 산출물 인덱스
reports/ingest-medipanda-backend-YYYYMMDD.md 의 §1, §2 표 참조
```

---

## 주의사항

- **읽기 전용 원칙**: 백엔드/프론트 소스에는 절대 Write 하지 않는다. 모든 Write 는 `claude-opus-test/reports/` 하위.
- **병렬 호출 강제**: Phase 1 의 6개 Agent 는 반드시 한 메시지에서 동시 호출. 순차 호출 시 효과 70% 손실.
- **민감정보 마스킹**: DB password, API key, JWT secret 등이 보고서에 노출되지 않도록 security/config 에이전트가 직접 마스킹 (그들의 시스템 프롬프트에 이미 명시).
- **추정 표시**: 매트릭스 행이 불확실하면 비고에 "추정" + 근거 파일:라인.

---

## 사용 예시

```
# 전체 23개 메뉴 + 6-agent
/ingest-medipanda-backend

# 다른 경로 + 메뉴 2개만
/ingest-medipanda-backend /path/to/medipanda-api|admin/05,user/04

# Phase 1 만 돌리고 Phase 2 는 나중에 (수동 게이트)
/ingest-medipanda-backend |admin/00  # 빈 필터 → Phase 2 0건
```

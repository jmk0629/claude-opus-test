---
description: 내재화 플레이북(docs/INTERNALIZATION_PLAYBOOK.md)의 P0/P1/P2 체크리스트가 현재 얼마나 충족되었는지 **파일·문서 증거**로 자동 진단. evidence-collector 3-병렬로 섹션별 체크.
argument-hint: "대상 레포 경로 (생략 시 /Users/jmk0629/keymedi/medipanda-web) + 선택 섹션(P0/P1/P2/all)"
---

# /playbook-status

`docs/INTERNALIZATION_PLAYBOOK.md`의 P0/P1/P2 체크리스트를 **증거 기반 체크리스트 리포트**로 자동 변환. 백엔드 인수 디데이 전/후 매주 실행해서 수령 진행률을 가시화하는 것이 목표.

기본 대상: `/Users/jmk0629/keymedi/medipanda-web`
보조 검색 루트: `/Users/jmk0629/keymedi/` (sibling 디렉토리 `kotlin-test`, `db-backups` 등 포함)

---

## Phase 1: 입력 해석 및 플레이북 파싱

1. `$ARGUMENTS`가 비어있으면 기본 대상 사용
2. 대상 레포의 `docs/INTERNALIZATION_PLAYBOOK.md`를 Read
3. `## 4. 미팅에서 반드시 받아야 할 항목` 섹션에서 P0/P1/P2 아이템 목록 추출
4. 각 아이템에 대해 증거 후보 패턴 매핑 (아래 기본 매핑표 사용)

### 기본 증거 매핑표

**P0 — 미수령 시 내재화 시작 불가**
| ID | 항목 | 증거 후보 |
|----|------|---------|
| P0-01 | 백엔드 전체 소스 | sibling 디렉토리의 `build.gradle.kts` + `src/main/kotlin/` |
| P0-02 | build.gradle.kts + Gradle Wrapper | `build.gradle.kts` + `gradlew` 동반 존재 |
| P0-03 | application-{local,dev,prod}.yml | `application-*.yml` Glob |
| P0-04 | 로컬 실행 가이드 | `README.md`에서 "JDK", "gradlew bootRun" 등 키워드 |
| P0-05 | DB 마이그레이션 이력 | `db/migration/`, `Flyway`, `Liquibase`, `*.sql` 디렉토리 |
| P0-06 | DB 접속 정보 | `.env.example`에 DB_URL 키, 또는 docs/ 에 접속 가이드 |
| P0-07 | 배포 파이프라인 | `.github/workflows/*.yml`, `deploy.sh`, Jenkinsfile 등 |
| P0-08 | AWS 접근 권한 가이드 | docs/에서 "EC2", "S3", "RDS" 구조 설명 문서 |

**P1 — 운영 안정화 필수**
| ID | 항목 | 증거 후보 |
|----|------|---------|
| P1-01 | OCR 서버 코드/흐름 | docs/에서 "OCR" 문서, 또는 sibling 디렉토리의 OCR 프로젝트 |
| P1-02 | 외부 연동 명세 (KIMS/KMC/FCM/이메일/SMS) | docs/BACKEND_INTEGRATION.md 등에서 각 키워드 |
| P1-03 | 배치 목록 | docs/BATCH_ANALYSIS.md 또는 배치 관련 문서 |
| P1-04 | 로그 위치 | docs/에서 "log", "CloudWatch" 언급 |
| P1-05 | S3 버킷/경로 규칙 | docs/에서 "S3", 버킷명 언급 |
| P1-06 | 계정 체계 (GitHub/Firebase 등) | docs/에서 소유권/권한 문서 |

**P2 — 품질 판단**
| ID | 항목 | 증거 후보 |
|----|------|---------|
| P2-01 | 테스트 코드 | sibling BE의 `src/test/` 디렉토리 |
| P2-02 | 장애/TODO/기술부채 문서 | docs/에서 "TODO", "장애", "기술부채" 언급 문서 |
| P2-03 | 정산 월마감 절차서 | docs/에서 정산/마감 절차 문서 |
| P2-04 | 지출보고 기능 상태 | docs/에서 "지출보고", "expense" 언급 |

---

## Phase 2: evidence-collector 3-병렬 실행

단일 메시지에서 evidence-collector를 3번 호출 (P0 / P1 / P2 섹션별):

입력 공통:
- 검색 루트: `[대상 레포, /Users/jmk0629/keymedi/]`
- 각 섹션의 항목 목록 + 증거 후보 패턴 (위 매핑표에서)

출력은 각 섹션별 체크리스트 표.

---

## Phase 3: 통합 리포트

3개 섹션 결과를 다음 구조로 통합:

```markdown
# /playbook-status 리포트 — YYYY-MM-DD

## 플레이북 상태 요약
- P0 충족률: N% (✅ a / ⚠️ b / ⬜ c / ❓ d)
- P1 충족률: N%
- P2 충족률: N%
- **총 충족률**: N%

## 섹션별 체크리스트
### P0 미수령 시 내재화 시작 불가
(evidence-collector 결과 표)

### P1 운영 안정화 필수
(evidence-collector 결과 표)

### P2 품질 판단에 중요
(evidence-collector 결과 표)

## 다음 미팅 질문 후보
(⬜/⚠️ 항목 기반으로 취합)

## 위험 평가
- 🔴 P0 미수령 X건 — 내재화 시작 차단 요소
- 🟡 P1 미수령 Y건 — 운영 전환 시 장애 리스크
- 🟢 P2는 품질 판단용, 후순위 가능
```

---

## Phase 4: 리포트 저장

`reports/playbook-status-YYYYMMDD.md`

---

## Phase 5: 수동 검증 안내

```
## B2 플레이북 상태 결과
- 총 충족률: N%
- P0 미수령 X건 → 다음 미팅 아젠다 자동 생성

### 사용 방법
1. 리포트의 "다음 미팅 질문 후보"를 외주사 미팅 아젠다에 복붙
2. 주 1회 재실행으로 ✅ 카운트 변화 추적
3. P0가 모두 ✅가 되면 B1 `/ingest-medipanda-backend` 착수 신호

### 리포트 전문
reports/playbook-status-YYYYMMDD.md
```

---

## 사용 예시

```
# 기본 (medipanda-web 전체 섹션)
/playbook-status

# 특정 레포
/playbook-status /path/to/repo

# 특정 섹션만
/playbook-status P0
```

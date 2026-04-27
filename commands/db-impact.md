---
description: DB 마이그레이션 SQL(DDL) 입력 → 영향 메뉴/EP/프론트 함수 역추적. B1 결과(`reports/bridge/`) 를 인덱스로 사용.
argument-hint: "<sql_path | -> [|bridge_dir] [|ingest_dir]"
---

# /db-impact

마이그레이션 적용 전 "이게 어느 화면을 깨뜨릴 수 있는가?" 를 한 페이지로 답하는 사전 점검 도구. B1 `/ingest-medipanda-backend` 의 23개 풀스택 지도(`reports/bridge/*.md`) 가 이미 테이블 ↔ 메뉴 인덱스 역할을 하므로 그 위에 SQL 파싱 1단을 얹는 구조.

기본 입력:
- **sql_path**: 마이그레이션 SQL 파일 경로 (필수). `-` 로 stdin 또는 `<<<` 로 인라인 SQL 가능.
- **bridge_dir**: 기본 `reports/bridge/` (B1 산출물)
- **ingest_dir**: 기본 `reports/backend-ingestion-20260427/`
- 출력: `reports/db-impact-YYYYMMDD-<sql_basename>.md`

`$ARGUMENTS` 파싱:
- 첫 토큰: sql_path
- `|bridge_dir`, `|ingest_dir`: 선택 오버라이드

---

## Phase 0: 사전 확인

1. sql_path 가 존재하는지 Read. `-` 면 사용자에게 SQL 본문 입력 요청.
2. bridge_dir 에 `*.md` 파일이 23개 있는지 Glob (없으면 B1 먼저 실행 안내).
3. ingest_dir 에 `01-controllers.md`~`06-config.md` 6개 있는지 Glob.
4. 어느 하나라도 실패하면 즉시 중단 + 안내.

---

## Phase 1: migration-impact-analyzer 1회 호출

**병렬 호출 없음** — SQL 파싱 + bridge Grep + 리포트 작성을 한 에이전트가 직렬로 처리.

전달 입력:
- sql_path / sql_text
- bridge_dir
- ingest_dir
- output_path: `reports/db-impact-<YYYYMMDD>-<sql_basename>.md`
- frontend_root, backend_root (보강용 기본값 medipanda 경로)

에이전트가 산출물 1개를 Write 후 한 문단 보고.

---

## Phase 2: 사용자 안내

```
## D1 /db-impact 결과
- 입력 SQL: <sql_path>
- 영향 테이블: N개 / 영향 메뉴: M개
- 위험 등급: CRIT x / HIGH y / MED z / LOW w
- 리포트: reports/db-impact-<...>.md

### 즉시 점검 필요 (CRIT/HIGH)
- <메뉴 1>: <bridge 링크>
- <메뉴 2>: <bridge 링크>

### 권장 후속
- 위험 메뉴별로 backend.ts 재생성 후 /verify-frontend-contract 재실행
- BaseEntity 등 cross-cutting 변경이면 /ingest-medipanda-backend |<영향 메뉴 필터> 로 cross-ref 재생성
```

---

## 주의사항

- **읽기 전용 원칙**: SQL/bridge/ingest 어느 쪽에도 Write 하지 않음. 모든 Write 는 `reports/` 하위.
- **추정 표시**: 매트릭스 행마다 bridge 파일 라인 출처. 추측은 "추정" 명시.
- **고아 테이블 처리**: 23개 bridge 어디에도 매핑이 없는 테이블은 §0 "고아" 섹션에 따로 모음. 어드민 도구·배치·통계 가능성 시사.
- **Phase 2 리스크 해결 마이그레이션**: B1 §3 다음 단계 항목(BaseEntity 보강, Enum drift 해소 등) 을 해결하는 마이그레이션이면 §0 에 "Phase 2 리스크 해결" 표기.

---

## 사용 예시

```
# 단일 마이그레이션 파일
/db-impact /path/to/V1_5__add_audit_columns.sql

# bridge 디렉토리 다른 위치 (다른 인수 결과 사용)
/db-impact ./migration.sql|/some/other/bridge/

# 인라인 SQL (테스트용)
/db-impact -
# 그 후 ALTER TABLE prescription_partner ADD COLUMN ... 입력
```

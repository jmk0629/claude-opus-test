---
description: npm 프로젝트 의존성 신선도(outdated) + 보안(audit) 점검. 외주 인수 직후 또는 분기 1회 실행해 EOL/CVE/메이저 격차를 한 페이지로 답한다.
argument-hint: "[target_root] [|audit_only] [|skip_dev]"
---

# /dep-health

`npm outdated --json` + `npm audit --json` 두 출처를 합쳐 **위험 등급(CRIT/HIGH/MED/LOW) 별로 업그레이드 우선순위**를 정리하는 도구. 분기 1회 또는 외주 인수 직후 실행 권장.

기본 입력:
- **target_root**: 점검 대상 npm 프로젝트 루트 (default: `/Users/jmk0629/keymedi/medipanda-web`)
- 출력: `reports/dep-health-YYYYMMDD-<basename>.md`

`$ARGUMENTS` 파싱:
- 첫 토큰: target_root (생략 시 기본값)
- `|audit_only`: outdated 생략, audit 만
- `|skip_dev`: devDependencies 제외

---

## Phase 0: 사전 확인

1. target_root 가 디렉토리인지 + `package.json` 존재 Read
2. `node_modules/` 존재 확인 (Bash `test -d`). 없으면 즉시 중단:
   ```
   ❌ node_modules 없음. 먼저:
      cd <target_root> && npm ci
   ```
3. `package-lock.json` 존재 확인 (audit 정확도 위해 권장)

---

## Phase 1: dep-health-analyzer 1회 호출

**병렬 호출 없음** — Bash 호출 2회(outdated/audit) + 파싱 + 리포트 작성을 한 에이전트가 직렬 처리.

전달 입력:
- target_root
- output_path: `reports/dep-health-<YYYYMMDD>-<basename>.md`
- audit_only / skip_dev 플래그

에이전트가 산출물 1개를 Write 후 한 문단 보고.

---

## Phase 2: 사용자 안내

```
## D3 /dep-health 결과
- 대상: <target_root>
- 의존성: prod N / dev M
- 위험 등급: CRIT x / HIGH y / MED z / LOW w
- 보안: critical A / high B / moderate C / low D
- 리포트: reports/dep-health-<...>.md

### 즉시 조치 필요 (CRIT)
- <패키지 1>: <사유>
- <패키지 2>: <사유>

### 권장 후속
- CRIT 개별 검토 + 호환성 확인
- `npm audit fix` 로 자동 fix 가능한 HIGH 우선 처리
- 메이저 업그레이드는 별도 PR 단위로 (BREAKING CHANGE 회귀 검증 필요)
- 다음 점검 분기말 권장 (`/dep-health` 재실행)
```

---

## 주의사항

- **읽기 전용 원칙**: `node_modules` 수정 안 함, `package.json` 안 만짐. 모든 Write 는 `reports/` 하위.
- **민감정보 sanitize**: package.json 의 토큰 포함 URL 은 출력에서 가림.
- **종료 코드 1 = 정상**: outdated/audit 둘 다 "발견 = exit 1". 에이전트는 이를 에러로 오해하지 않도록.
- **EOL 휴리스틱 좁게**: 잘못 EOL 표시하면 신뢰 잃음. 확정된 목록(`request`, `node-sass`, `gulp@3`, `moment` 등) 만 사용.
- **외주 인수 컨텍스트**: medipanda-web 같은 외주 인수 코드는 critical/high 가 두 자릿수여도 정상. 패닉 대신 우선순위 매기기에 집중.

---

## 사용 예시

```
# 기본 — medipanda-web 전체
/dep-health

# 다른 프로젝트
/dep-health /Users/jmk0629/keymedi/medipanda-mobile-app

# 보안만 (빠르게)
/dep-health |audit_only

# prod 의존성만 (배포 영향 좁히기)
/dep-health |skip_dev
```

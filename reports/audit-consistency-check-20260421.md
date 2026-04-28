# 감사 보고서 팩 정합성 점검 (Meta-Audit)

- 작성일: 2026-04-21
- 범위: `/Users/jmk0629/Downloads/homework/claude-opus-test/reports/audit-*.md` 전 9개
- 목적: 보고서 간 교차 참조·지표·P0 일치·중복/누락·버전 일관성 검증

---

## 0. 인벤토리

| # | 파일 | 크기 | 작성 시간 | 상태 |
|---|---|---:|---|---|
| 1 | `audit-menu-routes-20260416.md` | 10 KB | 04-16 16:52 | 🗂 1차 버전 (아카이브) |
| 2 | `audit-menu-routes-20260421.md` | 18 KB | 04-21 14:51 | ✅ 최신 |
| 3 | `audit-api-drift-20260421.md` | 16 KB | 04-21 15:21 | ✅ |
| 4 | `audit-nplus1-20260421.md` | 14 KB | 04-21 15:28 | ✅ |
| 5 | `audit-admin-rbac-20260421.md` | 13 KB | 04-21 15:32 | ✅ |
| 6 | `audit-secrets-config-20260421.md` | 16 KB | 04-21 15:45 | ✅ |
| 7 | **`audit-executive-summary-20260421.md`** | 9 KB | 04-21 15:45 | 🔴 **stale** (#6·#7·#8 반영 안 됨) |
| 8 | `audit-e2e-coverage-20260421.md` | 13 KB | 04-21 15:51 | ✅ (exec summary 이후 작성) |
| 9 | `audit-transactional-20260421.md` | 16 KB | 04-21 16:00 | ✅ (exec summary 이후 작성) |
| 10 | `audit-error-observability-20260421.md` | 21 KB | 04-21 16:13 | ✅ (exec summary 이후 작성) |

**총 9개 최신 + 1개 아카이브 = 10개 파일, 합계 ≈ 146 KB.**

---

## 1. 🔴 CRITICAL — Executive Summary 미갱신 (최대 정합성 결함)

### 1.1 원본 보고서 목록 누락

**현재** (`audit-executive-summary-20260421.md:5-10`):
```
- 원본 보고서 5종 (각각 상세 증거·재현 경로 포함):
  - audit-menu-routes  (#1)
  - audit-api-drift    (#2)
  - audit-nplus1       (#3)
  - audit-admin-rbac   (#4)
  - audit-secrets-config (#5)
```

**실제 존재하는 보고서 8종**: 위 5개 + `audit-e2e-coverage` + `audit-transactional` + `audit-error-observability`.

### 1.2 P0 개수 불일치

| 위치 | 표기 | 실제 |
|---|---|---|
| `:16` 한 문장 결론 | "P0 **5건**은 반드시 선결" | ❌ |
| `:22-31` P0 테이블 | **8건** (P0-1 ~ P0-8) | 🟡 (현 exec summary 기준) |
| #8 감사 후 | E-1(PII), E-2(printStackTrace) 추가 → **10건** | ✅ 갱신 필요 |

### 1.3 "후속 감사 후보 (미실행)" 전부 실행됨

**현재** (`:108-115`):
```
- #5 Secret/Config 감사        ← 실제로는 audit-secrets-config-20260421.md 존재. 이미 완료
- #6 Playwright 커버리지 감사  ← 실제로는 audit-e2e-coverage-20260421.md 존재. 이미 완료
- #7 @Transactional 일관성      ← 실제로는 audit-transactional-20260421.md 존재. 이미 완료
- #8 에러/관측성               ← 실제로는 audit-error-observability-20260421.md 존재. 이미 완료
```

**원인**: exec summary 작성 시점(`15:45`)에는 #5만 완료 상태였고, #6·#7·#8은 그 후에 순차 작성됨. exec summary에 다시 반영하지 않음.

**영향**: 인수인계 받는 쪽이 이 문구를 보고 "4건의 감사가 아직 미실행"이라고 오인할 수 있음. P0 개수 역시 잘못 인지.

### 1.4 지표 스냅샷 누락

**현 테이블**(`:96-104`)은 프런트 라우트/API 계약/영속성/RBAC 4개 영역만 다룸. 다음 영역 **미포함**:
- Secret/Config (3 CRITICAL, 5 HIGH → exec summary에 지표 행 없음)
- E2E 커버리지 (23/23 menu, 48% runtime, 322 scenarios)
- `@Transactional` (readOnly 1/104, OSIV 암묵)
- 관측성 (MDC/Metrics/Actuator 0건)

---

## 2. 🟠 HIGH — 누락된 P0 항목

exec summary의 P0 테이블에 다음 2건이 **반드시 추가**되어야 함:

| # 제안 | 이슈 | 위치 | 공수 | 출처 |
|---|---|---|---|---|
| **P0-9** | 🚨 로그에 전화번호·FCM 토큰 평문 기록 (8곳) — 30일 보관 정책으로 파일에 누적 | `AuthService.kt:95~191`, `SmsSender.kt:31`, `PushTokenCleaner.kt:18` | 2시간 | Obs §E-1 |
| **P0-10** | 🚨 `RoleCheckAspect`의 `e.printStackTrace()` — stderr 직접 출력, logback 우회, RBAC R-3 fail-open 지점과 동일 파일 | `RoleCheckAspect.kt:110` | 5분 | Obs §E-2 |

**총 P0 공수 변동**: 기존 "1~1.5일" + 2시간 5분 ≈ 여전히 **1.5일 이내**. 배포 일정 영향 없음.

---

## 3. 🟡 MEDIUM — 중복 이슈 (인지되어 있으나 독자 입장에서 혼동)

### 3.1 `RoleCheckAspect.kt` — 3개 보고서가 다른 각도로 지적

| 보고서 | 섹션 | 지적 내용 | 라인 |
|---|---|---|---|
| admin-rbac | R-3 | `ADMIN_OR_SELF` + `targetUserId==null` fail-open | :50-51, 104 |
| admin-rbac | R-10 (P3) | 파라미터 이름 `userId` 하드코딩 — targetParam 설정 불가 | :104 |
| error-observability | E-2 | `e.printStackTrace()` 구조화 로깅 우회 | :110 |

**인지 상태**: error-observability E-2 본문에 **"RBAC R-3와 동일 PR 처리 권고"** 명시 ✅. 즉 내부 일관성은 OK이나 exec summary는 이를 묶어 표시해야 함.

### 3.2 `/v1/hospitals/bulk-upsert` — 2개 보고서가 다른 결함 지적

| 보고서 | 섹션 | 결함 | 공수 |
|---|---|---|---|
| admin-rbac | R-1 | `permitAll` — JWT 없이 호출 가능 | 10분 |
| transactional | T-9 | TRUNCATE CASCADE — 의도치 않은 범위 확장 | 계획만 |

**인지 상태**: transactional T-9에 **"RBAC §R-1의 P0와 동일 엔드포인트"** 명시 ✅.

### 3.3 `application.yml` 평문 시크릿 — 2개 보고서가 중첩

| 보고서 | 섹션 |
|---|---|
| secrets-config | S-1 (P0) `application.yml` + `.gitignore` 미포함 — AES/RSA/GCP/DB 평문 |
| error-observability | (암시) 관련 언급 없음 — 다만 logs/yml 모두 평문이라는 공통 맥락 존재 |

**인지 상태**: error-observability §13 "감사 간 교차 영향"에 **"E-1 PII + S-1 평문 yml은 '로그/파일 둘 다에 평문 존재' 맥락"** 명시 ✅.

---

## 4. 🟡 MEDIUM — 교차 참조 링크 검증

### 4.1 정상 링크

- `audit-executive-summary` → 5개 원본 보고서 모두 정상 경로
- `audit-admin-rbac:246` → api-drift, nplus1, menu-routes 정상 참조
- `audit-error-observability:5` → secrets-config, admin-rbac 정상
- `audit-transactional:5` → nplus1, admin-rbac 정상

### 4.2 의문 링크

- `audit-nplus1:6` → `AUDIT_REPORT.md §F`(성능)
  - 해당 파일 위치: `/Users/jmk0629/keymedi/medipanda-api/docs/AUDIT_REPORT.md` (백엔드 repo 내부)
  - reports 폴더 내에서는 존재하지 않음 → 상대경로 링크 깨짐
  - **권고**: `medipanda-api/docs/AUDIT_REPORT.md §F` 절대 경로 또는 주석으로 표기

### 4.3 역참조 누락

다음 보고서는 **다른 감사에서 자신을 참조하지 않음** (보이지 않는 의존성):
- `audit-e2e-coverage-20260421.md` — 어느 보고서도 참조하지 않으나, 자신은 4개 원본을 참조. 단방향 링크.
- `audit-executive-summary` 자체가 신규 3개 보고서를 참조하지 않음 (§1.1 이슈와 동일 원인)

---

## 5. ✅ 지표 간 일관성 확인 — 모두 일치

### 5.1 RBAC 지표

| 지표 | admin-rbac | exec summary |
|---|---|---|
| `@RequiredRole` 적용 컨트롤러 | 8/23 (35%) | 8/23 (35%) ✅ |
| `WebSecurityConfig` role 매처 | 0건 | 0건 ✅ |
| permitAll 중 파괴 엔드포인트 | 2건 | 2건 ✅ |

### 5.2 영속성 지표

| 지표 | nplus1 | exec summary |
|---|---|---|
| JOIN FETCH 커버리지 | 4/53 (7.5%) | 4/53 (7.5%) ✅ |
| `@EntityGraph` 사용 | 0 | 0 ✅ |

### 5.3 API 계약 지표

| 지표 | api-drift | exec summary |
|---|---|---|
| 문서∖backend 차집합 | 11 | 11 ✅ |
| backend∖문서 차집합 | 0 | 0 ✅ |

### 5.4 신규 보고서 지표 (exec summary에 미통합)

- **Transactional**: `readOnly=true` 1/104, 클래스 레벨 1/30 서비스 (exec summary 미반영)
- **Observability**: MDC 0건, Metrics 0건, Actuator 0건, PII 로그 8곳 (exec summary 미반영)
- **E2E**: 23 spec/322 scenarios, 100% menu coverage, 48% runtime pass (exec summary 미반영)

---

## 6. ✅ 우선순위 일관성 확인 — 내부 기준 통일

각 보고서가 동일 우선순위 체계(P0/P1/P2 또는 CRIT/HIGH/MEDIUM/LOW) 사용:

| 보고서 | 체계 | P0 건수 | P1 건수 |
|---|---|---|---|
| menu-routes | CRIT/HIGH/INFO | 3 CRIT | 5 HIGH |
| api-drift | (drift #로 분류) | — | — |
| nplus1 | P0/P1/P2 | 1 (ProductService 2N) | 3 |
| admin-rbac | P0/HIGH/MEDIUM/LOW | 3 | 3 |
| secrets-config | CRIT/HIGH/MEDIUM/LOW | 3 | 5 |
| e2e-coverage | P0/P1/P2 | 5 (blind spots) | — |
| transactional | P0/P1/P2 | 0 | 2 |
| error-observability | P0/P1/P2 | 2 | 3 |

**총 P0 합계**: 3 + 1 + 3 + 3 + 5 + 0 + 2 = **17건** (exec summary 기준 8건 + 신규 2건(E-1, E-2) = 10건과 불일치)

### 6.1 P0 정의 차이

- menu-routes **CRIT 3건**은 exec summary P0-3(`/admin/admins`) + P0-5(가드 누락)로 부분 흡수. 남은 1건 미반영 의심
- e2e-coverage의 **"P0 blind spot 5건"**은 exec summary에서 P0로 미분류 (테스트 부재는 예방적 조치라서 운영 배포 차단은 아니라는 판단 가능)

**권고**: exec summary에 "P0 정의" 명시 — "운영 배포를 **기술적으로 차단**하는 이슈". E2E 부재·테스트 미작성은 P0 탈락 기준. 그러면 건수 불일치 해소.

---

## 7. 🟡 MEDIUM — 한 문장 결론 갱신 필요

### 7.1 현 상태 (`audit-executive-summary:16`)

> "프런트 UI와 백엔드 컨트랙트가 모두 겉으론 동작하지만, 관리자 권한 경계와 병원 데이터 보호 경계가 둘 다 뚫려 있어..."

### 7.2 한계

- 신규 P0 2건(PII, printStackTrace) 미반영
- 관측성 0건이라는 **운영 리스크**가 한 문장에 누락 → "장애 터지면 추적 불가"

### 7.3 권고 개정안

> "프런트 UI와 백엔드 컨트랙트가 겉으론 동작하지만, **① 관리자 권한 경계·② 병원 데이터 보호 경계·③ 로그 PII 유출** 3가지 축이 뚫려 있고, **관측성 인프라(MDC/Metrics/Actuator)가 전면 부재**해 장애 대응 도구가 없다. 운영 배포 전 **P0 10건은 반드시 선결**해야 한다."

---

## 8. 🟢 INFO — 보고서 구조 일관성 검증

모든 신규 보고서(#6, #7, #8)가 동일 템플릿 준수:

1. Executive Summary + 지표 스냅샷
2. 발견 사항 (P0 → P1 → P2 순)
3. 긍정 발견 (positive findings)
4. 권장 실행 순서
5. 감사 간 교차 영향 매트릭스
6. 한 줄 결론

**이전 보고서(#1~#5)**도 유사 구조이나 "감사 간 교차 영향 매트릭스" 섹션은 일관되지 않음. 통일 권고 (장기).

---

## 9. 🟢 INFO — 중복되는 권고사항

### 9.1 배포 파이프라인 관련

- admin-rbac R-8: `/v1/test`, `/swagger-ui/**`, `/api-docs/**` 운영 배포에서 제거
- secrets-config: `.gitignore` 보강 (S-1)
- transactional T-2: `spring.jpa.open-in-view` 명시 설정
- error-observability E-9: 로그 경로 `/tmp` → `/var/log` 이동

→ **단일 "배포 체크리스트"로 통합 가능** (exec summary에 추가 권고)

### 9.2 로깅 관련

- admin-rbac (indirect): `RoleCheckAspect.printStackTrace`
- error-observability E-1 ~ E-10: 10건 일괄
- secrets-config (indirect): KMC debug 로그, SecretKey override 로그

→ error-observability가 통합해서 다루므로 정합성 OK

---

## 10. 권장 조치 (Exec Summary 갱신 작업 목록)

우선순위 순:

### 즉시 (30분)

1. **exec summary `원본 보고서` 섹션**: 5종 → **8종**으로 확장, 신규 3개 링크 추가
2. **exec summary "7. 후속 감사 후보"**: #5~#8을 "미실행" → "완료" 상태로 갱신 또는 제거
3. **exec summary P0 테이블**: P0-9(PII), P0-10(printStackTrace) 2행 추가
4. **한 문장 결론**: §7.3 권고 개정안 적용
5. **P0 총 공수**: 기존 "1~1.5일" 유지 (신규 추가분 2시간 영향 미미)

### 단기 (1시간)

6. **지표 스냅샷 테이블**: Secret/Observability/Transactional/E2E 영역 행 4개 추가
7. **실행 순서**: Day 0에 P0-10(printStackTrace) 병합 — P0-2와 같은 파일이므로 자연스러움
8. **인수인계 체크리스트**: 로그 파일 30일치 정리, 관측성 도입 결정 등 2항목 추가

### 선택 (2시간)

9. 신규 3개 보고서에 대응하는 "감사 간 교차 영향" 통합 매트릭스 작성
10. 이전 5개 보고서에 "감사 간 교차 영향" 섹션 역소급 추가

---

## 11. 한 줄 결론

> **보고서 8개(+ 1개 구버전 아카이브)는 내부 일관성·지표 정확성·교차 참조 측면에서 양호**하나, **executive-summary가 작성 이후 3개 신규 감사(#6·#7·#8)를 반영하지 않아 stale 상태**다. 신규 P0 2건이 추가됐고 "미실행"으로 표기된 4건은 모두 완료됐다. **1시간 내 갱신이면 인수인계 팩 전체가 정합해진다.**

---

## 12. 부록 — 파일별 라인 수 (참조)

| 파일 | 라인 수 | 최신 |
|---|---:|---|
| audit-menu-routes-20260421.md | 약 250 | 04-21 14:51 |
| audit-api-drift-20260421.md | 약 270 | 04-21 15:21 |
| audit-nplus1-20260421.md | 약 290 | 04-21 15:28 |
| audit-admin-rbac-20260421.md | 약 250 | 04-21 15:32 |
| audit-secrets-config-20260421.md | 약 290 | 04-21 15:45 |
| audit-executive-summary-20260421.md | 125 | 04-21 15:45 🔴 |
| audit-e2e-coverage-20260421.md | 약 220 | 04-21 15:51 |
| audit-transactional-20260421.md | 약 250 | 04-21 16:00 |
| audit-error-observability-20260421.md | 약 380 | 04-21 16:13 |
| audit-consistency-check-20260421.md | (본 문서) | 04-21 16:25 |

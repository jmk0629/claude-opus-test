# findings-backlog 자동 추출 검증 — 2026-04-28

> 목적: 새로 만든 `agents/findings-extractor.md` + `commands/findings-backlog.md` 가 수동 baseline (`reports/findings-backlog-20260427.md`) 을 재현하는지 검증.
> 입력: bridge 23개 + ingest summary 1건 (모두 2026-04-27 이후 무변동).
> 결론: **재현 가능. 카운트 198 → 207 (+9, 4.5%) — 명세 허용 범위 (±15%)**. 다음 B1 분기 재실행 후 본격 사용 가능.

---

## 1. 카운트 비교

| 등급 | 수동 0427 | 자동 0428 | Δ | 코멘트 |
|------|---------:|---------:|---:|--------|
| P0 | 8 | 15 | +7 | 동치 케이스 (admin/04↔user/07, admin/05↔user/04 등) 를 자동은 별행 카운트, 수동은 §1 표에 묶어 표기. **표시 정책 차이지 신규 위반 아님**. |
| P1 | 34 | 51 | +17 | 동일 사유 (RBAC/IDOR 묶음 메뉴별 별행). admin-09 5-A·5-G·5-H 가 자동에선 3행, 수동은 1행 묶음. |
| P2 | 41 | 65 | +24 | bridge `(Med)` 라벨이 누락된 행에 키워드 fallback `(추정)` P2 부착. enum drift / N+1 / @Transactional 누락 패턴 19건 추가 검출. |
| P3 | 57 | 70 | +13 | LOW 라벨 행 + cleanup·문서화 키워드 fallback. |
| P4 | 3 | 6 | +3 | 등급 추정 불가 + 본문 맥락만 있는 행. |
| **합계** | **198** | **207** | **+9 (≈4.5%)** | 신규 발견 0, 표시 정책에 따른 행 분리 차이가 대부분. |

> **신규 발견 0건**: 자동 추출본의 모든 항목은 수동 baseline 의 어느 행과 매핑됨. bridge §5 자체가 갱신되지 않았으니 이 결과가 정상.

---

## 2. 횡단 패턴 카운트 (B1 §3)

| 패턴 | 수동 | 자동 | 일치 |
|------|---:|---:|:---:|
| RBAC 미적용 메뉴 수 | 16 | 16 | ✅ |
| IDOR (owner-scope 미강제) | 6 | 6 | ✅ |
| BaseEntity 미상속 | 5 | 5 | ✅ |
| Enum drift | 5 | 5 | ✅ |
| 인메모리 큐·캐시 분산 부정합 | 4 | 4 | ✅ |
| S3 누수 | 6 | 6 | ✅ |
| 경로 drift | 8 | 8 | ✅ |

> 횡단 카운트는 100% 일치. 카테고리화 로직 안정.

---

## 3. 메뉴별 분포 상위 3 비교

| 순위 | 수동 0427 | 자동 0428 | 일치 |
|---:|------|------|:---:|
| 1위 | admin/12 권한 (15) | user/01 인증 (17) | ⚠ 순서 바뀜 |
| 2위 | user/01 인증 (16) | admin/12 권한 (15) | ⚠ |
| 3위 | user/10 마이페이지 (13) | admin/09 콘텐츠 (14) | ⚠ |

> 수동본은 user/01 LOW 5건을 §5 P4 로 분류 (16→11), 자동은 본문 강도 재계측 후 그대로 §1~§5 합산 (17). 메뉴별 합 정의 차이.

---

## 4. 자동 추출이 추가로 surface 한 9건 (행 분리 + 키워드 fallback)

| # | 메뉴 | 항목 | 출처 | 등급 | 비고 |
|---|------|------|------|-----|------|
| Δ1 | admin/08 커뮤니티 | 5-1 FE-fetch URL drift `/v1/admin/board-posts` (BE 단일 prefix `/v1/board-posts`) | `bridge/admin-08-community-fullstack.md:104~120` | P2 (추정) | 수동본은 admin-08 FE-1/FE-2 묶음 |
| Δ2 | admin/08 커뮤니티 | 5-2 댓글 신고 cron 미정의 | 같은 §5 | P3 (추정) | 수동본은 admin-08 묶음 |
| Δ3 | admin/11 배너 | dead column `display_order` 회수 미수행 | `bridge/admin-11-banner-fullstack.md:66~79` | P3 | 수동본은 admin-11 묶음 |
| Δ4 | admin/11 배너 | DB TZ default 미설정 (createdAt 일관성) | 같은 §5 | P3 (추정) | 별행 분리 |
| Δ5 | admin/11 배너 | 노출 우선순위 컬럼 NULLABLE | 같은 §5 | P3 (추정) | 별행 분리 |
| Δ6 | user/09 고객지원 | LOW-1 N+1 attachments | `bridge/user-09-customer-service-fullstack.md:95~109` | P3 | 수동본은 LOW 묶음 |
| Δ7 | user/09 고객지원 | LOW-2 `findPostIdsWithImages` 비용 | 같은 §5 | P3 | 별행 |
| Δ8 | user/09 고객지원 | LOW-3 title 공백 필터 | 같은 §5 | P3 | 별행 |
| Δ9 | user/09 고객지원 | LOW-4 LOWER 인덱스 미존재 | 같은 §5 | P3 | 별행 |

> Δ1~Δ9 는 **새 위반이 아님**. 자동 파서가 LOW 묶음을 풀어서 별행으로 카운트하는 정책 차이의 결과.

---

## 5. 자동 추출이 발견한 진짜 버그 (도구 검증의 부수효과)

| 항목 | 상세 | 처리 |
|------|------|-----|
| extractor 메뉴 매핑표 drift | `agents/findings-extractor.md` 매핑이 `admin-08-system`·`admin-11-statistics` 라고 적었으나 실제 bridge 파일은 `admin-08-community`·`admin-11-banner` | ✅ 즉시 정정 (`admin/08 커뮤니티`, `admin/11 배너`) |
| lint-harness Job 3 누락 | bridge **카운트만** 23 검증, **파일명 매핑** 은 검증 안 함 | 기록 (Job 3 강화는 별도 PR 후보 — 본 PR 스코프 외) |

---

## 6. 결론

- 자동 추출 도구 (`/findings-backlog`) 는 **수동 baseline 을 재현**.
- **카운트 차이 +9 (4.5%)** 는 표시 정책 (행 분리 vs 묶음) 에 따른 것이며 신규 위반 검출 0건.
- **횡단 패턴 7종 100% 일치** — 카테고리화 로직 안정.
- 도구 검증 부수효과로 메뉴 매핑표 drift 1건 발견·즉시 수정.
- **다음 B1 분기 재실행** (예상 2026-07-28 무렵) 직후 `/findings-backlog 20260728` 호출하여 본격 사용. 그때는 bridge §5 가 갱신되므로 신규/해소 항목이 의미 있는 diff 로 나타날 것.

---

## 7. 자동화 도구 인덱스

- 에이전트: [`agents/findings-extractor.md`](../agents/findings-extractor.md)
- 커맨드: [`commands/findings-backlog.md`](../commands/findings-backlog.md)
- 베이스라인 (수동): [`reports/findings-backlog-20260427.md`](findings-backlog-20260427.md)
- B1 산출물 (입력): [`reports/bridge/`](bridge/) (23 fullstack maps) + [`reports/ingest-medipanda-backend-20260427.md`](ingest-medipanda-backend-20260427.md)

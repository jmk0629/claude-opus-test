# Medipanda 전체 시스템 아키텍처 — 2026-04-16 인수인계 미팅

**출처**: `~/Downloads/Keymedi 업무/20260417 메디판다 회의 AI 정리본/medipanda-full-architecture.html`
**미팅 일자**: 2026-04-16
**정리 일자**: 2026-04-17 (HTML → Markdown 변환 + 하네스 관점 주석 추가)

> HTML 인포그래픽을 검색·grep 가능한 md로 재구성. 원본의 시각 요소(색상/아이콘)는 제외하고 **사실 정보 + 하네스 자동화와의 연관성**만 보존.

---

## 0. 최상위 요약

- **AWS Account**: `knmedicine` (2155-3481-7917) · 리전 `ap-northeast-2` (서울)
- **GitHub Organization**: 신규 생성 예정 (초대 대기)
- **서비스 구성**: 웹(User+Admin, React) + 모바일(Flutter) + 백엔드 3종(API / OCR / Inference) + 데이터(RDS + S3 + CloudFront)
- **배치**: 3종 (sbert 벡터 / 병의원 스크래퍼 / KHIS 제품) — 각자 실행 방식 다름
- **권고**: Terraform, Backstage, OpenSearch, AWS Bedrock(도쿄), PortOne 도입

---

## 1. 서비스 아키텍처

### 1.1 클라이언트 계층

| 앱 | 스택 | 빌드/배포 | 도메인 |
|----|------|-----------|--------|
| **User Web** | React | `npm run build-prod` / `build-dev` → SCP → Nginx (EC2) | `medipanda.co.kr` |
| **Admin Web** | React (**같은 프로젝트** 내 별도 Provider & Route) | SCP → Nginx (EC2) | `admin.medipanda.co.kr` |
| **Mobile App** | Flutter | 테스트: Firebase App Distribution / 스토어: GitHub Actions | Play / App Store |

### 1.2 API 호출 관계

- User Web → Backend API (대부분의 기능)
- Admin Web → Backend API (대부분의 기능)
- User Web → **OCR App** (EDI 처방전 4점 촬영 → 분석 요청만 직접 호출)
- Mobile App → Backend API

### 1.3 백엔드 서비스 계층 (EC2)

#### knmedicine API (Backend)

- **스택**: Kotlin Spring Boot · **Java 17** · JPA
- **구조**: Controller → Service → Repository (MVC)
- **빌드**: Gradle Kotlin DSL, `libs.versions.toml` (버전 카탈로그)
- **ORM**: JPA + JPQL (**QueryDSL 미사용**)
- **인증**: Spring Security + **KMC 본인인증 (JAR)**
- **스케줄러**: 인스턴스 내장 (**단일 인스턴스 가정**)
- **프로파일**: `broker` / `db` / `local` / `dev` / `prod`
- **예외처리**: `GlobalExceptionHandler` (400 반환)
- **서버**:
  - prod: `3.39.216.231` (t3.medium)
  - dev: `43.202.151.248` (t3.medium)
- **Java 17인 이유**: KMC 본인인증 서비스가 구형이라 JAR를 직접 빌드에 포함 → 버전 다운그레이드
- **권고**: KMC → PortOne (KG이니시스) API 전환

#### medipanda-ocr-app

- **스택**: Kotlin Spring Boot
- **역할**: 처방전(EDI) 이미지 → 데이터 추출
- **파서**: **109개 룰베이스 파서** (EDI 타입별, `MainParser` 상속)
- **AI**: Claude API (프롬프트 기반 분석)
- **서버**: `13.209.69.219` (t3.medium)

### 1.4 추론 / 외부 연동

#### medipanda-inference-app

- **스택**: Python FastAPI · **sbert 벡터 검색** (CPU only)
- **역할**: 제품명 자연어 유사 검색
- **서버**: `54.180.99.115` (c6i.large)
- **배치**: 매일 03:00 벡터 재생성 (**실제 실행은 로컬 Mac Mini**, 아래 4절 참고)

#### 외부 API

| 이름 | 용도 | 호출 주체 |
|------|------|-----------|
| **Naver OCR API** | EDI 이미지 → 좌표(x,y) + 텍스트 | OCR App |
| **Claude API (Anthropic)** | EDI 표 매핑 LLM 추론 (현재 선불제 $100) | OCR App |

**권고**: Claude → **AWS Bedrock (도쿄 리전)** — 후불제, 속도 개선, 인프라 통합.

### 1.5 데이터 계층 (VPC `vpc-0c034143387ecfdde`)

| 자원 | 스펙 |
|------|------|
| **RDS PostgreSQL 17.4** | db.t3.medium · AZ 2d · 포트 5432 · 200 GiB gp3 · KMS 암호화 · 백업 7일 · **인터넷 비활성** · `medipanda.cp6gkgc82mif.ap-northeast-2.rds.amazonaws.com` |
| **S3 (medipanda 버킷)** | `app/` (배포) · `attachments/` · `inference-model/` (sbert 벡터) · `product/` · `training-data/` |
| **CloudFront CDN** | `cdn.medipanda.co.kr` → `d2pkqqipx6ipqz.cloudfront.net` → S3 |

---

## 2. 개발 환경 & CI/CD

### 2.1 로컬 개발

- **IDE**: IntelliJ IDEA (유료 권장) / VS Code
- **Java 관리**: sdkman
- **DB 클라이언트**: TablePlus
- **빌드**: Gradle Kotlin DSL
- **실행 프로파일**: `active: local` 또는 `dev`

### 2.2 Mac Mini (M4 Pro) — 배치 전용

- **역할**: sbert 벡터 생성 배치
- **이유**: AWS EC2(c6i.large)에서 CPU 100% 먹통 → 로컬 Mac Mini로 이전
- **스케줄**: 매일 03:00 자동 실행
- **결과 경로**: S3 업로드 → `inference-app` 시작 시 로드
- **수동 실행**: API 호출로 즉시 가능
- **KHIS 제품 업데이트 시**: 월 1회 → **배치 재실행 필요**

### 2.3 GitHub Organization (신규)

| 리포지토리 | 스택 |
|------------|------|
| `medipanda-api` | Kotlin Spring Boot (백엔드) |
| `medipanda-ocr-app` | Kotlin Spring Boot (OCR) |
| `medipanda-inference-app` | Python FastAPI (추론) |
| `medipanda-web` | React (User + Admin) ← **본 하네스의 대상** |
| `medipanda-app` | Flutter (모바일) |
| `medipanda-hospital-scraper` | Python (병의원 수집) |
| `medipanda-windows` | .NET (윈도우 도구) |

### 2.4 GitHub Actions

| 대상 | 트리거 | 플로우 |
|------|--------|--------|
| **백엔드 (API, OCR)** | 수동 | 브랜치 선택 → Docker 빌드 → EC2 배포 |
| **프론트엔드 (Web)** | `npm run build` | SCP로 EC2 Nginx 배포. `package.json`의 `deploy-prod-all`/`deploy-dev-all` |
| **모바일 (Flutter)** | - | `test-deploy` (Firebase) / `build-android-playstore` / `build-ios-playstore` |
| **병의원 스크래퍼** | 매주 일요일 03:00 (무료 티어) | Selenium → 정부 사이트 크롤링 → API bulk upsert |

### 2.5 배포 대상 (AWS EC2 · Docker)

| 서버 | 스펙 | IP | 역할 |
|------|------|----|----|
| prod-medipanda-app | t3.medium | `3.39.216.231` | Backend API + Nginx (Frontend) |
| dev-medipanda-app | t3.medium | `43.202.151.248` | Backend API + Nginx (Frontend, **쿼리 로그 활성화**) |
| medipanda-ocr-app | t3.medium | `13.209.69.219` | OCR + Claude 분석 |
| medipanda-inference-app | c6i.large | `54.180.99.115` | FastAPI + sbert |

---

## 3. EDI 처방전 분석 파이프라인

### 3.1 흐름

```
프론트 (4점 촬영) → OCR App 전송 → Naver OCR API → 좌표+텍스트 수신
    → 라인 정렬/보정 → 파서 또는 Claude 분석 → 결과 → 프론트
```

### 3.2 분석 방식 A — 룰베이스 파서 (109개)

- `MainParser` (베이스) 상속 → EDI 타입별 파서 구현
- 좌표 기반 라인 분리, 삐뚤어짐 보정
- **청구코드 매핑** (없으면 → 제품명 매핑)
- 한계: **매달 새 케이스 추가 필요**

### 3.3 분석 방식 B — Claude API LLM 추론

- 프롬프트에 OCR 결과 + 매핑 규칙 전달
- Claude가 표 구조 파악 → 코드 매핑
- 장점: 룰베이스 대비 유연성 높음
- 한계: **프롬프트 지속 개선 필요** (예외 케이스)

### 3.4 개선 포인트

- 이미지 전처리 (노이즈 판단 → 선택적 제거)
- Claude 프롬프트 지속 개선

---

## 4. 배치 작업 & 스케줄

**중요**: 각 배치마다 실행 방식이 다름. 아래 표가 **사실**.

| 배치 | 주기 | 실행 위치 | 실행 방식 |
|------|------|-----------|-----------|
| **sbert 벡터 생성** | 매일 03:00 | **로컬 Mac Mini (M4 Pro)** | 자동 (EC2 먹통 이슈로 이전) |
| **병의원 데이터 수집** | 매주 일요일 03:00 | **GitHub Actions** (무료 티어) | 자동 (Python + Selenium) |
| **KHIS 제품 데이터 업데이트** | 월 1회 | **Windows PC** (.NET 도구, Mac 불가) | **수동** (엑셀 수신 → 업로드 → DB 갱신 → 벡터 배치 재실행) |

### 4.1 sbert 벡터 생성

- DB 전체 제품명 → 정규화 → 벡터화 → S3 업로드
- `inference-app` 시작 시 로드
- 수동 실행도 API 호출로 가능

### 4.2 병의원 스크래퍼

- Python + Selenium WebDriver
- 정부 사이트 크롤링 → 엑셀 다운로드 → 파싱 → API bulk upsert (`v1/hospital`)
- **주의**: 주소 예외처리 다수 (세종시 구 없음, 성남시/분당구, 고양시 등)
- 권고: 공공 API 전환 검토

### 4.3 KHIS 제품 업데이트

- 엑셀 파일 수신 → **윈도우 도구(.NET)** 통해 업로드 → DB 갱신
- 후속: sbert 벡터 배치 재실행 필요
- 윈도우 도구는 Mac 불가 → **별도 Windows PC 필요**

---

## 5. DNS & 도메인 매핑 (Route53)

### 5.1 Production → `3.39.216.231`

- `medipanda.co.kr` — 사용자 웹
- `admin.medipanda.co.kr` — 관리자 웹
- `prod.api.medipanda.co.kr` — API 엔드포인트

### 5.2 Development → `43.202.151.248`

- `dev.medipanda.co.kr` — 사용자 웹 (개발)
- `admin.dev.medipanda.co.kr` — 관리자 웹 (개발)
- `dev.api.medipanda.co.kr` — API 엔드포인트 (개발)

### 5.3 CDN

- `cdn.medipanda.co.kr` → `d2pkqqipx6ipqz.cloudfront.net` → S3

---

## 6. 개선 권장사항 (미팅 기반)

### 6.1 인프라

- **Terraform** 도입 → IaC로 AWS 자원 관리
- **Backstage** (Spotify 오픈소스) → 개발자 포털
- **OpenSearch** → 로그 수집 (현재 Docker logs만 사용)
- **AWS Bedrock** (도쿄 리전) → Claude API 대체
- Mac Mini → **모바일 빌드 머신** 전용 구성 검토

### 6.2 서비스

- **KMC → PortOne** (KG이니시스) 본인인증 전환
- EDI **이미지 전처리** 추가
- Claude 프롬프트 지속 개선
- **ClickUp → 자체 관리** (6월까지 백업 필요)
- **보안그룹 IP** 추가 (새 개발자 접근용)
- 병의원 스크래퍼: **공공 API 전환** 검토

---

## 7. 인수인계 주요 참고사항

### 7.1 계정 & 접근

- AWS Account: **knmedicine** (2155-3481-7917)
- IAM: **knm-jinam23** (AdministratorAccess)
- GitHub: Organization 신규 생성 → 초대 예정
- 서버 접근: 보안그룹 IP 등록 필요
- MFA: Google Authenticator 권장

### 7.2 인수인계 TODO

- README.md 작성 예정 (실행/배포/환경설정)
- 서비스 의도 & 기획 설명 세션 필요
- ClickUp 데이터 백업 (6월 전)
- GitHub Org 레포지토리 생성 → 코드 Push
- **프론트엔드 레포 public → private 전환 필요**

---

## 8. claude-opus-test 하네스와의 연관성

이 아키텍처 문서를 하네스 관점에서 읽으면 다음 연계점이 생김.

### 8.1 B1 `/ingest-medipanda-backend` 재평가

- 기존 계획: 외주 소스 수령 후 `/ingest-backend` (Spring Boot 6-에이전트) 1회 실행
- **본 문서의 힌트**로 커스텀 필요:
  - 스택 확정: **Kotlin + Java 17 + JPA/JPQL** (QueryDSL 없음) — 기존 `/ingest-backend`는 QueryDSL 전용 repository-analyzer 가정이 있으므로 **JPQL 전용 분기**로 수정
  - 프로파일 5종(`broker`/`db`/`local`/`dev`/`prod`) 존재 — config-analyzer가 전수 파악해야 함
  - **KMC JAR**가 `libs/` 같은 수동 관리 경로에 있을 가능성 → classpath 스캔 시 분리 표기
  - 엔드포인트는 `prod.api.medipanda.co.kr` / `dev.api.medipanda.co.kr` — CORS/hosts 설정 감사 항목

### 8.2 B2 `/playbook-status` P1-03 "배치" 재평가

- 기존 리포트(`reports/playbook-status-20260417.md`)는 `docs/BATCH_ANALYSIS.md`를 단독 증거로 **✅** 처리
- **본 문서 기준 실제 배치는 3건** (sbert / 병의원 / KHIS), 실행 방식이 **각기 다름**:
  - `docs/BATCH_ANALYSIS.md`가 이 3건을 올바르게 반영하는지 확인 후 평가 ✅ 유지 또는 ⚠️로 강등
  - 해당 문서에 "별도 서버" vs "로컬 Mac Mini" vs "GitHub Actions" vs "Windows 수동" 실행 맥락이 없다면 **⚠️ (분류는 있으나 실행 맥락 누락)**

### 8.3 C1 `/pr-context` DB 매퍼 보강

- `db-mapper`는 현재 메뉴 문서 인덱스에서 테이블을 유추
- 실제 DB는 **RDS PostgreSQL 17.4** — 향후 SQL 스키마 덤프를 받으면 직접 연결 검증 가능
- 프로덕션 RDS는 인터넷 비활성이므로 쿼리 직접 접근은 **개발자 로컬 + VPN 또는 bastion** 경유 필요

### 8.4 인프라 자동화 후보 (D 시리즈 재검토)

- D1 `/db-impact`는 PostgreSQL 17.4 기준 마이그레이션 스크립트 분석으로 구체화 가능
- **신규 후보 D4 `/iac-audit`**: Terraform 미도입 상태 → 현재 수동 AWS 리소스(EC2 4대 + RDS + S3 + CloudFront + Route53)와 IaC 목표 간 diff 추적
- **신규 후보 D5 `/batch-health`**: 3종 배치(sbert / 병의원 / KHIS) 각 성공·실패 여부와 S3 산출물 존재 확인 (Mac Mini 의존 배치가 끊겼을 때 감지)

---

## 9. 이 문서의 사용법

- **신규 입사자**: 0절 + 1절 + 7절만 읽으면 개괄 파악 (~10분)
- **백엔드 인수 담당**: 1.3 + 2 + 4절 정독 (~20분)
- **하네스 유지보수(개인)**: 8절만 — PR 설계 시점에 다시 열기

---

## 변경 이력

- 2026-04-17: HTML 원본 최초 변환 + 하네스 관점 8절 추가

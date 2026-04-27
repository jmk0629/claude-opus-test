-- V1.5: 거래·계약 테이블에 BaseEntity 감사 컬럼 보강
-- 출처: B1 Phase 2 횡단 발견 #4 — "BaseEntity 미상속 거래 테이블" 리스크 해소
-- 영향 메뉴 예상: admin/05 처방, user/04 처방, admin/03 거래처, user/11 파트너 계약, admin/06 정산

-- 1. prescription_partner: 처방-거래처 N:N 이력 추적 보강
ALTER TABLE prescription_partner
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE prescription_partner
    ADD COLUMN modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. partner_contract_file: 계약 첨부 파일 갱신 시점 추적
ALTER TABLE partner_contract_file
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE partner_contract_file
    ADD COLUMN modified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- UNIQUE 추가로 중복 등록 차단 (Phase 2 user/11 R2 stale 파일 리스크 해소)
ALTER TABLE partner_contract_file
    ADD CONSTRAINT uk_partner_contract_file_contract_kind UNIQUE (partner_contract_id, file_kind);

-- 3. banner_file: 배너 이미지 교체 이력 + 소프트 삭제 컬럼 추가 (admin/11 R3)
ALTER TABLE banner_file
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE banner_file
    ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. 인덱스 보강 (성능)
CREATE INDEX idx_prescription_partner_created_at ON prescription_partner (created_at);
CREATE INDEX idx_partner_contract_file_modified_at ON partner_contract_file (modified_at);

-- 실데이터(블랙크랙원 로스터스) 구조 반영:
-- 생두(a00xxx, 원재료) ↔ 원두(00xxx, 제품)가 짝으로 운영됨 → 간이 BOM의 기초
ALTER TABLE item ADD COLUMN paired_item_id INTEGER REFERENCES item(id);  -- 제품(원두)에 연결된 생두
ALTER TABLE item ADD COLUMN default_yield REAL NOT NULL DEFAULT 85.0;    -- 로스팅 기본 수율(%)

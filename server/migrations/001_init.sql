-- Phase 0: 마스터 테이블
-- 규칙: 금액은 원 단위 정수(INTEGER), 수량은 REAL(kg 소수 1자리)

CREATE TABLE item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 품목코드
  name TEXT NOT NULL,                        -- 품목명
  spec TEXT DEFAULT '',                      -- 규격
  unit TEXT NOT NULL DEFAULT 'kg',           -- 단위
  item_type TEXT NOT NULL DEFAULT '제품'
    CHECK (item_type IN ('원재료','부자재','제품','상품')),
  price_in INTEGER NOT NULL DEFAULT 0,       -- 입고단가(원)
  price_out INTEGER NOT NULL DEFAULT 0,      -- 출고단가(원). 0 = 싯가(주문 시 직접 입력)
  safety_qty REAL NOT NULL DEFAULT 0,        -- 안전재고수량
  use_lot INTEGER NOT NULL DEFAULT 0,        -- 로트 관리 여부
  is_set INTEGER NOT NULL DEFAULT 0,         -- 세트품목 여부
  barcode TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE partner (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 거래처코드
  name TEXT NOT NULL,                        -- 거래처명
  biz_no TEXT DEFAULT '',                    -- 사업자번호
  ceo TEXT DEFAULT '',                       -- 대표자
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  partner_type TEXT NOT NULL DEFAULT '매출'
    CHECK (partner_type IN ('매출','매입','매출+매입')),
  pay_cycle TEXT NOT NULL DEFAULT '당일'
    CHECK (pay_cycle IN ('당일','월별')),     -- 입금주기 (기존 앱 개념)
  memo TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE warehouse (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  wh_type TEXT NOT NULL DEFAULT '창고' CHECK (wh_type IN ('창고','공장')),
  memo TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  memo TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

-- 특별단가: 거래처 × 품목 (기존 앱의 '예외단가')
CREATE TABLE price_special (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  price INTEGER NOT NULL,                    -- 출고단가(원)
  memo TEXT DEFAULT '',
  UNIQUE (partner_id, item_id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

INSERT INTO settings (key, value) VALUES
  ('company_name', ''),
  ('company_ceo', ''),
  ('company_biz_no', ''),
  ('company_address', ''),
  ('company_phone', ''),
  ('batch_kg', '5'),          -- 로스터 1배치 배출량(kg) — 기센 W6 기준
  ('vat_round', 'floor');     -- 부가세 원미만 처리: floor(절사) | round(반올림)

INSERT INTO warehouse (code, name, wh_type) VALUES
  ('100', '본사창고', '창고'),
  ('200', '로스팅공장', '공장');

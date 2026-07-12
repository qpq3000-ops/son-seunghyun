-- Phase 1: 전표 엔진 (doc / doc_line / stock_ledger / doc_seq / receipt)
-- 규칙(001과 동일): 금액은 원 단위 정수(INTEGER), 수량은 REAL(kg 소수 1자리).
-- 재고의 유일한 진실 = stock_ledger (append-only). 재고현황/수불부는 전부 이 원장의 집계다.
-- 전표 저장/수정/삭제 시 원장을 트랜잭션 안에서 재작성한다.

-- ── 전표 헤더 ───────────────────────────────────────────────
CREATE TABLE doc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,                        -- 전표번호 'YYYYMMDD-N' (일자+유형별 순번). 최초 채번값 불변, 삭제해도 재사용 안 함
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('sale','purchase','roast')),   -- 판매 / 구매 / 로스팅
  io_date TEXT NOT NULL,                       -- 일자 'YYYY-MM-DD'
  partner_id INTEGER REFERENCES partner(id),   -- 거래처. 로스팅(roast)은 NULL
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(id),  -- 판매=출하창고 / 구매=입고창고 / 로스팅=공장
  tax_mode TEXT NOT NULL DEFAULT '과세'
    CHECK (tax_mode IN ('과세','면세')),          -- 로스팅은 '면세'로 저장(금액 0)
  project_id INTEGER REFERENCES project(id),
  memo TEXT NOT NULL DEFAULT '',               -- 적요
  total_qty REAL NOT NULL DEFAULT 0,           -- 라인 수량 합(캐시). roast는 산출 수량
  total_supply INTEGER NOT NULL DEFAULT 0,     -- 공급가액 합(캐시)
  total_vat INTEGER NOT NULL DEFAULT 0,        -- 부가세 합(캐시)
  total_amount INTEGER NOT NULL DEFAULT 0,     -- 합계(공급가액 + 부가세)
  yield_pct REAL,                              -- 로스팅 수율(%) — 판매/구매는 NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (doc_type, doc_no)                    -- 번호는 유형별로 유일 (판매·구매가 같은 날 같은 번호일 수 있음)
);
CREATE INDEX idx_doc_type_date ON doc (doc_type, io_date);
CREATE INDEX idx_doc_partner   ON doc (partner_id);

-- ── 전표 품목 라인 ─────────────────────────────────────────
CREATE TABLE doc_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES doc(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,                    -- 1부터의 라인 순번
  item_id INTEGER NOT NULL REFERENCES item(id),
  line_role TEXT NOT NULL DEFAULT 'normal'
    CHECK (line_role IN ('normal','input','output')),
    -- normal = 판매/구매 라인, input = 로스팅 투입(생두), output = 로스팅 산출(원두)
  qty REAL NOT NULL DEFAULT 0,                 -- kg. 항상 양수로 저장(입출고 방향은 stock_ledger가 결정)
  price INTEGER NOT NULL DEFAULT 0,            -- 단가(원). 로스팅 라인은 0
  supply_amt INTEGER NOT NULL DEFAULT 0,       -- 공급가액(서버 계산)
  vat_amt INTEGER NOT NULL DEFAULT 0,          -- 부가세(서버 계산)
  remarks TEXT NOT NULL DEFAULT ''             -- 라인 적요
);
CREATE INDEX idx_line_doc  ON doc_line (doc_id);
CREATE INDEX idx_line_item ON doc_line (item_id);

-- ── 재고수불원장 (append-only. 전표 저장/수정/삭제 시 트랜잭션 안에서 재작성) ──
CREATE TABLE stock_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES doc(id) ON DELETE CASCADE,        -- 원천 전표
  doc_line_id INTEGER REFERENCES doc_line(id) ON DELETE CASCADE,
  io_date TEXT NOT NULL,                       -- doc.io_date 사본(기간 필터·인덱스용)
  item_id INTEGER NOT NULL REFERENCES item(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(id),
  io_type TEXT NOT NULL
    CHECK (io_type IN ('구매','판매','생산입고','생산소모','기타입고','기타출고')),
    -- 입고: 구매/생산입고/기타입고,  출고: 판매/생산소모/기타출고
  qty REAL NOT NULL,                           -- 부호 있는 수량: +입고 / -출고 (SUM(qty) = 현재고)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_ledger_item_date ON stock_ledger (item_id, io_date);
CREATE INDEX idx_ledger_wh_item   ON stock_ledger (warehouse_id, item_id, io_date);
CREATE INDEX idx_ledger_doc       ON stock_ledger (doc_id);

-- ── 채번 카운터 (일자 + 유형별. 재사용 금지: 삭제해도 last_no를 감소시키지 않는다) ──
CREATE TABLE doc_seq (
  io_date TEXT NOT NULL,                       -- 'YYYYMMDD' (하이픈 제거형)
  seq_key TEXT NOT NULL,                       -- 'sale' | 'purchase' | 'roast' | '수금' | '지불'
  last_no INTEGER NOT NULL DEFAULT 0,          -- 마지막으로 발급한 순번 (단조 증가)
  PRIMARY KEY (io_date, seq_key)
);

-- ── 수금/지불 (품목 라인이 없고 금액+결제수단만 → doc과 분리한 별도 테이블) ──
--   미수금 = 판매 합계 − 수금 합계,  미지급 = 구매 합계 − 지불 합계 (거래처별 집계)
CREATE TABLE receipt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL,                    -- 'YYYYMMDD-N' (doc_seq로 채번)
  kind TEXT NOT NULL CHECK (kind IN ('수금','지불')),
  io_date TEXT NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partner(id),
  method TEXT NOT NULL DEFAULT '보통예금'
    CHECK (method IN ('현금','보통예금','받을어음','카드','기타')),   -- 결제수단
  amount INTEGER NOT NULL DEFAULT 0,           -- 금액(원)
  project_id INTEGER REFERENCES project(id),
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (kind, receipt_no)
);
CREATE INDEX idx_receipt_kind_date ON receipt (kind, io_date);
CREATE INDEX idx_receipt_partner   ON receipt (partner_id);

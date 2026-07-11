-- Phase 1.5: 전표 체인(견적/주문/발주) + 기타이동 4종 (마이그레이션 004)
-- 규칙(003과 동일): 금액 INTEGER(원), 수량 REAL(kg). 재고의 유일한 진실 = stock_ledger.
-- doc 헤더에 진행상태/전표체인/납기일자/받는창고 컬럼을 더하고 doc_type CHECK 목록을 확장한다.
-- SQLite는 CHECK 제약을 ALTER로 못 바꾸므로 doc 테이블을 재빌드한다. 재빌드 시 자식(doc_line/stock_ledger)이
-- ON DELETE CASCADE로 지워지지 않도록 FK 없는 임시표로 백업했다가 되돌린다(러너가 트랜잭션 안에서 실행 → 원자적).

-- ── ① doc에 신규 컬럼 추가 ──────────────────────────────────
ALTER TABLE doc ADD COLUMN status TEXT NOT NULL DEFAULT '완료';       -- 진행상태: 견적/주문/발주='대기'|'완료', 그 외='완료'
ALTER TABLE doc ADD COLUMN source_doc_id INTEGER;                     -- 끌어오기 원본 전표 id(견적→주문→판매, 발주→구매)
ALTER TABLE doc ADD COLUMN time_date TEXT;                            -- 납기일자(주문서/발주서) 'YYYY-MM-DD'. 없으면 NULL
ALTER TABLE doc ADD COLUMN wh_to_id INTEGER REFERENCES warehouse(id); -- 창고이동 받는창고(그 외 NULL)

-- ── ② 자식 테이블 백업(FK 없는 임시표) ─────────────────────
CREATE TABLE _mig_doc_line AS SELECT * FROM doc_line;
CREATE TABLE _mig_ledger   AS SELECT * FROM stock_ledger;

-- 자식을 비워 doc DROP 시 CASCADE가 지울 게 없도록 함(백업은 위 임시표에 보존됨)
DELETE FROM stock_ledger;
DELETE FROM doc_line;

-- ── ③ doc 재빌드(doc_type CHECK 확장 + 신규 컬럼 포함) ──────
CREATE TABLE doc_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('sale','purchase','roast',
                        'quote','order','purchase_order',
                        'move','self_use','defect','adjust')),
  io_date TEXT NOT NULL,
  partner_id INTEGER REFERENCES partner(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(id),
  tax_mode TEXT NOT NULL DEFAULT '과세' CHECK (tax_mode IN ('과세','면세')),
  project_id INTEGER REFERENCES project(id),
  memo TEXT NOT NULL DEFAULT '',
  total_qty REAL NOT NULL DEFAULT 0,
  total_supply INTEGER NOT NULL DEFAULT 0,
  total_vat INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  yield_pct REAL,
  status TEXT NOT NULL DEFAULT '완료',
  source_doc_id INTEGER REFERENCES doc(id) ON DELETE SET NULL,  -- 원본 삭제 시 연결만 끊고 자식 전표는 유지
  time_date TEXT,
  wh_to_id INTEGER REFERENCES warehouse(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (doc_type, doc_no)
);

INSERT INTO doc_new
  (id, doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode, project_id, memo,
   total_qty, total_supply, total_vat, total_amount, yield_pct,
   status, source_doc_id, time_date, wh_to_id, created_at, updated_at)
SELECT
   id, doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode, project_id, memo,
   total_qty, total_supply, total_vat, total_amount, yield_pct,
   status, source_doc_id, time_date, wh_to_id, created_at, updated_at
FROM doc;

DROP TABLE doc;
ALTER TABLE doc_new RENAME TO doc;

-- ── ④ 자식 복원 후 임시표 제거 ─────────────────────────────
INSERT INTO doc_line     SELECT * FROM _mig_doc_line;
INSERT INTO stock_ledger SELECT * FROM _mig_ledger;
DROP TABLE _mig_doc_line;
DROP TABLE _mig_ledger;

-- ── ⑤ 인덱스 재생성(옛 doc과 함께 사라진 것 + 신규) ─────────
CREATE INDEX idx_doc_type_date ON doc (doc_type, io_date);
CREATE INDEX idx_doc_partner   ON doc (partner_id);
CREATE INDEX idx_doc_status    ON doc (doc_type, status);
CREATE INDEX idx_doc_source    ON doc (source_doc_id);

-- Phase 3 잔여: 일반전표(수동분개) 허용 — journal의 원천 제약을 '정확히 1개'에서 '0 또는 1개'로 완화 (마이그레이션 006)
-- 규칙(005와 동일): 분개는 파생 원장. 단, 일반전표는 원천 전표가 없는 '독립 분개'다(doc_id/receipt_id 모두 NULL).
-- SQLite는 CHECK/컬럼목록을 ALTER로 못 바꾸므로 journal 테이블을 재빌드한다(004 doc 재빌드와 동일 패턴).
-- 자식(journal_line)이 journal DROP 시 ON DELETE CASCADE로 지워지지 않도록 FK 없는 임시표로 백업했다가 되돌린다.

-- ── ① 자식 백업(FK 없는 임시표) ─────────────────────────────
CREATE TABLE _mig_journal_line AS SELECT * FROM journal_line;
DELETE FROM journal_line;

-- ── ② journal 재빌드(entry_type에 '일반' 추가 + 원천 CHECK를 <=1로 완화) ──
CREATE TABLE journal_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER REFERENCES doc(id) ON DELETE CASCADE,           -- 원천이 판매/구매 전표일 때
  receipt_id INTEGER REFERENCES receipt(id) ON DELETE CASCADE,   -- 원천이 수금/지불일 때
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('매출','매입','수금','지불','일반')),   -- '일반' = 일반전표(수동분개, 경비 등)
  io_date TEXT NOT NULL,
  doc_no TEXT NOT NULL,                       -- 자동분개=원천 전표번호 / 일반전표=doc_seq('gl')로 채번한 'YYYYMMDD-N'
  partner_id INTEGER REFERENCES partner(id),
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK ((doc_id IS NOT NULL) + (receipt_id IS NOT NULL) <= 1)   -- 원천은 0개(일반전표) 또는 1개(자동분개)
);

INSERT INTO journal_new (id, doc_id, receipt_id, entry_type, io_date, doc_no, partner_id, summary, created_at)
SELECT id, doc_id, receipt_id, entry_type, io_date, doc_no, partner_id, summary, created_at FROM journal;

DROP TABLE journal;
ALTER TABLE journal_new RENAME TO journal;

-- ── ③ 자식 복원 후 임시표 제거 ─────────────────────────────
INSERT INTO journal_line SELECT * FROM _mig_journal_line;
DROP TABLE _mig_journal_line;

-- ── ④ 인덱스 재생성(옛 journal과 함께 사라진 것) ───────────
CREATE UNIQUE INDEX uq_journal_doc     ON journal (doc_id)     WHERE doc_id IS NOT NULL;
CREATE UNIQUE INDEX uq_journal_receipt ON journal (receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX idx_journal_date    ON journal (io_date);
CREATE INDEX idx_journal_partner ON journal (partner_id);

-- Phase 3: 회계 코어 — 계정과목(account) + 자동분개(journal/journal_line)  [마이그레이션 005]
-- 규칙(003/004과 동일): 금액 INTEGER(원). 분개는 stock_ledger처럼 '파생 원장'이다 — 원천 전표(doc/receipt)
-- 저장/수정/삭제 시 트랜잭션 안에서 재작성된다. 원천 삭제 시 FK ON DELETE CASCADE로 자동 정리된다.
-- 차대변 합계 일치는 서버(accounting.mjs)가 강제한다(DB는 dr/cr 비음·상호배타만 검증).

-- ── 계정과목 마스터 ───────────────────────────────────────────
CREATE TABLE account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 계정코드(전산회계 표준 관례). 자동분개 규칙이 이 코드를 참조한다
  name TEXT NOT NULL,                        -- 계정명
  category TEXT NOT NULL
    CHECK (category IN ('자산','부채','자본','수익','비용')),   -- 계정구분
  is_system INTEGER NOT NULL DEFAULT 0,      -- 1=자동분개가 참조하는 계정(코드/구분 변경·삭제 보호)
  active INTEGER NOT NULL DEFAULT 1,         -- 사용여부
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_account_cat ON account (category, code);

-- ── 분개 헤더(원천 전표 1건 = 분개 1건) ───────────────────────
-- doc_id / receipt_id 중 정확히 하나만 채운다(다형 원천). 둘 다 ON DELETE CASCADE →
-- 판매/구매 전표 또는 수금/지불 삭제 시 분개(및 라인)가 자동 삭제된다(stock_ledger와 동일한 파생 성격).
CREATE TABLE journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER REFERENCES doc(id) ON DELETE CASCADE,           -- 원천이 판매/구매 전표일 때
  receipt_id INTEGER REFERENCES receipt(id) ON DELETE CASCADE,   -- 원천이 수금/지불일 때
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('매출','매입','수금','지불')),          -- 분개 유형(표시·필터용)
  io_date TEXT NOT NULL,                     -- 원천 일자 'YYYY-MM-DD'(분개장 기간 조회 인덱스)
  doc_no TEXT NOT NULL,                       -- 원천 전표번호(doc.doc_no 또는 receipt.receipt_no) 표시용
  partner_id INTEGER REFERENCES partner(id), -- 원천 거래처(헤더 필터 편의). 라인에도 별도 보관
  summary TEXT NOT NULL DEFAULT '',           -- 적요
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK ((doc_id IS NOT NULL) + (receipt_id IS NOT NULL) = 1)     -- 정확히 하나의 원천
);
-- 원천당 분개 1건 강제(백필 멱등성의 DB 백스톱). SQLite UNIQUE는 NULL 다중 허용 → 반대편 원천엔 영향 없음
CREATE UNIQUE INDEX uq_journal_doc     ON journal (doc_id)     WHERE doc_id IS NOT NULL;
CREATE UNIQUE INDEX uq_journal_receipt ON journal (receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX idx_journal_date    ON journal (io_date);
CREATE INDEX idx_journal_partner ON journal (partner_id);

-- ── 분개 라인(차변/대변) ──────────────────────────────────────
-- 한 라인은 차변(dr) 또는 대변(cr) 한쪽만 값을 가진다. account_code/name은 표시·집계용 비정규화 사본.
CREATE TABLE journal_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL REFERENCES journal(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES account(id),
  account_code TEXT NOT NULL,                -- 계정코드 사본(월별손익/원장 집계 시 join 회피)
  account_name TEXT NOT NULL,                -- 계정명 사본(분개장 표시)
  dr INTEGER NOT NULL DEFAULT 0,             -- 차변 금액(원)
  cr INTEGER NOT NULL DEFAULT 0,             -- 대변 금액(원)
  partner_id INTEGER REFERENCES partner(id), -- 거래처원장용 — 외상매출금/외상매입금 라인에만 세팅
  remarks TEXT NOT NULL DEFAULT '',
  CHECK (dr >= 0 AND cr >= 0 AND (dr = 0 OR cr = 0))    -- 비음 + 차·대 상호배타
);
CREATE INDEX idx_jline_journal ON journal_line (journal_id);
CREATE INDEX idx_jline_account ON journal_line (account_code, journal_id);
CREATE INDEX idx_jline_partner ON journal_line (partner_id, account_code);

-- ── 기본 계정과목 시딩(전산회계 표준코드 관례) ───────────────────
-- is_system=1 : 자동분개 규칙이 코드로 참조하는 계정(101/103/108/135/153/251/255/404). 코드/구분 변경·삭제 보호.
INSERT INTO account (code, name, category, is_system) VALUES
  ('101','현금',        '자산',1),
  ('103','보통예금',    '자산',1),
  ('108','외상매출금',  '자산',1),
  ('110','받을어음',    '자산',0),
  ('135','부가세대급금','자산',1),
  ('146','상품',        '자산',0),
  ('150','제품',        '자산',0),
  ('153','원재료',      '자산',1),
  ('251','외상매입금',  '부채',1),
  ('252','지급어음',    '부채',0),
  ('255','부가세예수금','부채',1),
  ('331','자본금',      '자본',0),
  ('401','상품매출',    '수익',0),
  ('404','제품매출',    '수익',1),
  ('501','원재료매입',  '비용',0),
  ('811','복리후생비',  '비용',0),
  ('812','여비교통비',  '비용',0),
  ('813','기업업무추진비','비용',0),
  ('814','통신비',      '비용',0),
  ('815','수도광열비',  '비용',0),
  ('817','세금과공과금','비용',0),
  ('819','임차료',      '비용',0),
  ('822','차량유지비',  '비용',0),
  ('824','운반비',      '비용',0),
  ('830','소모품비',    '비용',0),
  ('831','지급수수료',  '비용',0),
  ('833','광고선전비',  '비용',0);

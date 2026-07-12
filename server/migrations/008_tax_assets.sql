-- 008: 세무(전자세금계산서 진행단계) + 회계Ⅱ(고정자산·예산·예적금·자금계획)  [R4]
-- 규칙(001/005와 동일): 금액 INTEGER(원), 수량/율 REAL, 코드/이름 UNIQUE, active로 사용여부.
-- 전부 신규 테이블 CREATE만 한다(기존 doc/journal/account 등 무변경). 부가세신고서·세금계산서합계표는
-- 신규 테이블이 필요 없다 — 기존 doc 집계이므로 여기에 테이블을 만들지 않는다(§3.1 소스 일치).

-- ── ① 전자세금계산서 진행단계(판매 전표 1건 = 상태 1건, 없으면 '미발행'으로 간주) ──
-- 대장은 doc(sale) LEFT JOIN 으로 생성하고, 상태 변경 시에만 이 표에 upsert 한다(미발행 행은 저장 안 함).
-- 원천 판매 전표 삭제 시 ON DELETE CASCADE로 상태도 정리된다(분개/재고원장과 동일한 파생 성격).
CREATE TABLE tax_invoice_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL UNIQUE REFERENCES doc(id) ON DELETE CASCADE,  -- 원천 판매 전표(1:1)
  status TEXT NOT NULL DEFAULT '미발행'
    CHECK (status IN ('미발행','발행','전송예정','전송완료')),           -- 전송완료는 국세청 연동(연동 예정)으로만 도달
  issued_at TEXT,                                  -- 발행 처리 일시(로컬). '발행' 전환 시 기록
  sent_at TEXT,                                    -- 국세청 전송완료 일시(연동 예정 — 현재 항상 NULL)
  approval_no TEXT NOT NULL DEFAULT '',            -- 국세청 승인번호 24자리(연동 예정 — 현재 빈값)
  memo TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_taxinv_doc ON tax_invoice_status (doc_id);

-- ── ② 고정자산(정액법 감가상각) ──
-- 감가상각 스케줄은 저장하지 않는다 — acq_date/acq_cost/salvage_value/life_years로 서버가 계산(§3.3).
CREATE TABLE fixed_asset (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                        -- 자산코드
  name TEXT NOT NULL,                               -- 자산명
  asset_account TEXT NOT NULL DEFAULT '비품',        -- 자산계정(건물/기계장치/차량운반구/비품/무형자산 등)
  acq_date TEXT NOT NULL,                           -- 취득일 'YYYY-MM-DD'
  acq_cost INTEGER NOT NULL DEFAULT 0,              -- 취득가액(원)
  salvage_value INTEGER NOT NULL DEFAULT 0,         -- 잔존가치(원)
  life_years INTEGER NOT NULL DEFAULT 5,            -- 내용연수(년). 월상각 기준 = life_years*12 개월
  method TEXT NOT NULL DEFAULT '정액법'
    CHECK (method IN ('정액법')),                    -- R4는 정액법만(정률법은 범위 밖)
  memo TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── ③ 예산(계정과목 × 연 × 월 편성액) ──
CREATE TABLE budget (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER NOT NULL,                     -- 회계연도 예: 2026
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  account_code TEXT NOT NULL REFERENCES account(code),  -- 계정과목(account.code는 UNIQUE)
  amount INTEGER NOT NULL DEFAULT 0,                -- 편성 예산액(원)
  memo TEXT NOT NULL DEFAULT '',
  UNIQUE (fiscal_year, account_code, month)
);
CREATE INDEX idx_budget_year ON budget (fiscal_year, account_code);

-- ── ④ 예적금(수기 등록) ──
CREATE TABLE deposit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                        -- 관리코드
  name TEXT NOT NULL,                               -- 예적금명(상품명)
  bank TEXT NOT NULL DEFAULT '',                    -- 금융기관(은행)
  account_no TEXT NOT NULL DEFAULT '',              -- 계좌번호
  kind TEXT NOT NULL DEFAULT '예금'
    CHECK (kind IN ('예금','적금')),
  principal INTEGER NOT NULL DEFAULT 0,             -- 원금/현재잔액(원)
  rate REAL NOT NULL DEFAULT 0,                     -- 연이율(%)
  start_date TEXT NOT NULL DEFAULT '',              -- 가입일 'YYYY-MM-DD'
  maturity_date TEXT NOT NULL DEFAULT '',           -- 만기일 'YYYY-MM-DD'
  memo TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── ⑤ 자금계획(월별 예정 수입/지출) ──
CREATE TABLE fund_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_date TEXT NOT NULL,                          -- 예정일자 'YYYY-MM-DD'
  flow TEXT NOT NULL DEFAULT '수입'
    CHECK (flow IN ('수입','지출')),
  amount INTEGER NOT NULL DEFAULT 0,                -- 금액(원)
  partner_id INTEGER REFERENCES partner(id),        -- 거래처(선택)
  title TEXT NOT NULL DEFAULT '',                   -- 내용/적요
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_fundplan_date ON fund_plan (plan_date);

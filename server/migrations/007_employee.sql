-- 007: 사원(담당자) 마스터 + 전표 담당자 컬럼 (R3)
-- 규칙(001과 동일): 코드/이름 UNIQUE, active로 사용여부. doc에 담당자 emp_id 추가(기존 전표 NULL 허용).
CREATE TABLE employee (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 사원코드
  name TEXT NOT NULL,                        -- 사원명(담당자)
  phone TEXT DEFAULT '',                     -- 연락처
  memo TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,         -- 사용
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- doc.emp_id: 담당자(선택). ADD COLUMN + REFERENCES는 기본값 NULL이라 foreign_keys=ON에서도 허용됨.
-- 기존 전표는 전부 NULL로 채워진다(NULL 허용).
ALTER TABLE doc ADD COLUMN emp_id INTEGER REFERENCES employee(id);
CREATE INDEX idx_doc_emp ON doc (emp_id);

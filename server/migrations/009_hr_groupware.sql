-- 009: 관리(급여·근태) + 그룹웨어(게시판·ToDo)  [R5 · 최종]
-- 규칙(001/005/008과 동일): 금액 INTEGER(원), 코드/이름 UNIQUE, active로 사용여부, 일자 'YYYY-MM-DD'.
-- 전부 신규 테이블 CREATE만 한다(기존 doc/journal/employee/account/settings 등 무변경).
-- 4대보험·소득세 요율은 신규 테이블을 만들지 않고 settings('payroll_rate_*') 키로 관리한다(§2.1 · §3.2).

-- ── ① 급여대장(사원 × 귀속연월 = 1행. 지급/공제 항목은 컬럼으로) ──
-- deduction 항목은 '금액'을 저장한다(요율이 아님) — 간이 계산으로 채우되 화면에서 수기 조정 가능.
-- gross_pay/deduction_total/net_pay는 doc의 total_* 처럼 서버가 항상 재계산해 저장하는 캐시(§3.3).
-- 원천 사원 삭제 시 ON DELETE CASCADE로 급여행도 정리(파생 성격).
CREATE TABLE payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL REFERENCES employee(id) ON DELETE CASCADE,  -- 사원(FK)
  pay_ym TEXT NOT NULL,                              -- 귀속연월 'YYYY-MM'
  pay_date TEXT NOT NULL DEFAULT '',                 -- 지급일 'YYYY-MM-DD'(선택)
  -- 지급 항목
  base_pay INTEGER NOT NULL DEFAULT 0,               -- 기본급
  allowance INTEGER NOT NULL DEFAULT 0,              -- 과세수당 합계(직책·연장 등)
  meal_allowance INTEGER NOT NULL DEFAULT 0,         -- 비과세 식대(소득세 과세표준 제외)
  -- 공제 항목(금액)
  national_pension INTEGER NOT NULL DEFAULT 0,       -- 국민연금
  health_ins INTEGER NOT NULL DEFAULT 0,             -- 건강보험
  longterm_care INTEGER NOT NULL DEFAULT 0,          -- 장기요양(건보의 %)
  employment_ins INTEGER NOT NULL DEFAULT 0,         -- 고용보험
  income_tax INTEGER NOT NULL DEFAULT 0,             -- 소득세(간이 근사)
  local_income_tax INTEGER NOT NULL DEFAULT 0,       -- 지방소득세(소득세의 10%)
  other_deduction INTEGER NOT NULL DEFAULT 0,        -- 기타공제(가불·경조회비 등)
  -- 캐시(서버 재계산)
  gross_pay INTEGER NOT NULL DEFAULT 0,              -- 지급총액 = base+allowance+meal
  deduction_total INTEGER NOT NULL DEFAULT 0,        -- 공제총액
  net_pay INTEGER NOT NULL DEFAULT 0,                -- 차인지급액(실지급) = gross - deduction_total
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (emp_id, pay_ym)                            -- 사원×월 1행(upsert 기준)
);
CREATE INDEX idx_payroll_ym ON payroll (pay_ym);

-- ── ② 근태(사원 × 일자 = 1행) ──
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_id INTEGER NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,                           -- 근무일자 'YYYY-MM-DD'
  att_type TEXT NOT NULL DEFAULT '출근'
    CHECK (att_type IN ('출근','지각','조퇴','결근','휴가','반차','연장')),
  check_in TEXT NOT NULL DEFAULT '',                 -- 출근시각 'HH:MM'
  check_out TEXT NOT NULL DEFAULT '',                -- 퇴근시각 'HH:MM'
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (emp_id, work_date)                         -- 사원×일 1행(upsert 기준)
);
CREATE INDEX idx_attendance_ym ON attendance (work_date);

-- ── ③ 게시판(단일 사용자 메모·공지 보드) ──
CREATE TABLE board_post (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,                               -- 제목
  content TEXT NOT NULL DEFAULT '',                  -- 내용
  pinned INTEGER NOT NULL DEFAULT 0,                 -- 상단 고정(0/1)
  author TEXT NOT NULL DEFAULT '',                   -- 작성자(선택 — 단일 사용자라 보통 빈값)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_board_pin ON board_post (pinned DESC, id DESC);

-- ── ④ To Do(할일 · MyPage 위젯 연동) ──
CREATE TABLE todo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,                             -- 할일 내용
  due_date TEXT NOT NULL DEFAULT '',                 -- 기한 'YYYY-MM-DD'(선택)
  done INTEGER NOT NULL DEFAULT 0,                   -- 완료(0/1)
  done_at TEXT,                                      -- 완료 처리 일시(선택)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_todo_open ON todo (done, due_date);

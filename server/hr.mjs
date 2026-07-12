// 관리 — 급여대장(간이 4대보험·소득세 계산) + 근태관리(간이 월집계).
// masters.mjs(마스터 CRUD)·db.mjs·ledger.mjs는 무수정 — 공용 헬퍼만 ledger.mjs에서 import 재사용한다.
//
// ⚠ 간이 계산·참고용: 4대보험 상하한·간이세액표(부양가족)·비과세 한도·두루누리 감면·중도입퇴사
// 일할 계산은 반영하지 않는다. 요율은 settings(payroll_rate_*)에 두어 화면에서 수정 가능하며,
// 각 공제액은 급여대장 저장 시 수기 조정할 수 있다(auto:false).
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, isValidDate, validId } from './ledger.mjs';

export const hr = new Hono();

// 조회 화면 월 기본값(이번달). accounting.mjs/assets.mjs monthStartISO()와 동일 규칙(로컬 복제 관례).
function monthKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

// 회사정보(tax.mjs companyInfo()와 동일 — 파일 격리를 위해 로컬 복제).
function companyInfo() {
  const rows = db.prepare(
    `SELECT key, value FROM settings WHERE key IN ('company_name','company_biz_no','company_ceo')`
  ).all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { name: map.company_name ?? '', biz_no: map.company_biz_no ?? '', ceo: map.company_ceo ?? '' };
}

// ══════════════════════════════════════════════════════════════
// 3.2 급여 요율 — settings(payroll_rate_*) 재사용(신규 테이블 없음)
// ══════════════════════════════════════════════════════════════
const RATE_DEFAULTS = { pension: 4.5, health: 3.545, longterm: 12.95, employment: 0.9, income_tax: 3.0 };
const RATE_KEYS = { pension: 'payroll_rate_pension', health: 'payroll_rate_health', longterm: 'payroll_rate_longterm', employment: 'payroll_rate_employment', income_tax: 'payroll_rate_income_tax' };

function getRates() {
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key LIKE 'payroll_rate_%'`).all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const rates = {};
  for (const [name, key] of Object.entries(RATE_KEYS)) {
    const v = map[key];
    rates[name] = v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : RATE_DEFAULTS[name];
  }
  return rates;
}

hr.get('/payroll/rates', (c) => c.json(getRates()));

hr.put('/payroll/rates', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  for (const name of Object.keys(RATE_KEYS)) {
    if (body[name] === undefined) continue;
    const v = Number(body[name]);
    if (!Number.isFinite(v) || v < 0) return err(c, 400, '요율은 0 이상의 숫자여야 합니다.');
  }
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  db.transaction(() => {
    for (const [name, key] of Object.entries(RATE_KEYS)) {
      if (body[name] === undefined) continue;
      upsert.run(key, String(Number(body[name])));
    }
  })();
  return c.json(getRates());
});

// 간이 공제 계산식(순수 함수) — 과세보수월액 = base_pay + allowance(비과세 식대는 4대보험·소득세 기준 제외).
// TODO(간이세액표): 정확한 근로소득 간이세액표(부양가족·자녀 수 반영) 연동은 R6+. 현재는 과세급여 × 설정요율(%) 근사 — 참고용.
export function calcDeductions(basePay, allowance, rates) {
  const taxable = basePay + allowance;
  const national_pension = Math.round((taxable * rates.pension) / 100);
  const health_ins = Math.round((taxable * rates.health) / 100);
  const longterm_care = Math.round((health_ins * rates.longterm) / 100);
  const employment_ins = Math.round((taxable * rates.employment) / 100);
  const income_tax = Math.round((taxable * rates.income_tax) / 100);
  const local_income_tax = Math.round(income_tax * 0.1);
  return { national_pension, health_ins, longterm_care, employment_ins, income_tax, local_income_tax };
}

// ══════════════════════════════════════════════════════════════
// 3.1 급여대장 목록 — GET /api/payroll?ym=YYYY-MM
// ══════════════════════════════════════════════════════════════
const PAYROLL_ROW_COLS = `
  p.id AS payroll_id, p.pay_ym, p.pay_date,
  p.base_pay, p.allowance, p.meal_allowance,
  p.national_pension, p.health_ins, p.longterm_care, p.employment_ins,
  p.income_tax, p.local_income_tax, p.other_deduction,
  p.gross_pay, p.deduction_total, p.net_pay, p.memo`;

hr.get('/payroll', (c) => {
  const ymQ = c.req.query('ym');
  const ym = /^\d{4}-\d{2}$/.test(ymQ || '') ? ymQ : monthKey();

  const rows = db.prepare(`
    SELECT e.id AS emp_id, e.code AS emp_code, e.name AS emp_name, ${PAYROLL_ROW_COLS}
    FROM employee e
    LEFT JOIN payroll p ON p.emp_id = e.id AND p.pay_ym = ?
    WHERE e.active = 1
    ORDER BY e.code
  `).all(ym).map((r) => ({
    emp_id: r.emp_id, emp_code: r.emp_code, emp_name: r.emp_name,
    payroll_id: r.payroll_id ?? null, pay_ym: r.pay_ym ?? null, pay_date: r.pay_date ?? '',
    base_pay: r.base_pay ?? 0, allowance: r.allowance ?? 0, meal_allowance: r.meal_allowance ?? 0,
    national_pension: r.national_pension ?? 0, health_ins: r.health_ins ?? 0, longterm_care: r.longterm_care ?? 0,
    employment_ins: r.employment_ins ?? 0, income_tax: r.income_tax ?? 0, local_income_tax: r.local_income_tax ?? 0,
    other_deduction: r.other_deduction ?? 0,
    gross_pay: r.gross_pay ?? 0, deduction_total: r.deduction_total ?? 0, net_pay: r.net_pay ?? 0,
    memo: r.memo ?? '',
  }));

  const totals = rows.reduce((t, r) => {
    if (r.payroll_id == null) return t;
    return {
      gross_pay: t.gross_pay + r.gross_pay,
      deduction_total: t.deduction_total + r.deduction_total,
      net_pay: t.net_pay + r.net_pay,
      count: t.count + 1,
    };
  }, { gross_pay: 0, deduction_total: 0, net_pay: 0, count: 0 });

  return c.json({ ym, rows, totals });
});

// ══════════════════════════════════════════════════════════════
// 3.3 급여 저장/삭제 — POST /api/payroll (upsert), DELETE /api/payroll/:id
// ══════════════════════════════════════════════════════════════
const DEDUCTION_FIELDS = ['national_pension', 'health_ins', 'longterm_care', 'employment_ins', 'income_tax', 'local_income_tax', 'other_deduction'];

function shapePayrollRow(row) {
  return {
    emp_id: row.emp_id, emp_code: row.emp_code, emp_name: row.emp_name,
    payroll_id: row.id, pay_ym: row.pay_ym, pay_date: row.pay_date,
    base_pay: row.base_pay, allowance: row.allowance, meal_allowance: row.meal_allowance,
    national_pension: row.national_pension, health_ins: row.health_ins, longterm_care: row.longterm_care,
    employment_ins: row.employment_ins, income_tax: row.income_tax, local_income_tax: row.local_income_tax,
    other_deduction: row.other_deduction,
    gross_pay: row.gross_pay, deduction_total: row.deduction_total, net_pay: row.net_pay, memo: row.memo,
  };
}

hr.post('/payroll', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const empId = Number(body.emp_id);
  const emp = Number.isInteger(empId) ? db.prepare(`SELECT id, code, name FROM employee WHERE id = ?`).get(empId) : null;
  if (!emp) return err(c, 400, '사원을 찾을 수 없습니다.');

  const payYm = body.pay_ym;
  if (!/^\d{4}-\d{2}$/.test(payYm || '')) return err(c, 400, '귀속연월(YYYY-MM)을 입력하세요.');

  const payDate = body.pay_date ? String(body.pay_date) : '';
  if (payDate && !isValidDate(payDate)) return err(c, 400, '지급일 형식이 올바르지 않습니다(YYYY-MM-DD).');

  const basePay = Math.trunc(Number(body.base_pay) || 0);
  const allowance = Math.trunc(Number(body.allowance) || 0);
  const mealAllowance = Math.trunc(Number(body.meal_allowance) || 0);
  if (basePay < 0 || allowance < 0 || mealAllowance < 0) return err(c, 400, '지급 금액은 0 이상이어야 합니다.');

  // 기타공제(가불·경조회비 등)는 요율표 대상이 아니라 auto 여부와 무관하게 항상 수기값을 받는다.
  const otherDeduction = Math.trunc(Number(body.other_deduction) || 0);
  if (otherDeduction < 0) return err(c, 400, '공제 금액은 0 이상이어야 합니다.');

  const auto = body.auto !== false; // 기본값 true(자동계산)
  let deductions;
  if (auto) {
    deductions = { ...calcDeductions(basePay, allowance, getRates()), other_deduction: otherDeduction };
  } else {
    deductions = { other_deduction: otherDeduction };
    for (const f of DEDUCTION_FIELDS) {
      if (f === 'other_deduction') continue;
      const v = Math.trunc(Number(body[f]) || 0);
      if (v < 0) return err(c, 400, '공제 금액은 0 이상이어야 합니다.');
      deductions[f] = v;
    }
  }

  const grossPay = basePay + allowance + mealAllowance;
  const deductionTotal = DEDUCTION_FIELDS.reduce((s, f) => s + deductions[f], 0);
  const netPay = grossPay - deductionTotal; // 기타공제 초과 시 음수 허용(경고 아님)
  const memo = String(body.memo ?? '');

  try {
    // upsert가 UPDATE로 처리되면 lastInsertRowid가 엉뚱한 값이라(masters.mjs price-special과 동일 이유)
    // RETURNING id를 get()으로 직접 받는다(better-sqlite3는 RETURNING이 있는 문장은 run() 대신 get/all 사용).
    const { id } = db.prepare(`
      INSERT INTO payroll (emp_id, pay_ym, pay_date, base_pay, allowance, meal_allowance,
        national_pension, health_ins, longterm_care, employment_ins, income_tax, local_income_tax, other_deduction,
        gross_pay, deduction_total, net_pay, memo)
      VALUES (?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?, ?)
      ON CONFLICT(emp_id, pay_ym) DO UPDATE SET
        pay_date=excluded.pay_date, base_pay=excluded.base_pay, allowance=excluded.allowance,
        meal_allowance=excluded.meal_allowance, national_pension=excluded.national_pension,
        health_ins=excluded.health_ins, longterm_care=excluded.longterm_care, employment_ins=excluded.employment_ins,
        income_tax=excluded.income_tax, local_income_tax=excluded.local_income_tax, other_deduction=excluded.other_deduction,
        gross_pay=excluded.gross_pay, deduction_total=excluded.deduction_total, net_pay=excluded.net_pay, memo=excluded.memo
      RETURNING id
    `).get(
      empId, payYm, payDate, basePay, allowance, mealAllowance,
      deductions.national_pension, deductions.health_ins, deductions.longterm_care, deductions.employment_ins,
      deductions.income_tax, deductions.local_income_tax, deductions.other_deduction,
      grossPay, deductionTotal, netPay, memo,
    );
    const row = db.prepare(`
      SELECT p.*, e.code AS emp_code, e.name AS emp_name FROM payroll p JOIN employee e ON e.id = p.emp_id WHERE p.id = ?
    `).get(id);
    return c.json(shapePayrollRow(row), 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '급여'));
  }
});

hr.delete('/payroll/:id', (c) => {
  const id = validId(c);
  const info = id ? db.prepare(`DELETE FROM payroll WHERE id = ?`).run(id) : { changes: 0 };
  if (!info.changes) return err(c, 404, '급여 내역을 찾을 수 없습니다.');
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
// 3.4 급여명세서 — GET /api/payroll/:id/statement
// ══════════════════════════════════════════════════════════════
hr.get('/payroll/:id/statement', (c) => {
  const id = validId(c);
  const row = id ? db.prepare(`
    SELECT p.*, e.code AS emp_code, e.name AS emp_name FROM payroll p JOIN employee e ON e.id = p.emp_id WHERE p.id = ?
  `).get(id) : null;
  if (!row) return err(c, 404, '급여명세서를 찾을 수 없습니다.');

  const earnings = [
    { label: '기본급', amount: row.base_pay },
    { label: '과세수당', amount: row.allowance },
    { label: '식대(비과세)', amount: row.meal_allowance },
  ];
  const deductions = [
    { label: '국민연금', amount: row.national_pension },
    { label: '건강보험', amount: row.health_ins },
    { label: '장기요양', amount: row.longterm_care },
    { label: '고용보험', amount: row.employment_ins },
    { label: '소득세', amount: row.income_tax },
    { label: '지방소득세', amount: row.local_income_tax },
    { label: '기타공제', amount: row.other_deduction },
  ];

  return c.json({
    company: companyInfo(),
    emp: { code: row.emp_code, name: row.emp_name },
    pay_ym: row.pay_ym, pay_date: row.pay_date,
    earnings, deductions,
    gross_pay: row.gross_pay, deduction_total: row.deduction_total, net_pay: row.net_pay,
  });
});

// ══════════════════════════════════════════════════════════════
// 3.5 근태관리 — GET/POST/PUT/DELETE /api/attendance + 월집계
// ══════════════════════════════════════════════════════════════
const ATT_TYPES = ['출근', '지각', '조퇴', '결근', '휴가', '반차', '연장'];
const HHMM_RE = /^\d{2}:\d{2}$/;

hr.get('/attendance', (c) => {
  const ymQ = c.req.query('ym');
  const ym = /^\d{4}-\d{2}$/.test(ymQ || '') ? ymQ : monthKey();
  const empIdQ = Number(c.req.query('emp_id')) || null;

  let sql = `
    SELECT a.id, a.emp_id, e.code AS emp_code, e.name AS emp_name,
           a.work_date, a.att_type, a.check_in, a.check_out, a.memo
    FROM attendance a JOIN employee e ON e.id = a.emp_id
    WHERE substr(a.work_date,1,7) = ?`;
  const params = [ym];
  if (empIdQ) { sql += ` AND a.emp_id = ?`; params.push(empIdQ); }
  sql += ` ORDER BY a.work_date, e.code`;
  const rows = db.prepare(sql).all(...params);

  let sumSql = `
    SELECT a.emp_id, e.code AS emp_code, e.name AS emp_name,
      SUM(CASE WHEN a.att_type IN ('출근','지각','조퇴','연장') THEN 1 ELSE 0 END) AS work_days,
      SUM(CASE WHEN a.att_type='휴가' THEN 1 ELSE 0 END) AS leave_days,
      SUM(CASE WHEN a.att_type='반차' THEN 1 ELSE 0 END) AS half_days,
      SUM(CASE WHEN a.att_type='결근' THEN 1 ELSE 0 END) AS absent_days,
      SUM(CASE WHEN a.att_type='연장' THEN 1 ELSE 0 END) AS overtime_days
    FROM attendance a JOIN employee e ON e.id = a.emp_id
    WHERE substr(a.work_date,1,7) = ?`;
  const sumParams = [ym];
  if (empIdQ) { sumSql += ` AND a.emp_id = ?`; sumParams.push(empIdQ); }
  sumSql += ` GROUP BY a.emp_id ORDER BY e.code`;
  const summary = db.prepare(sumSql).all(...sumParams);

  return c.json({ ym, rows, summary });
});

function validateAttendanceBody(body) {
  if (body.att_type !== undefined && !ATT_TYPES.includes(body.att_type)) return '근태구분이 올바르지 않습니다.';
  if (body.check_in !== undefined && body.check_in !== '' && !HHMM_RE.test(body.check_in)) return '출근시각 형식이 올바르지 않습니다(HH:MM).';
  if (body.check_out !== undefined && body.check_out !== '' && !HHMM_RE.test(body.check_out)) return '퇴근시각 형식이 올바르지 않습니다(HH:MM).';
  return null;
}

hr.post('/attendance', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const empId = Number(body.emp_id);
  const emp = Number.isInteger(empId) ? db.prepare(`SELECT id FROM employee WHERE id = ?`).get(empId) : null;
  if (!emp) return err(c, 400, '사원을 찾을 수 없습니다.');
  if (!isValidDate(body.work_date)) return err(c, 400, '근무일자(YYYY-MM-DD)를 입력하세요.');
  const attType = body.att_type || '출근';
  const msg = validateAttendanceBody({ ...body, att_type: attType });
  if (msg) return err(c, 400, msg);

  const checkIn = String(body.check_in ?? '');
  const checkOut = String(body.check_out ?? '');
  const memo = String(body.memo ?? '');

  try {
    db.prepare(`
      INSERT INTO attendance (emp_id, work_date, att_type, check_in, check_out, memo)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(emp_id, work_date) DO UPDATE SET
        att_type=excluded.att_type, check_in=excluded.check_in, check_out=excluded.check_out, memo=excluded.memo
    `).run(empId, body.work_date, attType, checkIn, checkOut, memo);
    const row = db.prepare(`
      SELECT a.id, a.emp_id, e.code AS emp_code, e.name AS emp_name,
             a.work_date, a.att_type, a.check_in, a.check_out, a.memo
      FROM attendance a JOIN employee e ON e.id = a.emp_id
      WHERE a.emp_id = ? AND a.work_date = ?
    `).get(empId, body.work_date);
    return c.json(row, 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '근태'));
  }
});

hr.put('/attendance/:id', async (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT * FROM attendance WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '근태 기록을 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const msg = validateAttendanceBody(body);
  if (msg) return err(c, 400, msg);
  if (body.work_date !== undefined && !isValidDate(body.work_date)) return err(c, 400, '근무일자 형식이 올바르지 않습니다(YYYY-MM-DD).');

  const attType = body.att_type ?? existing.att_type;
  const checkIn = body.check_in !== undefined ? String(body.check_in ?? '') : existing.check_in;
  const checkOut = body.check_out !== undefined ? String(body.check_out ?? '') : existing.check_out;
  const memo = body.memo !== undefined ? String(body.memo ?? '') : existing.memo;
  const workDate = body.work_date ?? existing.work_date;

  try {
    db.prepare(`UPDATE attendance SET work_date=?, att_type=?, check_in=?, check_out=?, memo=? WHERE id=?`)
      .run(workDate, attType, checkIn, checkOut, memo, id);
    return c.json(db.prepare(`
      SELECT a.id, a.emp_id, e.code AS emp_code, e.name AS emp_name,
             a.work_date, a.att_type, a.check_in, a.check_out, a.memo
      FROM attendance a JOIN employee e ON e.id = a.emp_id WHERE a.id = ?
    `).get(id));
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '근태'));
  }
});

hr.delete('/attendance/:id', (c) => {
  const id = validId(c);
  const info = id ? db.prepare(`DELETE FROM attendance WHERE id = ?`).run(id) : { changes: 0 };
  if (!info.changes) return err(c, 404, '근태 기록을 찾을 수 없습니다.');
  return c.json({ ok: true });
});

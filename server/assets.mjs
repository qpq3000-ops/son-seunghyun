// 회계Ⅱ — 고정자산+감가상각(§3.4) · 예산관리(§3.5) · 예적금현황(§3.6) · 자금계획(§3.7).
// masters.mjs(마스터 CRUD)는 손대지 않는다 — 고정자산·예적금의 마스터형 CRUD는 아래 crud() 헬퍼
// (masters.mjs의 for-루프 본문을 이 파일 안에 격리 복제한 것)로 자체 생성한다.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, isValidDate, todayISO, validId } from './ledger.mjs';

// 조회 화면 기간 기본값(이번달 1일). accounting.mjs/finreports.mjs monthStartISO()와 동일 규칙(로컬 복제).
function monthStartISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

// finreports.mjs DR_CATEGORIES와 동일 규칙(로컬 복제) — 예산 실적 방향 판정에 사용.
const DR_CATEGORIES = new Set(['자산', '비용']);

export const assets = new Hono();

// ══════════════════════════════════════════════════════════════
// crud() 헬퍼 — masters.mjs의 for-루프 본문(GET/POST/PUT/DELETE + readBody/friendlySqlError)을
// 그대로 복제한 것이다(파일 격리 규칙 — masters.mjs 자체는 수정하지 않는다).
// masters.mjs와의 차이: 선택적 validate(body, isUpdate) 훅 1개만 추가했다 — 고정자산(acq_date/
// life_years/acq_cost/salvage_value)·예적금(principal/rate) 같은 개별 업무 검증을 위해 필요(§3.4/§3.6).
// ══════════════════════════════════════════════════════════════
function crud(app, route, table, cols, required, label, validate) {
  app.get(`/${route}`, (c) => {
    const q = (c.req.query('q') || '').trim();
    const activeOnly = c.req.query('active') === '1';
    let sql = `SELECT * FROM ${table}`;
    const conds = [];
    const params = [];
    if (q) {
      conds.push(`(code LIKE ? OR name LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }
    if (activeOnly) conds.push(`active = 1`);
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY code`;
    return c.json(db.prepare(sql).all(...params));
  });

  app.post(`/${route}`, async (c) => {
    const body = await readBody(c);
    if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
    for (const r of required) {
      if (!String(body[r] ?? '').trim()) return err(c, 400, `${label}의 ${r === 'code' ? '코드' : '이름'}은(는) 필수입니다.`);
    }
    if (validate) {
      const msg = validate(body, false);
      if (msg) return err(c, 400, msg);
    }
    const keys = cols.filter((k) => body[k] !== undefined);
    try {
      const info = db.prepare(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
      ).run(...keys.map((k) => body[k]));
      return c.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid), 201);
    } catch (e) {
      return err(c, 400, friendlySqlError(e, label));
    }
  });

  app.put(`/${route}/:id`, async (c) => {
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
    // 수정 시에도 필수값(코드/이름)을 빈 값으로 덮어쓰지 못하게 검증
    for (const r of required) {
      if (body[r] !== undefined && !String(body[r] ?? '').trim()) {
        return err(c, 400, `${label}의 ${r === 'code' ? '코드' : '이름'}은(는) 비울 수 없습니다.`);
      }
    }
    if (validate) {
      const msg = validate(body, true);
      if (msg) return err(c, 400, msg);
    }
    const keys = cols.filter((k) => body[k] !== undefined);
    if (!keys.length) return err(c, 400, '변경할 내용이 없습니다.');
    try {
      const info = db.prepare(
        `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`
      ).run(...keys.map((k) => body[k]), id);
      if (!info.changes) return err(c, 404, `${label}을(를) 찾을 수 없습니다.`);
      return c.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    } catch (e) {
      return err(c, 400, friendlySqlError(e, label));
    }
  });

  app.delete(`/${route}/:id`, (c) => {
    const id = Number(c.req.param('id'));
    try {
      const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      if (!info.changes) return err(c, 404, `${label}을(를) 찾을 수 없습니다.`);
      return c.json({ ok: true });
    } catch (e) {
      return err(c, 400, friendlySqlError(e, label));
    }
  });
}

// ══════════════════════════════════════════════════════════════
// 3.4 고정자산 — /api/fixed-assets*, /api/fixed-assets/:id/schedule, /api/depreciation
// TODO: 감가상각비/감가상각누계액 자동분개는 R4 범위 밖(조회·계산만). 이카운트의 FastEntry
// 감가상각전표는 R6+ 후보.
// ══════════════════════════════════════════════════════════════
const FIXED_ASSET_COLS = [
  'code', 'name', 'asset_account', 'acq_date', 'acq_cost', 'salvage_value',
  'life_years', 'method', 'memo', 'active',
];

function validateFixedAsset(body, isUpdate) {
  if (!isUpdate && !isValidDate(body.acq_date)) return '취득일(YYYY-MM-DD)을 입력하세요.';
  if (isUpdate && body.acq_date !== undefined && !isValidDate(body.acq_date)) {
    return '취득일 형식이 올바르지 않습니다(YYYY-MM-DD).';
  }
  if (body.life_years !== undefined) {
    const ly = Number(body.life_years);
    if (!Number.isInteger(ly) || ly < 1) return '내용연수는 1년 이상의 정수여야 합니다.';
  }
  if (body.acq_cost !== undefined) {
    const ac = Number(body.acq_cost);
    if (!Number.isFinite(ac) || ac < 0) return '취득가액은 0 이상이어야 합니다.';
  }
  if (body.salvage_value !== undefined) {
    const sv = Number(body.salvage_value);
    if (!Number.isFinite(sv) || sv < 0) return '잔존가치는 0 이상이어야 합니다.';
  }
  return null;
}

crud(assets, 'fixed-assets', 'fixed_asset', FIXED_ASSET_COLS, ['code', 'name'], '고정자산', validateFixedAsset);

// 정액법 월별 스케줄(순수 함수, 저장 안 함). 월상각 기준액 = 취득가액-잔존가치. 총 개월수 = life_years*12.
// 취득월(acq_date의 YYYY-MM)부터 만액 상각 시작(월할, 일할 아님). 마지막 달은 (기준액-직전누계)로 보정
// → 총상각 = 기준액과 정확히 일치(반올림 잔차 흡수).
export function schedule(a) {
  const base = Math.max(0, a.acq_cost - a.salvage_value);
  const n = Math.max(1, a.life_years * 12);
  const per = Math.round(base / n);
  const rows = [];
  let accum = 0;
  let [y, m] = a.acq_date.slice(0, 7).split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const dep = (i === n - 1) ? (base - accum) : per;  // 마지막 달 보정
    accum += dep;
    rows.push({ ym: `${y}-${String(m).padStart(2, '0')}`, dep, accum, book_value: a.acq_cost - accum });
    m++; if (m > 12) { m = 1; y++; }
  }
  return rows;  // 길이 = life_years*12
}

assets.get('/fixed-assets/:id/schedule', (c) => {
  const id = validId(c);
  const asset = id ? db.prepare(`SELECT * FROM fixed_asset WHERE id = ?`).get(id) : null;
  if (!asset) return err(c, 404, '고정자산을 찾을 수 없습니다.');
  const rows = schedule(asset);
  const monthly_dep = rows.length ? rows[0].dep : 0;
  const total_dep = rows.length ? rows[rows.length - 1].accum : 0;
  return c.json({ asset, monthly_dep, total_dep, rows });
});

// 월별·자산별 상각현황 — 각 자산 schedule()을 만들고 ym이 [from,to] 월 범위에 드는 행만 합산.
assets.get('/depreciation', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const fromYm = from.slice(0, 7);
  const toYm = to.slice(0, 7);
  const assetIdQ = Number(c.req.query('asset_id')) || null;

  let sql = `SELECT * FROM fixed_asset WHERE active = 1`;
  const params = [];
  if (assetIdQ) { sql += ` AND id = ?`; params.push(assetIdQ); }
  sql += ` ORDER BY code`;
  const list = db.prepare(sql).all(...params);

  const byMonthMap = new Map();
  const by_asset = list.map((a) => {
    const rows = schedule(a);
    const monthly_dep = rows.length ? rows[0].dep : 0;
    let dep_in_range = 0;
    let accum_to = 0;
    for (const r of rows) {
      if (r.ym <= toYm) accum_to = r.accum;   // to 시점까지 누계('YYYY-MM' 문자열 비교 = 시간순 정렬과 동치)
      if (r.ym >= fromYm && r.ym <= toYm) {
        dep_in_range += r.dep;
        byMonthMap.set(r.ym, (byMonthMap.get(r.ym) ?? 0) + r.dep);
      }
    }
    const book_value = a.acq_cost - accum_to;
    return {
      code: a.code, name: a.name, asset_account: a.asset_account, acq_date: a.acq_date,
      acq_cost: a.acq_cost, salvage_value: a.salvage_value, monthly_dep,
      dep_in_range, accum_to, book_value,
    };
  });

  const by_month = [...byMonthMap.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([ym, dep]) => ({ ym, dep }));

  const totals = by_asset.reduce((t, r) => ({
    asset_count: t.asset_count + 1,
    dep_in_range: t.dep_in_range + r.dep_in_range,
    accum_to: t.accum_to + r.accum_to,
  }), { asset_count: 0, dep_in_range: 0, accum_to: 0 });

  return c.json({ by_asset, by_month, totals });
});

// ══════════════════════════════════════════════════════════════
// 3.5 예산관리 — GET/PUT /api/budget
// 실적 방향: account.category가 차변성(자산·비용)이면 dr-cr, 대변성이면 cr-dr(finreports.mjs와 동일 규칙).
// 대상 계정: category='비용'인 활성 계정 ∪ 해당 연도 budget 행이 있는 계정.
// ══════════════════════════════════════════════════════════════
assets.get('/budget', (c) => {
  const year = Number(c.req.query('year')) || new Date().getFullYear();

  const budgetRows = db.prepare(`SELECT account_code, month, amount FROM budget WHERE fiscal_year = ?`).all(year);
  const budgetMap = new Map();
  for (const r of budgetRows) {
    if (!budgetMap.has(r.account_code)) budgetMap.set(r.account_code, Array(12).fill(0));
    budgetMap.get(r.account_code)[r.month - 1] = r.amount;
  }

  const actualRows = db.prepare(`
    SELECT jl.account_code, substr(j.io_date,1,7) AS ym,
           COALESCE(SUM(jl.dr),0) AS dr, COALESCE(SUM(jl.cr),0) AS cr
    FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE substr(j.io_date,1,4) = ?
    GROUP BY jl.account_code, ym
  `).all(String(year));
  const catRows = db.prepare(`SELECT code, category FROM account`).all();
  const catMap = new Map(catRows.map((r) => [r.code, r.category]));
  const actualMap = new Map();
  for (const r of actualRows) {
    const month = Number(r.ym.slice(5, 7));
    if (!(month >= 1 && month <= 12)) continue;
    if (!actualMap.has(r.account_code)) actualMap.set(r.account_code, Array(12).fill(0));
    const drSide = DR_CATEGORIES.has(catMap.get(r.account_code));
    actualMap.get(r.account_code)[month - 1] = drSide ? (r.dr - r.cr) : (r.cr - r.dr);
  }

  const codeSet = new Set(
    db.prepare(`SELECT code FROM account WHERE category='비용' AND active=1`).all().map((r) => r.code)
  );
  for (const code of budgetMap.keys()) codeSet.add(code);

  let accounts = [];
  if (codeSet.size) {
    const codesArr = [...codeSet];
    const placeholders = codesArr.map(() => '?').join(',');
    accounts = db.prepare(`SELECT code, name, category FROM account WHERE code IN (${placeholders}) ORDER BY code`).all(...codesArr);
  }

  const rows = accounts.map((a) => {
    const budget = budgetMap.get(a.code) ?? Array(12).fill(0);
    const actual = actualMap.get(a.code) ?? Array(12).fill(0);
    const budget_total = budget.reduce((s, v) => s + v, 0);
    const actual_total = actual.reduce((s, v) => s + v, 0);
    const variance = budget_total - actual_total;
    const rate_pct = budget_total > 0 ? Math.round((actual_total / budget_total) * 100) : 0;
    return {
      account_code: a.code, account_name: a.name, category: a.category,
      budget, actual, budget_total, actual_total, variance, rate_pct,
    };
  });

  const totals = rows.reduce((t, r) => ({
    budget_total: t.budget_total + r.budget_total,
    actual_total: t.actual_total + r.actual_total,
    variance: t.variance + r.variance,
  }), { budget_total: 0, actual_total: 0, variance: 0 });
  totals.rate_pct = totals.budget_total > 0 ? Math.round((totals.actual_total / totals.budget_total) * 100) : 0;

  return c.json({ year, rows, totals });
});

// PUT — 편성액 저장(bulk upsert). body { fiscal_year, entries:[{account_code, month, amount}] }.
// amount=0인 entry는 0으로 단순 저장(설계 §3.5 비고). account_code가 account에 없으면 FK 거부.
assets.put('/budget', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const fiscalYear = Number(body.fiscal_year);
  if (!Number.isInteger(fiscalYear)) return err(c, 400, '회계연도를 입력하세요.');
  const entries = Array.isArray(body.entries) ? body.entries : [];
  for (const e of entries) {
    const month = Number(e.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) return err(c, 400, '월은 1~12 사이여야 합니다.');
    if (!String(e.account_code ?? '').trim()) return err(c, 400, '계정과목을 입력하세요.');
    if (!Number.isFinite(Number(e.amount))) return err(c, 400, '금액이 올바르지 않습니다.');
  }

  const upsert = db.prepare(`
    INSERT INTO budget (fiscal_year, account_code, month, amount)
    VALUES (?,?,?,?)
    ON CONFLICT(fiscal_year, account_code, month) DO UPDATE SET amount = excluded.amount
  `);
  try {
    db.transaction(() => {
      for (const e of entries) {
        upsert.run(fiscalYear, String(e.account_code).trim(), Number(e.month), Math.trunc(Number(e.amount) || 0));
      }
    })();
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '예산'));
  }
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
// 3.6 예적금현황 — /api/deposits* (crud() 재사용, MasterScreen 계약 충족)
// ══════════════════════════════════════════════════════════════
const DEPOSIT_COLS = [
  'code', 'name', 'bank', 'account_no', 'kind', 'principal', 'rate',
  'start_date', 'maturity_date', 'memo', 'active',
];

function validateDeposit(body) {
  if (body.principal !== undefined) {
    const p = Number(body.principal);
    if (!Number.isFinite(p) || p < 0) return '원금은 0 이상이어야 합니다.';
  }
  if (body.rate !== undefined) {
    const r = Number(body.rate);
    if (!Number.isFinite(r) || r < 0) return '이율은 0 이상이어야 합니다.';
  }
  return null;
}

crud(assets, 'deposits', 'deposit', DEPOSIT_COLS, ['code', 'name'], '예적금', validateDeposit);

// ══════════════════════════════════════════════════════════════
// 3.7 자금계획 — /api/fund-plans* (목록+요약, custom — crud() 미사용)
// TODO(연동 예정): 이카운트 '추정자금일보'(실적+계획 통합 잔액)의 은행연동 자동수집은 R6+ 범위.
// 여기서는 예정치 수기 등록·월 요약까지만 다룬다.
// ══════════════════════════════════════════════════════════════
assets.get('/fund-plans', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();

  const rows = db.prepare(`
    SELECT f.id, f.plan_date, f.flow, f.amount, f.partner_id, p.name AS partner_name, f.title, f.memo
    FROM fund_plan f LEFT JOIN partner p ON p.id = f.partner_id
    WHERE f.plan_date >= ? AND f.plan_date <= ?
    ORDER BY f.plan_date, f.id
  `).all(from, to).map((r) => ({ ...r, partner_name: r.partner_name ?? null }));

  const in_total = rows.filter((r) => r.flow === '수입').reduce((s, r) => s + r.amount, 0);
  const out_total = rows.filter((r) => r.flow === '지출').reduce((s, r) => s + r.amount, 0);
  return c.json({ rows, summary: { in_total, out_total, net: in_total - out_total, count: rows.length } });
});

assets.post('/fund-plans', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const planDate = body.plan_date;
  if (!isValidDate(planDate)) return err(c, 400, '예정일자를 입력하세요.');
  const flow = body.flow;
  if (!['수입', '지출'].includes(flow)) return err(c, 400, '구분(수입/지출)이 올바르지 않습니다.');
  const amount = Math.trunc(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 0) return err(c, 400, '금액은 0 이상의 정수여야 합니다.');
  const partnerId = body.partner_id != null && body.partner_id !== '' ? Number(body.partner_id) : null;
  const title = String(body.title ?? '');
  const memo = String(body.memo ?? '');

  try {
    const info = db.prepare(`
      INSERT INTO fund_plan (plan_date, flow, amount, partner_id, title, memo)
      VALUES (?,?,?,?,?,?)
    `).run(planDate, flow, amount, partnerId, title, memo);
    return c.json(db.prepare(`SELECT * FROM fund_plan WHERE id = ?`).get(info.lastInsertRowid), 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '자금계획'));
  }
});

assets.put('/fund-plans/:id', async (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT * FROM fund_plan WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '자금계획을 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const planDate = body.plan_date !== undefined ? body.plan_date : existing.plan_date;
  if (!isValidDate(planDate)) return err(c, 400, '예정일자가 올바르지 않습니다.');
  const flow = body.flow !== undefined ? body.flow : existing.flow;
  if (!['수입', '지출'].includes(flow)) return err(c, 400, '구분(수입/지출)이 올바르지 않습니다.');
  const amount = body.amount !== undefined ? Math.trunc(Number(body.amount)) : existing.amount;
  if (!Number.isFinite(amount) || amount < 0) return err(c, 400, '금액은 0 이상의 정수여야 합니다.');
  const partnerId = body.partner_id !== undefined
    ? (body.partner_id != null && body.partner_id !== '' ? Number(body.partner_id) : null)
    : existing.partner_id;
  const title = body.title !== undefined ? String(body.title ?? '') : existing.title;
  const memo = body.memo !== undefined ? String(body.memo ?? '') : existing.memo;

  try {
    db.prepare(`UPDATE fund_plan SET plan_date=?, flow=?, amount=?, partner_id=?, title=?, memo=? WHERE id = ?`)
      .run(planDate, flow, amount, partnerId, title, memo, id);
    return c.json(db.prepare(`SELECT * FROM fund_plan WHERE id = ?`).get(id));
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '자금계획'));
  }
});

assets.delete('/fund-plans/:id', (c) => {
  const id = validId(c);
  const info = id ? db.prepare(`DELETE FROM fund_plan WHERE id = ?`).run(id) : { changes: 0 };
  if (!info.changes) return err(c, 404, '자금계획을 찾을 수 없습니다.');
  return c.json({ ok: true });
});

// 회계 보고서 엔진 — 계정별원장/총계정원장/현금출납장/합계잔액시산표/손익계산서/수금현황/지급현황/이익현황.
// 전부 journal/journal_line/receipt/doc 집계일 뿐, 별도 테이블/마이그레이션은 없다(파생 보고서).
// 손익계산서는 monthly-pl(accounting.mjs:327-354)과 표현식이 동일해야 두 보고서가 구조적으로 일치한다.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, isValidDate, todayISO, round1 } from './ledger.mjs';

export const finreports = new Hono();

// 조회 화면 기간 기본값(이번달 1일). accounting.mjs monthStartISO()와 동일 규칙(로컬 복제).
function monthStartISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

const CATEGORIES = ['자산', '부채', '자본', '수익', '비용'];
const DR_CATEGORIES = new Set(['자산', '비용']); // 차변성 계정(잔액 방향 결정용, §2.1)

// ══════════════════════════════════════════════════════════════
// 공통 헬퍼 3개 — accountMeta / openingBalance / ledgerRows
// ══════════════════════════════════════════════════════════════

// 계정 1건 메타 + 방향(dr_side). 없으면 null.
function accountMeta(code) {
  const row = db.prepare(`SELECT code, name, category FROM account WHERE code = ?`).get(code);
  if (!row) return null;
  return { code: row.code, name: row.name, category: row.category, dr_side: DR_CATEGORIES.has(row.category) };
}

// 이월 잔액 = Σ(dr-cr) WHERE account_code=? AND io_date<from [AND 헤더 거래처=?], 방향 반영(대변성은 부호 반전).
// partner_id는 journal 헤더(j.partner_id) 기준 — 원천 doc/receipt의 실제 거래처와 항상 일치(자동분개 규칙상).
function openingBalance(code, from, partnerId) {
  let sql = `
    SELECT COALESCE(SUM(jl.dr - jl.cr), 0) AS diff
    FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE jl.account_code = ? AND j.io_date < ?
  `;
  const params = [code, from];
  if (partnerId) { sql += ` AND j.partner_id = ?`; params.push(partnerId); }
  const diff = db.prepare(sql).get(...params).diff;
  const meta = accountMeta(code);
  return meta.dr_side ? diff : -diff;
}

// 계정별원장·현금출납장 공용 라인 조회. partner_id는 헤더(j.partner_id) 기준(openingBalance와 동일 경계).
function ledgerRows(code, from, to, partnerId) {
  let sql = `
    SELECT j.io_date, j.doc_no, j.entry_type, j.partner_id, p.name AS partner_name, j.summary, jl.dr, jl.cr
    FROM journal_line jl
    JOIN journal j ON j.id = jl.journal_id
    LEFT JOIN partner p ON p.id = j.partner_id
    WHERE jl.account_code = ? AND j.io_date >= ? AND j.io_date <= ?
  `;
  const params = [code, from, to];
  if (partnerId) { sql += ` AND j.partner_id = ?`; params.push(partnerId); }
  sql += ` ORDER BY j.io_date, j.id, jl.line_no`;
  return db.prepare(sql).all(...params);
}

// ══════════════════════════════════════════════════════════════
// 1. 계정별원장 — GET /api/account-ledger
// ══════════════════════════════════════════════════════════════
finreports.get('/account-ledger', (c) => {
  const code = c.req.query('account_code');
  if (!code) return err(c, 400, '계정과목을 선택하세요.');
  const meta = accountMeta(code);
  if (!meta) return err(c, 404, '계정과목을 찾을 수 없습니다.');

  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const partnerId = Number(c.req.query('partner_id')) || null;

  const opening = openingBalance(code, from, partnerId);
  const raw = ledgerRows(code, from, to, partnerId);

  let balance = opening;
  let sumDr = 0, sumCr = 0;
  const rows = raw.map((r) => {
    balance += meta.dr_side ? (r.dr - r.cr) : (r.cr - r.dr);
    sumDr += r.dr; sumCr += r.cr;
    return {
      io_date: r.io_date, doc_no: r.doc_no, entry_type: r.entry_type,
      partner_name: r.partner_name ?? null, dr: r.dr, cr: r.cr, balance, summary: r.summary ?? '',
    };
  });

  return c.json({
    meta: { account: meta },
    opening, rows, sum_dr: sumDr, sum_cr: sumCr, closing: balance,
  });
});

// ══════════════════════════════════════════════════════════════
// 2. 총계정원장 — GET /api/general-ledger
// ══════════════════════════════════════════════════════════════
finreports.get('/general-ledger', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const category = CATEGORIES.includes(c.req.query('category')) ? c.req.query('category') : null;

  // 대상 계정: 기간 내 활동 있는 계정 ∪ 이월(io_date<from)이 있는 계정
  const periodCodes = db.prepare(`
    SELECT DISTINCT jl.account_code FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE j.io_date >= ? AND j.io_date <= ?
  `).all(from, to).map((r) => r.account_code);
  const beforeCodes = db.prepare(`
    SELECT DISTINCT jl.account_code FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE j.io_date < ?
  `).all(from).map((r) => r.account_code);
  const codeSet = [...new Set([...periodCodes, ...beforeCodes])];

  let accounts = [];
  if (codeSet.length) {
    const placeholders = codeSet.map(() => '?').join(',');
    accounts = db.prepare(`SELECT code, name, category FROM account WHERE code IN (${placeholders}) ORDER BY code`).all(...codeSet);
  }
  if (category) accounts = accounts.filter((a) => a.category === category);

  const periodAgg = db.prepare(`
    SELECT COALESCE(SUM(jl.dr), 0) AS dr, COALESCE(SUM(jl.cr), 0) AS cr
    FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE jl.account_code = ? AND j.io_date >= ? AND j.io_date <= ?
  `);

  const rows = accounts.map((a) => {
    const drSide = DR_CATEGORIES.has(a.category);
    const opening = openingBalance(a.code, from);
    const { dr, cr } = periodAgg.get(a.code, from, to);
    const balance = opening + (drSide ? dr - cr : cr - dr);
    return { code: a.code, name: a.name, category: a.category, opening, dr, cr, balance };
  });

  const sum_dr = rows.reduce((s, r) => s + r.dr, 0);
  const sum_cr = rows.reduce((s, r) => s + r.cr, 0);
  return c.json({ rows, summary: { sum_dr, sum_cr } });
});

// ══════════════════════════════════════════════════════════════
// 3. 현금출납장 — GET /api/cashbook
// ══════════════════════════════════════════════════════════════
function cashKind(entryType, dr) {
  if (entryType === '일반') return dr > 0 ? '수입' : '지출';
  return entryType; // 수금/지불/매출/매입 그대로(§2.3)
}

finreports.get('/cashbook', (c) => {
  const reqCode = c.req.query('account_code');
  const code = reqCode === '101' || reqCode === '103' ? reqCode : '101';
  const meta = accountMeta(code);

  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();

  const opening = openingBalance(code, from);
  const raw = ledgerRows(code, from, to);

  let balance = opening;
  let sumIn = 0, sumOut = 0;
  const rows = raw.map((r) => {
    balance += r.dr - r.cr; // 101/103은 자산=차변성 → 입금(+)/출금(-)이 그대로 잔액에 반영
    sumIn += r.dr; sumOut += r.cr;
    return {
      io_date: r.io_date, doc_no: r.doc_no, kind: cashKind(r.entry_type, r.dr),
      partner_name: r.partner_name ?? null, in_amt: r.dr, out_amt: r.cr, balance, summary: r.summary ?? '',
    };
  });

  return c.json({
    meta: { account: { code: meta.code, name: meta.name } },
    opening, rows, sum_in: sumIn, sum_out: sumOut, closing: balance,
  });
});

// ══════════════════════════════════════════════════════════════
// 4. 합계잔액시산표 — GET /api/trial-balance
// ══════════════════════════════════════════════════════════════
finreports.get('/trial-balance', (c) => {
  const asOfQ = c.req.query('as_of');
  const asOf = isValidDate(asOfQ) ? asOfQ : todayISO();

  const codes = db.prepare(`
    SELECT DISTINCT jl.account_code FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE j.io_date <= ?
  `).all(asOf).map((r) => r.account_code);

  let accounts = [];
  if (codes.length) {
    const placeholders = codes.map(() => '?').join(',');
    accounts = db.prepare(`SELECT code, name, category FROM account WHERE code IN (${placeholders}) ORDER BY code`).all(...codes);
  }

  const agg = db.prepare(`
    SELECT COALESCE(SUM(jl.dr), 0) AS sum_dr, COALESCE(SUM(jl.cr), 0) AS sum_cr
    FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE jl.account_code = ? AND j.io_date <= ?
  `);

  const rows = accounts.map((a) => {
    const { sum_dr, sum_cr } = agg.get(a.code, asOf);
    const diff = sum_dr - sum_cr;
    return {
      code: a.code, name: a.name, category: a.category,
      sum_dr, sum_cr,
      bal_dr: diff > 0 ? diff : 0,
      bal_cr: diff < 0 ? -diff : 0,
    };
  });

  const totals = rows.reduce((t, r) => ({
    sum_dr: t.sum_dr + r.sum_dr, sum_cr: t.sum_cr + r.sum_cr,
    bal_dr: t.bal_dr + r.bal_dr, bal_cr: t.bal_cr + r.bal_cr,
  }), { sum_dr: 0, sum_cr: 0, bal_dr: 0, bal_cr: 0 });
  totals.balanced = totals.sum_dr === totals.sum_cr && totals.bal_dr === totals.bal_cr;

  return c.json({ rows, totals });
});

// ══════════════════════════════════════════════════════════════
// 5. 손익계산서 — GET /api/income-statement (서식형)
// monthly-pl(accounting.mjs:327-354)의 3개 쿼리 표현식을 그대로 복사(기간 필터만 substr→BETWEEN으로 교체).
// 판관비는 일반전표(entry_type='일반')로만 발생 — 자동분개는 판관비를 만들지 않는다(월별손익과 동일 전제).
// ══════════════════════════════════════════════════════════════
finreports.get('/income-statement', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();

  const salesAmt = db.prepare(`
    SELECT COALESCE(SUM(total_supply), 0) AS amt FROM doc WHERE doc_type = 'sale' AND io_date >= ? AND io_date <= ?
  `).get(from, to).amt;
  const cogsAmt = db.prepare(`
    SELECT COALESCE(SUM(total_supply), 0) AS amt FROM doc WHERE doc_type = 'purchase' AND io_date >= ? AND io_date <= ?
  `).get(from, to).amt;
  const sgaRows = db.prepare(`
    SELECT jl.account_code AS code, jl.account_name AS name, SUM(jl.dr - jl.cr) AS amt
    FROM journal_line jl
    JOIN journal j ON j.id = jl.journal_id
    JOIN account a ON a.code = jl.account_code
    WHERE a.category = '비용' AND jl.account_code LIKE '8%' AND j.io_date >= ? AND j.io_date <= ?
    GROUP BY jl.account_code
    ORDER BY jl.account_code
  `).all(from, to);
  const sgaTotal = sgaRows.reduce((s, r) => s + r.amt, 0);

  const gross = salesAmt - cogsAmt;
  const op = gross - sgaTotal;
  const companyName = db.prepare(`SELECT value FROM settings WHERE key = 'company_name'`).get()?.value ?? '';

  return c.json({
    from, to, company_name: companyName,
    sections: [
      { key: 'sales', no: 'I', label: '매출액', amount: salesAmt, emphasis: false,
        details: [{ code: '404', name: '제품·상품 매출', amount: salesAmt }] },
      { key: 'cogs', no: 'II', label: '매출원가', amount: cogsAmt, emphasis: false,
        details: [{ code: '153', name: '상품·원재료 매입액', amount: cogsAmt }] },
      { key: 'gross', no: 'III', label: '매출총이익', amount: gross, emphasis: true, details: [] },
      { key: 'sga', no: 'IV', label: '판매비와관리비', amount: sgaTotal, emphasis: false,
        details: sgaRows.map((r) => ({ code: r.code, name: r.name, amount: r.amt })) },
      { key: 'op', no: 'V', label: '영업이익', amount: op, emphasis: true, details: [] },
    ],
  });
});

// ══════════════════════════════════════════════════════════════
// 6/7. 수금현황·지급현황 — GET /api/receipt-status, /api/payment-status
// ══════════════════════════════════════════════════════════════
function statusReport(kind, c) {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const method = c.req.query('method');
  const partnerId = Number(c.req.query('partner_id')) || null;

  let sql = `
    SELECT r.io_date, r.receipt_no, p.name AS partner_name, r.method, r.amount, r.memo
    FROM receipt r JOIN partner p ON p.id = r.partner_id
    WHERE r.kind = ? AND r.io_date >= ? AND r.io_date <= ?
  `;
  const params = [kind, from, to];
  if (method && method !== '전체') { sql += ` AND r.method = ?`; params.push(method); }
  if (partnerId) { sql += ` AND r.partner_id = ?`; params.push(partnerId); }
  sql += ` ORDER BY r.io_date, r.id`;

  const rows = db.prepare(sql).all(...params).map((r) => ({
    io_date: r.io_date, receipt_no: r.receipt_no, partner_name: r.partner_name,
    method: r.method, amount: r.amount, memo: r.memo ?? '',
  }));

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byMethod = new Map();
  for (const r of rows) {
    const e = byMethod.get(r.method) ?? { method: r.method, count: 0, amount: 0 };
    e.count += 1; e.amount += r.amount;
    byMethod.set(r.method, e);
  }

  return { rows, summary: { count: rows.length, total, by_method: [...byMethod.values()] } };
}

finreports.get('/receipt-status', (c) => c.json(statusReport('수금', c)));
finreports.get('/payment-status', (c) => c.json(statusReport('지불', c)));

// ══════════════════════════════════════════════════════════════
// 8. 이익현황 — GET /api/profit-status
// 원가단가: item.price_in>0 → std, 아니면 실매입 가중평균 → avg, 둘 다 없으면 0 → none (§2.5).
// TODO: BOM 원가 — 로스팅(생두→원두) 구조상 판매품 직접 매입원가가 없어 근사치임. R2/R3에서 BOM 연동.
// ══════════════════════════════════════════════════════════════
const costUnitCache = new Map();
function costUnit(itemId, to) {
  const cacheKey = `${itemId}:${to}`;
  if (costUnitCache.has(cacheKey)) return costUnitCache.get(cacheKey);
  const item = db.prepare(`SELECT price_in FROM item WHERE id = ?`).get(itemId);
  let result;
  if (item && item.price_in > 0) {
    result = { unit: item.price_in, source: 'std' };
  } else {
    const agg = db.prepare(`
      SELECT COALESCE(SUM(dl.supply_amt), 0) AS sup, COALESCE(SUM(dl.qty), 0) AS qty
      FROM doc_line dl JOIN doc d ON d.id = dl.doc_id
      WHERE d.doc_type = 'purchase' AND dl.item_id = ? AND d.io_date <= ? AND dl.qty > 0
    `).get(itemId, to);
    result = agg.qty > 0 ? { unit: agg.sup / agg.qty, source: 'avg' } : { unit: 0, source: 'none' };
  }
  costUnitCache.set(cacheKey, result);
  return result;
}

finreports.get('/profit-status', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const group = c.req.query('group') === 'partner' ? 'partner' : 'item';
  const partnerId = Number(c.req.query('partner_id')) || null;

  let sql = `
    SELECT dl.item_id, i.code AS item_code, i.name AS item_name,
           d.partner_id, p.code AS partner_code, p.name AS partner_name,
           dl.qty, dl.supply_amt
    FROM doc_line dl
    JOIN doc d ON d.id = dl.doc_id
    JOIN item i ON i.id = dl.item_id
    LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type = 'sale' AND d.io_date >= ? AND d.io_date <= ?
  `;
  const params = [from, to];
  if (partnerId) { sql += ` AND d.partner_id = ?`; params.push(partnerId); }
  const raw = db.prepare(sql).all(...params);

  costUnitCache.clear();
  const groups = new Map();
  for (const r of raw) {
    const key = group === 'item' ? r.item_id : (r.partner_id ?? 0);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        code: group === 'item' ? r.item_code : (r.partner_code ?? null),
        name: group === 'item' ? r.item_name : (r.partner_name ?? '(거래처 미지정)'),
        qty: 0, sales: 0, cost: 0, sources: new Set(),
      });
    }
    const g = groups.get(key);
    const { unit, source } = costUnit(r.item_id, to);
    g.qty = round1(g.qty + r.qty);
    g.sales += r.supply_amt;
    g.cost += Math.round(r.qty * unit);
    g.sources.add(source);
  }

  const rows = [...groups.values()]
    .map((g) => {
      const margin = g.sales - g.cost;
      const margin_pct = g.sales > 0 ? Math.round((margin / g.sales) * 100) : 0;
      const cost_source = g.sources.size === 1 ? [...g.sources][0] : 'mixed';
      return { key: g.key, code: g.code, name: g.name, qty: g.qty, sales: g.sales, cost: g.cost, margin, margin_pct, cost_source };
    })
    .sort((a, b) => String(a.code ?? a.name).localeCompare(String(b.code ?? b.name)));

  const summary = rows.reduce((s, r) => ({
    qty: round1(s.qty + r.qty), sales: s.sales + r.sales, cost: s.cost + r.cost, margin: s.margin + r.margin,
  }), { qty: 0, sales: 0, cost: 0, margin: 0 });
  summary.margin_pct = summary.sales > 0 ? Math.round((summary.margin / summary.sales) * 100) : 0;

  return c.json({ rows, summary });
});

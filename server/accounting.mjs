// 회계 코어 — 자동분개 엔진(writeJournalForDoc/writeJournalForReceipt/backfillJournals)
// + 계정과목 CRUD(/api/accounts) + 분개장(/api/journal) + 거래처원장(/api/partner-ledger)
// + 월별손익(/api/monthly-pl) + 매입매출장(/api/vat-book, 보너스).
//
// 분개(journal/journal_line)는 stock_ledger와 동형의 '파생 원장'이다. 원천 전표(doc의 sale/purchase,
// receipt의 수금/지불)를 저장/수정하면 원천 저장 트랜잭션 안에서 재작성되고, 원천을 삭제하면
// FK ON DELETE CASCADE로 자동 정리된다. 차변합계=대변합계는 커밋 전에 이 파일이 강제한다
// (불일치 시 throw → 원천 저장 트랜잭션 전체 롤백).
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, isValidDate, todayISO, validId } from './ledger.mjs';

export const accounting = new Hono();

// 조회 화면 기간 기본값(이번달 1일). client/format.ts의 monthStartISO()와 동일 규칙.
function monthStartISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

// ── 계정코드 상수 — 자동분개 규칙이 참조하는 유일한 매핑 지점(005 시딩 코드와 일치) ──
const A = {
  현금: '101', 보통예금: '103', 외상매출금: '108', 부가세대급금: '135',
  원재료: '153', 외상매입금: '251', 부가세예수금: '255', 제품매출: '404',
};
const cashCode = (method) => (method === '현금' ? A.현금 : A.보통예금);

// ── 계정 캐시(코드 → account 행). 계정과목 CRUD가 일어나면 clearAccountCache()로 무효화 ──
const accountCache = new Map();
function clearAccountCache() {
  accountCache.clear();
}
function getAccountByCode(code) {
  if (accountCache.has(code)) return accountCache.get(code);
  const row = db.prepare(`SELECT * FROM account WHERE code = ?`).get(code);
  if (!row) throw new Error(`계정과목(${code})이 없습니다. 마이그레이션 005 시딩을 확인하세요.`);
  accountCache.set(code, row);
  return row;
}

const L = (code, dr, cr, partnerId = null) => ({ code, dr, cr, partnerId });

// doc(sale/purchase) → 분개 라인들. 그 외 doc_type은 null(분개 없음).
function buildDocJournal(doc) {
  if (doc.doc_type === 'sale') {
    const lines = [L(A.외상매출금, doc.total_amount, 0, doc.partner_id), L(A.제품매출, 0, doc.total_supply)];
    if (doc.total_vat > 0) lines.push(L(A.부가세예수금, 0, doc.total_vat));
    return { entry_type: '매출', lines };
  }
  if (doc.doc_type === 'purchase') {
    const lines = [L(A.원재료, doc.total_supply, 0)];
    if (doc.total_vat > 0) lines.push(L(A.부가세대급금, doc.total_vat, 0));
    lines.push(L(A.외상매입금, 0, doc.total_amount, doc.partner_id));
    return { entry_type: '매입', lines };
  }
  return null; // roast/move/self_use/defect/adjust/quote/order/purchase_order
}

// receipt(수금/지불) → 분개 라인들
function buildReceiptJournal(r) {
  const cash = cashCode(r.method);
  if (r.kind === '수금') {
    return { entry_type: '수금', lines: [L(cash, r.amount, 0), L(A.외상매출금, 0, r.amount, r.partner_id)] };
  }
  return { entry_type: '지불', lines: [L(A.외상매입금, r.amount, 0, r.partner_id), L(cash, 0, r.amount)] };
}

// 분개 라인 배열을 journal/journal_line에 실제로 기록한다(공용 하부 로직).
// 차변합계≠대변합계면 throw(호출부 트랜잭션 전체가 롤백된다). 트랜잭션 안에서 호출 전제.
function insertJournal({ docId = null, receiptId = null, entryType, ioDate, docNo, partnerId, summary, lines }) {
  const sumDr = lines.reduce((s, l) => s + l.dr, 0);
  const sumCr = lines.reduce((s, l) => s + l.cr, 0);
  if (sumDr !== sumCr) {
    throw new Error(`분개 차대변이 일치하지 않습니다(차변 ${sumDr} / 대변 ${sumCr}).`);
  }
  const jInfo = db.prepare(`
    INSERT INTO journal (doc_id, receipt_id, entry_type, io_date, doc_no, partner_id, summary)
    VALUES (?,?,?,?,?,?,?)
  `).run(docId, receiptId, entryType, ioDate, docNo, partnerId ?? null, summary ?? '');
  const journalId = jInfo.lastInsertRowid;
  const insLine = db.prepare(`
    INSERT INTO journal_line (journal_id, line_no, account_id, account_code, account_name, dr, cr, partner_id, remarks)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  lines.forEach((l, idx) => {
    const acc = getAccountByCode(l.code);
    insLine.run(journalId, idx + 1, acc.id, acc.code, acc.name, l.dr, l.cr, l.partnerId ?? null, '');
  });
  return journalId;
}

// doc(sale/purchase) → 분개 재작성. sale/purchase가 아니면 분개를 만들지 않고,
// 혹시 남은 분개가 있으면 삭제만 한다(로스팅/이동 유형 전환 대비 guard).
// 원천 저장 트랜잭션 '안'에서 호출한다(자체 트랜잭션 없음). throw 시 호출부 트랜잭션이 롤백된다.
export function writeJournalForDoc(docId) {
  db.prepare(`DELETE FROM journal WHERE doc_id = ?`).run(docId);
  const doc = db.prepare(`SELECT * FROM doc WHERE id = ?`).get(docId);
  if (!doc) return;
  const built = buildDocJournal(doc);
  if (!built) return;
  insertJournal({
    docId, entryType: built.entry_type, ioDate: doc.io_date, docNo: doc.doc_no,
    partnerId: doc.partner_id, summary: doc.memo ?? '', lines: built.lines,
  });
}

// receipt(수금/지불) → 분개 재작성. 원천 저장 트랜잭션 '안'에서 호출한다(자체 트랜잭션 없음).
export function writeJournalForReceipt(receiptId) {
  db.prepare(`DELETE FROM journal WHERE receipt_id = ?`).run(receiptId);
  const r = db.prepare(`SELECT * FROM receipt WHERE id = ?`).get(receiptId);
  if (!r) return;
  const built = buildReceiptJournal(r);
  insertJournal({
    receiptId, entryType: built.entry_type, ioDate: r.io_date, docNo: r.receipt_no,
    partnerId: r.partner_id, summary: r.memo ?? '', lines: built.lines,
  });
}

// 기동 시 1회. 분개 없는 sale/purchase doc + 분개 없는 모든 receipt를 찾아 생성.
// 이미 분개가 있으면 대상에서 빠지므로 재실행해도 추가 생성 없음(멱등).
export function backfillJournals() {
  const docs = db.prepare(`SELECT id FROM doc WHERE doc_type IN ('sale','purchase')
      AND id NOT IN (SELECT doc_id FROM journal WHERE doc_id IS NOT NULL)`).all();
  const rcs = db.prepare(`SELECT id FROM receipt
      WHERE id NOT IN (SELECT receipt_id FROM journal WHERE receipt_id IS NOT NULL)`).all();
  db.transaction(() => {
    for (const d of docs) writeJournalForDoc(d.id);
    for (const r of rcs) writeJournalForReceipt(r.id);
  })();
  return docs.length + rcs.length;
}

// ══════════════════════════════════════════════════════════════
// 계정과목 — /api/accounts
// ══════════════════════════════════════════════════════════════
const CATEGORIES = ['자산', '부채', '자본', '수익', '비용'];
const ACCOUNT_COLS = 'id, code, name, category, is_system, active, memo';

accounting.get('/accounts', (c) => {
  const q = (c.req.query('q') || '').trim();
  const category = c.req.query('category');
  const activeOnly = c.req.query('active') === '1';
  let sql = `SELECT ${ACCOUNT_COLS} FROM account`;
  const conds = [];
  const params = [];
  if (q) { conds.push(`(code LIKE ? OR name LIKE ?)`); params.push(`%${q}%`, `%${q}%`); }
  if (category) { conds.push(`category = ?`); params.push(category); }
  if (activeOnly) conds.push(`active = 1`);
  if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
  sql += ` ORDER BY code`;
  return c.json(db.prepare(sql).all(...params));
});

accounting.post('/accounts', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const code = String(body.code ?? '').trim();
  if (!code) return err(c, 400, '계정코드는 필수입니다.');
  const name = String(body.name ?? '').trim();
  if (!name) return err(c, 400, '계정명은 필수입니다.');
  if (!CATEGORIES.includes(body.category)) return err(c, 400, '계정구분이 올바르지 않습니다.');
  const active = body.active === undefined ? 1 : (body.active ? 1 : 0);
  const memo = String(body.memo ?? '');

  try {
    // is_system은 클라가 보내도 무시 → 항상 0(자동분개 보호 계정은 005 시딩으로만 존재)
    const info = db.prepare(`
      INSERT INTO account (code, name, category, is_system, active, memo)
      VALUES (?,?,?,0,?,?)
    `).run(code, name, body.category, active, memo);
    clearAccountCache();
    return c.json(db.prepare(`SELECT ${ACCOUNT_COLS} FROM account WHERE id = ?`).get(info.lastInsertRowid), 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '계정'));
  }
});

accounting.put('/accounts/:id', async (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT * FROM account WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '계정과목을 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const name = body.name !== undefined ? String(body.name ?? '').trim() : existing.name;
  if (!name) return err(c, 400, '계정명은 필수입니다.');
  const memo = body.memo !== undefined ? String(body.memo ?? '') : existing.memo;
  const active = body.active === undefined ? existing.active : (body.active ? 1 : 0);

  // is_system=1 계정은 code/category 변경을 무시(기존값 유지) — 자동분개 보호.
  let code = existing.code;
  let category = existing.category;
  if (!existing.is_system) {
    if (body.code !== undefined) {
      const newCode = String(body.code ?? '').trim();
      if (!newCode) return err(c, 400, '계정코드는 필수입니다.');
      code = newCode;
    }
    if (body.category !== undefined) {
      if (!CATEGORIES.includes(body.category)) return err(c, 400, '계정구분이 올바르지 않습니다.');
      category = body.category;
    }
  }

  try {
    db.prepare(`UPDATE account SET code=?, name=?, category=?, active=?, memo=? WHERE id=?`)
      .run(code, name, category, active, memo, id);
    clearAccountCache();
    return c.json(db.prepare(`SELECT ${ACCOUNT_COLS} FROM account WHERE id = ?`).get(id));
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '계정'));
  }
});

accounting.delete('/accounts/:id', (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT * FROM account WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '계정과목을 찾을 수 없습니다.');
  if (existing.is_system) return err(c, 400, '기본 계정과목은 삭제할 수 없습니다.');

  try {
    db.prepare(`DELETE FROM account WHERE id = ?`).run(id);
    clearAccountCache();
    return c.json({ ok: true });
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '계정'));
  }
});

// ══════════════════════════════════════════════════════════════
// 분개장 — GET /api/journal
// ══════════════════════════════════════════════════════════════
accounting.get('/journal', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const accountCode = c.req.query('account_code');
  const partnerId = c.req.query('partner_id');
  const entryType = c.req.query('entry_type');

  let sql = `
    SELECT jl.journal_id AS journal_id, jl.line_no, j.io_date, j.doc_no, j.entry_type,
           jl.account_code, jl.account_name, jl.dr, jl.cr,
           j.partner_id, p.name AS partner_name, j.summary
    FROM journal_line jl
    JOIN journal j ON j.id = jl.journal_id
    LEFT JOIN partner p ON p.id = j.partner_id
    WHERE j.io_date >= ? AND j.io_date <= ?
  `;
  const params = [from, to];
  if (accountCode) { sql += ` AND jl.account_code = ?`; params.push(accountCode); }
  if (partnerId) { sql += ` AND j.partner_id = ?`; params.push(Number(partnerId)); }
  if (entryType) { sql += ` AND j.entry_type = ?`; params.push(entryType); }
  sql += ` ORDER BY j.io_date, jl.journal_id, jl.line_no`;
  return c.json(db.prepare(sql).all(...params));
});

// ══════════════════════════════════════════════════════════════
// 거래처원장 — GET /api/partner-ledger
// ══════════════════════════════════════════════════════════════
accounting.get('/partner-ledger', (c) => {
  const partnerId = Number(c.req.query('partner_id')) || 0;
  if (!partnerId) return err(c, 400, '거래처를 선택하세요.');
  const partner = db.prepare(`SELECT id, code, name FROM partner WHERE id = ?`).get(partnerId);
  if (!partner) return err(c, 404, '거래처를 찾을 수 없습니다.');

  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();

  let side = c.req.query('side');
  if (side !== '매출' && side !== '매입') {
    const hasAr = db.prepare(`SELECT 1 FROM journal_line WHERE partner_id = ? AND account_code = ? LIMIT 1`)
      .get(partnerId, A.외상매출금);
    side = hasAr ? '매출' : '매입';
  }
  const accountCode = side === '매출' ? A.외상매출금 : A.외상매입금;
  const account = db.prepare(`SELECT code, name FROM account WHERE code = ?`).get(accountCode);

  // opening: 매출측 Σ(dr-cr), 매입측 Σ(cr-dr) — io_date < from
  const openingDiff = db.prepare(`
    SELECT COALESCE(SUM(jl.dr - jl.cr), 0) AS diff
    FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE jl.partner_id = ? AND jl.account_code = ? AND j.io_date < ?
  `).get(partnerId, accountCode, from).diff;
  const opening = side === '매출' ? openingDiff : -openingDiff;

  const raw = db.prepare(`
    SELECT j.io_date, j.doc_no, j.entry_type, j.summary, jl.dr, jl.cr
    FROM journal_line jl JOIN journal j ON j.id = jl.journal_id
    WHERE jl.partner_id = ? AND jl.account_code = ? AND j.io_date >= ? AND j.io_date <= ?
    ORDER BY j.io_date, j.id
  `).all(partnerId, accountCode, from, to);

  let balance = opening;
  let sumIncrease = 0, sumDecrease = 0;
  const rows = raw.map((r) => {
    const increase = side === '매출' ? r.dr : r.cr;
    const decrease = side === '매출' ? r.cr : r.dr;
    balance += increase - decrease;
    sumIncrease += increase;
    sumDecrease += decrease;
    return {
      io_date: r.io_date, doc_no: r.doc_no, entry_type: r.entry_type,
      summary: r.summary, increase, decrease, balance,
    };
  });

  return c.json({
    partner: { id: partner.id, code: partner.code, name: partner.name },
    side, account, opening, rows,
    sum_increase: sumIncrease, sum_decrease: sumDecrease, closing: balance,
  });
});

// ══════════════════════════════════════════════════════════════
// 월별손익 — GET /api/monthly-pl
// ══════════════════════════════════════════════════════════════
accounting.get('/monthly-pl', (c) => {
  const year = Number(c.req.query('year')) || new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const salesRows = db.prepare(`
    SELECT substr(io_date,1,7) AS ym, SUM(total_supply) AS amt
    FROM doc WHERE doc_type = 'sale' AND substr(io_date,1,4) = ? GROUP BY ym
  `).all(String(year));
  const purchaseRows = db.prepare(`
    SELECT substr(io_date,1,7) AS ym, SUM(total_supply) AS amt
    FROM doc WHERE doc_type = 'purchase' AND substr(io_date,1,4) = ? GROUP BY ym
  `).all(String(year));
  // 판매관리비: 비용 계정 중 계정코드 8로 시작하는 라인(자동분개는 판관비를 만들지 않아 현재 항상 0.
  // 향후 일반전표(gl-entry)가 이 축에 반영되도록 구조만 마련해 둔다).
  const sgaRows = db.prepare(`
    SELECT substr(j.io_date,1,7) AS ym, SUM(jl.dr - jl.cr) AS amt
    FROM journal_line jl
    JOIN journal j ON j.id = jl.journal_id
    JOIN account a ON a.code = jl.account_code
    WHERE a.category = '비용' AND jl.account_code LIKE '8%' AND substr(j.io_date,1,4) = ?
    GROUP BY ym
  `).all(String(year));

  const salesMap = Object.fromEntries(salesRows.map((r) => [r.ym, r.amt]));
  const purchaseMap = Object.fromEntries(purchaseRows.map((r) => [r.ym, r.amt]));
  const sgaMap = Object.fromEntries(sgaRows.map((r) => [r.ym, r.amt]));

  const salesValues = months.map((m) => salesMap[m] || 0);
  const cogsValues = months.map((m) => purchaseMap[m] || 0);
  const grossValues = months.map((_, i) => salesValues[i] - cogsValues[i]);
  const sgaValues = months.map((m) => sgaMap[m] || 0);
  const opValues = months.map((_, i) => grossValues[i] - sgaValues[i]);
  const sum = (arr) => arr.reduce((s, v) => s + v, 0);

  return c.json({
    year, months,
    rows: [
      { key: 'sales', label: '매출액', values: salesValues, total: sum(salesValues) },
      { key: 'cogs', label: '매출원가(구매액)', values: cogsValues, total: sum(cogsValues) },
      { key: 'gross_profit', label: '매출총이익', values: grossValues, total: sum(grossValues) },
      { key: 'sga', label: '판매관리비', values: sgaValues, total: sum(sgaValues) },
      { key: 'op_profit', label: '영업이익', values: opValues, total: sum(opValues) },
    ],
  });
});

// ══════════════════════════════════════════════════════════════
// 매입매출장(보너스) — GET /api/vat-book
// ══════════════════════════════════════════════════════════════
accounting.get('/vat-book', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const kindMap = { 매출: 'sale', 매입: 'purchase' };
  const kind = c.req.query('kind');
  const types = kind && kindMap[kind] ? [kindMap[kind]] : ['sale', 'purchase'];

  const placeholders = types.map(() => '?').join(',');
  const docs = db.prepare(`
    SELECT d.id, d.doc_no, d.doc_type, d.io_date, d.tax_mode, d.total_supply, d.total_vat, d.total_amount,
           p.name AS partner_name
    FROM doc d LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type IN (${placeholders}) AND d.io_date >= ? AND d.io_date <= ?
    ORDER BY d.io_date, d.doc_no
  `).all(...types, from, to);

  const lineNames = db.prepare(`
    SELECT i.name FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ? ORDER BY dl.line_no
  `);
  const rows = docs.map((d) => {
    const names = lineNames.all(d.id).map((x) => x.name);
    const item_summary = names.length ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}건` : '') : '';
    return {
      io_date: d.io_date, doc_no: d.doc_no,
      kind: d.doc_type === 'sale' ? '매출' : '매입',
      tax_mode: d.tax_mode,
      partner_name: d.partner_name ?? null,
      item_summary,
      supply: d.total_supply, vat: d.total_vat, total: d.total_amount,
    };
  });

  const summarize = (kindLabel) => {
    const list = rows.filter((r) => r.kind === kindLabel);
    const taxed = list.filter((r) => r.tax_mode === '과세');
    const free = list.filter((r) => r.tax_mode === '면세');
    return {
      과세공급: taxed.reduce((s, r) => s + r.supply, 0),
      부가세: taxed.reduce((s, r) => s + r.vat, 0),
      면세공급: free.reduce((s, r) => s + r.supply, 0),
      합계: list.reduce((s, r) => s + r.total, 0),
    };
  };

  return c.json({ rows, summary: { 매출: summarize('매출'), 매입: summarize('매입') } });
});

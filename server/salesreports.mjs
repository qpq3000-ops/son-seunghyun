// 영업·재고 현황 — 미주문현황/견적서·주문서·발주서현황/판매구매 집계표/기타이동현황/재고변동표.
// 전부 doc/doc_line/stock_ledger/partner 집계일 뿐, 별도 테이블/마이그레이션은 없다(파생 보고서).
// 설계: docs/설계-R2-영업재고현황.md
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, isValidDate, todayISO, round1 } from './ledger.mjs';

export const salesreports = new Hono();

// 조회 화면 기간 기본값(이번달 1일). finreports.mjs monthStartISO()와 동일 규칙(로컬 복제).
function monthStartISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

function periodFrom(c) {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  return { from, to };
}

const BASIS_LABEL = { order: '주문서', order_sale: '주문·판매' };
const MOVE_LABEL = { move: '창고이동', self_use: '자가사용', defect: '불량처리', adjust: '재고조정' };

// ══════════════════════════════════════════════════════════════
// 1. 미주문현황 — GET /api/order-missing (§1.1, §2.1)
// ══════════════════════════════════════════════════════════════
salesreports.get('/order-missing', (c) => {
  const { from, to } = periodFrom(c);
  const basisQ = c.req.query('basis');
  const basis = basisQ === 'order_sale' ? 'order_sale' : 'order';
  const orderTypes = basis === 'order_sale' ? `('order','sale')` : `('order')`;

  const partners = db.prepare(`
    SELECT id, code, name, pay_cycle FROM partner
    WHERE active = 1 AND partner_type LIKE '%매출%'
    ORDER BY code
  `).all();

  const lastOrderStmt = db.prepare(`SELECT MAX(io_date) AS d FROM doc WHERE doc_type = 'order' AND partner_id = ?`);
  const lastSaleStmt = db.prepare(`SELECT MAX(io_date) AS d FROM doc WHERE doc_type = 'sale' AND partner_id = ?`);
  const existsStmt = db.prepare(`
    SELECT 1 FROM doc o
    WHERE o.doc_type IN ${orderTypes} AND o.partner_id = ? AND o.io_date >= ? AND o.io_date <= ?
    LIMIT 1
  `);

  const today = todayISO();
  const rows = [];
  for (const p of partners) {
    const has = existsStmt.get(p.id, from, to);
    if (has) continue; // 기간 내 주문(또는 주문·판매)이 있으면 미주문 대상 아님

    const lastOrder = lastOrderStmt.get(p.id).d ?? null;
    const lastSale = lastSaleStmt.get(p.id).d ?? null;
    let basisDate;
    if (basis === 'order_sale') {
      if (lastOrder && lastSale) basisDate = lastOrder > lastSale ? lastOrder : lastSale;
      else basisDate = lastOrder ?? lastSale ?? null;
    } else {
      basisDate = lastOrder;
    }
    const daysSince = basisDate
      ? Math.floor((Date.parse(today) - Date.parse(basisDate)) / 86400000)
      : null;

    rows.push({
      partner_id: p.id, code: p.code, name: p.name, pay_cycle: p.pay_cycle,
      last_order: lastOrder, last_sale: lastSale, days_since: daysSince,
    });
  }

  return c.json({ rows, summary: { count: rows.length, basis: BASIS_LABEL[basis] } });
});

// ══════════════════════════════════════════════════════════════
// 2/3/4. 견적서·주문서·발주서 현황 (라인 단위) — §1.2~1.4, §2.2
// ══════════════════════════════════════════════════════════════
function docStatusReport(type, c) {
  const { from, to } = periodFrom(c);
  const partnerId = Number(c.req.query('partner_id')) || null;
  const itemId = Number(c.req.query('item_id')) || null;
  const statusQ = c.req.query('status');
  const status = statusQ === '대기' || statusQ === '완료' ? statusQ : null;

  let sql = `
    SELECT d.io_date, d.doc_no, p.name AS partner_name,
           i.code AS item_code, i.name AS item_name, dl.qty, dl.price,
           dl.supply_amt, dl.vat_amt, d.status, d.time_date, d.memo
    FROM doc_line dl
    JOIN doc d ON d.id = dl.doc_id
    JOIN item i ON i.id = dl.item_id
    LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type = ? AND d.io_date >= ? AND d.io_date <= ?
  `;
  const params = [type, from, to];
  if (partnerId) { sql += ` AND d.partner_id = ?`; params.push(partnerId); }
  if (itemId) { sql += ` AND dl.item_id = ?`; params.push(itemId); }
  if (status) { sql += ` AND d.status = ?`; params.push(status); }
  sql += ` ORDER BY d.io_date, d.id, dl.line_no`;

  const raw = db.prepare(sql).all(...params);
  const rows = raw.map(r => ({
    io_date: r.io_date, doc_no: r.doc_no, partner_name: r.partner_name ?? null,
    item_code: r.item_code, item_name: r.item_name, qty: r.qty, price: r.price,
    supply_amt: r.supply_amt, vat_amt: r.vat_amt, amount: r.supply_amt + r.vat_amt,
    status: r.status, time_date: type === 'quote' ? null : (r.time_date ?? null), memo: r.memo ?? '',
  }));

  const summary = rows.reduce((s, r) => ({
    qty: round1(s.qty + r.qty), supply: s.supply + r.supply_amt, vat: s.vat + r.vat_amt, total: s.total + r.amount,
  }), { qty: 0, supply: 0, vat: 0, total: 0 });

  return { rows, summary: { count: rows.length, ...summary } };
}

salesreports.get('/quote-status', (c) => c.json(docStatusReport('quote', c)));
salesreports.get('/order-status', (c) => c.json(docStatusReport('order', c)));
salesreports.get('/po-status', (c) => c.json(docStatusReport('purchase_order', c)));

// ══════════════════════════════════════════════════════════════
// 5. 판매구매 집계표 — GET /api/sales-purchase-summary (§1.5, §2.3)
// ══════════════════════════════════════════════════════════════
salesreports.get('/sales-purchase-summary', (c) => {
  const { from, to } = periodFrom(c);
  const txQ = c.req.query('tx');
  const tx = txQ === 'purchase' ? 'purchase' : 'sale';
  const groupQ = c.req.query('group');
  const group = ['day', 'month', 'partner', 'item'].includes(groupQ) ? groupQ : 'day';

  const GROUP_EXPR = {
    day: { code: 'd.io_date', label: 'd.io_date' },
    month: { code: `substr(d.io_date,1,7)`, label: `substr(d.io_date,1,7)` },
    partner: { code: 'p.code', label: 'p.name' },
    item: { code: 'i.code', label: 'i.name' },
  };
  const { code: codeExpr, label: labelExpr } = GROUP_EXPR[group];

  const sql = `
    SELECT ${codeExpr} AS code, ${labelExpr} AS label,
           SUM(dl.qty) AS qty, SUM(dl.supply_amt) AS supply, SUM(dl.vat_amt) AS vat
    FROM doc_line dl
    JOIN doc d ON d.id = dl.doc_id
    JOIN item i ON i.id = dl.item_id
    LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type = ? AND d.io_date >= ? AND d.io_date <= ?
    GROUP BY ${codeExpr}
    ORDER BY code
  `;
  const raw = db.prepare(sql).all(tx, from, to);
  const rows = raw.map(r => ({
    code: r.code, label: r.label, qty: round1(r.qty), supply: r.supply, vat: r.vat, total: r.supply + r.vat,
  }));

  const summary = rows.reduce((s, r) => ({
    qty: round1(s.qty + r.qty), supply: s.supply + r.supply, vat: s.vat + r.vat, total: s.total + r.total,
  }), { qty: 0, supply: 0, vat: 0, total: 0 });

  return c.json({ rows, summary: { count: rows.length, ...summary } });
});

// ══════════════════════════════════════════════════════════════
// 6. 기타이동현황 — GET /api/other-moves (§1.6, §2.5) — grain = stock_ledger 1행
// ══════════════════════════════════════════════════════════════
const OTHER_MOVE_TYPES = ['move', 'self_use', 'defect', 'adjust'];

salesreports.get('/other-moves', (c) => {
  const { from, to } = periodFrom(c);
  const typeQ = c.req.query('type');
  const type = OTHER_MOVE_TYPES.includes(typeQ) ? typeQ : null;

  let sql = `
    SELECT sl.io_date, d.doc_no, d.doc_type, i.code AS item_code, i.name AS item_name,
           w.name AS warehouse_name, sl.io_type, sl.qty,
           COALESCE(NULLIF(dl.remarks,''), d.memo) AS memo
    FROM stock_ledger sl
    JOIN doc d ON d.id = sl.doc_id
    JOIN item i ON i.id = sl.item_id
    JOIN warehouse w ON w.id = sl.warehouse_id
    LEFT JOIN doc_line dl ON dl.id = sl.doc_line_id
    WHERE d.doc_type IN ('move','self_use','defect','adjust')
      AND sl.io_date >= ? AND sl.io_date <= ?
  `;
  const params = [from, to];
  if (type) { sql += ` AND d.doc_type = ?`; params.push(type); }
  sql += ` ORDER BY sl.io_date, sl.id`;

  const raw = db.prepare(sql).all(...params);
  const rows = raw.map(r => ({
    io_date: r.io_date, doc_no: r.doc_no, type: MOVE_LABEL[r.doc_type],
    item_code: r.item_code, item_name: r.item_name, warehouse_name: r.warehouse_name,
    io_type: r.io_type, qty: round1(r.qty), memo: r.memo ?? '',
  }));

  const netQty = round1(rows.reduce((s, r) => s + r.qty, 0));
  return c.json({ rows, summary: { count: rows.length, net_qty: netQty } });
});

// ══════════════════════════════════════════════════════════════
// 7. 재고변동표 — GET /api/stock-flow (§1.7, §2.4) — 수불부의 전 품목 버전
// ══════════════════════════════════════════════════════════════
const ITEM_TYPES = ['원재료', '부자재', '제품', '상품'];

salesreports.get('/stock-flow', (c) => {
  const { from, to } = periodFrom(c);
  const itemTypeQ = c.req.query('item_type');
  const itemType = ITEM_TYPES.includes(itemTypeQ) ? itemTypeQ : null;
  const showQ = c.req.query('show');
  const show = showQ === 'all' ? 'all' : 'active';

  let itemSql = `SELECT id, code, name, spec, unit, item_type FROM item`;
  const itemParams = [];
  if (itemType) { itemSql += ` WHERE item_type = ?`; itemParams.push(itemType); }
  itemSql += ` ORDER BY code`;
  const items = db.prepare(itemSql).all(...itemParams);

  const openingStmt = db.prepare(`SELECT COALESCE(SUM(qty),0) AS bal FROM stock_ledger WHERE item_id = ? AND io_date < ?`);
  const periodStmt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN qty > 0 THEN qty ELSE 0 END), 0) AS in_qty,
      COALESCE(SUM(CASE WHEN qty < 0 THEN -qty ELSE 0 END), 0) AS out_qty
    FROM stock_ledger WHERE item_id = ? AND io_date >= ? AND io_date <= ?
  `);

  const rows = [];
  for (const it of items) {
    const opening = round1(openingStmt.get(it.id, from).bal);
    const { in_qty, out_qty } = periodStmt.get(it.id, from, to);
    const inQty = round1(in_qty);
    const outQty = round1(out_qty);
    if (show === 'active' && opening === 0 && inQty === 0 && outQty === 0) continue;
    const closing = round1(opening + inQty - outQty);
    rows.push({
      item_id: it.id, code: it.code, name: it.name, spec: it.spec ?? '', unit: it.unit,
      opening, in_qty: inQty, out_qty: outQty, closing,
    });
  }

  return c.json({ rows, summary: { count: rows.length } });
});

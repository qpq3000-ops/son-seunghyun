// 재고 리포트 — 재고현황(시점 스냅샷)·재고수불부(품목별 원장)·창고별재고현황(매트릭스).
// 전부 stock_ledger 집계일 뿐, 별도 재고 테이블은 없다(원장이 유일한 진실).
// + 달력(로스팅/판매/주문납기 월별 집계·일자별 상세) — doc 집계.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, isValidDate, round1, todayISO } from './ledger.mjs';

export const reports = new Hono();

// 재고현황: qty = SUM(ledger.qty WHERE io_date <= as_of [AND warehouse_id]). warehouse_id 없으면 전 창고 합산.
reports.get('/stock/status', (c) => {
  const q = c.req.query('as_of');
  const asOf = isValidDate(q) ? q : todayISO();
  const warehouseId = c.req.query('warehouse_id');

  const sql = `
    SELECT i.id AS item_id, i.code AS item_code, i.name AS item_name, i.spec, i.unit, i.item_type,
      i.safety_qty,
      COALESCE((
        SELECT SUM(sl.qty) FROM stock_ledger sl
        WHERE sl.item_id = i.id AND sl.io_date <= ?
        ${warehouseId ? 'AND sl.warehouse_id = ?' : ''}
      ), 0) AS raw_qty
    FROM item i
    ORDER BY i.code
  `;
  const params = warehouseId ? [asOf, Number(warehouseId)] : [asOf];
  const rows = db.prepare(sql).all(...params);

  return c.json(rows.map(r => {
    const qty = round1(r.raw_qty);
    return {
      item_id: r.item_id, item_code: r.item_code, item_name: r.item_name,
      spec: r.spec, unit: r.unit, item_type: r.item_type,
      qty, safety_qty: r.safety_qty,
      below_safety: r.safety_qty > 0 && qty < r.safety_qty,
    };
  }));
});

// 재고수불부: 품목 필수. balance는 이월값에서 (io_date, id) 순서로 누적 계산.
reports.get('/stock/ledger', (c) => {
  const itemId = Number(c.req.query('item_id')) || 0;
  if (!itemId) return err(c, 400, '품목을 선택하세요.');
  const warehouseId = c.req.query('warehouse_id');
  const from = c.req.query('from');
  const to = c.req.query('to');

  const item = db.prepare(`SELECT id, code, name, unit FROM item WHERE id = ?`).get(itemId);
  if (!item) return err(c, 404, '품목을 찾을 수 없습니다.');

  // 이월 = SUM(qty) WHERE io_date < from (from 미지정이면 이월 0 = 전체 이력을 다 보여줌)
  let opening = 0;
  if (from) {
    let openSql = `SELECT COALESCE(SUM(qty),0) AS bal FROM stock_ledger WHERE item_id = ? AND io_date < ?`;
    const openParams = [itemId, from];
    if (warehouseId) { openSql += ` AND warehouse_id = ?`; openParams.push(Number(warehouseId)); }
    opening = db.prepare(openSql).get(...openParams).bal;
  }

  let rowSql = `
    SELECT sl.io_date, d.doc_no, sl.io_type, p.name AS partner_name, sl.qty, d.memo
    FROM stock_ledger sl
    JOIN doc d ON d.id = sl.doc_id
    LEFT JOIN partner p ON p.id = d.partner_id
    WHERE sl.item_id = ?
  `;
  const rowParams = [itemId];
  if (warehouseId) { rowSql += ` AND sl.warehouse_id = ?`; rowParams.push(Number(warehouseId)); }
  if (from) { rowSql += ` AND sl.io_date >= ?`; rowParams.push(from); }
  if (to) { rowSql += ` AND sl.io_date <= ?`; rowParams.push(to); }
  rowSql += ` ORDER BY sl.io_date, sl.id`;
  const raw = db.prepare(rowSql).all(...rowParams);

  let balance = round1(opening);
  let sumIn = 0, sumOut = 0;
  const rows = raw.map(r => {
    const inQty = r.qty > 0 ? round1(r.qty) : 0;
    const outQty = r.qty < 0 ? round1(-r.qty) : 0;
    balance = round1(balance + r.qty);
    sumIn = round1(sumIn + inQty);
    sumOut = round1(sumOut + outQty);
    return {
      io_date: r.io_date, doc_no: r.doc_no, io_type: r.io_type,
      partner_name: r.partner_name ?? null, in_qty: inQty, out_qty: outQty,
      balance, memo: r.memo ?? '',
    };
  });

  return c.json({
    item: { id: item.id, code: item.code, name: item.name, unit: item.unit },
    opening: round1(opening),
    rows,
    sum_in: sumIn, sum_out: sumOut,
    closing: round1(opening + sumIn - sumOut),
  });
});

// 창고별재고현황: 창고×품목 매트릭스. qty = SUM(ledger.qty WHERE io_date<=as_of), 창고별로 열 구성.
// 총재고 0인 품목(모든 활성 창고 0)은 매트릭스에서 제외한다.
reports.get('/stock/by-warehouse', (c) => {
  const q = c.req.query('as_of');
  const asOf = isValidDate(q) ? q : todayISO();

  const warehouses = db.prepare(`SELECT id, name FROM warehouse WHERE active = 1 ORDER BY code`).all();
  const balances = db.prepare(`
    SELECT item_id, warehouse_id, SUM(qty) AS bal
    FROM stock_ledger WHERE io_date <= ?
    GROUP BY item_id, warehouse_id
  `).all(asOf);
  const balMap = new Map(); // item_id -> Map(warehouse_id -> bal)
  for (const b of balances) {
    if (!balMap.has(b.item_id)) balMap.set(b.item_id, new Map());
    balMap.get(b.item_id).set(b.warehouse_id, round1(b.bal));
  }

  const items = db.prepare(`SELECT id, code, name, unit FROM item ORDER BY code`).all();
  const rows = [];
  for (const it of items) {
    const whMap = balMap.get(it.id);
    if (!whMap) continue; // 활동 없는 품목(모든 창고 0)은 제외
    const by_wh = {};
    let total = 0;
    let hasNonZero = false;
    for (const wh of warehouses) {
      const bal = whMap.get(wh.id) || 0;
      by_wh[String(wh.id)] = bal;
      total = round1(total + bal);
      if (bal !== 0) hasNonZero = true;
    }
    if (!hasNonZero) continue;
    rows.push({ item_id: it.id, item_code: it.code, item_name: it.name, unit: it.unit, by_wh, total });
  }

  return c.json({ warehouses, rows });
});

// ── 달력 ────────────────────────────────────────────────────
// 월 일자별 집계: 로스팅(건수·산출kg) + 판매(건수·수량·금액) + 주문납기(건수). 활동 있는 날짜만 포함.
reports.get('/calendar', (c) => {
  const year = Number(c.req.query('year')) || new Date().getFullYear();
  const month = Number(c.req.query('month')) || (new Date().getMonth() + 1);
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const days = {};
  const ensure = (date) => {
    if (!days[date]) {
      days[date] = { roast_count: 0, roast_kg: 0, sale_count: 0, sale_kg: 0, sale_amount: 0, order_due_count: 0 };
    }
    return days[date];
  };

  const roastRows = db.prepare(`
    SELECT io_date, COUNT(*) AS cnt, SUM(total_qty) AS kg
    FROM doc WHERE doc_type = 'roast' AND substr(io_date,1,7) = ?
    GROUP BY io_date
  `).all(ym);
  for (const r of roastRows) {
    const d = ensure(r.io_date);
    d.roast_count = r.cnt;
    d.roast_kg = round1(r.kg || 0);
  }

  const saleRows = db.prepare(`
    SELECT io_date, COUNT(*) AS cnt, SUM(total_qty) AS kg, SUM(total_amount) AS amt
    FROM doc WHERE doc_type = 'sale' AND substr(io_date,1,7) = ?
    GROUP BY io_date
  `).all(ym);
  for (const r of saleRows) {
    const d = ensure(r.io_date);
    d.sale_count = r.cnt;
    d.sale_kg = round1(r.kg || 0);
    d.sale_amount = r.amt || 0;
  }

  const orderRows = db.prepare(`
    SELECT time_date, COUNT(*) AS cnt
    FROM doc WHERE doc_type = 'order' AND time_date IS NOT NULL AND substr(time_date,1,7) = ?
    GROUP BY time_date
  `).all(ym);
  for (const r of orderRows) {
    const d = ensure(r.time_date);
    d.order_due_count = r.cnt;
  }

  return c.json({ year, month, days });
});

// 그날 전표 목록(팝업/패널용): 로스팅(io_date) + 판매(io_date) + 주문납기(time_date=date) 순.
reports.get('/calendar/day', (c) => {
  const date = c.req.query('date');
  if (!isValidDate(date)) return err(c, 400, '날짜가 올바르지 않습니다.');

  const lineNames = db.prepare(`
    SELECT i.name FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ? ORDER BY dl.line_no
  `);
  const itemSummary = (docId) => {
    const names = lineNames.all(docId).map((x) => x.name);
    return names.length ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}건` : '') : '';
  };

  const events = [];

  const roastRows = db.prepare(`
    SELECT d.id, d.doc_no, d.total_qty,
      (SELECT i.name FROM doc_line dl JOIN item i ON i.id = dl.item_id
       WHERE dl.doc_id = d.id AND dl.line_role = 'output' LIMIT 1) AS output_name
    FROM doc d WHERE d.doc_type = 'roast' AND d.io_date = ?
    ORDER BY d.id
  `).all(date);
  for (const r of roastRows) {
    events.push({
      kind: '로스팅', doc_type: 'roast', id: r.id, doc_no: r.doc_no, partner_name: null,
      title: r.output_name ?? '', qty: r.total_qty, amount: 0,
    });
  }

  const saleRows = db.prepare(`
    SELECT d.id, d.doc_no, d.total_qty, d.total_amount, p.name AS partner_name
    FROM doc d LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type = 'sale' AND d.io_date = ?
    ORDER BY d.id
  `).all(date);
  for (const r of saleRows) {
    events.push({
      kind: '판매', doc_type: 'sale', id: r.id, doc_no: r.doc_no, partner_name: r.partner_name ?? null,
      title: itemSummary(r.id), qty: r.total_qty, amount: r.total_amount,
    });
  }

  const orderRows = db.prepare(`
    SELECT d.id, d.doc_no, d.total_qty, d.total_amount, d.time_date, p.name AS partner_name
    FROM doc d LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type = 'order' AND d.time_date = ?
    ORDER BY d.id
  `).all(date);
  for (const r of orderRows) {
    events.push({
      kind: '주문납기', doc_type: 'order', id: r.id, doc_no: r.doc_no, partner_name: r.partner_name ?? null,
      title: itemSummary(r.id), qty: r.total_qty, amount: r.total_amount, time_date: r.time_date,
    });
  }

  return c.json({ date, events });
});

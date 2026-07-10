// 재고 리포트 — 재고현황(시점 스냅샷)·재고수불부(품목별 원장). 둘 다 stock_ledger 집계일 뿐,
// 별도 재고 테이블은 없다(원장이 유일한 진실).
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

// 로트조회(lot)·생산입고 조회(prod-in) 공용 목록 + 소요량계산(mrp)
// 둘 다 읽기 전용 — roast 전표(doc_type='roast')를 배치 로트 관점으로 조회하거나(roast-docs),
// 대기 주문서(order,status='대기') 기준으로 필요량 대비 재고 부족분을 계산한다(mrp).
// 신규 테이블 없음 — 기존 doc/doc_line/item/stock_ledger 조회·집계로만 구성.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, nextSeqNo, isValidDate, todayISO, round1, validId } from './ledger.mjs';
function monthStartISO() { const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-01`; }

export const prodQuery = new Hono();

// ── 로스팅 전표 목록 — lot·prod-in 공용 ──────────────────────
prodQuery.get('/roast-docs', (c) => {
  const from = isValidDate(c.req.query('from')) ? c.req.query('from') : monthStartISO();
  const to   = isValidDate(c.req.query('to'))   ? c.req.query('to')   : todayISO();
  const itemId = Number(c.req.query('item_id')) || 0;

  let sql = `
    SELECT d.id, d.doc_no, d.io_date, d.warehouse_id, w.name AS warehouse_name,
           d.total_qty AS output_total, d.yield_pct, d.memo,
           (SELECT dl.item_id FROM doc_line dl WHERE dl.doc_id=d.id AND dl.line_role='output' LIMIT 1) AS output_item_id
    FROM doc d JOIN warehouse w ON w.id=d.warehouse_id
    WHERE d.doc_type='roast' AND d.io_date>=? AND d.io_date<=?`;
  const params = [from, to];
  if (itemId) {
    sql += ` AND EXISTS (SELECT 1 FROM doc_line dl WHERE dl.doc_id=d.id AND dl.line_role='output' AND dl.item_id=?)`;
    params.push(itemId);
  }
  sql += ` ORDER BY d.io_date DESC, d.id DESC`;

  const inputStmt = db.prepare(`
    SELECT dl.item_id, i.code AS item_code, i.name AS item_name, dl.qty
    FROM doc_line dl JOIN item i ON i.id=dl.item_id
    WHERE dl.doc_id=? AND dl.line_role='input' ORDER BY dl.line_no`);
  const nameStmt = db.prepare(`SELECT name FROM item WHERE id=?`);

  return c.json(db.prepare(sql).all(...params).map(r => {
    const inputs = inputStmt.all(r.id);
    const input_total = round1(inputs.reduce((s, x) => s + x.qty, 0));
    return {
      ...r,
      output_item_name: r.output_item_id ? (nameStmt.get(r.output_item_id)?.name ?? '') : '',
      inputs,
      input_total,
      input_summary: inputs.map(x => `${x.item_name} ${round1(x.qty)}`).join(', '),
    };
  }));
});

// ── 소요량계산 — 대기 주문 필요량 → 제품 부족분 → paired 생두 환산 → 생두 부족분 ──
prodQuery.get('/mrp', (c) => {
  const need = db.prepare(`
    SELECT dl.item_id, i.code AS item_code, i.name AS item_name, i.unit,
           i.paired_item_id, i.default_yield, SUM(dl.qty) AS required
    FROM doc_line dl
    JOIN doc d ON d.id=dl.doc_id
    JOIN item i ON i.id=dl.item_id
    WHERE d.doc_type='order' AND d.status='대기'
    GROUP BY dl.item_id, i.code, i.name, i.unit, i.paired_item_id, i.default_yield
    ORDER BY i.code`).all();

  const stockOf = (id) => round1(db.prepare(
    `SELECT COALESCE(SUM(qty),0) AS b FROM stock_ledger WHERE item_id=?`).get(id).b);
  const meta = (id) => db.prepare(`SELECT code, name, unit FROM item WHERE id=?`).get(id);

  const rows = need.map(n => {
    const required = round1(n.required);
    const stock = stockOf(n.item_id);
    const shortage = Math.max(0, round1(required - stock));
    let bean = { bean_item_id:null, bean_code:null, bean_name:null, yield_pct:n.default_yield,
                 bean_need:null, bean_stock:null, bean_short:null };
    if (n.paired_item_id && n.default_yield > 0) {
      const bean_need  = shortage > 0 ? round1(shortage / (n.default_yield/100)) : 0;   // 부족 원두 ÷ 수율%
      const bean_stock = stockOf(n.paired_item_id);
      const bean_short = Math.max(0, round1(bean_need - bean_stock));
      const bi = meta(n.paired_item_id);
      bean = { bean_item_id:n.paired_item_id, bean_code:bi?.code ?? null, bean_name:bi?.name ?? null,
               yield_pct:n.default_yield, bean_need, bean_stock, bean_short };
    }
    return { item_id:n.item_id, item_code:n.item_code, item_name:n.item_name, unit:n.unit,
             required, stock, shortage, ...bean };
  });
  return c.json({ rows });
});

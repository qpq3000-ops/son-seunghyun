// 기타이동 4종 — 창고이동(move) / 자가사용(self_use) / 불량처리(defect) / 재고조정(adjust)
// 거래처 없음(partner_id NULL), 금액 0, tax_mode='면세', status='완료'(진행상태 체인 없음).
// 원장 발생 규칙은 ledger.mjs의 buildMoveLedgerRows/bookQty를 그대로 따른다(2장 규칙 표).
import { Hono } from 'hono';
import { db } from './db.mjs';
import {
  err, readBody, friendlySqlError,
  nextSeqNo, isValidDate, round1, validateLines, stockWarnings, validId,
  buildMoveLedgerRows, bookQty,
} from './ledger.mjs';

export const moves = new Hono();

const MOVE_TYPES = ['move', 'self_use', 'defect', 'adjust'];

// 재고조정 doc_line.remarks에 저장해 둔 "장부 {book} → 실사 {real} (조정 {diff})" 문자열에서
// book_qty만 다시 뽑아낸다(별도 컬럼을 추가하지 않고 remarks를 유일한 진실로 삼음).
function parseBookQty(remarks) {
  const m = /^장부\s+(-?\d+(?:\.\d+)?)\s*→/.exec(remarks || '');
  return m ? Number(m[1]) : null;
}

function loadMoveDetail(id) {
  const doc = db.prepare(`
    SELECT d.id, d.doc_no, d.doc_type, d.io_date, d.warehouse_id, w.name AS warehouse_name,
           d.wh_to_id, wt.name AS wh_to_name, d.memo, d.total_qty
    FROM doc d
    JOIN warehouse w ON w.id = d.warehouse_id
    LEFT JOIN warehouse wt ON wt.id = d.wh_to_id
    WHERE d.id = ? AND d.doc_type IN ('move','self_use','defect','adjust')
  `).get(id);
  if (!doc) return null;

  const lineRows = db.prepare(`
    SELECT dl.line_no, dl.item_id, i.code AS item_code, i.name AS item_name, i.unit, dl.qty, dl.remarks
    FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ? ORDER BY dl.line_no
  `).all(id);
  const isAdjust = doc.doc_type === 'adjust';
  const lines = lineRows.map(l => ({
    line_no: l.line_no, item_id: l.item_id, item_code: l.item_code, item_name: l.item_name, unit: l.unit,
    qty: l.qty, book_qty: isAdjust ? parseBookQty(l.remarks) : null, remarks: l.remarks,
  }));

  return {
    id: doc.id, doc_no: doc.doc_no, doc_type: doc.doc_type, io_date: doc.io_date,
    warehouse_id: doc.warehouse_id, warehouse_name: doc.warehouse_name,
    wh_to_id: doc.wh_to_id ?? null, wh_to_name: doc.wh_to_name ?? null,
    memo: doc.memo, method: doc.doc_type === 'defect' ? '폐기' : null,
    total_qty: doc.total_qty,
    lines,
  };
}

// 요청 body.lines를 검증한다. adjust는 필드명이 real_qty이므로 qty로 옮겨 validateLines를 재사용한다.
function parseMoveLines(type, rawLines) {
  const mapped = type === 'adjust'
    ? (Array.isArray(rawLines) ? rawLines : []).map(l => ({ ...l, qty: l?.real_qty }))
    : rawLines;
  return validateLines(mapped, '품목 라인을 1개 이상 입력하세요.');
}

moves.get('/moves', (c) => {
  const type = c.req.query('type');
  if (!MOVE_TYPES.includes(type)) return err(c, 400, '이동 유형이 올바르지 않습니다.');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const warehouseId = c.req.query('warehouse_id');

  let sql = `
    SELECT d.id, d.doc_no, d.doc_type, d.io_date, d.warehouse_id, w.name AS warehouse_name,
           d.wh_to_id, wt.name AS wh_to_name, d.total_qty, d.memo
    FROM doc d
    JOIN warehouse w ON w.id = d.warehouse_id
    LEFT JOIN warehouse wt ON wt.id = d.wh_to_id
    WHERE d.doc_type = ?
  `;
  const params = [type];
  if (from) { sql += ` AND d.io_date >= ?`; params.push(from); }
  if (to) { sql += ` AND d.io_date <= ?`; params.push(to); }
  if (warehouseId) { sql += ` AND d.warehouse_id = ?`; params.push(Number(warehouseId)); }
  sql += ` ORDER BY d.io_date DESC, d.id DESC`;
  const rows = db.prepare(sql).all(...params);

  const lineNames = db.prepare(`
    SELECT i.name FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ? ORDER BY dl.line_no
  `);
  return c.json(rows.map(r => {
    const names = lineNames.all(r.id).map(x => x.name);
    const item_summary = names.length
      ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}건` : '')
      : '';
    return {
      id: r.id, doc_no: r.doc_no, doc_type: r.doc_type, io_date: r.io_date,
      warehouse_id: r.warehouse_id, warehouse_name: r.warehouse_name,
      wh_to_id: r.wh_to_id ?? null, wh_to_name: r.wh_to_name ?? null,
      item_summary, line_count: names.length, total_qty: r.total_qty, memo: r.memo,
    };
  }));
});

moves.get('/moves/:id', (c) => {
  const id = validId(c);
  const detail = id ? loadMoveDetail(id) : null;
  if (!detail) return err(c, 404, '전표를 찾을 수 없습니다.');
  return c.json(detail);
});

moves.post('/moves', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const type = body.type;
  if (!MOVE_TYPES.includes(type)) return err(c, 400, '이동 유형이 올바르지 않습니다.');
  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');
  const warehouseId = Number(body.warehouse_id) || 0;
  if (!warehouseId) return err(c, 400, '창고를 선택하세요.');
  const memo = String(body.memo ?? '');

  let whToId = null;
  if (type === 'move') {
    whToId = Number(body.wh_to_id) || 0;
    if (!whToId) return err(c, 400, '받는 창고를 선택하세요.');
    if (whToId === warehouseId) return err(c, 400, '보내는 창고와 받는 창고가 같습니다.');
  }

  const parsed = parseMoveLines(type, body.lines);
  if (parsed.error) return err(c, 400, parsed.error);

  try {
    const id = db.transaction(() => {
      const docNo = nextSeqNo(ioDate, type);

      // adjust: 라인마다 저장 시점 장부수량을 서버가 재계산해 diff(=실사-장부)를 확정한다(클라 값 불신).
      let totalQty = 0;
      const finalLines = parsed.lines.map(l => {
        totalQty += l.qty;
        if (type !== 'adjust') return l;
        const book = bookQty(l.item_id, warehouseId, ioDate);
        const diff = round1(l.qty - book);
        const remarks = `장부 ${book.toFixed(1)} → 실사 ${l.qty.toFixed(1)} (조정 ${diff.toFixed(1)})`;
        return { ...l, remarks, diff };
      });

      const info = db.prepare(`
        INSERT INTO doc (doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode, project_id, memo,
                          total_qty, total_supply, total_vat, total_amount, status, wh_to_id)
        VALUES (?, ?, ?, NULL, ?, '면세', NULL, ?, ?, 0, 0, 0, '완료', ?)
      `).run(docNo, type, ioDate, warehouseId, memo, round1(totalQty), whToId);
      const docId = info.lastInsertRowid;

      const insLine = db.prepare(`
        INSERT INTO doc_line (doc_id, line_no, item_id, line_role, qty, price, supply_amt, vat_amt, remarks)
        VALUES (?,?,?,'normal',?,0,0,0,?)
      `);
      const insLedger = db.prepare(`
        INSERT INTO stock_ledger (doc_id, doc_line_id, io_date, item_id, warehouse_id, io_type, qty)
        VALUES (?,?,?,?,?,?,?)
      `);
      finalLines.forEach((l, idx) => {
        const lineInfo = insLine.run(docId, idx + 1, l.item_id, l.qty, l.remarks ?? '');
        for (const row of buildMoveLedgerRows({ docType: type, itemId: l.item_id, warehouseId, whToId, qty: l.qty, diff: l.diff })) {
          insLedger.run(docId, lineInfo.lastInsertRowid, ioDate, row.itemId, row.warehouseId, row.ioType, row.qty);
        }
      });

      return docId;
    })();

    const detail = loadMoveDetail(id);
    const warnings = stockWarnings(
      type === 'move'
        ? parsed.lines.flatMap(l => [{ itemId: l.item_id, warehouseId }, { itemId: l.item_id, warehouseId: whToId }])
        : parsed.lines.map(l => ({ itemId: l.item_id, warehouseId }))
    );
    return c.json({ ...detail, warnings }, 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '이동전표'));
  }
});

moves.put('/moves/:id', async (c) => {
  const id = validId(c);
  const existing = id
    ? db.prepare(`SELECT * FROM doc WHERE id = ? AND doc_type IN ('move','self_use','defect','adjust')`).get(id)
    : null;
  if (!existing) return err(c, 404, '전표를 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const type = existing.doc_type; // 유형·번호는 수정 시 변경하지 않음(불변)
  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');
  const warehouseId = Number(body.warehouse_id) || 0;
  if (!warehouseId) return err(c, 400, '창고를 선택하세요.');
  const memo = String(body.memo ?? '');

  let whToId = null;
  if (type === 'move') {
    whToId = Number(body.wh_to_id) || 0;
    if (!whToId) return err(c, 400, '받는 창고를 선택하세요.');
    if (whToId === warehouseId) return err(c, 400, '보내는 창고와 받는 창고가 같습니다.');
  }

  const parsed = parseMoveLines(type, body.lines);
  if (parsed.error) return err(c, 400, parsed.error);

  try {
    db.transaction(() => {
      // 원장을 먼저 지워야 adjust 장부수량이 '이번 수정 이전' 상태를 정확히 반영한다.
      db.prepare(`DELETE FROM doc_line WHERE doc_id = ?`).run(id);
      db.prepare(`DELETE FROM stock_ledger WHERE doc_id = ?`).run(id);

      let totalQty = 0;
      const finalLines = parsed.lines.map(l => {
        totalQty += l.qty;
        if (type !== 'adjust') return l;
        const book = bookQty(l.item_id, warehouseId, ioDate);
        const diff = round1(l.qty - book);
        const remarks = `장부 ${book.toFixed(1)} → 실사 ${l.qty.toFixed(1)} (조정 ${diff.toFixed(1)})`;
        return { ...l, remarks, diff };
      });

      db.prepare(`
        UPDATE doc SET io_date=?, warehouse_id=?, wh_to_id=?, memo=?, total_qty=?, updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(ioDate, warehouseId, whToId, memo, round1(totalQty), id);

      const insLine = db.prepare(`
        INSERT INTO doc_line (doc_id, line_no, item_id, line_role, qty, price, supply_amt, vat_amt, remarks)
        VALUES (?,?,?,'normal',?,0,0,0,?)
      `);
      const insLedger = db.prepare(`
        INSERT INTO stock_ledger (doc_id, doc_line_id, io_date, item_id, warehouse_id, io_type, qty)
        VALUES (?,?,?,?,?,?,?)
      `);
      finalLines.forEach((l, idx) => {
        const lineInfo = insLine.run(id, idx + 1, l.item_id, l.qty, l.remarks ?? '');
        for (const row of buildMoveLedgerRows({ docType: type, itemId: l.item_id, warehouseId, whToId, qty: l.qty, diff: l.diff })) {
          insLedger.run(id, lineInfo.lastInsertRowid, ioDate, row.itemId, row.warehouseId, row.ioType, row.qty);
        }
      });
    })();

    const detail = loadMoveDetail(id);
    const warnings = stockWarnings(
      type === 'move'
        ? parsed.lines.flatMap(l => [{ itemId: l.item_id, warehouseId }, { itemId: l.item_id, warehouseId: whToId }])
        : parsed.lines.map(l => ({ itemId: l.item_id, warehouseId }))
    );
    return c.json({ ...detail, warnings });
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '이동전표'));
  }
});

moves.delete('/moves/:id', (c) => {
  const id = validId(c);
  const info = id
    ? db.transaction(() => db.prepare(`DELETE FROM doc WHERE id = ? AND doc_type IN ('move','self_use','defect','adjust')`).run(id))()
    : { changes: 0 };
  if (!info.changes) return err(c, 404, '전표를 찾을 수 없습니다.');
  return c.json({ ok: true });
});

// 수금/지불(receipt) CRUD + 미수금/미지급 현황
// receipt는 doc과 분리된 테이블(품목 라인 없음, 재고원장 건드리지 않음). 번호는 doc_seq를 doc과 공유하되
// seq_key를 '수금'/'지불'로 구분해 채번한다.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, nextSeqNo, isValidDate, todayISO, validId } from './ledger.mjs';
import { writeJournalForReceipt } from './accounting.mjs';

export const receipts = new Hono();

const KINDS = ['수금', '지불'];
const METHODS = ['현금', '보통예금', '받을어음', '카드', '기타'];

function loadReceipt(id) {
  return db.prepare(`
    SELECT r.id, r.receipt_no, r.kind, r.io_date, r.partner_id, p.name AS partner_name,
           r.method, r.amount, r.project_id, r.memo
    FROM receipt r JOIN partner p ON p.id = r.partner_id
    WHERE r.id = ?
  `).get(id);
}

receipts.get('/receipts', (c) => {
  const kind = c.req.query('kind');
  if (kind && !KINDS.includes(kind)) return err(c, 400, '구분이 올바르지 않습니다.');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const partnerId = c.req.query('partner_id');

  let sql = `
    SELECT r.id, r.receipt_no, r.kind, r.io_date, r.partner_id, p.name AS partner_name,
           r.method, r.amount, r.project_id, r.memo
    FROM receipt r JOIN partner p ON p.id = r.partner_id
  `;
  const conds = [];
  const params = [];
  if (kind) { conds.push('r.kind = ?'); params.push(kind); }
  if (from) { conds.push('r.io_date >= ?'); params.push(from); }
  if (to) { conds.push('r.io_date <= ?'); params.push(to); }
  if (partnerId) { conds.push('r.partner_id = ?'); params.push(Number(partnerId)); }
  if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
  sql += ` ORDER BY r.io_date DESC, r.id DESC`;
  return c.json(db.prepare(sql).all(...params));
});

receipts.post('/receipts', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const kind = body.kind;
  if (!KINDS.includes(kind)) return err(c, 400, '구분이 올바르지 않습니다.');
  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');
  const partnerId = Number(body.partner_id) || 0;
  if (!partnerId) return err(c, 400, '거래처를 선택하세요.');
  const amount = Math.trunc(Number(body.amount) || 0);
  if (amount <= 0) return err(c, 400, '금액은 0보다 커야 합니다.');
  const method = METHODS.includes(body.method) ? body.method : '보통예금';
  const projectId = Number(body.project_id) || null;
  const memo = String(body.memo ?? '');

  try {
    const id = db.transaction(() => {
      const receiptNo = nextSeqNo(ioDate, kind);
      const info = db.prepare(`
        INSERT INTO receipt (receipt_no, kind, io_date, partner_id, method, amount, project_id, memo)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(receiptNo, kind, ioDate, partnerId, method, amount, projectId, memo);
      writeJournalForReceipt(info.lastInsertRowid);
      return info.lastInsertRowid;
    })();
    return c.json(loadReceipt(id), 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '수금'));
  }
});

receipts.put('/receipts/:id', async (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT * FROM receipt WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '수금 자료를 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  // kind/receipt_no는 수정 시 변경하지 않음(번호 불변)
  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');
  const partnerId = Number(body.partner_id) || 0;
  if (!partnerId) return err(c, 400, '거래처를 선택하세요.');
  const amount = Math.trunc(Number(body.amount) || 0);
  if (amount <= 0) return err(c, 400, '금액은 0보다 커야 합니다.');
  const method = METHODS.includes(body.method) ? body.method : existing.method;
  const projectId = Number(body.project_id) || null;
  const memo = String(body.memo ?? '');

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE receipt SET io_date=?, partner_id=?, method=?, amount=?, project_id=?, memo=?,
          updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(ioDate, partnerId, method, amount, projectId, memo, id);
      writeJournalForReceipt(id);
    })();
    return c.json(loadReceipt(id));
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '수금'));
  }
});

receipts.delete('/receipts/:id', (c) => {
  const id = validId(c);
  const info = id ? db.prepare(`DELETE FROM receipt WHERE id = ?`).run(id) : { changes: 0 };
  if (!info.changes) return err(c, 404, '수금 자료를 찾을 수 없습니다.');
  return c.json({ ok: true });
});

// ── 미수금/미지급 현황 (거래처별 집계) ────────────────────────
// 미수금 = 판매 합계 − 수금 합계 / 미지급 = 구매 합계 − 지불 합계. 활동 없는 거래처는 제외.
receipts.get('/receivables', (c) => {
  const q = c.req.query('as_of');
  const asOf = isValidDate(q) ? q : todayISO();
  const rows = db.prepare(`
    SELECT p.id AS partner_id, p.code AS partner_code, p.name AS partner_name, p.pay_cycle,
      COALESCE((SELECT SUM(d.total_amount) FROM doc d
                WHERE d.doc_type = 'sale' AND d.partner_id = p.id AND d.io_date <= ?), 0) AS sales_total,
      COALESCE((SELECT SUM(r.amount) FROM receipt r
                WHERE r.kind = '수금' AND r.partner_id = p.id AND r.io_date <= ?), 0) AS receipt_total
    FROM partner p
  `).all(asOf, asOf);
  return c.json(
    rows
      .map(r => ({ ...r, balance: r.sales_total - r.receipt_total }))
      .filter(r => r.sales_total !== 0 || r.receipt_total !== 0)
      .sort((a, b) => b.balance - a.balance)
  );
});

receipts.get('/payables', (c) => {
  const q = c.req.query('as_of');
  const asOf = isValidDate(q) ? q : todayISO();
  const rows = db.prepare(`
    SELECT p.id AS partner_id, p.code AS partner_code, p.name AS partner_name, p.pay_cycle,
      COALESCE((SELECT SUM(d.total_amount) FROM doc d
                WHERE d.doc_type = 'purchase' AND d.partner_id = p.id AND d.io_date <= ?), 0) AS purchase_total,
      COALESCE((SELECT SUM(r.amount) FROM receipt r
                WHERE r.kind = '지불' AND r.partner_id = p.id AND r.io_date <= ?), 0) AS payment_total
    FROM partner p
  `).all(asOf, asOf);
  return c.json(
    rows
      .map(r => ({ ...r, balance: r.purchase_total - r.payment_total }))
      .filter(r => r.purchase_total !== 0 || r.payment_total !== 0)
      .sort((a, b) => b.balance - a.balance)
  );
});

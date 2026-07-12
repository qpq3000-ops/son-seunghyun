// 자금현황(cash) — receipt(수금/지불) 기반 결제수단별 집계 + 일별 입출금 목록.
// 스펙 버킷은 현금/보통예금/카드/기타(받을어음·기타는 '기타'로 합산). 신규 테이블 없음.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, nextSeqNo, isValidDate, todayISO, round1, validId } from './ledger.mjs';
function monthStartISO() { const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-01`; }

export const cash = new Hono();

cash.get('/cash', (c) => {
  const from = isValidDate(c.req.query('from')) ? c.req.query('from') : monthStartISO();
  const to   = isValidDate(c.req.query('to'))   ? c.req.query('to')   : todayISO();
  const rows = db.prepare(`
    SELECT r.io_date, r.kind, r.method, r.amount, r.receipt_no, r.memo, p.name AS partner_name
    FROM receipt r JOIN partner p ON p.id=r.partner_id
    WHERE r.io_date>=? AND r.io_date<=? ORDER BY r.io_date, r.id`).all(from, to);
  const bucket = (m) => (m==='현금'||m==='보통예금'||m==='카드') ? m : '기타';   // 받을어음·기타 → '기타'
  const methods = ['현금','보통예금','카드','기타'];
  const byM = Object.fromEntries(methods.map(m => [m, { method:m, in_amt:0, out_amt:0 }]));
  let totalIn = 0, totalOut = 0;
  const list = rows.map(r => {
    const b = byM[bucket(r.method)];
    const isIn = r.kind === '수금';
    if (isIn) { b.in_amt += r.amount; totalIn += r.amount; } else { b.out_amt += r.amount; totalOut += r.amount; }
    return { io_date:r.io_date, kind:r.kind, partner_name:r.partner_name, method:r.method,
             receipt_no:r.receipt_no, in_amt: isIn?r.amount:0, out_amt: isIn?0:r.amount, memo:r.memo };
  });
  return c.json({
    summary: methods.map(m => ({ ...byM[m], net: byM[m].in_amt - byM[m].out_amt })),
    list,
    totals: { in_amt: totalIn, out_amt: totalOut, net: totalIn - totalOut },
  });
});

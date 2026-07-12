// 거래처 메시지(message) — 기간 내 판매(sale) 전표를 거래처별로 묶어 안내문 생성 재료를 준다.
// 템플릿 자체(msg_tpl_confirm/msg_tpl_ship)는 기존 /api/settings(PUT)로 클라가 저장·조회한다(신규 API 아님).
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, nextSeqNo, isValidDate, todayISO, round1, validId } from './ledger.mjs';
function monthStartISO() { const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-01`; }

export const messageApi = new Hono();

messageApi.get('/message', (c) => {
  const from = isValidDate(c.req.query('from')) ? c.req.query('from') : todayISO();   // 메시지는 기본 '오늘'
  const to   = isValidDate(c.req.query('to'))   ? c.req.query('to')   : from;
  const partnerId = Number(c.req.query('partner_id')) || 0;
  let dsql = `
    SELECT d.id, d.partner_id, p.name AS partner_name
    FROM doc d JOIN partner p ON p.id=d.partner_id
    WHERE d.doc_type='sale' AND d.io_date>=? AND d.io_date<=?`;
  const params = [from, to];
  if (partnerId) { dsql += ` AND d.partner_id=?`; params.push(partnerId); }
  dsql += ` ORDER BY p.name, d.io_date, d.id`;
  const lineStmt = db.prepare(`
    SELECT i.name AS item_name, i.unit, dl.qty, dl.price, (dl.supply_amt + dl.vat_amt) AS amount
    FROM doc_line dl JOIN item i ON i.id=dl.item_id WHERE dl.doc_id=? ORDER BY dl.line_no`);
  const map = new Map();
  for (const d of db.prepare(dsql).all(...params)) {
    if (!map.has(d.partner_id)) map.set(d.partner_id, { partner_id:d.partner_id, partner_name:d.partner_name, lines:[], total:0 });
    const g = map.get(d.partner_id);
    for (const l of lineStmt.all(d.id)) { g.lines.push(l); g.total += l.amount; }
  }
  return c.json([...map.values()]);
});

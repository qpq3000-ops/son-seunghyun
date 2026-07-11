// 거래명세서인쇄 (docs/설계-거래명세서인쇄.md) — 기간×거래처 합산 명세서
// 이카운트의 [영업관리 > 판매 > 거래명세서인쇄] 동선: 검색 → 거래처별 요약 → 명세서(전잔/후잔 포함)
import { Hono } from 'hono';
import { db } from './db.mjs';

export const statements = new Hono();

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));

// 거래처별 요약 리스트
statements.get('/statements', (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!isDate(from) || !isDate(to)) return c.json({ error: '기간(from/to)을 지정하세요.' }, 400);
  const partnerId = Number(c.req.query('partner_id') || 0);
  const itemId = Number(c.req.query('item_id') || 0);

  const conds = [`d.doc_type = 'sale'`, `d.io_date BETWEEN ? AND ?`];
  const params = [from, to];
  if (partnerId) { conds.push('d.partner_id = ?'); params.push(partnerId); }
  if (itemId) { conds.push(`EXISTS (SELECT 1 FROM doc_line x WHERE x.doc_id = d.id AND x.item_id = ?)`); params.push(itemId); }

  const rows = db.prepare(`
    SELECT d.partner_id, p.name AS partner_name,
           COUNT(DISTINCT d.id) AS doc_cnt,
           SUM(l.qty) AS qty, SUM(l.supply_amt) AS supply, SUM(l.vat_amt) AS vat,
           SUM(l.supply_amt + l.vat_amt) AS total
    FROM doc d
    JOIN partner p ON p.id = d.partner_id
    JOIN doc_line l ON l.doc_id = d.id
    WHERE ${conds.join(' AND ')}
    GROUP BY d.partner_id
    ORDER BY p.name
  `).all(...params);

  // 품목요약: 첫 품목명 + 외 N건 (이카운트 리스트 표기)
  const firstItem = db.prepare(`
    SELECT i.name || CASE WHEN i.spec != '' THEN ' [' || i.spec || ']' ELSE '' END AS name,
           COUNT(DISTINCT l.item_id) AS item_cnt
    FROM doc d JOIN doc_line l ON l.doc_id = d.id JOIN item i ON i.id = l.item_id
    WHERE d.doc_type = 'sale' AND d.io_date BETWEEN ? AND ? AND d.partner_id = ?
    ORDER BY d.io_date, l.id
  `);
  for (const r of rows) {
    const f = firstItem.get(from, to, r.partner_id);
    r.item_summary = f && f.name ? (f.item_cnt > 1 ? `${f.name} 외 ${f.item_cnt - 1}건` : f.name) : '';
  }
  return c.json(rows);
});

// 거래처 1곳의 기간 명세서 (라인 + 전잔/후잔)
statements.get('/statements/:partnerId', (c) => {
  const partnerId = Number(c.req.param('partnerId'));
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!isDate(from) || !isDate(to)) return c.json({ error: '기간(from/to)을 지정하세요.' }, 400);

  const partner = db.prepare('SELECT id, code, name, biz_no, ceo, phone, address FROM partner WHERE id = ?').get(partnerId);
  if (!partner) return c.json({ error: '거래처를 찾을 수 없습니다.' }, 404);

  const lines = db.prepare(`
    SELECT d.io_date, d.doc_no, i.name AS item_name, i.spec, i.unit,
           l.qty, l.price, l.supply_amt AS supply, l.vat_amt AS vat
    FROM doc d
    JOIN doc_line l ON l.doc_id = d.id
    JOIN item i ON i.id = l.item_id
    WHERE d.doc_type = 'sale' AND d.partner_id = ? AND d.io_date BETWEEN ? AND ?
    ORDER BY d.io_date, d.doc_no, l.id
  `).all(partnerId, from, to);

  const sum = (rows, f) => rows.reduce((a, r) => a + (r[f] || 0), 0);
  const totals = { qty: sum(lines, 'qty'), supply: sum(lines, 'supply'), vat: sum(lines, 'vat') };
  totals.total = totals.supply + totals.vat;

  // 전잔 = 기간 시작 전 (매출 - 수금), 후잔 = 전잔 + 기간 매출 - 기간 수금
  const salesBefore = db.prepare(`
    SELECT COALESCE(SUM(l.supply_amt + l.vat_amt), 0) AS v
    FROM doc d JOIN doc_line l ON l.doc_id = d.id
    WHERE d.doc_type = 'sale' AND d.partner_id = ? AND d.io_date < ?
  `).get(partnerId, from).v;
  const rcptBefore = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS v FROM receipt
    WHERE kind = '수금' AND partner_id = ? AND io_date < ?
  `).get(partnerId, from).v;
  const rcptPeriod = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS v FROM receipt
    WHERE kind = '수금' AND partner_id = ? AND io_date BETWEEN ? AND ?
  `).get(partnerId, from, to).v;

  const prev_balance = salesBefore - rcptBefore;
  const after_balance = prev_balance + totals.total - rcptPeriod;
  const last_doc_no = lines.length ? lines[lines.length - 1].doc_no : '';

  return c.json({ partner, lines, totals, prev_balance, receipt_period: rcptPeriod, after_balance, last_doc_no });
});

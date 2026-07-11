// BOM(제품↔생두 짝 + 기본수율) + 생산현황/수율분석
// BOM은 masters.mjs를 건드리지 않고 item.paired_item_id/item.default_yield 두 컬럼만
// 전용 엔드포인트로 갱신한다(002_item_pairing.sql에서 이미 추가된 컬럼).
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, isValidDate, todayISO, round1 } from './ledger.mjs';

export const production = new Hono();

function monthStartISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

const BOM_SELECT = `
  SELECT i.id AS item_id, i.code AS item_code, i.name AS item_name, i.item_type,
         i.paired_item_id, pi.code AS paired_item_code, pi.name AS paired_item_name,
         i.default_yield
  FROM item i
  LEFT JOIN item pi ON pi.id = i.paired_item_id
`;

// ══════════════════════════════════════════════════════════════
// BOM등록 — /api/bom
// ══════════════════════════════════════════════════════════════
production.get('/bom', (c) => {
  const q = (c.req.query('q') || '').trim();
  let sql = `${BOM_SELECT} WHERE i.item_type IN ('제품','상품')`;
  const params = [];
  if (q) { sql += ` AND (i.code LIKE ? OR i.name LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
  sql += ` ORDER BY i.code`;
  return c.json(db.prepare(sql).all(...params));
});

production.put('/bom/:itemId', async (c) => {
  const itemId = Number(c.req.param('itemId'));
  const item = Number.isInteger(itemId) && itemId > 0
    ? db.prepare(`SELECT id FROM item WHERE id = ? AND item_type IN ('제품','상품')`).get(itemId)
    : null;
  if (!item) return err(c, 404, '품목을 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  let pairedItemId = null;
  if (body.paired_item_id !== null && body.paired_item_id !== undefined) {
    const candidate = Number(body.paired_item_id) || 0;
    if (candidate === itemId) return err(c, 400, '생두는 자기 자신을 지정할 수 없습니다.');
    const paired = candidate ? db.prepare(`SELECT id FROM item WHERE id = ?`).get(candidate) : null;
    if (!paired) return err(c, 400, '연결할 생두를 찾을 수 없습니다.');
    pairedItemId = candidate;
  }

  const defaultYield = Number(body.default_yield);
  if (!(defaultYield > 0 && defaultYield <= 200)) return err(c, 400, '수율은 0 초과 200 이하로 입력하세요.');

  try {
    db.prepare(`UPDATE item SET paired_item_id = ?, default_yield = ? WHERE id = ?`)
      .run(pairedItemId, defaultYield, itemId);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '품목'));
  }

  return c.json(db.prepare(`${BOM_SELECT} WHERE i.id = ?`).get(itemId));
});

// ══════════════════════════════════════════════════════════════
// 생산현황/수율분석 — GET /api/production/summary
// ══════════════════════════════════════════════════════════════
production.get('/production/summary', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();

  // 로스팅 1건 단위: input_total(Σ input qty), output_item_id, output_total(=doc.total_qty)
  const docs = db.prepare(`
    SELECT d.id, d.io_date, d.total_qty AS output_total,
      (SELECT SUM(dl.qty) FROM doc_line dl WHERE dl.doc_id = d.id AND dl.line_role = 'input') AS input_total,
      (SELECT dl2.item_id FROM doc_line dl2 WHERE dl2.doc_id = d.id AND dl2.line_role = 'output' LIMIT 1) AS output_item_id
    FROM doc d
    WHERE d.doc_type = 'roast' AND d.io_date >= ? AND d.io_date <= ?
  `).all(from, to);

  const itemNameCache = new Map();
  const itemName = (id) => {
    if (id == null) return null;
    if (!itemNameCache.has(id)) {
      const row = db.prepare(`SELECT name FROM item WHERE id = ?`).get(id);
      itemNameCache.set(id, row?.name ?? '');
    }
    return itemNameCache.get(id);
  };
  const yieldOf = (inp, outp) => (inp > 0 ? round1((outp / inp) * 100) : null);

  let totalInput = 0, totalOutput = 0;
  const byItemMap = new Map();
  const byMonthMap = new Map();

  for (const d of docs) {
    const input = round1(d.input_total || 0);
    const output = round1(d.output_total || 0);
    totalInput = round1(totalInput + input);
    totalOutput = round1(totalOutput + output);

    const itemKey = d.output_item_id ?? null;
    if (!byItemMap.has(itemKey)) {
      byItemMap.set(itemKey, {
        output_item_id: itemKey, output_item_name: itemName(itemKey),
        batch_count: 0, input_total: 0, output_total: 0,
      });
    }
    const ib = byItemMap.get(itemKey);
    ib.batch_count += 1;
    ib.input_total = round1(ib.input_total + input);
    ib.output_total = round1(ib.output_total + output);

    const ym = d.io_date.slice(0, 7);
    if (!byMonthMap.has(ym)) {
      byMonthMap.set(ym, { ym, batch_count: 0, input_total: 0, output_total: 0 });
    }
    const mb = byMonthMap.get(ym);
    mb.batch_count += 1;
    mb.input_total = round1(mb.input_total + input);
    mb.output_total = round1(mb.output_total + output);
  }

  const by_item = [...byItemMap.values()]
    .map((r) => ({ ...r, avg_yield: yieldOf(r.input_total, r.output_total) }))
    .sort((a, b) => b.output_total - a.output_total);
  const by_month = [...byMonthMap.values()]
    .map((r) => ({ ...r, avg_yield: yieldOf(r.input_total, r.output_total) }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  return c.json({
    totals: {
      batch_count: docs.length, input_total: totalInput, output_total: totalOutput,
      avg_yield: yieldOf(totalInput, totalOutput),
    },
    by_item, by_month,
  });
});

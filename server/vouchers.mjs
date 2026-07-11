// 전표 CRUD — 판매/구매(doc_type sale|purchase) + 로스팅(doc_type roast)
// 재고의 유일한 진실은 stock_ledger. 저장/수정/삭제는 하나의 트랜잭션에서 doc/doc_line/stock_ledger를
// 함께 재작성한다. 금액(supply_amt/vat_amt/total_*)과 전표번호(doc_no)는 클라 값을 무시하고
// 서버가 항상 재계산·재채번한다.
import { Hono } from 'hono';
import { db } from './db.mjs';
import {
  err, readBody, friendlySqlError,
  nextSeqNo, calcAmounts, getVatRound, defaultFactoryWarehouseId,
  isValidDate, round1, validateLines, stockWarnings, validId,
  DOC_EMITS_LEDGER,
} from './ledger.mjs';
import { writeJournalForDoc } from './accounting.mjs';

export const vouchers = new Hono();

// Phase 1.5: quote/order/purchase_order까지 확장. 원장 발생 여부는 DOC_EMITS_LEDGER(ledger.mjs)를 따른다.
const DOC_TYPES = ['sale', 'purchase', 'quote', 'order', 'purchase_order'];
const CHAIN_TYPES = ['quote', 'order', 'purchase_order'];   // 진행상태(대기/완료)를 갖는 끌어오기 체인
const IO_TYPE_IN = { sale: '판매', purchase: '구매' };
// 끌어오기 대상 관계(target(저장하는 전표) → source(끌어올 원본 doc_type))
const PULL_MAP = { order: 'quote', sale: 'order', purchase: 'purchase_order' };

// ── 판매/구매/견적/주문/발주 전표 조회 ─────────────────────────
function loadDocDetail(id) {
  const doc = db.prepare(`
    SELECT d.id, d.doc_no, d.doc_type, d.io_date, d.partner_id, p.name AS partner_name,
           p.biz_no AS partner_biz_no, p.ceo AS partner_ceo, p.address AS partner_address, p.phone AS partner_phone,
           d.warehouse_id, w.name AS warehouse_name, d.tax_mode, d.project_id, d.memo,
           d.total_qty, d.total_supply, d.total_vat, d.total_amount,
           d.status, d.time_date, d.source_doc_id, d.emp_id, e.name AS emp_name
    FROM doc d
    LEFT JOIN partner p ON p.id = d.partner_id
    JOIN warehouse w ON w.id = d.warehouse_id
    LEFT JOIN employee e ON e.id = d.emp_id
    WHERE d.id = ? AND d.doc_type IN ('sale','purchase','quote','order','purchase_order')
  `).get(id);
  if (!doc) return null;
  const lines = db.prepare(`
    SELECT dl.id, dl.line_no, dl.item_id, i.code AS item_code, i.name AS item_name, i.unit, i.spec AS spec,
           dl.line_role, dl.qty, dl.price, dl.supply_amt, dl.vat_amt, dl.remarks
    FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ?
    ORDER BY dl.line_no
  `).all(id);
  return { ...doc, lines };
}

vouchers.get('/docs', (c) => {
  const type = c.req.query('type');
  if (!['sale', 'purchase', 'roast', 'quote', 'order', 'purchase_order'].includes(type)) {
    return err(c, 400, '전표 유형이 올바르지 않습니다.');
  }
  const from = c.req.query('from');
  const to = c.req.query('to');
  const partnerId = c.req.query('partner_id');
  const itemId = c.req.query('item_id');
  const status = c.req.query('status');

  let sql = `
    SELECT d.id, d.doc_no, d.doc_type, d.io_date, d.partner_id, p.name AS partner_name,
           d.warehouse_id, w.name AS warehouse_name,
           d.total_qty, d.total_supply, d.total_vat, d.total_amount, d.memo,
           d.status, d.time_date
    FROM doc d
    LEFT JOIN partner p ON p.id = d.partner_id
    JOIN warehouse w ON w.id = d.warehouse_id
    WHERE d.doc_type = ?
  `;
  const params = [type];
  if (from) { sql += ` AND d.io_date >= ?`; params.push(from); }
  if (to) { sql += ` AND d.io_date <= ?`; params.push(to); }
  if (partnerId) { sql += ` AND d.partner_id = ?`; params.push(Number(partnerId)); }
  if (itemId) {
    sql += ` AND EXISTS (SELECT 1 FROM doc_line dl WHERE dl.doc_id = d.id AND dl.item_id = ?)`;
    params.push(Number(itemId));
  }
  if (status) { sql += ` AND d.status = ?`; params.push(status); }
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
    return { ...r, item_summary, line_count: names.length };
  }));
});

// 끌어오기 후보 목록 — /docs/:id 보다 반드시 먼저 등록(정적 경로 우선 매칭)
vouchers.get('/docs/pullable', (c) => {
  const target = c.req.query('target');
  const sourceType = PULL_MAP[target];
  if (!sourceType) return err(c, 400, '전표 유형이 올바르지 않습니다.');
  const partnerId = c.req.query('partner_id');

  let sql = `
    SELECT d.id, d.doc_no, d.doc_type, d.io_date, d.partner_id, p.name AS partner_name,
           d.time_date, d.total_amount
    FROM doc d
    LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type = ? AND d.status = '대기'
  `;
  const params = [sourceType];
  if (partnerId) { sql += ` AND d.partner_id = ?`; params.push(Number(partnerId)); }
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
    return { ...r, item_summary, line_count: names.length };
  }));
});

// 지난 주문 복사용 — /docs/:id 보다 반드시 먼저 등록(정적 경로 우선 매칭)
vouchers.get('/docs/recent-sale', (c) => {
  const partnerId = Number(c.req.query('partner_id')) || 0;
  if (!partnerId) return c.json({ found: false });
  const doc = db.prepare(`
    SELECT id, doc_no, io_date FROM doc
    WHERE doc_type = 'sale' AND partner_id = ?
    ORDER BY io_date DESC, id DESC LIMIT 1
  `).get(partnerId);
  if (!doc) return c.json({ found: false });
  const lines = db.prepare(`
    SELECT dl.item_id, i.code AS item_code, i.name AS item_name, i.unit, dl.qty, dl.price, dl.remarks
    FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ? ORDER BY dl.line_no
  `).all(doc.id);
  return c.json({ found: true, doc_no: doc.doc_no, io_date: doc.io_date, lines });
});

vouchers.get('/docs/:id', (c) => {
  const id = validId(c);
  const detail = id ? loadDocDetail(id) : null;
  if (!detail) return err(c, 404, '전표를 찾을 수 없습니다.');
  return c.json(detail);
});

vouchers.post('/docs', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const type = body.type;
  if (!DOC_TYPES.includes(type)) return err(c, 400, '전표 유형이 올바르지 않습니다.');
  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');
  const partnerId = Number(body.partner_id) || 0;
  if (!partnerId) return err(c, 400, '거래처를 선택하세요.');
  const warehouseId = Number(body.warehouse_id) || 0;
  if (!warehouseId) return err(c, 400, '창고를 선택하세요.');
  const taxMode = body.tax_mode === '면세' ? '면세' : '과세';
  const projectId = Number(body.project_id) || null;
  const memo = String(body.memo ?? '');
  // 납기일자(order/purchase_order만 유효, 그 외 무시). 형식이 아니면 NULL로 저장.
  const timeDate = ['order', 'purchase_order'].includes(type) && isValidDate(body.time_date) ? body.time_date : null;
  // 담당자(사원, 선택). 미존재 id는 FK가 방어(friendlySqlError로 400).
  const empId = Number(body.emp_id) || null;

  // 끌어오기 원본(옵션): target→source 매핑(PULL_MAP)에 맞는 status='대기' 원본이어야 함
  let sourceDocId = null;
  if (body.source_doc_id) {
    const sourceType = PULL_MAP[type];
    const src = sourceType
      ? db.prepare(`SELECT id FROM doc WHERE id = ? AND doc_type = ? AND status = '대기'`)
          .get(Number(body.source_doc_id), sourceType)
      : null;
    if (!src) return err(c, 400, '끌어올 원본 전표를 찾을 수 없습니다.');
    sourceDocId = src.id;
  }

  const parsed = validateLines(body.lines, '품목 라인을 1개 이상 입력하세요.');
  if (parsed.error) return err(c, 400, parsed.error);

  const vatRound = getVatRound();
  const status = CHAIN_TYPES.includes(type) ? '대기' : '완료';   // 클라가 보낸 status는 무시하고 서버가 판정
  const emitsLedger = DOC_EMITS_LEDGER.has(type);                // quote/order/purchase_order는 원장 미발생
  const ioType = IO_TYPE_IN[type];
  const sign = type === 'sale' ? -1 : 1;

  try {
    const id = db.transaction(() => {
      let totalQty = 0, totalSupply = 0, totalVat = 0;
      const calced = parsed.lines.map(l => {
        const { supply, vat } = calcAmounts(l.qty, l.price, taxMode, vatRound);
        totalQty += l.qty; totalSupply += supply; totalVat += vat;
        return { ...l, supply, vat };
      });

      const docNo = nextSeqNo(ioDate, type);
      const info = db.prepare(`
        INSERT INTO doc (doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode,
                          project_id, memo, total_qty, total_supply, total_vat, total_amount,
                          status, source_doc_id, time_date, emp_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(docNo, type, ioDate, partnerId, warehouseId, taxMode, projectId, memo,
             round1(totalQty), totalSupply, totalVat, totalSupply + totalVat,
             status, sourceDocId, timeDate, empId);
      const docId = info.lastInsertRowid;

      const insLine = db.prepare(`
        INSERT INTO doc_line (doc_id, line_no, item_id, line_role, qty, price, supply_amt, vat_amt, remarks)
        VALUES (?,?,?,'normal',?,?,?,?,?)
      `);
      const insLedger = db.prepare(`
        INSERT INTO stock_ledger (doc_id, doc_line_id, io_date, item_id, warehouse_id, io_type, qty)
        VALUES (?,?,?,?,?,?,?)
      `);
      calced.forEach((l, idx) => {
        const lineInfo = insLine.run(docId, idx + 1, l.item_id, l.qty, l.price, l.supply, l.vat, l.remarks);
        if (emitsLedger) {
          insLedger.run(docId, lineInfo.lastInsertRowid, ioDate, l.item_id, warehouseId, ioType, sign * l.qty);
        }
      });

      // 끌어오기 전환: 원본 전표를 완료 처리(같은 트랜잭션)
      if (sourceDocId) {
        db.prepare(`UPDATE doc SET status = '완료', updated_at = datetime('now','localtime') WHERE id = ?`).run(sourceDocId);
      }

      // 자동분개(같은 트랜잭션 안). sale/purchase가 아니면 no-op(quote/order/purchase_order 안전).
      writeJournalForDoc(docId);

      return docId;
    })();

    const detail = loadDocDetail(id);
    // quote/order/purchase_order는 원장 미발생 → 음수재고 판정 대상이 아님(warnings 항상 [])
    const warnings = emitsLedger
      ? stockWarnings(parsed.lines.map(l => ({ itemId: l.item_id, warehouseId })))
      : [];
    return c.json({ ...detail, warnings }, 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '전표'));
  }
});

vouchers.put('/docs/:id', async (c) => {
  const id = validId(c);
  const existing = id
    ? db.prepare(`SELECT * FROM doc WHERE id = ? AND doc_type IN ('sale','purchase','quote','order','purchase_order')`).get(id)
    : null;
  if (!existing) return err(c, 404, '전표를 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const type = existing.doc_type; // 전표 유형·번호·체인(status/source_doc_id)은 수정 시 변경하지 않음(불변)
  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');
  const partnerId = Number(body.partner_id) || 0;
  if (!partnerId) return err(c, 400, '거래처를 선택하세요.');
  const warehouseId = Number(body.warehouse_id) || 0;
  if (!warehouseId) return err(c, 400, '창고를 선택하세요.');
  const taxMode = body.tax_mode === '면세' ? '면세' : '과세';
  const projectId = Number(body.project_id) || null;
  const memo = String(body.memo ?? '');
  const timeDate = ['order', 'purchase_order'].includes(type) && isValidDate(body.time_date) ? body.time_date : null;
  // 담당자(사원, 선택). 미존재 id는 FK가 방어(friendlySqlError로 400).
  const empId = Number(body.emp_id) || null;

  const parsed = validateLines(body.lines, '품목 라인을 1개 이상 입력하세요.');
  if (parsed.error) return err(c, 400, parsed.error);

  const vatRound = getVatRound();
  const emitsLedger = DOC_EMITS_LEDGER.has(type);
  const ioType = IO_TYPE_IN[type];
  const sign = type === 'sale' ? -1 : 1;

  try {
    db.transaction(() => {
      let totalQty = 0, totalSupply = 0, totalVat = 0;
      const calced = parsed.lines.map(l => {
        const { supply, vat } = calcAmounts(l.qty, l.price, taxMode, vatRound);
        totalQty += l.qty; totalSupply += supply; totalVat += vat;
        return { ...l, supply, vat };
      });

      db.prepare(`
        UPDATE doc SET partner_id=?, warehouse_id=?, tax_mode=?, project_id=?, memo=?, time_date=?, emp_id=?,
          total_qty=?, total_supply=?, total_vat=?, total_amount=?, updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(partnerId, warehouseId, taxMode, projectId, memo, timeDate, empId,
             round1(totalQty), totalSupply, totalVat, totalSupply + totalVat, id);

      // 원장 재작성: 기존 라인·원장을 지우고 새로 채운다(트랜잭션 안). quote/order/po는 애초에 원장이 없음.
      db.prepare(`DELETE FROM doc_line WHERE doc_id = ?`).run(id);
      db.prepare(`DELETE FROM stock_ledger WHERE doc_id = ?`).run(id);

      const insLine = db.prepare(`
        INSERT INTO doc_line (doc_id, line_no, item_id, line_role, qty, price, supply_amt, vat_amt, remarks)
        VALUES (?,?,?,'normal',?,?,?,?,?)
      `);
      const insLedger = db.prepare(`
        INSERT INTO stock_ledger (doc_id, doc_line_id, io_date, item_id, warehouse_id, io_type, qty)
        VALUES (?,?,?,?,?,?,?)
      `);
      calced.forEach((l, idx) => {
        const lineInfo = insLine.run(id, idx + 1, l.item_id, l.qty, l.price, l.supply, l.vat, l.remarks);
        if (emitsLedger) {
          insLedger.run(id, lineInfo.lastInsertRowid, ioDate, l.item_id, warehouseId, ioType, sign * l.qty);
        }
      });

      // 자동분개 재작성(같은 트랜잭션 안)
      writeJournalForDoc(id);
    })();

    const detail = loadDocDetail(id);
    const warnings = emitsLedger
      ? stockWarnings(parsed.lines.map(l => ({ itemId: l.item_id, warehouseId })))
      : [];
    return c.json({ ...detail, warnings });
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '전표'));
  }
});

vouchers.delete('/docs/:id', (c) => {
  const id = validId(c);
  const existing = id
    ? db.prepare(`SELECT id, source_doc_id FROM doc WHERE id = ? AND doc_type IN ('sale','purchase','quote','order','purchase_order')`).get(id)
    : null;
  if (!existing) return err(c, 404, '전표를 찾을 수 없습니다.');

  db.transaction(() => {
    db.prepare(`DELETE FROM doc WHERE id = ?`).run(id);
    // 역전환: 이 전표가 끌어온 원본이 있으면 원본 status를 대기로 원복(원본이 아직 존재할 때만 영향받음)
    if (existing.source_doc_id) {
      db.prepare(`UPDATE doc SET status = '대기', updated_at = datetime('now','localtime') WHERE id = ?`).run(existing.source_doc_id);
    }
  })();
  return c.json({ ok: true });
});

// 진행상태 수동 변경(현황 화면의 [완료처리] 버튼). quote/order/purchase_order만 허용.
vouchers.put('/docs/:id/status', async (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT id, doc_type FROM doc WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '전표를 찾을 수 없습니다.');
  if (!CHAIN_TYPES.includes(existing.doc_type)) return err(c, 400, '진행상태를 바꿀 수 없는 전표입니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const status = body.status === '대기' || body.status === '완료' ? body.status : null;
  if (!status) return err(c, 400, '진행상태가 올바르지 않습니다.');

  db.prepare(`UPDATE doc SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(status, id);
  return c.json({ id, status });
});

// ── 로스팅 (doc_type='roast') ────────────────────────────────
// 투입 여러 라인(line_role='input', 생산소모 −) + 산출 1건(line_role='output', 생산입고 +)을
// 한 트랜잭션으로 저장한다. 거래처 없음(partner_id NULL), 금액 0, tax_mode='면세'.
function loadRoastDetail(id) {
  const doc = db.prepare(`
    SELECT d.id, d.doc_no, d.io_date, d.warehouse_id, w.name AS warehouse_name, d.memo, d.yield_pct
    FROM doc d JOIN warehouse w ON w.id = d.warehouse_id
    WHERE d.id = ? AND d.doc_type = 'roast'
  `).get(id);
  if (!doc) return null;
  const lines = db.prepare(`
    SELECT dl.item_id, i.code AS item_code, i.name AS item_name, dl.line_role, dl.qty
    FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ? ORDER BY dl.line_no
  `).all(id);
  const inputs = lines.filter(l => l.line_role === 'input')
    .map(l => ({ item_id: l.item_id, item_code: l.item_code, item_name: l.item_name, qty: l.qty }));
  const out = lines.find(l => l.line_role === 'output');
  const output = out
    ? { item_id: out.item_id, item_code: out.item_code, item_name: out.item_name, qty: out.qty }
    : null;
  return {
    id: doc.id, doc_no: doc.doc_no, io_date: doc.io_date,
    warehouse_id: doc.warehouse_id, warehouse_name: doc.warehouse_name, memo: doc.memo,
    input_total: round1(inputs.reduce((s, l) => s + l.qty, 0)),
    output_total: output ? output.qty : 0,
    yield_pct: doc.yield_pct,
    inputs, output,
  };
}

async function saveRoast(c, existingId) {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');

  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');

  let warehouseId = Number(body.warehouse_id) || 0;
  if (!warehouseId) warehouseId = defaultFactoryWarehouseId() || 0;
  if (!warehouseId) return err(c, 400, '창고를 선택하세요.');

  const parsedInputs = validateLines(body.inputs, '투입 생두를 1개 이상 입력하세요.');
  if (parsedInputs.error) return err(c, 400, parsedInputs.error);

  const output = body.output;
  const outputItemId = Number(output?.item_id) || 0;
  const outputQty = round1(Number(output?.qty) || 0);
  if (!outputItemId || outputQty <= 0) return err(c, 400, '산출 원두와 수량을 입력하세요.');

  const memo = String(body.memo ?? '');

  try {
    const id = db.transaction(() => {
      const inputTotal = round1(parsedInputs.lines.reduce((s, l) => s + l.qty, 0));
      const yieldPct = inputTotal > 0 ? round1((outputQty / inputTotal) * 100) : null;

      let docId = existingId;
      if (docId) {
        db.prepare(`
          UPDATE doc SET io_date=?, warehouse_id=?, memo=?, total_qty=?, yield_pct=?,
            updated_at=datetime('now','localtime')
          WHERE id=?
        `).run(ioDate, warehouseId, memo, outputQty, yieldPct, docId);
        db.prepare(`DELETE FROM doc_line WHERE doc_id = ?`).run(docId);
        db.prepare(`DELETE FROM stock_ledger WHERE doc_id = ?`).run(docId);
      } else {
        const docNo = nextSeqNo(ioDate, 'roast');
        const info = db.prepare(`
          INSERT INTO doc (doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode,
                            project_id, memo, total_qty, total_supply, total_vat, total_amount, yield_pct)
          VALUES (?, 'roast', ?, NULL, ?, '면세', NULL, ?, ?, 0, 0, 0, ?)
        `).run(docNo, ioDate, warehouseId, memo, outputQty, yieldPct);
        docId = info.lastInsertRowid;
      }

      const insLine = db.prepare(`
        INSERT INTO doc_line (doc_id, line_no, item_id, line_role, qty, price, supply_amt, vat_amt, remarks)
        VALUES (?,?,?,?,?,0,0,0,'')
      `);
      const insLedger = db.prepare(`
        INSERT INTO stock_ledger (doc_id, doc_line_id, io_date, item_id, warehouse_id, io_type, qty)
        VALUES (?,?,?,?,?,?,?)
      `);
      let lineNo = 1;
      for (const l of parsedInputs.lines) {
        const lineInfo = insLine.run(docId, lineNo++, l.item_id, 'input', l.qty);
        insLedger.run(docId, lineInfo.lastInsertRowid, ioDate, l.item_id, warehouseId, '생산소모', -l.qty);
      }
      const outInfo = insLine.run(docId, lineNo++, outputItemId, 'output', outputQty);
      insLedger.run(docId, outInfo.lastInsertRowid, ioDate, outputItemId, warehouseId, '생산입고', outputQty);

      return docId;
    })();

    const detail = loadRoastDetail(id);
    const warnings = stockWarnings([
      ...parsedInputs.lines.map(l => ({ itemId: l.item_id, warehouseId })),
      { itemId: outputItemId, warehouseId },
    ]);
    if (detail.output_total > detail.input_total) {
      warnings.push('수율이 100%를 넘습니다(투입보다 산출이 많음). 수량을 확인하세요.');
    }
    return c.json({ ...detail, warnings }, existingId ? 200 : 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '로스팅'));
  }
}

vouchers.post('/roast', (c) => saveRoast(c, null));

vouchers.get('/roast', (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  let sql = `SELECT id FROM doc WHERE doc_type = 'roast'`;
  const params = [];
  if (from) { sql += ` AND io_date >= ?`; params.push(from); }
  if (to) { sql += ` AND io_date <= ?`; params.push(to); }
  sql += ` ORDER BY io_date DESC, id DESC`;
  const ids = db.prepare(sql).all(...params).map(r => r.id);
  return c.json(ids.map(id => {
    const d = loadRoastDetail(id);
    return {
      id: d.id, doc_no: d.doc_no, io_date: d.io_date,
      output_item_name: d.output?.item_name ?? '',
      input_total: d.input_total, output_total: d.output_total,
      yield_pct: d.yield_pct, memo: d.memo,
    };
  }));
});

vouchers.get('/roast/:id', (c) => {
  const id = validId(c);
  const detail = id ? loadRoastDetail(id) : null;
  if (!detail) return err(c, 404, '전표를 찾을 수 없습니다.');
  return c.json({ ...detail, warnings: [] });
});

vouchers.put('/roast/:id', (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT id FROM doc WHERE id = ? AND doc_type = 'roast'`).get(id) : null;
  if (!existing) return err(c, 404, '전표를 찾을 수 없습니다.');
  return saveRoast(c, id);
});

vouchers.delete('/roast/:id', (c) => {
  const id = validId(c);
  const info = id
    ? db.transaction(() => db.prepare(`DELETE FROM doc WHERE id = ? AND doc_type = 'roast'`).run(id))()
    : { changes: 0 };
  if (!info.changes) return err(c, 404, '전표를 찾을 수 없습니다.');
  return c.json({ ok: true });
});

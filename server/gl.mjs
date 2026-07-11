// 일반전표(gl-entry) — 원천 전표 없는 수동 분개(경비 등). entry_type='일반', doc_id/receipt_id=NULL.
// journal/journal_line에 그대로 기록되므로 분개장·거래처원장·월별손익 등 journal 기반 집계에
// 자동 합류한다(006 마이그레이션으로 원천 제약을 '정확히 1개'→'0 또는 1개'로 완화했기에 가능).
// 차대변 합계 일치는 이 파일이 저장 전 강제한다(005 accounting.mjs의 insertJournal과 동일 원칙).
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, nextSeqNo, isValidDate, todayISO, round1, validId } from './ledger.mjs';
function monthStartISO() { const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-01`; }

export const glEntries = new Hono();

// ── 목록(전표 단위, 라인 포함) ──────────────────────────────
glEntries.get('/gl-entries', (c) => {
  const from = isValidDate(c.req.query('from')) ? c.req.query('from') : monthStartISO();
  const to   = isValidDate(c.req.query('to'))   ? c.req.query('to')   : todayISO();
  const heads = db.prepare(`
    SELECT id, io_date, doc_no, summary FROM journal
    WHERE entry_type='일반' AND io_date>=? AND io_date<=?
    ORDER BY io_date DESC, id DESC`).all(from, to);
  const lineStmt = db.prepare(`
    SELECT line_no, account_code, account_name, dr, cr, partner_id, remarks
    FROM journal_line WHERE journal_id=? ORDER BY line_no`);
  const pName = db.prepare(`SELECT name FROM partner WHERE id=?`);
  return c.json(heads.map(h => {
    const lines = lineStmt.all(h.id).map(l => ({
      ...l, partner_name: l.partner_id ? (pName.get(l.partner_id)?.name ?? null) : null }));
    return { ...h, amount: lines.reduce((s,l)=>s+l.dr,0), lines };
  }));
});

// ── 생성(균형 강제) ──────────────────────────────────────────
glEntries.post('/gl-entries', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const ioDate = body.io_date;
  if (!isValidDate(ioDate)) return err(c, 400, '일자를 입력하세요.');
  const summary = String(body.summary ?? '');

  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map(l => ({ code:String(l.account_code ?? '').trim(),
                 dr:Math.trunc(Number(l.dr)||0), cr:Math.trunc(Number(l.cr)||0),
                 partner_id:Number(l.partner_id)||null, remarks:String(l.remarks ?? '') }))
    .filter(l => l.code && (l.dr>0 || l.cr>0));            // 계정+금액 있는 줄만
  if (lines.length < 2) return err(c, 400, '차변·대변을 합쳐 2줄 이상 입력하세요.');
  if (lines.some(l => l.dr>0 && l.cr>0)) return err(c, 400, '한 줄에 차변과 대변을 동시에 입력할 수 없습니다.');
  const sumDr = lines.reduce((s,l)=>s+l.dr,0), sumCr = lines.reduce((s,l)=>s+l.cr,0);
  if (sumDr !== sumCr) return err(c, 400, `차변합계(${sumDr.toLocaleString()})와 대변합계(${sumCr.toLocaleString()})가 일치하지 않습니다.`);

  const accs = new Map();
  for (const l of lines) if (!accs.has(l.code)) {
    const a = db.prepare(`SELECT id, code, name FROM account WHERE code=?`).get(l.code);
    if (!a) return err(c, 400, `계정과목(${l.code})을 찾을 수 없습니다.`);
    accs.set(l.code, a);
  }
  try {
    const id = db.transaction(() => {
      const docNo = nextSeqNo(ioDate, 'gl');
      const headPartner = lines.find(l => l.partner_id)?.partner_id ?? null;
      const jid = db.prepare(`
        INSERT INTO journal (doc_id, receipt_id, entry_type, io_date, doc_no, partner_id, summary)
        VALUES (NULL, NULL, '일반', ?, ?, ?, ?)`).run(ioDate, docNo, headPartner, summary).lastInsertRowid;
      const ins = db.prepare(`
        INSERT INTO journal_line (journal_id, line_no, account_id, account_code, account_name, dr, cr, partner_id, remarks)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      lines.forEach((l, i) => { const a = accs.get(l.code);
        ins.run(jid, i+1, a.id, a.code, a.name, l.dr, l.cr, l.partner_id, l.remarks); });
      return jid;
    })();
    return c.json({ id, doc_no: db.prepare(`SELECT doc_no FROM journal WHERE id=?`).get(id).doc_no }, 201);
  } catch (e) { return err(c, 400, friendlySqlError(e, '전표')); }
});

// ── 삭제 — 자동분개(원천 있는 분개)는 이 경로로 못 지움(보호) ──
glEntries.delete('/gl-entries/:id', (c) => {
  const id = validId(c);
  const info = id ? db.prepare(
    `DELETE FROM journal WHERE id=? AND entry_type='일반' AND doc_id IS NULL AND receipt_id IS NULL`).run(id)
    : { changes: 0 };
  if (!info.changes) return err(c, 404, '일반전표를 찾을 수 없습니다.');
  return c.json({ ok: true });
});

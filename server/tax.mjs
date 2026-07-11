// 세무 — 부가가치세신고서(/api/vat-return) · 세금계산서합계표(/api/tax-invoice-report) ·
// 전자세금계산서 진행단계(/api/tax-invoices, 전송 stub).
//
// ★ 소스 일치(설계 §3.1): 부가세신고서·세금계산서합계표는 매입매출장(accounting.mjs:372-419)과
// 완전히 동일한 원천·필터·컬럼을 쓴다 — doc 테이블, doc_type IN('sale'/'purchase'), io_date BETWEEN,
// tax_mode로 과세/면세 분리, 금액은 total_supply/total_vat(캐시 컬럼). journal은 다시 집계하지 않는다.
// 그래서 두 화면 숫자가 구조적으로 항상 일치한다(§5.2 대조 지점).
//
// TODO(국세청 연동): 홈택스 전자신고 파일(.101) 생성·전송은 R6+ 연동 예정. 현재는 로컬 집계·인쇄만.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, isValidDate, todayISO } from './ledger.mjs';

// 조회 화면 기간 기본값(이번달 1일). accounting.mjs monthStartISO()와 동일 규칙(로컬 복제 관례).
function monthStartISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}

export const tax = new Hono();

// 회사정보(PnlStatement/StatementSheet와 동일하게 settings에서 채운다)
function companyInfo() {
  const rows = db.prepare(
    `SELECT key, value FROM settings WHERE key IN ('company_name','company_biz_no','company_ceo')`
  ).all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    company_name: map.company_name ?? '',
    company_biz_no: map.company_biz_no ?? '',
    company_ceo: map.company_ceo ?? '',
  };
}

// ══════════════════════════════════════════════════════════════
// 1. 부가가치세신고서 — GET /api/vat-return
// ══════════════════════════════════════════════════════════════
tax.get('/vat-return', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();

  // 매출/매입 각각 tax_mode(과세/면세)별 집계 — VatBook의 docs 조회와 동일 원천/필터.
  const agg = (docType) => db.prepare(`
    SELECT tax_mode,
           COALESCE(SUM(total_supply),0) AS supply,
           COALESCE(SUM(total_vat),0)    AS vat,
           COUNT(*)                       AS cnt
    FROM doc
    WHERE doc_type=? AND io_date>=? AND io_date<=?
    GROUP BY tax_mode
  `).all(docType, from, to);

  const pick = (rows, mode) => rows.find((r) => r.tax_mode === mode) ?? { supply: 0, vat: 0, cnt: 0 };
  const salesRows = agg('sale');
  const purRows = agg('purchase');
  const sTax = pick(salesRows, '과세');
  const sFree = pick(salesRows, '면세');
  const pTax = pick(purRows, '과세');
  const pFree = pick(purRows, '면세');

  const tax_base = sTax.supply;              // 과세표준(=과세 매출 공급가액). 면세는 과세표준에 미포함
  const sales_vat = sTax.vat;                // 매출세액
  const purchase_vat = pTax.vat;             // 매입세액
  const payable = sales_vat - purchase_vat;  // 납부(환급)세액. 음수 = 환급
  // 영세율(0%): 현 데이터 모델은 tax_mode가 과세/면세뿐이라 영세율 라인은 항상 0(서식에 자리만 둔다).
  // TODO(영세율): 수출 등 영세율 거래 구분이 추가되면 tax_mode에 '영세율'을 더해 여기서 분리 집계한다.

  return c.json({
    from, to, ...companyInfo(),
    sales: { taxable_supply: sTax.supply, sales_vat: sTax.vat, free_supply: sFree.supply, count: sTax.cnt + sFree.cnt },
    purchase: { taxable_supply: pTax.supply, purchase_vat: pTax.vat, free_supply: pFree.supply, count: pTax.cnt + pFree.cnt },
    tax_base, sales_vat, purchase_vat, payable,
  });
});

// ══════════════════════════════════════════════════════════════
// 2. 세금계산서합계표 — GET /api/tax-invoice-report
// 세금계산서 = 과세 거래(tax_mode='과세')만 대상(면세는 계산서합계표로 별도 — R4 범위 밖).
// ══════════════════════════════════════════════════════════════
tax.get('/tax-invoice-report', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();

  const side = (docType) => {
    const raw = db.prepare(`
      SELECT d.partner_id, p.name AS partner_name, COALESCE(p.biz_no,'') AS biz_no,
             COUNT(*)                        AS sheet_count,
             COALESCE(SUM(d.total_supply),0) AS supply,
             COALESCE(SUM(d.total_vat),0)    AS vat
      FROM doc d LEFT JOIN partner p ON p.id=d.partner_id
      WHERE d.doc_type=? AND d.tax_mode='과세' AND d.io_date>=? AND d.io_date<=?
      GROUP BY d.partner_id
      ORDER BY p.name
    `).all(docType, from, to);
    const rows = raw.map((r) => ({
      partner_id: r.partner_id,
      partner_name: r.partner_id == null ? '(거래처 미지정)' : (r.partner_name ?? ''),
      biz_no: r.biz_no, sheet_count: r.sheet_count, supply: r.supply, vat: r.vat,
    }));
    const totals = rows.reduce((t, r) => ({
      partner_count: t.partner_count + 1,
      sheet_count: t.sheet_count + r.sheet_count,
      supply: t.supply + r.supply,
      vat: t.vat + r.vat,
    }), { partner_count: 0, sheet_count: 0, supply: 0, vat: 0 });
    return { rows, totals };
  };

  const { company_name, company_biz_no } = companyInfo();
  return c.json({
    from, to, company_name, company_biz_no,
    sales: side('sale'), purchase: side('purchase'),
  });
});

// ══════════════════════════════════════════════════════════════
// 3. 전자세금계산서 진행단계 — GET/PUT /api/tax-invoices
// 판매 과세 전표를 대상으로 한 발행상태 대장. 미발행은 저장하지 않고 LEFT JOIN 시 COALESCE로 간주
// (대장이 판매전표를 항상 전량 표시 → 원천 삭제 시 CASCADE로 상태도 자동 정리).
// ══════════════════════════════════════════════════════════════
const STATUSES = ['미발행', '발행', '전송예정', '전송완료'];

const INVOICE_SELECT = `
  SELECT d.id AS doc_id, d.doc_no, d.io_date, d.tax_mode,
         d.total_supply, d.total_vat, d.total_amount,
         p.name AS partner_name, COALESCE(p.biz_no,'') AS biz_no,
         COALESCE(t.status,'미발행') AS status, t.issued_at, t.approval_no, t.memo
  FROM doc d
  LEFT JOIN partner p ON p.id=d.partner_id
  LEFT JOIN tax_invoice_status t ON t.doc_id=d.id
`;
const lineNamesStmt = db.prepare(`
  SELECT i.name FROM doc_line dl JOIN item i ON i.id=dl.item_id
  WHERE dl.doc_id=? ORDER BY dl.line_no
`);
// GET 목록/PUT 응답 공용 — doc_line 서브쿼리(accounting.mjs lineNames)와 동일한 '첫 품목명 외 N건' 규칙.
function shapeInvoiceRow(d) {
  const names = lineNamesStmt.all(d.doc_id).map((x) => x.name);
  const item_summary = names.length ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}건` : '') : '';
  return {
    doc_id: d.doc_id, doc_no: d.doc_no, io_date: d.io_date,
    partner_name: d.partner_name ?? null, biz_no: d.biz_no,
    item_summary, supply: d.total_supply, vat: d.total_vat, total: d.total_amount,
    status: d.status, issued_at: d.issued_at ?? null, approval_no: d.approval_no ?? '', memo: d.memo ?? '',
  };
}

tax.get('/tax-invoices', (c) => {
  const fromQ = c.req.query('from');
  const toQ = c.req.query('to');
  const from = isValidDate(fromQ) ? fromQ : monthStartISO();
  const to = isValidDate(toQ) ? toQ : todayISO();
  const statusQ = c.req.query('status');

  let sql = INVOICE_SELECT + ` WHERE d.doc_type='sale' AND d.tax_mode='과세' AND d.io_date>=? AND d.io_date<=?`;
  const params = [from, to];
  if (statusQ && STATUSES.includes(statusQ)) {
    sql += ` AND COALESCE(t.status,'미발행')=?`;
    params.push(statusQ);
  }
  sql += ` ORDER BY d.io_date DESC, d.id DESC`;
  const rows = db.prepare(sql).all(...params).map(shapeInvoiceRow);

  // counts: status 필터를 뺀 동일 WHERE로 상태별 건수(단계별 배지용)
  const countRows = db.prepare(`
    SELECT COALESCE(t.status,'미발행') AS status, COUNT(*) AS cnt
    FROM doc d
    LEFT JOIN tax_invoice_status t ON t.doc_id=d.id
    WHERE d.doc_type='sale' AND d.tax_mode='과세' AND d.io_date>=? AND d.io_date<=?
    GROUP BY COALESCE(t.status,'미발행')
  `).all(from, to);
  const counts = { 전체: 0, 미발행: 0, 발행: 0, 전송예정: 0, 전송완료: 0 };
  for (const r of countRows) { counts[r.status] = r.cnt; counts.전체 += r.cnt; }

  return c.json({ rows, counts });
});

// PUT — 상태 변경(upsert). status='전송완료'는 로컬 변경 거부(국세청 연동 전용).
// TODO(국세청 연동): 공동인증서 첨부→홈택스 전송→승인번호(approval_no) 수신→status='전송완료'. R6+ 연동 예정.
// (전송 엔드포인트는 미구현 — 호출부 없음. 아래는 로컬 상태(미발행/발행/전송예정)만 바꾼다.)
tax.put('/tax-invoices/:docId', async (c) => {
  const docId = Number(c.req.param('docId'));
  if (!Number.isInteger(docId) || docId <= 0) return err(c, 404, '판매전표를 찾을 수 없습니다.');
  const doc = db.prepare(`SELECT id FROM doc WHERE id=? AND doc_type='sale'`).get(docId);
  if (!doc) return err(c, 404, '판매전표를 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const status = body.status;
  if (status === '전송완료') return err(c, 400, '전송완료는 국세청 연동 시 자동 처리됩니다.');
  if (!['미발행', '발행', '전송예정'].includes(status)) return err(c, 400, '허용되지 않는 상태입니다.');
  const memo = String(body.memo ?? '');

  db.prepare(`
    INSERT INTO tax_invoice_status (doc_id, status, issued_at, memo)
    VALUES (?, ?, CASE WHEN ?='발행' THEN datetime('now','localtime') ELSE NULL END, ?)
    ON CONFLICT(doc_id) DO UPDATE SET
      status = excluded.status,
      memo   = excluded.memo,
      issued_at = COALESCE(tax_invoice_status.issued_at, excluded.issued_at),
      updated_at = datetime('now','localtime')
  `).run(docId, status, status, memo);

  const row = db.prepare(INVOICE_SELECT + ` WHERE d.id=?`).get(docId);
  return c.json(shapeInvoiceRow(row));
});

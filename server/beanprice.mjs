// 생두 단가비교(bean-price) — 구매(purchase) 전표 라인 기반. 원재료(생두)별 최근가/최저가(업체)/평균가/
// 최근구매일/누적구매량 + 월별 구매 합계. 품목별 구매 이력 상세도 제공. 신규 테이블 없음.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, nextSeqNo, isValidDate, todayISO, round1, validId } from './ledger.mjs';
function monthStartISO() { const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-01`; }

export const beanPrice = new Hono();

// ── 목록 + 월별합계 — from/to 선택(기본: 전체 기간 — 미지정 시 필터 없음) ──
beanPrice.get('/bean-price', (c) => {
  const from = c.req.query('from'), to = c.req.query('to');
  const hasFrom = isValidDate(from), hasTo = isValidDate(to);
  const per = (alias) => {
    let s = ''; const p = [];
    if (hasFrom) { s += ` AND ${alias}.io_date>=?`; p.push(from); }
    if (hasTo)   { s += ` AND ${alias}.io_date<=?`; p.push(to);   }
    return { s, p };
  };
  const items = db.prepare(`SELECT id, code, name, unit FROM item WHERE item_type='원재료' AND active=1 ORDER BY code`).all();
  const rows = [];
  for (const it of items) {
    const f = per('d');
    const a = db.prepare(`
      SELECT COUNT(*) AS cnt, COALESCE(SUM(dl.qty),0) AS qty, COALESCE(SUM(dl.supply_amt),0) AS supply,
             MAX(d.io_date) AS last_date, MIN(dl.price) AS min_price
      FROM doc_line dl JOIN doc d ON d.id=dl.doc_id
      WHERE d.doc_type='purchase' AND dl.item_id=?${f.s}`).get(it.id, ...f.p);
    if (!a.cnt) continue;
    const recent = db.prepare(`
      SELECT dl.price, d.io_date, pt.name AS partner_name
      FROM doc_line dl JOIN doc d ON d.id=dl.doc_id LEFT JOIN partner pt ON pt.id=d.partner_id
      WHERE d.doc_type='purchase' AND dl.item_id=?${f.s} ORDER BY d.io_date DESC, d.id DESC LIMIT 1`).get(it.id, ...f.p);
    const minRow = db.prepare(`
      SELECT pt.name AS partner_name FROM doc_line dl JOIN doc d ON d.id=dl.doc_id LEFT JOIN partner pt ON pt.id=d.partner_id
      WHERE d.doc_type='purchase' AND dl.item_id=?${f.s} ORDER BY dl.price ASC, d.io_date DESC LIMIT 1`).get(it.id, ...f.p);
    rows.push({
      item_id:it.id, item_code:it.code, item_name:it.name, unit:it.unit,
      recent_price: recent?.price ?? 0, recent_date: a.last_date,
      min_price: a.min_price ?? 0, min_partner: minRow?.partner_name ?? null,
      avg_price: a.qty > 0 ? Math.round(a.supply / a.qty) : 0,
      total_qty: round1(a.qty), buy_count: a.cnt,
    });
  }
  const f2 = per('d');
  const monthly = db.prepare(`
    SELECT substr(d.io_date,1,7) AS ym, COALESCE(SUM(dl.qty),0) AS qty, COALESCE(SUM(dl.supply_amt),0) AS supply
    FROM doc_line dl JOIN doc d ON d.id=dl.doc_id JOIN item i ON i.id=dl.item_id
    WHERE d.doc_type='purchase' AND i.item_type='원재료'${f2.s}
    GROUP BY ym ORDER BY ym`).all(...f2.p);
  return c.json({ rows, monthly });
});

// ── 품목별 구매 이력(일자/거래처/수량/단가) ──────────────────
// 주의: ledger.mjs의 validId(c)는 라우트 파라미터명이 항상 :id 라고 가정한다(c.req.param('id') 고정).
// 이 라우트의 파라미터명은 :itemId 이므로 validId를 그대로 쓰면 항상 null이 된다(production.mjs의
// /bom/:itemId 처리와 동일하게 직접 파싱한다) — 설계 문서 3.6의 참조 구현에서 벗어난 부분.
beanPrice.get('/bean-price/:itemId', (c) => {
  const id = Number(c.req.param('itemId'));
  if (!Number.isInteger(id) || id <= 0) return err(c, 404, '품목을 찾을 수 없습니다.');
  return c.json(db.prepare(`
    SELECT d.io_date, d.doc_no, pt.name AS partner_name, dl.qty, dl.price, dl.supply_amt
    FROM doc_line dl JOIN doc d ON d.id=dl.doc_id LEFT JOIN partner pt ON pt.id=d.partner_id
    WHERE d.doc_type='purchase' AND dl.item_id=? ORDER BY d.io_date DESC, d.id DESC`).all(id));
});

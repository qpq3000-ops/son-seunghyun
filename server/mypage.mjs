// MyPage 위젯 통합 — GET /api/mypage 1개로 재고현황·판매현황·미수금TOP·To Do·달력 미니 데이터를 반환한다.
// 전부 기존 테이블 집계(reports.mjs/vouchers.mjs/receipts.mjs와 동일 SQL을 이 파일에 복제) —
// 신규 테이블·마이그레이션 없음. 파일 격리를 위해 공용 헬퍼(ledger.mjs)만 import한다.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { round1, todayISO } from './ledger.mjs';

export const mypage = new Hono();

mypage.get('/mypage', (c) => {
  const today = todayISO();
  const ym = today.slice(0, 7);             // 'YYYY-MM'
  const ymSlash = ym.replace('-', '/');      // 'YYYY/MM' (헤더 표기)
  const monthFrom = `${ym}-01`;
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));

  // ── 재고현황: reports.mjs /stock/status와 동일 집계, |재고|>0 상위 8(내림차순) ──
  const stockRows = db.prepare(`
    SELECT i.id AS item_id, i.code AS item_code, i.name AS item_name, i.spec, i.unit, i.safety_qty,
      COALESCE((
        SELECT SUM(sl.qty) FROM stock_ledger sl WHERE sl.item_id = i.id AND sl.io_date <= ?
      ), 0) AS raw_qty
    FROM item i
  `).all(today);
  const stock = stockRows
    .map(r => {
      const qty = round1(r.raw_qty);
      return {
        item_id: r.item_id, item_code: r.item_code, item_name: r.item_name,
        spec: r.spec, unit: r.unit, qty,
        below_safety: r.safety_qty > 0 && qty < r.safety_qty,
      };
    })
    .filter(r => Math.abs(r.qty) > 0.001)
    .sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty))
    .slice(0, 8);

  // ── 판매현황: vouchers.mjs /docs(type=sale) 축약, 이번달 최근 6건 ──
  const saleRows = db.prepare(`
    SELECT d.id, d.doc_no, d.io_date, p.name AS partner_name,
           d.total_qty, d.total_supply, d.total_vat, d.total_amount
    FROM doc d LEFT JOIN partner p ON p.id = d.partner_id
    WHERE d.doc_type = 'sale' AND d.io_date >= ? AND d.io_date <= ?
    ORDER BY d.io_date DESC, d.id DESC LIMIT 6
  `).all(monthFrom, today);
  const lineNames = db.prepare(`
    SELECT i.name FROM doc_line dl JOIN item i ON i.id = dl.item_id
    WHERE dl.doc_id = ? ORDER BY dl.line_no
  `);
  const sales = saleRows.map(r => {
    const names = lineNames.all(r.id).map(x => x.name);
    const item_summary = names.length
      ? names[0] + (names.length > 1 ? ` 외 ${names.length - 1}건` : '')
      : '';
    return {
      id: r.id, doc_no: r.doc_no, io_date: r.io_date,
      item_summary, total_qty: r.total_qty, total_supply: r.total_supply,
      total_vat: r.total_vat, total_amount: r.total_amount, partner_name: r.partner_name ?? null,
    };
  });

  // ── 미수금 TOP: receipts.mjs /receivables 축약, balance>0 상위 5(내림차순) ──
  const recvRows = db.prepare(`
    SELECT p.id AS partner_id, p.code AS partner_code, p.name AS partner_name,
      COALESCE((SELECT SUM(d.total_amount) FROM doc d
                WHERE d.doc_type = 'sale' AND d.partner_id = p.id AND d.io_date <= ?), 0)
      - COALESCE((SELECT SUM(r.amount) FROM receipt r
                WHERE r.kind = '수금' AND r.partner_id = p.id AND r.io_date <= ?), 0) AS balance
    FROM partner p
  `).all(today, today);
  const receivables_top = recvRows
    .filter(r => r.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
    .map(r => ({ partner_id: r.partner_id, partner_code: r.partner_code, partner_name: r.partner_name, balance: r.balance }));

  // ── To Do: R5 실데이터 예정. 지금은 항상 빈 배열 ──
  const todos = [];

  // ── 달력 미니: reports.mjs /calendar와 동일 3쿼리, 활동 있는 날짜만 ──
  const days = {};
  const ensure = (date) => {
    if (!days[date]) days[date] = { roast_count: 0, sale_count: 0, order_due_count: 0 };
    return days[date];
  };
  const roastRows = db.prepare(`
    SELECT io_date, COUNT(*) AS cnt FROM doc
    WHERE doc_type = 'roast' AND substr(io_date,1,7) = ? GROUP BY io_date
  `).all(ym);
  for (const r of roastRows) ensure(r.io_date).roast_count = r.cnt;

  const calSaleRows = db.prepare(`
    SELECT io_date, COUNT(*) AS cnt FROM doc
    WHERE doc_type = 'sale' AND substr(io_date,1,7) = ? GROUP BY io_date
  `).all(ym);
  for (const r of calSaleRows) ensure(r.io_date).sale_count = r.cnt;

  const orderRows = db.prepare(`
    SELECT time_date, COUNT(*) AS cnt FROM doc
    WHERE doc_type = 'order' AND time_date IS NOT NULL AND substr(time_date,1,7) = ? GROUP BY time_date
  `).all(ym);
  for (const r of orderRows) ensure(r.time_date).order_due_count = r.cnt;

  return c.json({
    ym: ymSlash,
    stock,
    sales,
    receivables_top,
    todos,
    calendar: { year, month, days },
  });
});

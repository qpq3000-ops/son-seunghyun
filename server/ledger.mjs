// 전표 엔진 공유 헬퍼 — vouchers.mjs / receipts.mjs / reports.mjs 가 공용으로 import 한다.
// masters.mjs의 err/readBody/friendlySqlError와 동일 시그니처를 여기 복제해 재사용한다
// (마스터 CRUD 파일인 masters.mjs 자체는 수정하지 않는다).
import { db } from './db.mjs';

// ── 공통 응답/파싱 헬퍼 (masters.mjs와 동일 시그니처) ──────────────
export function err(c, status, message) {
  return c.json({ error: message }, status);
}

// JSON body 안전 파싱: 잘못된 JSON / 배열 body는 null 반환 → 호출부에서 400 처리
export async function readBody(c) {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    return null;
  } catch {
    return null;
  }
}

export function friendlySqlError(e, label) {
  if (String(e.message).includes('UNIQUE')) return `${label} 코드가 이미 존재합니다.`;
  if (String(e.message).includes('CHECK')) return `허용되지 않는 값이 있습니다.`;
  if (String(e.message).includes('FOREIGN KEY')) return `연결된 자료가 있어 처리할 수 없습니다.`;
  return e.message;
}

// ── 날짜/수치 유틸 ──────────────────────────────────────────
// io_date 형식 검증 'YYYY-MM-DD' (달력상 실재 여부까지는 확인하지 않음 — masters.mjs 수준의 단순 검증)
export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 경로 파라미터 :id 검증 — 정수가 아니면 null(호출부에서 404 처리)
export function validId(c) {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 수량은 kg 소수 1자리 규칙 → 합산 시 생기는 부동소수 오차 정리(예: 12.3+7.9)
export function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}

// ── 채번 (doc_seq) ────────────────────────────────────────
// 반드시 트랜잭션 내부에서 호출한다. io_date 'YYYY-MM-DD', seqKey 'sale'|'purchase'|'roast'|'수금'|'지불'.
// 삭제해도 last_no는 감소시키지 않는다 → 빈 번호가 생겨도 재사용하지 않음.
// 수정(PUT) 시에는 호출하지 않는다 → 전표번호(최초 채번값)는 불변.
export function nextSeqNo(ioDate, seqKey) {
  const ymd = ioDate.replace(/-/g, '');
  const row = db.prepare(`
    INSERT INTO doc_seq (io_date, seq_key, last_no) VALUES (?, ?, 1)
    ON CONFLICT(io_date, seq_key) DO UPDATE SET last_no = last_no + 1
    RETURNING last_no
  `).get(ymd, seqKey);
  return `${ymd}-${row.last_no}`;
}

// ── 금액 재계산 ───────────────────────────────────────────
// settings.vat_round (없으면 'floor')
export function getVatRound() {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'vat_round'`).get();
  return row?.value === 'round' ? 'round' : 'floor';
}

// 클라 VoucherForm.calcLine과 비트 단위로 동일해야 한다(미리보기·저장값 불일치 방지).
// 공급가액/부가세는 항상 서버가 이 함수로 재계산 — 클라가 보낸 supply_amt/vat_amt는 폐기한다.
export function calcAmounts(qty, price, taxMode, vatRound) {
  const supply = Math.round(qty * price);
  const rawVat = taxMode === '과세' ? supply * 0.1 : 0;
  const vat = vatRound === 'round' ? Math.round(rawVat) : Math.floor(rawVat);
  return { supply, vat };
}

// ── 창고 ─────────────────────────────────────────────────
// 로스팅 창고 미지정 시 사용할 기본 공장 창고(wh_type='공장' 중 첫 번째, 활성만)
export function defaultFactoryWarehouseId() {
  const row = db.prepare(
    `SELECT id FROM warehouse WHERE wh_type = '공장' AND active = 1 ORDER BY id LIMIT 1`
  ).get();
  return row?.id ?? null;
}

// ── 전표 라인 검증 ─────────────────────────────────────────
// 품목 라인 배열을 검증·정규화한다(판매/구매 라인, 로스팅 투입 라인 공용).
// - 수량을 입력했는데 품목을 선택하지 않은 라인이 있으면 구체적으로 안내
// - 유효 라인(품목 선택 + 수량>0)이 하나도 없으면 emptyMessage로 안내
export function validateLines(rawLines, emptyMessage) {
  const arr = Array.isArray(rawLines) ? rawLines : [];
  if (arr.some(l => !l?.item_id && Number(l?.qty) > 0)) {
    return { error: '품목을 선택하지 않은 라인이 있습니다.' };
  }
  const lines = arr
    .filter(l => l?.item_id && Number(l.qty) > 0)
    .map(l => ({
      item_id: Number(l.item_id),
      qty: round1(Number(l.qty)),
      price: Math.trunc(Number(l.price) || 0),
      remarks: String(l.remarks ?? ''),
    }));
  if (!lines.length) return { error: emptyMessage };
  return { lines };
}

// ── Phase 1.5: doc_type 규칙 헬퍼 (2장 규칙표) ────────────────
// 원장(stock_ledger)을 발생시키는 doc_type 집합. quote/order/purchase_order는 원장 미발생.
export const DOC_EMITS_LEDGER = new Set(['sale', 'purchase', 'roast', 'move', 'self_use', 'defect', 'adjust']);

// 기타이동 4종(move/self_use/defect/adjust) 라인 1건에 대한 stock_ledger 삽입행(들)을 만든다.
// - move: 보내는창고 기타출고(-) + 받는창고 기타입고(+) 2행(총재고 불변)
// - self_use/defect: 창고 기타출고(-) 1행
// - adjust: diff(=실사-장부)가 0이면 미발생, 아니면 diff>0 기타입고(+) / diff<0 기타출고(-) 1행
// qty는 라인의 절대 수량(양수), adjust만 diff(부호 있는 값)를 별도로 받는다.
export function buildMoveLedgerRows({ docType, itemId, warehouseId, whToId, qty, diff }) {
  if (docType === 'move') {
    return [
      { itemId, warehouseId, ioType: '기타출고', qty: -qty },
      { itemId, warehouseId: whToId, ioType: '기타입고', qty },
    ];
  }
  if (docType === 'self_use' || docType === 'defect') {
    return [{ itemId, warehouseId, ioType: '기타출고', qty: -qty }];
  }
  if (docType === 'adjust') {
    if (!diff) return [];
    return [{ itemId, warehouseId, ioType: diff > 0 ? '기타입고' : '기타출고', qty: diff }];
  }
  return [];
}

// 재고조정 장부수량: 지정 시점(asOf) 이하 해당 (품목,창고) 조합의 stock_ledger 누계.
// 조정 저장 시 이 값을 기준으로 diff를 계산하므로, 저장 전(원장 재작성 delete 이후) 호출해야 한다.
export function bookQty(itemId, warehouseId, asOf) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(qty), 0) AS bal FROM stock_ledger WHERE item_id = ? AND warehouse_id = ? AND io_date <= ?`
  ).get(itemId, warehouseId, asOf);
  return round1(row.bal);
}

// ── 재고 경고 ─────────────────────────────────────────────
// 저장 후 영향받은 (품목,창고) 조합의 현재 잔량을 확인해 음수면 경고 문자열을 만든다.
// 음수재고 자체는 막지 않는다(이카운트와 동일) — 저장이 이미 커밋된 뒤 호출해서 안내만 담는다.
export function stockWarnings(pairs) {
  const warnings = [];
  const seen = new Set();
  for (const { itemId, warehouseId } of pairs) {
    const key = `${itemId}:${warehouseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = db.prepare(
      `SELECT COALESCE(SUM(qty), 0) AS bal FROM stock_ledger WHERE item_id = ? AND warehouse_id = ?`
    ).get(itemId, warehouseId);
    const bal = round1(row.bal);
    if (bal < 0) {
      const item = db.prepare(`SELECT name FROM item WHERE id = ?`).get(itemId);
      warnings.push(`'${item?.name ?? ''}' 재고가 ${bal}kg 입니다.`);
    }
  }
  return warnings;
}

export interface Item {
  id: number;
  code: string;
  name: string;
  spec: string;
  unit: string;
  item_type: '원재료' | '부자재' | '제품' | '상품';
  price_in: number;
  price_out: number;
  safety_qty: number;
  use_lot: 0 | 1;
  is_set: 0 | 1;
  barcode: string;
  memo: string;
  active: 0 | 1;
  paired_item_id: number | null;  // 제품(원두)에 연결된 생두 — 로스팅입력의 자동 제안에 사용
  default_yield: number;          // 로스팅 기본 수율(%)
}

export interface Partner {
  id: number;
  code: string;
  name: string;
  biz_no: string;
  ceo: string;
  phone: string;
  email: string;
  address: string;
  partner_type: '매출' | '매입' | '매출+매입';
  pay_cycle: '당일' | '월별';
  memo: string;
  active: 0 | 1;
}

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  wh_type: '창고' | '공장';
  memo: string;
  active: 0 | 1;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  memo: string;
  active: 0 | 1;
}

export interface PriceSpecial {
  id: number;
  partner_id: number;
  item_id: number;
  price: number;
  memo: string;
  partner_code: string;
  partner_name: string;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_price_out: number;
}

export type Settings = Record<string, string>;

// ───────────────────────── Phase 1: 전표 엔진 ─────────────────────────

// 전표 품목 라인 (GET /api/docs/:id, POST/PUT 응답의 lines[])
export interface DocLine {
  id?: number;
  line_no?: number;
  item_id: number;
  item_code?: string;
  item_name?: string;
  unit?: string;
  spec?: string;               // 규격(인쇄용, Phase 1.5)
  line_role?: 'normal' | 'input' | 'output';
  qty: number;
  price: number;
  supply_amt: number;
  vat_amt: number;
  remarks: string;
}

// 전표 1건 상세 (GET/POST/PUT /api/docs(/:id) 응답 — POST/PUT은 warnings 포함)
export interface Doc {
  id: number;
  doc_no: string;
  doc_type: 'sale' | 'purchase' | 'roast' | 'quote' | 'order' | 'purchase_order';
  io_date: string;
  partner_id: number | null;
  partner_name?: string;
  partner_biz_no?: string;     // 인쇄용(Phase 1.5) — 공급받는자 사업자번호
  partner_ceo?: string;
  partner_address?: string;
  partner_phone?: string;
  warehouse_id: number;
  warehouse_name?: string;
  tax_mode: '과세' | '면세';
  project_id: number | null;
  memo: string;
  status?: '대기' | '완료';    // 견적/주문/발주 진행상태(Phase 1.5)
  time_date?: string | null;   // 납기일자(주문/발주, Phase 1.5)
  source_doc_id?: number | null; // 끌어오기 원본 전표 id(Phase 1.5)
  total_qty: number;
  total_supply: number;
  total_vat: number;
  total_amount: number;
  lines: DocLine[];
  warnings?: string[];
}

// 전표 목록 1행 (GET /api/docs — 조회 화면 그리드)
export interface DocListRow {
  id: number;
  doc_no: string;
  doc_type: 'sale' | 'purchase' | 'roast' | 'quote' | 'order' | 'purchase_order';
  io_date: string;
  partner_id: number | null;
  partner_name: string | null;
  warehouse_id: number;
  warehouse_name: string;
  item_summary: string;
  line_count: number;
  total_qty: number;
  total_supply: number;
  total_vat: number;
  total_amount: number;
  status?: '대기' | '완료';
  time_date?: string | null;
  memo: string;
}

// 로스팅 1건 상세 (GET/POST/PUT /api/roast(/:id) 응답)
export interface RoastDetail {
  id: number;
  doc_no: string;
  io_date: string;
  warehouse_id: number;
  warehouse_name: string;
  memo: string;
  input_total: number;
  output_total: number;
  yield_pct: number;
  inputs: { item_id: number; item_code: string; item_name: string; qty: number }[];
  output: { item_id: number; item_code: string; item_name: string; qty: number };
  warnings?: string[];
}

// 로스팅 이력 1행 (GET /api/roast)
export interface RoastListRow {
  id: number;
  doc_no: string;
  io_date: string;
  output_item_name: string;
  input_total: number;
  output_total: number;
  yield_pct: number | null;
  memo: string;
}

// 수금/지불 (GET/POST/PUT /api/receipts(/:id))
export interface Receipt {
  id: number;
  receipt_no: string;
  kind: '수금' | '지불';
  io_date: string;
  partner_id: number;
  partner_name: string;
  method: '현금' | '보통예금' | '받을어음' | '카드' | '기타';
  amount: number;
  project_id: number | null;
  memo: string;
}

// 미수금(미지급)현황 1행 (GET /api/receivables, /api/payables)
export interface Receivable {
  partner_id: number;
  partner_code: string;
  partner_name: string;
  pay_cycle: '당일' | '월별';
  sales_total: number;
  receipt_total: number;
  balance: number;
}

// 재고현황 1행 (GET /api/stock/status)
export interface StockRow {
  item_id: number;
  item_code: string;
  item_name: string;
  spec: string;
  unit: string;
  item_type: string;
  qty: number;
  safety_qty: number;
  below_safety: boolean;
}

// 재고수불부 1행 (LedgerReport.rows[])
export interface LedgerRow {
  io_date: string;
  doc_no: string;
  io_type: string;
  partner_name: string | null;
  in_qty: number;
  out_qty: number;
  balance: number;
  memo: string;
}

// 재고수불부 응답 (GET /api/stock/ledger)
export interface LedgerReport {
  item: { id: number; code: string; name: string; unit: string };
  opening: number;
  rows: LedgerRow[];
  sum_in: number;
  sum_out: number;
  closing: number;
}

// ───────────────────────── Phase 1.5: 전표체인·기타이동·인쇄 ─────────────────────────

// 기타이동 4종 라인 (GET/POST/PUT /api/moves(/:id) 응답의 lines[])
export interface MoveLine {
  line_no?: number;
  item_id: number;
  item_code?: string;
  item_name?: string;
  unit?: string;
  qty: number;               // move/self_use/defect=입력수량, adjust=실사수량(저장 후 확정값)
  book_qty?: number | null;  // adjust 전용: 저장 시점 장부수량(참고 표시)
  real_qty?: number;         // adjust 요청 전용(POST/PUT body에서만 사용, 응답엔 qty로 내려옴)
  remarks: string;
}

// 기타이동 1건 상세 (GET/POST/PUT /api/moves(/:id) 응답 — POST/PUT은 warnings 포함)
export interface MoveDetail {
  id: number;
  doc_no: string;
  doc_type: 'move' | 'self_use' | 'defect' | 'adjust';
  io_date: string;
  warehouse_id: number;
  warehouse_name: string;
  wh_to_id?: number | null;
  wh_to_name?: string | null;
  memo: string;
  method?: string | null;    // defect='폐기', 그 외 null
  lines: MoveLine[];
  warnings?: string[];
}

// 기타이동 목록 1행 (GET /api/moves)
export interface MoveListRow {
  id: number;
  doc_no: string;
  doc_type: 'move' | 'self_use' | 'defect' | 'adjust';
  io_date: string;
  warehouse_id: number;
  warehouse_name: string;
  wh_to_id?: number | null;
  wh_to_name?: string | null;
  item_summary: string;
  line_count: number;
  total_qty: number;
  memo: string;
  method?: string | null;
}

// 미지급현황 1행 (GET /api/payables) — Receivable과 동일 구조, 매입 기준
export interface Payable {
  partner_id: number;
  partner_code: string;
  partner_name: string;
  pay_cycle: '당일' | '월별';
  purchase_total: number;
  payment_total: number;
  balance: number;
}

// 끌어오기 후보 1행 (GET /api/docs/pullable)
export interface PullRow {
  id: number;
  doc_no: string;
  doc_type: string;
  io_date: string;
  partner_id: number | null;
  partner_name: string;
  item_summary: string;
  line_count: number;
  total_amount: number;
  time_date?: string | null;
}

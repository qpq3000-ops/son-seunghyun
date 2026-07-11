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

// ───────────────────────── Phase 3: 회계 코어(계정과목/분개/원장/손익) ─────────────────────────

// 계정과목 (GET/POST/PUT /api/accounts) — MasterScreen<Account>로 사용
export interface Account {
  id: number;
  code: string;
  name: string;
  category: '자산' | '부채' | '자본' | '수익' | '비용';
  is_system: 0 | 1;
  active: 0 | 1;
  memo: string;
}

// 분개장 1행 = 분개 라인 1건 (GET /api/journal)
export interface JournalRow {
  journal_id: number;
  line_no: number;
  io_date: string;
  doc_no: string;
  entry_type: '매출' | '매입' | '수금' | '지불';
  account_code: string;
  account_name: string;
  dr: number;
  cr: number;
  partner_id: number | null;
  partner_name: string | null;
  summary: string;
}

// 거래처원장 1행 (GET /api/partner-ledger 의 rows[])
export interface PartnerLedgerRow {
  io_date: string;
  doc_no: string;
  entry_type: string;
  summary: string;
  increase: number;
  decrease: number;
  balance: number;
}

// 거래처원장 응답 (GET /api/partner-ledger)
export interface PartnerLedger {
  partner: { id: number; code: string; name: string };
  side: '매출' | '매입';
  account: { code: string; name: string };
  opening: number;
  rows: PartnerLedgerRow[];
  sum_increase: number;
  sum_decrease: number;
  closing: number;
}

// 월별손익 1행 (GET /api/monthly-pl 의 rows[])
export interface MonthlyPLRow {
  key: string;
  label: string;
  values: number[];   // 12개월치
  total: number;
}

// 월별손익 응답 (GET /api/monthly-pl)
export interface MonthlyPL {
  year: number;
  months: string[];   // 'YYYY-MM' × 12
  rows: MonthlyPLRow[];
}

// 매입매출장 1행 (GET /api/vat-book 의 rows[])
export interface VatBookRow {
  io_date: string;
  doc_no: string;
  kind: '매출' | '매입';
  tax_mode: '과세' | '면세';
  partner_name: string;
  item_summary: string;
  supply: number;
  vat: number;
  total: number;
}

export interface VatBookSummarySide {
  과세공급: number;
  부가세: number;
  면세공급: number;
  합계: number;
}

// 매입매출장 응답 (GET /api/vat-book)
export interface VatBook {
  rows: VatBookRow[];
  summary: { 매출: VatBookSummarySide; 매입: VatBookSummarySide };
}

// ───────────────────────── Phase 2: 생산(BOM/수율)·창고별재고·달력 ─────────────────────────

// BOM등록 1행 (GET/PUT /api/bom(/:itemId))
export interface BomRow {
  item_id: number;
  item_code: string;
  item_name: string;
  item_type: string;
  paired_item_id: number | null;
  paired_item_code: string | null;
  paired_item_name: string | null;
  default_yield: number;
}

// 생산현황/수율분석 — 산출품목별 1행
export interface ProdItemRow {
  output_item_id: number;
  output_item_name: string;
  batch_count: number;
  input_total: number;
  output_total: number;
  avg_yield: number | null;
}

// 생산현황/수율분석 — 월별 1행
export interface ProdMonthRow {
  ym: string;
  batch_count: number;
  input_total: number;
  output_total: number;
  avg_yield: number | null;
}

// 생산현황/수율분석 응답 (GET /api/production/summary)
export interface ProductionSummary {
  totals: { batch_count: number; input_total: number; output_total: number; avg_yield: number | null };
  by_item: ProdItemRow[];
  by_month: ProdMonthRow[];
}

// 창고별재고현황 1행 (GET /api/stock/by-warehouse 의 rows[])
export interface StockWhRow {
  item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  by_wh: Record<string, number>;
  total: number;
}

// 창고별재고현황 응답 (GET /api/stock/by-warehouse)
export interface StockWhMatrix {
  warehouses: { id: number; name: string }[];
  rows: StockWhRow[];
}

// 달력 — 일자별 집계 1건 (GET /api/calendar 의 days[key])
export interface CalendarDay {
  roast_count: number;
  roast_kg: number;
  sale_count: number;
  sale_kg: number;
  sale_amount: number;
  order_due_count: number;
}

// 달력 — 월 조회 응답 (GET /api/calendar?year&month)
export interface CalendarMonth {
  year: number;
  month: number;
  days: Record<string, CalendarDay>;
}

// 달력 — 일자 상세 이벤트 1건 (GET /api/calendar/day 의 events[])
export interface CalendarEvent {
  kind: '로스팅' | '판매' | '주문납기';
  doc_type: string;
  id: number;
  doc_no: string;
  partner_name: string | null;
  title: string;
  qty: number;
  amount: number;
  time_date?: string;
}

// 달력 — 일자 상세 응답 (GET /api/calendar/day?date=)
export interface CalendarDayDetail {
  date: string;
  events: CalendarEvent[];
}

// ───────────────────────── 잔여메뉴 7종 (설계-잔여메뉴.md 5장) ─────────────────────────

// ── 로트조회·생산입고 조회 (GET /api/roast-docs) ──
export interface RoastInputLine { item_id: number; item_code: string; item_name: string; qty: number; }
export interface RoastDocRow {
  id: number; doc_no: string; io_date: string;
  warehouse_id: number; warehouse_name: string;
  output_item_id: number | null; output_item_name: string;
  output_total: number; yield_pct: number | null; memo: string;
  input_total: number; input_summary: string; inputs: RoastInputLine[];
}
// ── 소요량계산 (GET /api/mrp) ──
export interface MrpRow {
  item_id: number; item_code: string; item_name: string; unit: string;
  required: number; stock: number; shortage: number;
  bean_item_id: number | null; bean_code: string | null; bean_name: string | null;
  yield_pct: number; bean_need: number | null; bean_stock: number | null; bean_short: number | null;
}
export interface MrpReport { rows: MrpRow[]; }
// ── 일반전표 (/api/gl-entries) ──
export interface GlLine {
  line_no?: number; account_code: string; account_name?: string;
  dr: number; cr: number; partner_id: number | null; partner_name?: string | null; remarks: string;
}
export interface GlEntry { id: number; io_date: string; doc_no: string; summary: string; amount: number; lines: GlLine[]; }
// ── 자금현황 (GET /api/cash) ──
export interface CashSummaryRow { method: string; in_amt: number; out_amt: number; net: number; }
export interface CashListRow {
  io_date: string; kind: '수금' | '지불'; partner_name: string; method: string;
  receipt_no: string; in_amt: number; out_amt: number; memo: string;
}
export interface CashReport { summary: CashSummaryRow[]; list: CashListRow[]; totals: { in_amt: number; out_amt: number; net: number }; }
// ── 거래처 메시지 (GET /api/message) ──
export interface MessageLine { item_name: string; unit: string; qty: number; price: number; amount: number; }
export interface MessagePartner { partner_id: number; partner_name: string; lines: MessageLine[]; total: number; }
// ── 생두 단가비교 (/api/bean-price) ──
export interface BeanPriceRow {
  item_id: number; item_code: string; item_name: string; unit: string;
  recent_price: number; recent_date: string; min_price: number; min_partner: string | null;
  avg_price: number; total_qty: number; buy_count: number;
}
export interface BeanMonthRow { ym: string; qty: number; supply: number; }
export interface BeanPriceReport { rows: BeanPriceRow[]; monthly: BeanMonthRow[]; }
export interface BeanHistoryRow { io_date: string; doc_no: string; partner_name: string | null; qty: number; price: number; supply_amt: number; }

// ───────────────────────── R1: 재무 보고서 8종 (설계-R1-보고서엔진.md §1) ─────────────────────────

// ── 1. 계정별원장 (GET /api/account-ledger, 원장형) ──
export interface AccountLedgerRow {
  io_date: string; doc_no: string; entry_type: string;
  partner_name: string | null; dr: number; cr: number; balance: number; summary: string;
}
export interface AccountLedger {
  meta: { account: { code: string; name: string; category: string; dr_side: boolean } };
  opening: number;
  rows: AccountLedgerRow[];
  sum_dr: number; sum_cr: number; closing: number;
}

// ── 2. 총계정원장 (GET /api/general-ledger, 집계형) ──
export interface GeneralLedgerRow {
  code: string; name: string; category: string;
  opening: number; dr: number; cr: number; balance: number;
}
export interface GeneralLedger {
  rows: GeneralLedgerRow[];
  summary: { sum_dr: number; sum_cr: number };
}

// ── 3. 현금출납장 (GET /api/cashbook, 원장형) ──
export interface CashbookRow {
  io_date: string; doc_no: string; kind: string;
  partner_name: string | null; in_amt: number; out_amt: number; balance: number; summary: string;
}
export interface Cashbook {
  meta: { account: { code: string; name: string } };
  opening: number;
  rows: CashbookRow[];
  sum_in: number; sum_out: number; closing: number;
}

// ── 4. 합계잔액시산표 (GET /api/trial-balance, 집계형) ──
export interface TrialBalanceRow {
  code: string; name: string; category: string;
  sum_dr: number; sum_cr: number; bal_dr: number; bal_cr: number;
}
export interface TrialBalance {
  rows: TrialBalanceRow[];
  totals: { sum_dr: number; sum_cr: number; bal_dr: number; bal_cr: number; balanced: boolean };
}

// ── 5. 손익계산서 (GET /api/income-statement, 서식형 — PnlStatement.tsx) ──
export interface PnlDetail { code: string; name: string; amount: number; }
export interface PnlSection {
  key: string; no: string; label: string; amount: number; emphasis: boolean; details: PnlDetail[];
}
export interface IncomeStatement {
  from: string; to: string; company_name: string; sections: PnlSection[];
}

// ── 6/7. 수금현황·지급현황 (GET /api/receipt-status, /api/payment-status — 동형) ──
export interface ReceiptStatusRow {
  io_date: string; receipt_no: string; partner_name: string;
  method: string; amount: number; memo: string;
}
export interface ReceiptStatusSummary {
  count: number; total: number;
  by_method: { method: string; count: number; amount: number }[];
}
export interface ReceiptStatus { rows: ReceiptStatusRow[]; summary: ReceiptStatusSummary; }
export type PaymentStatus = ReceiptStatus;

// ── 8. 이익현황 (GET /api/profit-status, 집계형) ──
export interface ProfitStatusRow {
  key: number; code: string; name: string; qty: number;
  sales: number; cost: number; margin: number; margin_pct: number;
  // 'mixed' = group=partner 등 한 그룹에 원가 소스가 다른 라인이 섞인 경우(서버 finreports.mjs 실 거동)
  cost_source: 'std' | 'avg' | 'none' | 'mixed';
}
export interface ProfitStatus {
  rows: ProfitStatusRow[];
  summary: { qty: number; sales: number; cost: number; margin: number; margin_pct: number };
}

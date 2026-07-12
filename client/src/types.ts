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
  emp_id?: number | null;       // 담당자(사원) id — 선택(R3)
  emp_name?: string;            // 담당자명(조회용, R3)
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

// ───────────────────────── R2: 영업·재고 현황 7종 (설계-R2-영업재고현황.md §1) ─────────────────────────

// ── 1. 미주문현황 (GET /api/order-missing, 집계형) ──
export interface OrderMissingRow {
  partner_id: number; code: string; name: string; pay_cycle: string;
  last_order: string | null; last_sale: string | null; days_since: number | null;
}
export interface OrderMissing {
  rows: OrderMissingRow[];
  summary: { count: number; basis: string };
}

// ── 2/3/4. 견적서·주문서·발주서 현황 (GET /api/quote-status, /api/order-status, /api/po-status — 라인 단위, 공용) ──
export interface DocStatusRow {
  io_date: string; doc_no: string; partner_name: string;
  item_code: string; item_name: string; qty: number; price: number;
  supply_amt: number; vat_amt: number; amount: number; status: string;
  time_date: string | null; memo: string;
}
export interface DocStatus {
  rows: DocStatusRow[];
  summary: { count: number; qty: number; supply: number; vat: number; total: number };
}

// ── 5. 판매구매 집계표 (GET /api/sales-purchase-summary, 집계형·group×tx 8조합 공용) ──
export interface SalesSummaryRow {
  code: string; label: string; qty: number; supply: number; vat: number; total: number;
}
export interface SalesSummary {
  rows: SalesSummaryRow[];
  summary: { count: number; qty: number; supply: number; vat: number; total: number };
}

// ── 6. 기타이동현황 (GET /api/other-moves, stock_ledger grain) ──
export interface OtherMovesRow {
  io_date: string; doc_no: string; type: string; item_code: string; item_name: string;
  warehouse_name: string; io_type: string; qty: number; memo: string;
}
export interface OtherMoves {
  rows: OtherMovesRow[];
  summary: { count: number; net_qty: number };
}

// ── 7. 재고변동표 (GET /api/stock-flow, 전 품목 이월/입고/출고/잔량) ──
export interface StockFlowRow {
  item_id: number; code: string; name: string; spec: string; unit: string;
  opening: number; in_qty: number; out_qty: number; closing: number;
}
export interface StockFlow {
  rows: StockFlowRow[];
  summary: { count: number };
}

// ───────────────────────── R3: IA 재편성 + MyPage + 사원(담당자) ─────────────────────────

// 사원(담당자) 마스터 (GET/POST/PUT/DELETE /api/employees) — MasterScreen<Employee>로 사용
export interface Employee {
  id: number;
  code: string;
  name: string;
  phone: string;
  memo: string;
  active: 0 | 1;
  created_at?: string;
}

// MyPage 재고현황 위젯 1행 (GET /api/mypage 의 stock[])
export interface MyPageStockRow {
  item_id: number;
  item_code: string;
  item_name: string;
  spec: string;
  unit: string;
  qty: number;
  below_safety: boolean;
}

// MyPage 판매현황 위젯 1행 (GET /api/mypage 의 sales[]) — 참고서 §2/설계-R8 §1.2: 전표 품목 줄 단위로 변경
export interface MyPageSaleRow {
  io_date: string;
  doc_no: string;
  item_name: string;
  spec: string;
  unit: string;            // 규격 없을 때 [단위] 폴백 표기용
  qty: number;
  unit_price: number;      // 공급가액÷수량 반올림(서버계산)
  supply: number;
  vat: number;
  total: number;
  partner_name: string | null;
}

// 쪽지함리스트 1행 — GET /api/mypage 의 messages[] (현재 그룹웨어 쪽지 저장소가 없어 항상 [])
export interface MyPageMessageRow {
  id: number;
  content: string;
  from_name: string;
  created_at: string;
}

// 매입매출장 위젯 1행 — GET /api/mypage 의 pnl_ledger[]
export interface MyPagePnlRow {
  io_date: string;
  doc_no: string;
  kind: '매출' | '매입';
  partner_name: string | null;
  item_summary: string;
  supply: number;
  vat: number;
  total: number;
}

// (세금)계산서진행단계 1행 — GET /api/mypage 의 tax_invoice[] (R8에서는 항상 [])
export interface MyPageTaxInvoiceRow {
  doc_id: number;
  doc_no: string;
  io_date: string;
  partner_name: string | null;
  total: number;
  status: string;
}

// MyPage 미수금 TOP 위젯 1행 (GET /api/mypage 의 receivables_top[])
export interface MyPageReceivableRow {
  partner_id: number;
  partner_code: string;
  partner_name: string;
  balance: number;
}

// MyPage 달력 미니 위젯 — 일자별 집계 1건 (GET /api/mypage 의 calendar.days[key])
export interface MyPageCalendarDay {
  roast_count: number;
  sale_count: number;
  order_due_count: number;
}

// MyPage To Do 위젯 1행 (GET /api/mypage 의 todos[] — R5: groupware.mjs todo 테이블 연동, §3.7)
export interface MyPageTodo {
  id: number;
  content: string;
  due_date: string;
  done: 0 | 1;
}

// MyPage 위젯 통합 응답 (GET /api/mypage, 파라미터 없음) — 설계-R8-실물매칭.md §1.2
export interface MyPageData {
  ym: string;
  stock: MyPageStockRow[];
  sales: MyPageSaleRow[];
  receivables_top: MyPageReceivableRow[];   // 유지(렌더 제외, SHOW_LEGACY_WIDGETS 전용)
  todos: MyPageTodo[];
  calendar: { year: number; month: number; days: Record<string, MyPageCalendarDay> }; // 유지(렌더 제외, SHOW_LEGACY_WIDGETS 전용)
  messages: MyPageMessageRow[];
  pnl_ledger: MyPagePnlRow[];
  tax_invoice: MyPageTaxInvoiceRow[];
}

// ───────────────────────── R4: 세무 + 회계Ⅱ(설계-R4-세무회계2.md §4.6) ─────────────────────────
// 주의: 화면 컴포넌트명(VatReturn/TaxInvoiceReport)과 이름이 겹치므로 응답 타입은
// VatReturnData/TaxInvoiceReportData로 명명한다(설계 §4.6 원안의 VatReturn/TaxInvoiceReport에서 변경).

// ── 부가가치세신고서 (GET /api/vat-return) ──
export interface VatReturnData {
  from: string; to: string; company_name: string; company_biz_no: string; company_ceo: string;
  sales: { taxable_supply: number; sales_vat: number; free_supply: number; count: number };
  purchase: { taxable_supply: number; purchase_vat: number; free_supply: number; count: number };
  tax_base: number; sales_vat: number; purchase_vat: number; payable: number;
}

// ── 세금계산서합계표 (GET /api/tax-invoice-report) ──
export interface TaxInvoiceSide {
  rows: { partner_id: number | null; partner_name: string; biz_no: string; sheet_count: number; supply: number; vat: number }[];
  totals: { partner_count: number; sheet_count: number; supply: number; vat: number };
}
export interface TaxInvoiceReportData {
  from: string; to: string; company_name: string; company_biz_no: string;
  sales: TaxInvoiceSide; purchase: TaxInvoiceSide;
}

// ── 전자세금계산서 진행단계 (GET/PUT /api/tax-invoices) ──
export interface EtaxRow {
  doc_id: number; doc_no: string; io_date: string; partner_name: string | null; biz_no: string;
  item_summary: string; supply: number; vat: number; total: number;
  status: string; issued_at: string | null; approval_no: string; memo: string;
}
export interface EtaxList { rows: EtaxRow[]; counts: Record<string, number>; }

// ── 고정자산 (GET/POST/PUT/DELETE /api/fixed-assets) ──
export interface FixedAsset {
  id: number; code: string; name: string; asset_account: string; acq_date: string;
  acq_cost: number; salvage_value: number; life_years: number; method: string; memo: string; active: 0 | 1;
}

// ── 감가상각 스케줄(GET /api/fixed-assets/:id/schedule) · 현황(GET /api/depreciation) ──
export interface DepScheduleRow { ym: string; dep: number; accum: number; book_value: number; }
export interface DepSchedule { asset: FixedAsset; monthly_dep: number; total_dep: number; rows: DepScheduleRow[]; }
export interface DepreciationReport {
  by_asset: {
    code: string; name: string; asset_account: string; acq_date: string; acq_cost: number;
    salvage_value: number; monthly_dep: number; dep_in_range: number; accum_to: number; book_value: number;
  }[];
  by_month: { ym: string; dep: number }[];
  totals: { asset_count: number; dep_in_range: number; accum_to: number };
}

// ── 예산관리 (GET/PUT /api/budget) ──
export interface BudgetRow {
  account_code: string; account_name: string; category: string;
  budget: number[]; actual: number[]; budget_total: number; actual_total: number; variance: number; rate_pct: number;
}
export interface BudgetReport {
  year: number; rows: BudgetRow[];
  totals: { budget_total: number; actual_total: number; variance: number; rate_pct: number };
}

// ── 예적금현황 (GET/POST/PUT/DELETE /api/deposits) — MasterScreen<Deposit>로 사용 ──
export interface Deposit {
  id: number; code: string; name: string; bank: string; account_no: string; kind: '예금' | '적금';
  principal: number; rate: number; start_date: string; maturity_date: string; memo: string; active: 0 | 1;
}

// ── 자금계획 (GET/POST/PUT/DELETE /api/fund-plans) ──
export interface FundPlanRow {
  id: number; plan_date: string; flow: '수입' | '지출'; amount: number;
  partner_id: number | null; partner_name: string | null; title: string; memo: string;
}
export interface FundPlanList {
  rows: FundPlanRow[];
  summary: { in_total: number; out_total: number; net: number; count: number };
}

// ───────────────────────── R5: 관리 + 그룹웨어 + 유틸(설계-R5-관리그룹웨어유틸.md §4.9) ─────────────────────────

// ── 급여대장(GET /api/payroll, POST /api/payroll, DELETE /api/payroll/:id) — hr.mjs §3.1·3.3 ──
export interface PayrollRow {
  emp_id: number; emp_code: string; emp_name: string; payroll_id: number | null; pay_ym: string | null; pay_date: string;
  base_pay: number; allowance: number; meal_allowance: number;
  national_pension: number; health_ins: number; longterm_care: number; employment_ins: number;
  income_tax: number; local_income_tax: number; other_deduction: number;
  gross_pay: number; deduction_total: number; net_pay: number; memo: string;
}
export interface PayrollList { ym: string; rows: PayrollRow[]; totals: { gross_pay: number; deduction_total: number; net_pay: number; count: number }; }
// ── 급여 요율(GET/PUT /api/payroll/rates) — §3.2 ──
export interface PayrollRates { pension: number; health: number; longterm: number; employment: number; income_tax: number; }
// ── 급여명세서(GET /api/payroll/:id/statement) — §3.4 ──
export interface PayslipData {
  company: { name: string; biz_no: string; ceo: string }; emp: { code: string; name: string };
  pay_ym: string; pay_date: string; earnings: { label: string; amount: number }[]; deductions: { label: string; amount: number }[];
  gross_pay: number; deduction_total: number; net_pay: number;
}

// ── 근태관리(GET/POST/PUT/DELETE /api/attendance) — hr.mjs §3.5 ──
export interface AttendanceRow {
  id: number; emp_id: number; emp_code: string; emp_name: string;
  work_date: string; att_type: string; check_in: string; check_out: string; memo: string;
}
export interface AttendanceSummaryRow {
  emp_id: number; emp_code: string; emp_name: string;
  work_days: number; leave_days: number; half_days: number; absent_days: number; overtime_days: number;
}
export interface AttendanceList { ym: string; rows: AttendanceRow[]; summary: AttendanceSummaryRow[]; }

// ── 게시판(/api/board*) — groupware.mjs §3.6, `memo` id 재사용 ──
export interface BoardPost { id: number; title: string; content: string; pinned: 0 | 1; author: string; created_at: string; updated_at: string; }
// ── To Do(/api/todos*) — groupware.mjs §3.7, MyPage 위젯 연동 ──
export interface Todo { id: number; content: string; due_date: string; done: 0 | 1; done_at: string | null; created_at: string; }

// ── 엑셀 업로드 dry-run(POST /api/io/import/preview) 및 반영(POST /api/io/import/apply) — admin.mjs §3.8·3.9 ──
export interface IoPreview {
  type: string; columns: string[]; preview: Record<string, unknown>[];
  stats: { total: number; new: number; update: number; error: number }; errors: { row: number; reason: string }[];
}
export interface IoApplyResult { created: number; updated: number; }

// ── 판매현황 이관 dry-run(POST /api/migrate/sales/preview) 및 실행(POST /api/migrate/sales/apply) — admin.mjs §3.10 ──
export interface MigratePartnerMap { name: string; action: '병합' | '신규생성' | '기존' | '매칭실패'; target_name: string; target_code: string | null; matched: boolean; }
export interface MigratePreview {
  partner_map: MigratePartnerMap[];
  stats: { sheet_docs: number; planned: number; skipped_existing: number; skipped_no_partner: number; item_ok: number; item_fail: number };
  item_fail: { doc_no: string; partner_name: string; item_text: string }[]; period: { from: string; to: string }; total_supply: number;
}
export interface MigrateApplyResult { created: number; }

// ── 백업/복원(GET /api/backup/list, POST /api/backup/now, POST /api/backup/restore) — admin.mjs §3.11~3.13 ──
export interface BackupFile { name: string; size: number; mtime: string; }
export interface BackupList { dir: string; files: BackupFile[]; }
export interface BackupNowResult { ok: boolean; file: { name: string; size: number }; }
export interface BackupRestoreResult { ok: boolean; needs_restart: boolean; pre_backup: string; message: string; }

// ───────────────────────── R9: 실물 매칭 — 전표조회(회계거래조회) ─────────────────────────

// 전표조회(회계거래조회) 1행 — GET /api/gl-vouchers (설계-R9-실물매칭.md §1.2)
export interface GlVoucherRow {
  journal_id: number;
  io_date: string;
  doc_no: string;
  entry_type: '매출' | '매입' | '수금' | '지불' | '일반';
  source_menu: string;      // 입력메뉴(서버계산)
  amount: number;
  partner_name: string | null;
  summary: string;
}

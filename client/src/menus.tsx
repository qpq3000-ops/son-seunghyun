import { ComponentType } from 'react';
import { Dashboard } from './screens/Dashboard';
import { ItemMaster, PartnerMaster, WarehouseMaster, ProjectMaster, EmployeeMaster } from './screens/masters';
import { PriceSpecialScreen } from './screens/PriceSpecialScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Placeholder } from './screens/Placeholder';
import { SaleInput, PurchaseInput } from './screens/VoucherScreen';
import { SaleList, PurchaseList } from './screens/VoucherList';
import { FromSalePartnerInput, ReceiptScreen, ReceivableScreen } from './screens/ReceiptScreen';
import { RoastInput } from './screens/RoastInput';
import { StockStatus, StockLedger } from './screens/StockScreens';
import { StatementPrint } from './screens/StatementPrint';
import { QuoteList, OrderList, PurchaseOrderList } from './screens/DocChainList';
import { StockMove, SelfUse, Defect, StockAdjust } from './screens/MoveScreens';
import { ToPurchasePartnerInput, PaymentScreen, PayableScreen } from './screens/PaymentScreen';
import { AccountMaster, JournalScreen, PartnerLedger, MonthlyPL, VatBook } from './screens/AccountingScreens';
import { BomScreen, ProductionStatus } from './screens/ProductionScreens';
import { StockByWarehouse } from './screens/StockByWarehouse';
import { CalendarScreen } from './screens/CalendarScreen';
import { LotScreen } from './screens/LotScreen';
import { MrpScreen } from './screens/MrpScreen';
import { ProdInScreen } from './screens/ProdInScreen';
import { GlEntryScreen, ExpenseRequestInput } from './screens/GlEntryScreen';
import { SalesVoucher1Input, PurchaseVoucher1Input } from './screens/AcctVoucherEntry';
import { CashScreen } from './screens/CashScreen';
import { MessageScreen } from './screens/MessageScreen';
import { BeanPriceScreen } from './screens/BeanPriceScreen';
import { ReportScreen } from './components/ReportScreen';
import { REPORT_DEFS } from './screens/reportDefs';
import { PnlStatement } from './screens/PnlStatement';
import { VatReturn } from './screens/VatReturn';
import { TaxInvoiceReport } from './screens/TaxInvoiceReport';
import { EtaxInvoiceScreen } from './screens/EtaxInvoiceScreen';
import { FixedAssetScreen } from './screens/FixedAssetScreen';
import { BudgetScreen } from './screens/BudgetScreen';
import { DepositScreen } from './screens/DepositScreen';
import { FundPlanScreen } from './screens/FundPlanScreen';
import { PayrollScreen } from './screens/PayrollScreen';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { BoardScreen } from './screens/BoardScreen';
import { TodoScreen } from './screens/TodoScreen';
import { ExcelIoScreen } from './screens/ExcelIoScreen';
import { BackupScreen } from './screens/BackupScreen';
import { MigrateScreen } from './screens/MigrateScreen';
import { StubScreen } from './screens/StubScreen';
import { SaleBulkPostScreen } from './screens/SaleBulkPostScreen';
import { GlVoucherScreen } from './screens/GlVoucherScreen';
import { ArByPartnerScreen } from './screens/ArByPartnerScreen';
import { GridStub } from './screens/GridStub';

// 전체 메뉴 트리 (docs/설계-R3-IA재편성.md §1 — 이카운트식 대메뉴 재편성) — 미구현 메뉴는 Placeholder로 Phase 표시
export interface MenuDef {
  id: string;
  group: string;
  name: string;
  component: ComponentType;
  phase: number;          // 구현 Phase
  implemented: boolean;
  subgroup?: string;       // 서브그룹(선택)
}

const ph = (name: string, phase: number): ComponentType =>
  () => <Placeholder name={name} phase={phase} />;

// R5: 연동 예정 stub 래퍼(ph()와 동일 패턴) — bank-link/wms/pos/shopping-mall/forex가 공용 StubScreen을 사용(§1.2)
const stub = (title: string, description: string): ComponentType =>
  () => <StubScreen title={title} description={description} />;

// R1 보고서 엔진(ReportScreen 공통 화면) — 정의 id로 REPORT_DEFS에서 조회해 마운트
const R = (id: string): ComponentType =>
  () => <ReportScreen def={REPORT_DEFS[id]} />;

// R10-B: 실물 메뉴 뼈대(GridStub, 설계-R10-커버리지.md §B-0) — '준비 중' stub이 아니라
// 실물명 타이틀바 + 빈 그리드로 화면 자체는 갖춘 커버리지 확장용 메뉴.
// note는 국세청/은행/전자결재 등 실연동 예정 안내가 필요한 일부 메뉴(§B-3⑦ 전자계약 등)에서만 전달한다.
const gs = (name: string, columns?: string[], note?: string): ComponentType =>
  () => <GridStub title={name} columns={columns} note={note} />;

const m = (id: string, group: string, name: string, phase: number, component?: ComponentType, subgroup?: string): MenuDef => ({
  id, group, name, phase,
  implemented: !!component,
  component: component ?? ph(name, phase),
  subgroup,
});

export const MENUS: MenuDef[] = [
  m('dashboard', 'MyPage', '메인 대시보드', 0, Dashboard),

  // ══════════════════════════════ 재고Ⅰ (서브그룹 기존 유지, 무변경) ══════════════════════════════

  // ── 재고Ⅰ — 기초등록 ──
  m('employee', '재고Ⅰ', '사원등록', 0, EmployeeMaster, '기초등록'),
  m('item', '재고Ⅰ', '품목등록', 0, ItemMaster, '기초등록'),
  m('partner', '재고Ⅰ', '거래처등록', 0, PartnerMaster, '기초등록'),
  m('warehouse', '재고Ⅰ', '창고등록', 0, WarehouseMaster, '기초등록'),
  m('price', '재고Ⅰ', '단가관리', 0, PriceSpecialScreen, '기초등록'),
  m('project', '재고Ⅰ', '프로젝트등록', 0, ProjectMaster, '기초등록'),

  // ── 재고Ⅰ — 영업관리 ──
  m('quote', '재고Ⅰ', '견적서입력/조회', 1, QuoteList, '영업관리'),
  m('order', '재고Ⅰ', '주문서입력/조회', 1, OrderList, '영업관리'),
  m('sale', '재고Ⅰ', '판매입력', 1, SaleInput, '영업관리'),
  m('sale-status', '재고Ⅰ', '판매조회', 1, SaleList, '영업관리'),
  m('receipt', '재고Ⅰ', '수금입력', 1, ReceiptScreen, '영업관리'),
  m('receivable', '재고Ⅰ', '미수금현황', 1, ReceivableScreen, '영업관리'),
  m('statement-print', '재고Ⅰ', '거래명세서인쇄', 1, StatementPrint, '영업관리'),
  m('sale-bulk-acct', '재고Ⅰ', '판매일괄회계반영', 1, SaleBulkPostScreen, '영업관리'),
  m('ar-by-partner', '재고Ⅰ', '거래처별채권', 1, ArByPartnerScreen, '영업관리'),
  m('message', '재고Ⅰ', '거래처 메시지', 4, MessageScreen, '영업관리'),
  // R10-B §B-3⑤ 영업관리 보강(판매 트리 잔여 + 출하)
  m('sale-price-bulk-change', '재고Ⅰ', '판매단가일괄변경', 9, gs('판매단가일괄변경', ['품목코드', '품목명', '기존단가', '변경단가', '적용일']), '영업관리'),
  m('sale-status-report', '재고Ⅰ', '판매현황', 9, gs('판매현황', ['일자', '거래처', '품목', '수량', '금액']), '영업관리'),
  m('sale-discount-status', '재고Ⅰ', '판매할인현황', 9, gs('판매할인현황', ['일자', '거래처', '품목', '할인율', '할인액']), '영업관리'),
  m('sale-unposted-status', '재고Ⅰ', '회계미반영현황(판매)', 9, gs('회계미반영현황(판매)', ['일자', '거래처', '전표번호', '금액', '비고']), '영업관리'),
  m('shipment-order', '재고Ⅰ', '출하지시서', 9, gs('출하지시서', ['일자', '거래처', '품목', '수량', '창고']), '영업관리'),
  m('shipment', '재고Ⅰ', '출하', 9, gs('출하', ['일자', '거래처', '품목', '수량', '상태']), '영업관리'),
  // R11-B §4.4A: 견적서현황·미주문현황·주문서현황을 출력물→영업관리로 재배치(실물 트리 §12.1/§12.2 정합, id 동결) + 신규 2종
  m('order-ship-process', '재고Ⅰ', '주문서출고처리', 9, gs('주문서출고처리', ['일자', '거래처', '품목', '수량', '출고여부']), '영업관리'),
  m('sale-missing', '재고Ⅰ', '미판매현황', 9, gs('미판매현황', ['일자', '거래처', '품목', '주문수량', '미판매수량']), '영업관리'),

  // ── 재고Ⅰ — 구매관리 (R11-B §4.4D: 실물 트리 §12.3 정합 — 기존 매핑 유지 + 신규 gs 잔여) ──
  m('po-request', '재고Ⅰ', '발주요청', 9, gs('발주요청', ['일자', '거래처', '품목', '수량', '상태']), '구매관리'),
  m('po-plan', '재고Ⅰ', '발주계획', 9, gs('발주계획', ['일자', '품목', '계획수량', '거래처', '상태']), '구매관리'),
  m('price-request', '재고Ⅰ', '단가요청', 9, gs('단가요청', ['일자', '거래처', '품목', '요청단가', '상태']), '구매관리'),
  m('po', '재고Ⅰ', '발주서입력/조회', 1, PurchaseOrderList, '구매관리'),
  m('purchase-status', '재고Ⅰ', '구매조회', 1, PurchaseList, '구매관리'),
  m('purchase', '재고Ⅰ', '구매입력', 1, PurchaseInput, '구매관리'),
  m('purchase-status-report', '재고Ⅰ', '구매현황', 9, gs('구매현황', ['일자', '거래처', '품목', '수량', '금액']), '구매관리'),
  m('purchase-price-bulk-change', '재고Ⅰ', '구매단가일괄변경', 9, gs('구매단가일괄변경', ['품목코드', '품목명', '기존단가', '변경단가', '적용일']), '구매관리'),
  m('purchase-payment-status', '재고Ⅰ', '지급현황', 9, R('payment-status'), '구매관리'),
  m('purchase-discount-status', '재고Ⅰ', '구매할인현황', 9, gs('구매할인현황', ['일자', '거래처', '품목', '할인율', '할인액']), '구매관리'),
  m('purchase-unposted-status', '재고Ⅰ', '회계미반영현황(구매)', 9, gs('회계미반영현황(구매)', ['일자', '거래처', '전표번호', '금액', '비고']), '구매관리'),
  m('ap-by-partner', '재고Ⅰ', '거래처별채무', 9, gs('거래처별채무', ['거래처', '매입합계', '지급합계', '채무잔액']), '구매관리'),
  m('purchase-bulk-acct', '재고Ⅰ', '구매일괄회계반영', 9, gs('구매일괄회계반영', ['일자', '거래처', '전표번호', '금액', '반영여부']), '구매관리'),
  m('payment', '재고Ⅰ', '지불입력', 1, PaymentScreen, '구매관리'),
  m('payable', '재고Ⅰ', '미지급금현황', 1, PayableScreen, '구매관리'),
  m('bean-price', '재고Ⅰ', '생두 단가비교', 4, BeanPriceScreen, '구매관리'),

  // ── 재고Ⅰ — 생산/외주 ──
  m('bom', '재고Ⅰ', 'BOM등록', 2, BomScreen, '생산/외주'),
  m('roast-sheet', '재고Ⅰ', '로스팅 입력', 1, RoastInput, '생산/외주'),
  m('prod-in', '재고Ⅰ', '생산입고', 2, ProdInScreen, '생산/외주'),
  m('prod-status', '재고Ⅰ', '생산현황/수율분석', 2, ProductionStatus, '생산/외주'),
  m('mrp', '재고Ⅰ', '소요량계산', 2, MrpScreen, '생산/외주'),
  // R10-B §B-3⑤ 생산/외주 보강(§10.1·§11 실물 트리 잔여)
  m('process-master', '재고Ⅰ', '공정', 9, gs('공정', ['공정코드', '공정명', '설명', '사용여부']), '생산/외주'),
  m('production-plan', '재고Ⅰ', '생산계획', 9, gs('생산계획', ['일자', '품목', '계획수량', '완료수량', '상태']), '생산/외주'),
  m('work-order', '재고Ⅰ', '작업지시서', 9, gs('작업지시서', ['일자', '품목', '지시수량', '담당자', '상태']), '생산/외주'),
  m('production-issue', '재고Ⅰ', '생산불출', 9, gs('생산불출', ['일자', '품목', '수량', '창고', '담당자']), '생산/외주'),
  m('work-entry', '재고Ⅰ', '작업', 9, gs('작업', ['일자', '작업지시', '품목', '수량', '담당자']), '생산/외주'),
  m('outsourcing-cost-post', '재고Ⅰ', '외주비회계반영', 9, gs('외주비회계반영', ['일자', '거래처', '품목', '금액', '반영여부']), '생산/외주'),
  m('production-in-status', '재고Ⅰ', '생산입고현황', 9, gs('생산입고현황', ['일자', '품목', '수량', '창고', '비고']), '생산/외주'),

  // ── 재고Ⅰ — 기타이동 ──
  m('move', '재고Ⅰ', '창고이동', 1, StockMove, '기타이동'),
  m('self-use', '재고Ⅰ', '자가사용', 1, SelfUse, '기타이동'),
  m('defect', '재고Ⅰ', '불량처리', 1, Defect, '기타이동'),
  m('adjust', '재고Ⅰ', '재고조정', 1, StockAdjust, '기타이동'),

  // ── 재고Ⅰ — 출력물 ──
  m('stock-status', '재고Ⅰ', '재고현황', 1, StockStatus, '출력물'),
  m('stock-wh', '재고Ⅰ', '창고별재고현황', 1, StockByWarehouse, '출력물'),
  m('stock-ledger', '재고Ⅰ', '재고수불부', 1, StockLedger, '출력물'),
  m('stock-flow', '재고Ⅰ', '재고변동표', 6, R('stock-flow'), '출력물'),
  m('other-moves', '재고Ⅰ', '기타이동현황', 6, R('other-moves'), '출력물'),
  m('profit-status', '재고Ⅰ', '이익현황', 5, R('profit-status'), '출력물'),
  m('sales-summary', '재고Ⅰ', '판매구매 집계표', 6, R('sales-summary'), '출력물'),
  m('order-missing', '재고Ⅰ', '미주문현황', 6, R('order-missing'), '영업관리'),
  m('quote-status', '재고Ⅰ', '견적서현황', 6, R('quote-status'), '영업관리'),
  m('order-status', '재고Ⅰ', '주문서현황', 6, R('order-status'), '영업관리'),
  m('po-status', '재고Ⅰ', '발주서현황', 6, R('po-status'), '출력물'),
  m('receipt-status', '재고Ⅰ', '수금현황', 5, R('receipt-status'), '출력물'),
  m('payment-status', '재고Ⅰ', '지급현황', 5, R('payment-status'), '출력물'),

  // ── 재고Ⅰ — POS/쇼핑몰(연동 stub, 기존 배치 무변경) ──
  m('pos', '재고Ⅰ', 'POS판매', 7, stub('POS판매', '카드단말기(VAN) 연동 POS 판매는 연동 예정입니다. 판매는 [재고Ⅰ > 영업관리 > 판매입력]을 사용하세요.'), '영업관리'),
  m('shopping-mall', '재고Ⅰ', '쇼핑몰관리', 7, stub('쇼핑몰관리', '오픈마켓 주문 자동수집(쇼핑몰통합관리)은 연동 예정입니다.'), '쇼핑몰관리'),

  // ══════════════════════════════ 재고Ⅱ (R10-B: 서브그룹 신규 도입) ══════════════════════════════
  // SUBGROUP_ORDER['재고Ⅱ'] = A/S관리 · 시리얼/로트No. · 품질관리 · 계획관리 · 이익관리 · 오더관리 · 수출관리 · WMS

  // ── A/S관리 ──
  m('as-receipt', '재고Ⅱ', 'A/S접수', 9, gs('A/S접수', ['접수일자', '거래처', '품목', '증상', '상태']), 'A/S관리'),
  m('as-status', '재고Ⅱ', 'A/S처리현황', 9, gs('A/S처리현황', ['접수일자', '거래처', '품목', '처리상태', '완료일']), 'A/S관리'),

  // ── 시리얼/로트No. ──
  m('lot', '재고Ⅱ', '로트조회', 2, LotScreen, '시리얼/로트No.'),
  m('serial-status', '재고Ⅱ', '시리얼번호현황', 9, gs('시리얼번호현황', ['시리얼번호', '품목', '입고일', '상태', '비고']), '시리얼/로트No.'),

  // ── 품질관리 ──
  m('incoming-inspection', '재고Ⅱ', '수입검사', 9, gs('수입검사', ['일자', '품목', '검사수량', '합격수량', '불합격수량']), '품질관리'),
  m('process-inspection', '재고Ⅱ', '공정검사', 9, gs('공정검사', ['일자', '공정', '품목', '합격여부', '비고']), '품질관리'),

  // ── 계획관리 ──
  m('sales-plan', '재고Ⅱ', '판매계획', 9, gs('판매계획', ['월', '품목', '계획수량', '실적수량', '달성률']), '계획관리'),
  m('production-plan-status', '재고Ⅱ', '생산계획현황', 9, gs('생산계획현황', ['월', '품목', '계획수량', '생산수량', '달성률']), '계획관리'),

  // ── 이익관리 (§B-3② 이익현황=profit-status 재사용 + 월별이익/일별이익 트리 gs) ──
  m('profit-status-2', '재고Ⅱ', '이익현황', 9, R('profit-status'), '이익관리'),
  m('standard-cost-status', '재고Ⅱ', '표준원가현황', 9, gs('표준원가현황', ['품목코드', '품목명', '표준원가', '실제원가', '차이']), '이익관리'),
  m('actual-cost-status', '재고Ⅱ', '실제원가현황', 9, gs('실제원가현황', ['품목코드', '품목명', '실제원가', '수량', '금액']), '이익관리'),
  m('cost-variance-analysis', '재고Ⅱ', '차이분석', 9, gs('차이분석', ['품목', '표준원가', '실제원가', '차이', '차이율']), '이익관리'),
  m('monthly-profit-status', '재고Ⅱ', '월별이익현황', 9, gs('월별이익현황', ['월', '품목', '매출', '원가', '이익']), '이익관리'),
  m('daily-stock-status', '재고Ⅱ', '일별재고현황', 9, gs('일별재고현황', ['일자', '품목', '입고', '출고', '재고']), '이익관리'),
  m('daily-profit-status', '재고Ⅱ', '일별이익현황', 9, gs('일별이익현황', ['일자', '품목', '매출', '원가', '이익']), '이익관리'),

  // ── 오더관리 ──
  m('order-receive-status', '재고Ⅱ', '수주현황', 9, gs('수주현황', ['일자', '거래처', '품목', '수량', '상태']), '오더관리'),
  m('po-issue-status', '재고Ⅱ', '발주현황', 9, gs('발주현황', ['일자', '거래처', '품목', '수량', '상태']), '오더관리'),

  // ── 수출관리 ──
  m('export-order', '재고Ⅱ', '수출오더', 9, gs('수출오더', ['일자', '거래처', '품목', '수량', '금액']), '수출관리'),
  m('lc-management', '재고Ⅱ', 'L/C관리', 9, gs('L/C관리', ['L/C번호', '거래처', '개설일', '금액', '상태']), '수출관리'),

  // ── WMS ──
  m('wms', '재고Ⅱ', 'WMS', 7, stub('WMS', '위치(Location)·랙 단위 창고관리시스템은 연동 예정입니다. 현재 재고는 [재고Ⅰ > 출력물 > 창고별재고현황]에서 확인하세요.'), 'WMS'),

  // ══════════════════════════════ 회계Ⅰ (R10-B: 서브그룹 신규 도입) ══════════════════════════════
  // SUBGROUP_ORDER['회계Ⅰ'] = 기초등록·FastEntry·매출매입거래·전자(세금)계산서·계좌·카드·현금거래·비현금거래·어음거래·고정자산·회계거래관리·출력물

  // ── 기초등록 ──
  m('account', '회계Ⅰ', '계정과목', 3, AccountMaster, '기초등록'),
  // 실물에서 거래처등록/리스트는 회계Ⅰ>기초등록 소속(참고서 §5). 기존 id 'partner'(재고Ⅰ)는 동결 —
  // 같은 화면(PartnerMaster)을 새 id로 회계Ⅰ에도 노출한다(설계-R8-실물매칭.md §6.3).
  m('partner-acct', '회계Ⅰ', '거래처등록', 0, PartnerMaster, '기초등록'),
  m('dept-master', '회계Ⅰ', '부서등록', 9, gs('부서등록', ['부서코드', '부서명', '상위부서', '사용여부']), '기초등록'),
  m('summary-master', '회계Ⅰ', '적요등록', 9, gs('적요등록', ['코드', '적요내용', '구분', '사용여부']), '기초등록'),

  // ── FastEntry ──
  m('fast-entry', '회계Ⅰ', 'FastEntry입력', 9, gs('FastEntry입력', ['일자', '계정과목', '거래처', '금액', '적요']), 'FastEntry'),

  // ── 매출매입거래 ── (R11-B §4.4B: 매출전표Ⅰ/매입전표Ⅰ 실폼 승격. 매출처로부터/매입처로부터는
  // 현금거래로 재배치했다 — 아래 §4.4C 참조, id 동결)
  m('sale-voucher-1', '회계Ⅰ', '매출전표Ⅰ', 3, SalesVoucher1Input, '매출매입거래'),
  m('purchase-voucher-1', '회계Ⅰ', '매입전표Ⅰ', 3, PurchaseVoucher1Input, '매출매입거래'),

  // ── 전자(세금)계산서 ── (e-tax-invoice: B-1 라벨 실물화 '(세금)계산서진행단계')
  m('e-tax-invoice', '회계Ⅰ', '(세금)계산서진행단계', 7, EtaxInvoiceScreen, '전자(세금)계산서'),
  m('hometax-lookup', '회계Ⅰ', '홈택스자료조회', 9, gs('홈택스자료조회', ['일자', '거래처', '종류', '금액', '상태']), '전자(세금)계산서'),
  m('sale-tax-invoice-summary', '회계Ⅰ', '매출(세금)계산서요약', 9, gs('매출(세금)계산서요약', ['월', '거래처', '건수', '공급가액', '부가세']), '전자(세금)계산서'),
  m('tax-invoice-type-change', '회계Ⅰ', '각종구분값변경', 9, gs('각종구분값변경', ['전표번호', '거래처', '현재구분', '변경구분']), '전자(세금)계산서'),

  // ── 계좌·카드 ── (bank-link: B-1 라벨 실물화 '입/출금계좌 조회')
  m('bank-link', '회계Ⅰ', '입/출금계좌 조회', 7, stub('입/출금계좌 조회', '은행 계좌·카드 매입내역 자동 수집은 연동 예정입니다. 수기 입출금은 [회계Ⅱ > 자금계획 > 자금현황]에서 관리하세요.'), '계좌·카드'),
  m('card-usage', '회계Ⅰ', '카드사용내역', 9, gs('카드사용내역', ['일자', '가맹점', '카드번호', '금액', '비고']), '계좌·카드'),

  // ── 현금거래 (R11-B §4.4C: 입금 5 + 출금 8, id 동결·재배치·라벨변경·실폼 승격) ──
  m('deposit-slip', '회계Ⅰ', '입금표', 9, gs('입금표', ['일자', '거래처', '금액', '계정과목', '적요']), '현금거래'),
  // 현금예금입금(5)
  m('from-sale-partner', '회계Ⅰ', '매출처로부터', 1, FromSalePartnerInput, '현금거래'),
  m('card-sale-collect', '회계Ⅰ', '카드매출대금회수', 9, gs('카드매출대금회수', ['일자', '거래처', '카드사', '금액']), '현금거래'),
  m('temp-in', '회계Ⅰ', '일시적으로(입금)', 9, gs('일시적으로(입금)', ['일자', '계좌', '금액', '적요']), '현금거래'),
  m('bank-loan-in', '회계Ⅰ', '은행차입으로', 9, gs('은행차입으로', ['일자', '은행', '금액', '적요']), '현금거래'),
  m('etc-in', '회계Ⅰ', '기타입금', 9, gs('기타입금', ['일자', '계좌', '금액', '적요']), '현금거래'),
  // 현금예금출금(8)
  m('expense-request', '회계Ⅰ', '지출결의서', 3, ExpenseRequestInput, '현금거래'),
  m('from-purchase-partner', '회계Ⅰ', '매입처로', 1, ToPurchasePartnerInput, '현금거래'),
  m('receipt-out', '회계Ⅰ', '영수증으로', 9, gs('영수증으로', ['일자', '계정', '금액', '적요']), '현금거래'),
  m('corp-card-pay', '회계Ⅰ', '법인카드대금결제', 9, gs('법인카드대금결제', ['일자', '카드사', '결제계좌', '금액']), '현금거래'),
  m('inter-account-move', '회계Ⅰ', '계좌간이동', 9, gs('계좌간이동', ['일자', '출금계좌', '입금계좌', '금액']), '현금거래'),
  m('temp-out', '회계Ⅰ', '일시적으로(출금)', 9, gs('일시적으로(출금)', ['일자', '계좌', '금액', '적요']), '현금거래'),
  m('bank-out', '회계Ⅰ', '은행으로', 9, gs('은행으로', ['일자', '은행', '금액', '적요']), '현금거래'),
  m('etc-out', '회계Ⅰ', '기타출금', 9, gs('기타출금', ['일자', '계좌', '금액', '적요']), '현금거래'),

  // ── 비현금거래 ──
  m('gl-entry', '회계Ⅰ', '일반전표(경비)', 3, GlEntryScreen, '비현금거래'),
  m('transfer-voucher', '회계Ⅰ', '대체전표', 9, gs('대체전표', ['일자', '차변계정', '대변계정', '금액', '적요']), '비현금거래'),

  // ── 어음거래 ──
  m('note-receivable-status', '회계Ⅰ', '받을어음현황', 9, gs('받을어음현황', ['어음번호', '거래처', '금액', '만기일', '상태']), '어음거래'),
  m('note-payable-status', '회계Ⅰ', '지급어음현황', 9, gs('지급어음현황', ['어음번호', '거래처', '금액', '만기일', '상태']), '어음거래'),

  // ── 고정자산 ── (fixed-asset: 실물상 회계Ⅱ가 아닌 회계Ⅰ>고정자산 소속 — 의도적 재배치, id 동결)
  m('fixed-asset', '회계Ⅰ', '고정자산등록', 7, FixedAssetScreen, '고정자산'),
  m('fixed-asset-status', '회계Ⅰ', '고정자산현황', 9, gs('고정자산현황', ['자산코드', '자산명', '취득가액', '감가상각누계', '장부가액']), '고정자산'),

  // ── 회계거래관리 ──
  m('gl-voucher', '회계Ⅰ', '전표조회', 3, GlVoucherScreen, '회계거래관리'),
  m('gl-transaction-status', '회계Ⅰ', '회계거래현황', 9, gs('회계거래현황', ['일자', '전표번호', '거래처', '금액']), '회계거래관리'),

  // ── 출력물 (실동작 11종: 기존 9 + 신규 report def 2 / 나머지 35종 gs — §B-3③) ──
  m('vat-book', '회계Ⅰ', '매입/매출장', 3, VatBook, '출력물'),
  m('journal', '회계Ⅰ', '분개장', 3, JournalScreen, '출력물'),
  m('acct-ledger', '회계Ⅰ', '계정별원장', 5, R('acct-ledger'), '출력물'),
  m('general-ledger', '회계Ⅰ', '총계정원장', 5, R('general-ledger'), '출력물'),
  m('cashbook', '회계Ⅰ', '현금출납장', 5, R('cashbook'), '출력물'),
  m('partner-ledger', '회계Ⅰ', '거래처거래내역조회', 3, PartnerLedger, '출력물'),
  m('trial-balance', '회계Ⅰ', '합계잔액시산표', 5, R('trial-balance'), '출력물'),
  m('income-statement', '회계Ⅰ', '손익계산서', 5, PnlStatement, '출력물'),
  m('monthly-pl', '회계Ⅰ', '월별손익분석', 3, MonthlyPL, '출력물'),
  m('ar-monthly-summary', '회계Ⅰ', '월별매출집계표', 9, R('ar-monthly-summary'), '출력물'),
  m('ap-monthly-summary', '회계Ⅰ', '월별매입집계표', 9, R('ap-monthly-summary'), '출력물'),
  // 경영자료(월별손익분석 제외 잔여 8종)
  m('cash-daily', '회계Ⅰ', '자금일보', 9, gs('자금일보', ['일자', '구분', '금액', '잔액', '비고']), '출력물'),
  m('cash-flow-io', '회계Ⅰ', '현금흐름(입출금내역)', 9, gs('현금흐름(입출금내역)', ['일자', '구분', '입금', '출금', '잔액']), '출력물'),
  m('fund-status-table', '회계Ⅰ', '자금현황표', 9, gs('자금현황표', ['구분', '전월잔액', '입금', '출금', '당월잔액']), '출력물'),
  m('fund-change', '회계Ⅰ', '자금증감내역', 9, gs('자금증감내역', ['일자', '구분', '증감액', '잔액', '비고']), '출력물'),
  m('monthly-cost-analysis', '회계Ⅰ', '월별원가분석', 9, gs('월별원가분석', ['월', '품목', '수량', '원가', '비고']), '출력물'),
  m('ar-ap-turnover', '회계Ⅰ', '채권/채무회수기간표', 9, gs('채권/채무회수기간표', ['거래처', '채권잔액', '채무잔액', '회수기간(일)', '비고']), '출력물'),
  m('ar-ap-balance-analysis', '회계Ⅰ', '채권/채무잔액분석표', 9, gs('채권/채무잔액분석표', ['거래처', '채권잔액', '채무잔액', '순잔액', '비고']), '출력물'),
  m('mgmt-summary-report', '회계Ⅰ', '경영요약보고서', 9, gs('경영요약보고서', ['구분', '금액', '전월대비', '비고']), '출력물'),
  // 회계집계표(월별매출·매입집계표 제외 잔여 4종)
  m('expense-report-summary', '회계Ⅰ', '지출결의서집계', 9, gs('지출결의서집계', ['일자', '부서', '건수', '금액', '비고']), '출력물'),
  m('deposit-report-summary', '회계Ⅰ', '입금보고서집계', 9, gs('입금보고서집계', ['일자', '거래처', '건수', '금액', '비고']), '출력물'),
  m('advance-settlement-summary', '회계Ⅰ', '가지급금정산서집계', 9, gs('가지급금정산서집계', ['일자', '사원', '금액', '정산액', '비고']), '출력물'),
  m('custom-report', '회계Ⅰ', '사용자정의보고서', 9, gs('사용자정의보고서'), '출력물'),
  // 장부(계정별원장·매입/매출장·분개장·현금출납장·거래처거래내역조회 제외 잔여 8종)
  m('acct-partner-ledger', '회계Ⅰ', '계정별거래처별원장', 9, gs('계정별거래처별원장', ['일자', '전표번호', '거래처', '차변', '대변', '잔액']), '출력물'),
  m('partner-acct-ledger', '회계Ⅰ', '거래처별계정별원장', 9, gs('거래처별계정별원장', ['일자', '전표번호', '계정과목', '차변', '대변', '잔액']), '출력물'),
  m('acct-summary-ledger', '회계Ⅰ', '계정별적요별원장', 9, gs('계정별적요별원장', ['일자', '적요', '차변', '대변', '잔액']), '출력물'),
  m('acct-change-detail', '회계Ⅰ', '계정증감내역', 9, gs('계정증감내역', ['일자', '계정과목', '증감', '잔액', '비고']), '출력물'),
  m('daily-monthly-sheet', '회계Ⅰ', '일/월계표', 9, gs('일/월계표', ['일자', '계정과목', '차변', '대변', '잔액']), '출력물'),
  m('forex-ledger', '회계Ⅰ', '외화장부', 9, gs('외화장부', ['일자', '통화', '외화금액', '환율', '원화금액']), '출력물'),
  m('partner-mgmt-ledger-1', '회계Ⅰ', '거래처관리대장Ⅰ', 9, gs('거래처관리대장Ⅰ', ['거래처코드', '거래처명', '담당자', '전화', '비고']), '출력물'),
  m('partner-mgmt-ledger-2', '회계Ⅰ', '거래처관리대장Ⅱ', 9, gs('거래처관리대장Ⅱ', ['거래처코드', '거래처명', '계좌정보', '한도', '비고']), '출력물'),
  // 주요재무제표(손익계산서·합계잔액시산표 제외 잔여 6종)
  m('balance-sheet', '회계Ⅰ', '재무상태표', 9, gs('재무상태표', ['계정과목', '당기', '전기', '증감', '비고']), '출력물'),
  m('cost-statement', '회계Ⅰ', '원가명세서', 9, gs('원가명세서', ['항목', '당기', '전기', '증감']), '출력물'),
  m('acct-statement', '회계Ⅰ', '계정명세서', 9, gs('계정명세서', ['계정과목', '금액', '비고']), '출력물'),
  m('cashflow-statement', '회계Ⅰ', '현금흐름표', 9, gs('현금흐름표', ['구분', '당기', '전기', '증감']), '출력물'),
  m('retained-earnings-statement', '회계Ⅰ', '이익잉여금처분계산서', 9, gs('이익잉여금처분계산서', ['항목', '금액', '비고']), '출력물'),
  m('income-expense-statement', '회계Ⅰ', '수입지출명세서', 9, gs('수입지출명세서', ['일자', '항목', '수입', '지출', '잔액']), '출력물'),
  // 기타(9종)
  m('gl-status-report', '회계Ⅰ', '회계거래현황', 9, gs('회계거래현황', ['일자', '전표번호', '거래처', '금액', '비고']), '출력물'),
  m('voucher-print', '회계Ⅰ', '전표인쇄', 9, gs('전표인쇄', ['일자', '전표번호', '거래처', '금액']), '출력물'),
  m('sales-tax-invoice-status', '회계Ⅰ', '매출(세금)계산서현황', 9, gs('매출(세금)계산서현황', ['일자', '거래처', '공급가액', '부가세', '합계']), '출력물'),
  m('purchase-tax-invoice-status', '회계Ⅰ', '매입(세금)계산서현황', 9, gs('매입(세금)계산서현황', ['일자', '거래처', '공급가액', '부가세', '합계']), '출력물'),
  m('expense-transfer-list', '회계Ⅰ', '지출결의서이체리스트', 9, gs('지출결의서이체리스트', ['일자', '거래처', '금액', '계좌', '비고']), '출력물'),
  m('acct-vs-stock', '회계Ⅰ', '회계vs재고비교', 9, gs('회계vs재고비교', ['품목', '회계수량', '재고수량', '차이']), '출력물'),
  m('partner-centric-entry', '회계Ⅰ', '거래처중심입력', 9, gs('거래처중심입력', ['거래처', '일자', '금액', '비고']), '출력물'),
  m('tx-history', '회계Ⅰ', '거래이력조회', 9, gs('거래이력조회', ['일자', '거래유형', '거래처', '금액']), '출력물'),
  m('balance-recalc', '회계Ⅰ', '잔액재집계', 9, gs('잔액재집계', ['계정과목', '기존잔액', '재집계잔액', '차이']), '출력물'),

  // ══════════════════════════════ 회계Ⅱ (R10-B: 서브그룹 신규 도입) ══════════════════════════════
  // SUBGROUP_ORDER['회계Ⅱ'] = 채권관리·채무관리·수표관리·자금계획·예산관리·수입비용·비용관리·계약관리·전자계약

  // ── 채권관리 ──
  m('ar-status', '회계Ⅱ', '채권현황', 9, gs('채권현황', ['거래처', '채권잔액', '최근거래일', '비고']), '채권관리'),
  m('ar-balance-detail', '회계Ⅱ', '채권잔액명세', 9, gs('채권잔액명세', ['거래처', '전표번호', '일자', '금액', '잔액']), '채권관리'),

  // ── 채무관리 ──
  m('ap-status', '회계Ⅱ', '채무현황', 9, gs('채무현황', ['거래처', '채무잔액', '최근거래일', '비고']), '채무관리'),

  // ── 수표관리 ──
  m('note-receivable', '회계Ⅱ', '받을어음', 9, gs('받을어음', ['어음번호', '거래처', '금액', '만기일', '상태']), '수표관리'),
  m('note-payable', '회계Ⅱ', '지급어음', 9, gs('지급어음', ['어음번호', '거래처', '금액', '만기일', '상태']), '수표관리'),

  // ── 자금계획 ──
  m('cash', '회계Ⅱ', '자금현황', 3, CashScreen, '자금계획'),
  m('fund-plan', '회계Ⅱ', '자금계획', 7, FundPlanScreen, '자금계획'),
  m('deposit', '회계Ⅱ', '예적금현황', 7, DepositScreen, '자금계획'),
  m('forex', '회계Ⅱ', '외화관리', 7, stub('외화관리', '외화 거래·환율·외화환산손익 자동계산은 연동 예정입니다.'), '자금계획'),
  m('fund-balance-plan', '회계Ⅱ', '자금수지계획', 9, gs('자금수지계획', ['월', '수입계획', '지출계획', '수지차']), '자금계획'),

  // ── 예산관리 ──
  m('budget', '회계Ⅱ', '예산관리', 7, BudgetScreen, '예산관리'),
  m('budget-vs-actual', '회계Ⅱ', '예산대비실적', 9, gs('예산대비실적', ['항목', '예산', '실적', '차이', '달성률']), '예산관리'),

  // ── 수입비용 ──
  m('import-mgmt-ledger', '회계Ⅱ', '수입관리대장', 9, gs('수입관리대장', ['일자', '거래처', '품목', '수입비용', '비고']), '수입비용'),
  m('expense-item-master', '회계Ⅱ', '비용항목등록', 9, gs('비용항목등록', ['항목코드', '항목명', '구분', '사용여부']), '수입비용'),

  // ── 비용관리 ──
  m('expense-status', '회계Ⅱ', '비용현황', 9, gs('비용현황', ['일자', '항목', '부서', '금액']), '비용관리'),

  // ── 계약관리 ──
  m('contract-master', '회계Ⅱ', '계약등록', 9, gs('계약등록', ['계약번호', '거래처', '계약일', '금액', '상태']), '계약관리'),
  m('contract-status', '회계Ⅱ', '계약현황', 9, gs('계약현황', ['계약번호', '거래처', '계약일', '만료일', '상태']), '계약관리'),

  // ── 전자계약 ──
  m('e-contract', '회계Ⅱ', '전자계약', 9, gs('전자계약', ['계약번호', '거래처', '상태', '비고'], '전자계약 연동은 연동 예정입니다.'), '전자계약'),

  // ══════════════════════════════ 세무 (R10-B: 서브그룹 신규 도입) ══════════════════════════════
  // SUBGROUP_ORDER['세무'] = 원천징수·기타원천세·부가세·법인세

  m('withholding-report', '세무', '원천징수이행상황신고서', 9, gs('원천징수이행상황신고서', ['귀속월', '인원', '지급액', '원천세액']), '원천징수'),
  m('other-income', '세무', '기타소득', 9, gs('기타소득', ['일자', '성명', '소득구분', '금액', '원천세액']), '기타원천세'),
  m('vat-return', '세무', '부가가치세신고서', 7, VatReturn, '부가세'),
  m('tax-invoice-report', '세무', '세금계산서합계표', 7, TaxInvoiceReport, '부가세'),
  m('vat-pre-check', '세무', '신고전검토자료', 9, gs('신고전검토자료', ['항목', '신고서금액', '검토금액', '차이']), '부가세'),
  m('corp-tax-report', '세무', '법인세신고', 9, gs('법인세신고', ['귀속연도', '과세표준', '산출세액', '납부세액']), '법인세'),

  // ══════════════════════════════ 그룹웨어 (R10-B: 서브그룹 신규 도입) ══════════════════════════════
  // SUBGROUP_ORDER['그룹웨어'] = 공유정보·전자결재·업무관리·고객관리·프로젝트·공용메일

  // ── 공유정보 ──
  m('calendar', '그룹웨어', '달력(로스팅/납기)', 2, CalendarScreen, '공유정보'),
  m('memo', '그룹웨어', '게시판', 4, BoardScreen, '공유정보'),
  m('messenger-box', '그룹웨어', '쪽지함', 9, gs('쪽지함', ['일자', '보낸사람', '받는사람', '내용']), '공유정보'),
  m('company-address-book', '그룹웨어', '사내주소록', 9, gs('사내주소록', ['성명', '부서', '전화', '이메일']), '공유정보'),

  // ── 전자결재 ──
  m('approval-draft', '그룹웨어', '기안서작성', 9, gs('기안서작성', ['기안일자', '제목', '기안자', '상태']), '전자결재'),
  m('approval-mgmt', '그룹웨어', '내결재관리', 9, gs('내결재관리', ['기안일자', '제목', '기안자', '결재자', '진행상태']), '전자결재'),
  m('approval-integrated-mgmt', '그룹웨어', '기안서통합관리', 9, gs('기안서통합관리', ['기안일자', '제목', '부서', '진행상태']), '전자결재'),
  m('approval-setting', '그룹웨어', '결재설정', 9, gs('결재설정', ['설정항목', '값', '비고']), '전자결재'),

  // ── 업무관리 ──
  m('todo', '그룹웨어', 'To Do', 7, TodoScreen, '업무관리'),
  m('work-journal', '그룹웨어', '업무일지', 9, gs('업무일지', ['일자', '작성자', '업무내용', '비고']), '업무관리'),

  // ── 고객관리 ──
  m('customer-inquiry', '그룹웨어', '고객문의', 9, gs('고객문의', ['일자', '고객', '문의내용', '상태']), '고객관리'),
  m('customer-status', '그룹웨어', '고객현황', 9, gs('고객현황', ['고객', '등급', '최근거래일', '비고']), '고객관리'),

  // ── 프로젝트 ──
  m('project-mgmt', '그룹웨어', '프로젝트관리', 9, gs('프로젝트관리', ['프로젝트명', '담당자', '시작일', '종료일', '상태']), '프로젝트'),

  // ── 공용메일 ──
  m('shared-mailbox', '그룹웨어', '공용메일함', 9, gs('공용메일함', ['일자', '보낸사람', '제목', '상태']), '공용메일'),

  // ══════════════════════════════ 데이터센터 (R10-B: 신규 대메뉴) ══════════════════════════════
  // SUBGROUP_ORDER['데이터센터'] = 데이터수집·데이터내보내기

  m('data-collect-register', '데이터센터', '수집데이터등록', 9, gs('수집데이터등록', ['수집유형', '거래처', '등록일', '상태']), '데이터수집'),
  m('statement-collect', '데이터센터', '거래명세서수집', 9, gs('거래명세서수집', ['일자', '거래처', '건수', '상태']), '데이터수집'),
  m('quote-collect', '데이터센터', '견적서수집', 9, gs('견적서수집', ['일자', '거래처', '건수', '상태']), '데이터수집'),
  m('po-collect', '데이터센터', '발주서수집', 9, gs('발주서수집', ['일자', '거래처', '건수', '상태']), '데이터수집'),
  m('data-export', '데이터센터', '데이터내보내기', 9, gs('데이터내보내기', ['유형', '기간', '상태', '비고']), '데이터내보내기'),

  // ══════════════════════════════ Self-Customizing (R10-B: 서브그룹 신규 도입) ══════════════════════════════
  // SUBGROUP_ORDER['Self-Customizing'] = 정보관리·사용자관리·환경설정·기타관리시스템·보안관리·다운로드

  // ── 정보관리 ──
  m('company-info', 'Self-Customizing', '회사정보', 9, gs('회사정보', ['항목', '값']), '정보관리'),
  m('api-key-issue', 'Self-Customizing', 'API인증키발급', 9, gs('API인증키발급', ['발급일', '키', '만료일', '상태']), '정보관리'),

  // ── 사용자관리 ──
  m('user-register', 'Self-Customizing', '사용자등록', 9, gs('사용자등록', ['아이디', '성명', '권한', '사용여부']), '사용자관리'),

  // ── 환경설정 ──
  m('settings', 'Self-Customizing', '환경설정', 0, SettingsScreen, '환경설정'),
  m('default-setting', 'Self-Customizing', '기본값설정', 9, gs('기본값설정', ['항목', '기본값', '비고']), '환경설정'),
  m('mapping-center', 'Self-Customizing', '매핑센터', 9, gs('매핑센터', ['원본항목', '매핑항목', '상태']), '환경설정'),

  // ── 기타관리시스템 ──
  m('migrate', 'Self-Customizing', '기존앱 데이터 이관', 1, MigrateScreen, '기타관리시스템'),

  // ── 보안관리 ──
  m('security-setting', 'Self-Customizing', '보안설정', 9, gs('보안설정', ['설정항목', '값', '비고']), '보안관리'),

  // ── 다운로드 ──
  m('io', 'Self-Customizing', '엑셀 업로드/다운로드', 4, ExcelIoScreen, '다운로드'),
  m('backup', 'Self-Customizing', '백업/복원', 4, BackupScreen, '다운로드'),

  // ══════════════════════════════ 관리 (R10-B: 서브그룹 신규 도입) ══════════════════════════════
  // SUBGROUP_ORDER['관리'] = 급여관리·인사관리·일용근로급여관리·근태관리·전자근로계약

  // ── 급여관리 ──
  m('payroll', '관리', '급여대장', 7, PayrollScreen, '급여관리'),
  m('payroll-calc-ledger', '관리', '급여계산/대장', 9, gs('급여계산/대장', ['지급연월', '사원', '지급총액', '공제총액', '실지급액']), '급여관리'),
  m('employee-payroll-lookup', '관리', '사원별급여조회', 9, gs('사원별급여조회', ['사원', '지급연월', '기본급', '수당', '공제', '실지급액']), '급여관리'),
  m('payroll-status', '관리', '급여현황', 9, gs('급여현황', ['부서', '인원', '지급총액', '공제총액', '실지급액']), '급여관리'),
  m('payroll-transfer-status', '관리', '급여이체현황', 9, gs('급여이체현황', ['사원', '계좌', '이체일', '금액', '상태']), '급여관리'),
  m('allowance-item-master', '관리', '수당항목등록', 9, gs('수당항목등록', ['항목코드', '항목명', '과세여부', '사용여부']), '급여관리'),
  m('deduction-item-master', '관리', '공제항목등록', 9, gs('공제항목등록', ['항목코드', '항목명', '구분', '사용여부']), '급여관리'),

  // ── 인사관리 ──
  m('hr-record-card', '관리', '인사기록카드', 9, gs('인사기록카드', ['사번', '성명', '부서', '직급', '입사일']), '인사관리'),
  m('hr-status', '관리', '인사현황', 9, gs('인사현황', ['부서', '인원', '평균근속', '비고']), '인사관리'),

  // ── 일용근로급여관리 ──
  m('daily-worker-master', '관리', '일용직등록', 9, gs('일용직등록', ['사번', '성명', '일당', '근무형태', '사용여부']), '일용근로급여관리'),
  m('daily-payroll-calc', '관리', '일용급여계산', 9, gs('일용급여계산', ['일자', '사원', '근무일수', '일당', '지급액']), '일용근로급여관리'),

  // ── 근태관리 ──
  m('attendance', '관리', '근태관리', 7, AttendanceScreen, '근태관리'),
  m('attendance-confirm-status', '관리', '근무확정현황', 9, gs('근무확정현황', ['사원', '일자', '근무시간', '확정여부']), '근태관리'),

  // ── 전자근로계약 ──
  m('e-labor-contract', '관리', '전자근로계약', 9, gs('전자근로계약', ['사원', '계약일', '상태', '비고']), '전자근로계약'),
];

// 대메뉴 순서 — R10-B: 그룹웨어 뒤에 '데이터센터' 신설(§B-2)
export const MENU_GROUPS = [
  'MyPage', 'Self-Customizing', '재고Ⅰ', '재고Ⅱ', '회계Ⅰ', '회계Ⅱ', '관리', '세무', '그룹웨어', '데이터센터',
];

// 서브그룹을 갖는 대메뉴 순서(실물 §11 순서, 없으면 등장순). 재고Ⅰ은 R7 이래 기존 유지, 나머지는 R10-B 신설(§B-2).
export const SUBGROUP_ORDER: Record<string, string[]> = {
  '재고Ⅰ': ['기초등록', '영업관리', '구매관리', '생산/외주', '기타이동', '쇼핑몰관리', '출력물'],
  '재고Ⅱ': ['A/S관리', '시리얼/로트No.', '품질관리', '계획관리', '이익관리', '오더관리', '수출관리', 'WMS'],
  '회계Ⅰ': ['기초등록', 'FastEntry', '매출매입거래', '전자(세금)계산서', '계좌·카드', '현금거래', '비현금거래', '어음거래', '고정자산', '회계거래관리', '출력물'],
  '회계Ⅱ': ['채권관리', '채무관리', '수표관리', '자금계획', '예산관리', '수입비용', '비용관리', '계약관리', '전자계약'],
  '관리': ['급여관리', '인사관리', '일용근로급여관리', '근태관리', '전자근로계약'],
  '세무': ['원천징수', '기타원천세', '부가세', '법인세'],
  '그룹웨어': ['공유정보', '전자결재', '업무관리', '고객관리', '프로젝트', '공용메일'],
  'Self-Customizing': ['정보관리', '사용자관리', '환경설정', '기타관리시스템', '보안관리', '다운로드'],
  '데이터센터': ['데이터수집', '데이터내보내기'],
};

export const findMenu = (id: string): MenuDef | undefined => MENUS.find(x => x.id === id);

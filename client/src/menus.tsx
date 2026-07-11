import { ComponentType } from 'react';
import { Dashboard } from './screens/Dashboard';
import { ItemMaster, PartnerMaster, WarehouseMaster, ProjectMaster, EmployeeMaster } from './screens/masters';
import { PriceSpecialScreen } from './screens/PriceSpecialScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { Placeholder } from './screens/Placeholder';
import { SaleInput, PurchaseInput } from './screens/VoucherScreen';
import { SaleList, PurchaseList } from './screens/VoucherList';
import { ReceiptScreen, ReceivableScreen } from './screens/ReceiptScreen';
import { RoastInput } from './screens/RoastInput';
import { StockStatus, StockLedger } from './screens/StockScreens';
import { StatementPrint } from './screens/StatementPrint';
import { QuoteList, OrderList, PurchaseOrderList } from './screens/DocChainList';
import { StockMove, SelfUse, Defect, StockAdjust } from './screens/MoveScreens';
import { PaymentScreen, PayableScreen } from './screens/PaymentScreen';
import { AccountMaster, JournalScreen, PartnerLedger, MonthlyPL, VatBook } from './screens/AccountingScreens';
import { BomScreen, ProductionStatus } from './screens/ProductionScreens';
import { StockByWarehouse } from './screens/StockByWarehouse';
import { CalendarScreen } from './screens/CalendarScreen';
import { LotScreen } from './screens/LotScreen';
import { MrpScreen } from './screens/MrpScreen';
import { ProdInScreen } from './screens/ProdInScreen';
import { GlEntryScreen } from './screens/GlEntryScreen';
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

// 전체 메뉴 트리 (docs/설계-R3-IA재편성.md §1 — 이카운트식 대메뉴 재편성) — 미구현 메뉴는 Placeholder로 Phase 표시
export interface MenuDef {
  id: string;
  group: string;
  name: string;
  component: ComponentType;
  phase: number;          // 구현 Phase
  implemented: boolean;
  subgroup?: string;       // 서브그룹(선택). 현재는 재고Ⅰ 소속 메뉴만 값을 가짐
}

const ph = (name: string, phase: number): ComponentType =>
  () => <Placeholder name={name} phase={phase} />;

// R5: 연동 예정 stub 래퍼(ph()와 동일 패턴) — bank-link/wms/pos/shopping-mall/forex가 공용 StubScreen을 사용(§1.2)
const stub = (title: string, description: string): ComponentType =>
  () => <StubScreen title={title} description={description} />;

// R1 보고서 엔진(ReportScreen 공통 화면) — 정의 id로 REPORT_DEFS에서 조회해 마운트
const R = (id: string): ComponentType =>
  () => <ReportScreen def={REPORT_DEFS[id]} />;

const m = (id: string, group: string, name: string, phase: number, component?: ComponentType, subgroup?: string): MenuDef => ({
  id, group, name, phase,
  implemented: !!component,
  component: component ?? ph(name, phase),
  subgroup,
});

export const MENUS: MenuDef[] = [
  m('dashboard', 'MyPage', '메인 대시보드', 0, Dashboard),

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
  m('message', '재고Ⅰ', '거래처 메시지', 4, MessageScreen, '영업관리'),

  // ── 재고Ⅰ — 구매관리 ──
  m('po', '재고Ⅰ', '발주서입력/조회', 1, PurchaseOrderList, '구매관리'),
  m('purchase', '재고Ⅰ', '구매입력', 1, PurchaseInput, '구매관리'),
  m('purchase-status', '재고Ⅰ', '구매조회', 1, PurchaseList, '구매관리'),
  m('payment', '재고Ⅰ', '지불입력', 1, PaymentScreen, '구매관리'),
  m('payable', '재고Ⅰ', '미지급금현황', 1, PayableScreen, '구매관리'),
  m('bean-price', '재고Ⅰ', '생두 단가비교', 4, BeanPriceScreen, '구매관리'),

  // ── 재고Ⅰ — 생산·외주 ──
  m('bom', '재고Ⅰ', 'BOM등록', 2, BomScreen, '생산·외주'),
  m('roast-sheet', '재고Ⅰ', '로스팅 입력', 1, RoastInput, '생산·외주'),
  m('prod-in', '재고Ⅰ', '생산입고', 2, ProdInScreen, '생산·외주'),
  m('prod-status', '재고Ⅰ', '생산현황/수율분석', 2, ProductionStatus, '생산·외주'),
  m('mrp', '재고Ⅰ', '소요량계산', 2, MrpScreen, '생산·외주'),

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
  m('order-missing', '재고Ⅰ', '미주문현황', 6, R('order-missing'), '출력물'),
  m('quote-status', '재고Ⅰ', '견적서현황', 6, R('quote-status'), '출력물'),
  m('order-status', '재고Ⅰ', '주문서현황', 6, R('order-status'), '출력물'),
  m('po-status', '재고Ⅰ', '발주서현황', 6, R('po-status'), '출력물'),
  m('receipt-status', '재고Ⅰ', '수금현황', 5, R('receipt-status'), '출력물'),
  m('payment-status', '재고Ⅰ', '지급현황', 5, R('payment-status'), '출력물'),

  // ── 재고Ⅱ ──
  m('lot', '재고Ⅱ', '로트조회', 2, LotScreen),

  // ── 회계Ⅰ ──
  m('vat-book', '회계Ⅰ', '매입매출장(부가세)', 3, VatBook),
  m('journal', '회계Ⅰ', '분개장', 3, JournalScreen),
  m('gl-entry', '회계Ⅰ', '일반전표(경비)', 3, GlEntryScreen),
  m('acct-ledger', '회계Ⅰ', '계정별원장', 5, R('acct-ledger')),
  m('general-ledger', '회계Ⅰ', '총계정원장', 5, R('general-ledger')),
  m('cashbook', '회계Ⅰ', '현금출납장', 5, R('cashbook')),
  m('partner-ledger', '회계Ⅰ', '거래처원장', 3, PartnerLedger),
  m('trial-balance', '회계Ⅰ', '합계잔액시산표', 5, R('trial-balance')),
  m('income-statement', '회계Ⅰ', '손익계산서', 5, PnlStatement),
  m('monthly-pl', '회계Ⅰ', '월별손익', 3, MonthlyPL),
  m('account', '회계Ⅰ', '계정과목', 3, AccountMaster),
  m('e-tax-invoice', '회계Ⅰ', '전자세금계산서', 7, EtaxInvoiceScreen),

  // ── 회계Ⅱ ──
  m('cash', '회계Ⅱ', '자금현황', 3, CashScreen),
  m('fixed-asset', '회계Ⅱ', '고정자산등록', 7, FixedAssetScreen),
  m('budget', '회계Ⅱ', '예산관리', 7, BudgetScreen),
  m('deposit', '회계Ⅱ', '예적금현황', 7, DepositScreen),
  m('fund-plan', '회계Ⅱ', '자금계획', 7, FundPlanScreen),

  // ── 세무 (R4 신설) ──
  m('vat-return', '세무', '부가가치세신고서', 7, VatReturn),
  m('tax-invoice-report', '세무', '세금계산서합계표', 7, TaxInvoiceReport),

  // ── 그룹웨어 ──
  m('calendar', '그룹웨어', '달력(로스팅/납기)', 2, CalendarScreen),
  m('memo', '그룹웨어', '게시판', 4, BoardScreen),                          // 기존 m('memo','그룹웨어','메모',4) — id 동결, 실화면 교체

  // ── Self-Customizing ──
  m('settings', 'Self-Customizing', '환경설정', 0, SettingsScreen),
  m('io', 'Self-Customizing', '엑셀 업로드/다운로드', 4, ExcelIoScreen),
  m('backup', 'Self-Customizing', '백업/복원', 4, BackupScreen),
  m('migrate', 'Self-Customizing', '기존앱 데이터 이관', 1, MigrateScreen),

  // ── R5: 관리(신설 블록 — 대메뉴 dim 자동 해제, §1.3) ──
  m('payroll', '관리', '급여대장', 7, PayrollScreen),
  m('attendance', '관리', '근태관리', 7, AttendanceScreen),
  // ── R5: 그룹웨어(달력·게시판 뒤) ──
  m('todo', '그룹웨어', 'To Do', 7, TodoScreen),
  // ── R5: 연동 stub(공용 StubScreen, §4.7) ──
  m('bank-link', '회계Ⅰ', '계좌/카드 연동', 7, stub('계좌/카드 연동', '은행 계좌·카드 매입내역 자동 수집은 연동 예정입니다. 수기 입출금은 [회계Ⅱ > 자금현황]에서 관리하세요.')),
  m('wms', '재고Ⅱ', 'WMS(창고관리)', 7, stub('WMS(창고관리)', '위치(Location)·랙 단위 창고관리시스템은 연동 예정입니다. 현재 재고는 [재고Ⅰ > 출력물 > 창고별재고현황]에서 확인하세요.')),
  m('pos', '재고Ⅰ', 'POS판매', 7, stub('POS판매', '카드단말기(VAN) 연동 POS 판매는 연동 예정입니다. 판매는 [재고Ⅰ > 영업관리 > 판매입력]을 사용하세요.'), '영업관리'),
  m('shopping-mall', '재고Ⅰ', '쇼핑몰관리', 7, stub('쇼핑몰관리', '오픈마켓 주문 자동수집(쇼핑몰통합관리)은 연동 예정입니다.'), '영업관리'),
  m('forex', '회계Ⅱ', '외화관리', 7, stub('외화관리', '외화 거래·환율·외화환산손익 자동계산은 연동 예정입니다.')),
];

// 대메뉴(9) 순서 — R5 종료 시 9개 전부 소속 메뉴 ≥1(관리 그룹도 payroll·attendance로 채워짐 → reserved 0개, §1.3/§1.5)
export const MENU_GROUPS = [
  'MyPage', '재고Ⅰ', '재고Ⅱ', '회계Ⅰ', '회계Ⅱ', '관리', '세무', '그룹웨어', 'Self-Customizing',
];

// 서브그룹을 갖는 대메뉴는 현재 재고Ⅰ 하나. 순서는 이카운트 실화면 그대로.
export const SUBGROUP_ORDER: Record<string, string[]> = {
  '재고Ⅰ': ['기초등록', '영업관리', '구매관리', '생산·외주', '기타이동', '출력물'],
};

export const findMenu = (id: string): MenuDef | undefined => MENUS.find(x => x.id === id);

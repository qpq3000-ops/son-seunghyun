import { ComponentType } from 'react';
import { Dashboard } from './screens/Dashboard';
import { ItemMaster, PartnerMaster, WarehouseMaster, ProjectMaster } from './screens/masters';
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

// 전체 메뉴 트리 (docs/01 기획서 5장 메뉴맵) — 미구현 메뉴는 Placeholder로 Phase 표시
export interface MenuDef {
  id: string;
  group: string;
  name: string;
  component: ComponentType;
  phase: number;          // 구현 Phase
  implemented: boolean;
}

const ph = (name: string, phase: number): ComponentType =>
  () => <Placeholder name={name} phase={phase} />;

const m = (id: string, group: string, name: string, phase: number, component?: ComponentType): MenuDef => ({
  id, group, name, phase,
  implemented: !!component,
  component: component ?? ph(name, phase),
});

export const MENUS: MenuDef[] = [
  m('dashboard', '대시보드', '메인 대시보드', 0, Dashboard),

  m('quote', '영업', '견적서입력/조회', 1, QuoteList),
  m('order', '영업', '주문서입력/조회', 1, OrderList),
  m('sale', '영업', '판매입력', 1, SaleInput),
  m('sale-status', '영업', '판매조회', 1, SaleList),
  m('receipt', '영업', '수금입력', 1, ReceiptScreen),
  m('receivable', '영업', '미수금현황', 1, ReceivableScreen),
  m('statement-print', '영업', '거래명세서인쇄', 1, StatementPrint),
  m('message', '영업', '거래처 메시지', 4, MessageScreen),

  m('po', '구매', '발주서입력/조회', 1, PurchaseOrderList),
  m('purchase', '구매', '구매입력', 1, PurchaseInput),
  m('purchase-status', '구매', '구매조회', 1, PurchaseList),
  m('payment', '구매', '지불입력', 1, PaymentScreen),
  m('payable', '구매', '미지급금현황', 1, PayableScreen),
  m('bean-price', '구매', '생두 단가비교', 4, BeanPriceScreen),

  m('bom', '생산', 'BOM등록', 2, BomScreen),
  m('roast-sheet', '생산', '로스팅 입력', 1, RoastInput),
  m('prod-in', '생산', '생산입고', 2, ProdInScreen),
  m('prod-status', '생산', '생산현황/수율분석', 2, ProductionStatus),
  m('mrp', '생산', '소요량계산', 2, MrpScreen),

  m('stock-status', '재고', '재고현황', 1, StockStatus),
  m('stock-wh', '재고', '창고별재고현황', 1, StockByWarehouse),
  m('stock-ledger', '재고', '재고수불부', 1, StockLedger),
  m('move', '재고', '창고이동', 1, StockMove),
  m('self-use', '재고', '자가사용', 1, SelfUse),
  m('defect', '재고', '불량처리', 1, Defect),
  m('adjust', '재고', '재고조정', 1, StockAdjust),
  m('lot', '재고', '로트조회', 2, LotScreen),

  m('vat-book', '회계', '매입매출장(부가세)', 3, VatBook),
  m('journal', '회계', '분개장', 3, JournalScreen),
  m('acct-ledger', '회계', '계정별원장', 3),
  m('partner-ledger', '회계', '거래처원장', 3, PartnerLedger),
  m('monthly-pl', '회계', '월별손익', 3, MonthlyPL),
  m('gl-entry', '회계', '일반전표(경비)', 3, GlEntryScreen),
  m('cash', '회계', '자금현황', 3, CashScreen),

  m('calendar', '일정', '달력(로스팅/납기)', 2, CalendarScreen),
  m('memo', '일정', '메모', 4),

  m('item', '기초등록', '품목등록', 0, ItemMaster),
  m('partner', '기초등록', '거래처등록', 0, PartnerMaster),
  m('warehouse', '기초등록', '창고등록', 0, WarehouseMaster),
  m('price', '기초등록', '단가관리', 0, PriceSpecialScreen),
  m('project', '기초등록', '프로젝트등록', 0, ProjectMaster),
  m('account', '기초등록', '계정과목', 3, AccountMaster),

  m('settings', '설정', '환경설정', 0, SettingsScreen),
  m('io', '설정', '엑셀 업로드/다운로드', 4),
  m('backup', '설정', '백업/복원', 4),
  m('migrate', '설정', '기존앱 데이터 이관', 1),
];

export const MENU_GROUPS = ['대시보드', '영업', '구매', '생산', '재고', '회계', '일정', '기초등록', '설정'];

export const findMenu = (id: string): MenuDef | undefined => MENUS.find(x => x.id === id);

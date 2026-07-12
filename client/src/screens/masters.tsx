import { MasterScreen, FormField } from '../components/MasterScreen';
import type { ColumnDefinition } from '../components/DataGrid';
import type { Item, Partner, Warehouse, Project, Employee } from '../types';
import { fmtWon } from '../format';

const won = (field: string, title: string, width = 100): ColumnDefinition => ({
  title, field, width, hozAlign: 'right',
  formatter: cell => fmtWon(Number(cell.getValue() ?? 0)),
  bottomCalc: undefined,
});

const yn: ColumnDefinition['formatter'] = cell => (Number(cell.getValue()) === 1 ? 'O' : '');

// ───────────────────────── 품목등록 ─────────────────────────
const itemColumns: ColumnDefinition[] = [
  { title: '품목코드', field: 'code', width: 110 },
  { title: '품목명', field: 'name', minWidth: 160 },
  { title: '규격', field: 'spec', width: 90 },
  { title: '단위', field: 'unit', width: 60, hozAlign: 'center' },
  { title: '품목구분', field: 'item_type', width: 84, hozAlign: 'center',
    formatter: cell => { const v = cell.getValue(); return v ? `[${v}]` : ''; } },
  won('price_in', '입고단가'),
  won('price_out', '출고단가'),
  { title: '안전재고', field: 'safety_qty', width: 84, hozAlign: 'right' },
  { title: '로트', field: 'use_lot', width: 54, hozAlign: 'center', formatter: yn },
  { title: '사용', field: 'active', width: 54, hozAlign: 'center', formatter: yn },
];

const itemFields: FormField[] = [
  { name: 'code', label: '품목코드', type: 'text', required: true, placeholder: '예: P001' },
  { name: 'name', label: '품목명', type: 'text', required: true, placeholder: '예: 하우스블렌드' },
  { name: 'spec', label: '규격', type: 'text', placeholder: '예: 1kg 벌크' },
  { name: 'unit', label: '단위', type: 'text' },
  { name: 'item_type', label: '품목구분', type: 'select', options: ['원재료', '부자재', '제품', '상품'] },
  { name: 'price_in', label: '입고단가(원)', type: 'money' },
  { name: 'price_out', label: '출고단가(원)', type: 'money', hint: '0이면 싯가 — 전표에서 직접 입력' },
  { name: 'safety_qty', label: '안전재고수량', type: 'number' },
  { name: 'use_lot', label: '로트 관리', type: 'checkbox' },
  { name: 'is_set', label: '세트품목', type: 'checkbox' },
  { name: 'barcode', label: '바코드', type: 'text' },
  { name: 'memo', label: '메모', type: 'textarea' },
];

export const ItemMaster = () => (
  <MasterScreen<Item>
    title="품목등록"
    endpoint="/api/items"
    columns={itemColumns}
    fields={itemFields}
    defaults={{ code: '', name: '', spec: '', unit: 'kg', item_type: '제품', price_in: 0, price_out: 0, safety_qty: 0, use_lot: 0, is_set: 0, barcode: '', memo: '', active: 1 }}
    helpText="생두는 [원재료], 로스팅 원두는 [제품], 포장봉투 등은 [부자재]로 등록하세요. 출고단가 0 = 싯가."
  />
);

// ───────────────────────── 거래처등록 ─────────────────────────
const partnerColumns: ColumnDefinition[] = [
  { title: '코드', field: 'code', width: 90 },
  { title: '거래처명', field: 'name', minWidth: 160 },
  { title: '구분', field: 'partner_type', width: 90, hozAlign: 'center' },
  { title: '입금주기', field: 'pay_cycle', width: 84, hozAlign: 'center' },
  { title: '전화', field: 'phone', width: 120 },
  { title: '사업자번호', field: 'biz_no', width: 110 },
  { title: '메모', field: 'memo', minWidth: 120 },
  { title: '사용', field: 'active', width: 54, hozAlign: 'center', formatter: yn },
];

const partnerFields: FormField[] = [
  { name: 'code', label: '거래처코드', type: 'text', required: true, placeholder: '예: C001' },
  { name: 'name', label: '거래처명', type: 'text', required: true },
  { name: 'partner_type', label: '거래구분', type: 'select', options: ['매출', '매입', '매출+매입'] },
  { name: 'pay_cycle', label: '입금주기', type: 'select', options: ['당일', '월별'], hint: '월별 = 월말 일괄 수금 거래처' },
  { name: 'phone', label: '전화번호', type: 'text' },
  { name: 'email', label: '이메일', type: 'text' },
  { name: 'biz_no', label: '사업자번호', type: 'text' },
  { name: 'ceo', label: '대표자', type: 'text' },
  { name: 'address', label: '주소', type: 'text' },
  { name: 'memo', label: '메모', type: 'textarea' },
];

export const PartnerMaster = () => (
  <MasterScreen<Partner>
    title="거래처등록"
    endpoint="/api/partners"
    columns={partnerColumns}
    fields={partnerFields}
    defaults={{ code: '', name: '', biz_no: '', ceo: '', phone: '', email: '', address: '', partner_type: '매출', pay_cycle: '당일', memo: '', active: 1 }}
    helpText="카페(판매처)는 [매출], 생두 공급사는 [매입]으로 등록하세요."
  />
);

// ───────────────────────── 창고등록 ─────────────────────────
export const WarehouseMaster = () => (
  <MasterScreen<Warehouse>
    title="창고등록"
    endpoint="/api/warehouses"
    columns={[
      { title: '코드', field: 'code', width: 90 },
      { title: '창고명', field: 'name', minWidth: 160 },
      { title: '구분', field: 'wh_type', width: 84, hozAlign: 'center' },
      { title: '메모', field: 'memo', minWidth: 120 },
      { title: '사용', field: 'active', width: 54, hozAlign: 'center', formatter: yn },
    ]}
    fields={[
      { name: 'code', label: '창고코드', type: 'text', required: true },
      { name: 'name', label: '창고명', type: 'text', required: true },
      { name: 'wh_type', label: '구분', type: 'select', options: ['창고', '공장'], hint: '공장 = 생산(로스팅)이 일어나는 곳' },
      { name: 'memo', label: '메모', type: 'textarea' },
    ]}
    defaults={{ code: '', name: '', wh_type: '창고', memo: '', active: 1 }}
  />
);

// ───────────────────────── 프로젝트등록 ─────────────────────────
export const ProjectMaster = () => (
  <MasterScreen<Project>
    title="프로젝트등록"
    endpoint="/api/projects"
    columns={[
      { title: '코드', field: 'code', width: 90 },
      { title: '프로젝트명', field: 'name', minWidth: 160 },
      { title: '메모', field: 'memo', minWidth: 120 },
      { title: '사용', field: 'active', width: 54, hozAlign: 'center', formatter: yn },
    ]}
    fields={[
      { name: 'code', label: '코드', type: 'text', required: true },
      { name: 'name', label: '프로젝트명', type: 'text', required: true },
      { name: 'memo', label: '메모', type: 'textarea' },
    ]}
    defaults={{ code: '', name: '', memo: '', active: 1 }}
    helpText="납품 채널(도매/택배/행사 등)처럼 전표를 묶어 보고 싶은 단위를 등록하세요."
  />
);

// ───────────────────────── 사원등록 (R3: 전표 담당자) ─────────────────────────
export const EmployeeMaster = () => (
  <MasterScreen<Employee>
    title="사원등록"
    endpoint="/api/employees"
    columns={[
      { title: '사원코드', field: 'code', width: 100 },
      { title: '사원명', field: 'name', minWidth: 140 },
      { title: '연락처', field: 'phone', width: 130 },
      { title: '메모', field: 'memo', minWidth: 140 },
      { title: '사용', field: 'active', width: 54, hozAlign: 'center', formatter: yn },
    ]}
    fields={[
      { name: 'code', label: '사원코드', type: 'text', required: true, placeholder: '예: E001' },
      { name: 'name', label: '사원명', type: 'text', required: true },
      { name: 'phone', label: '연락처', type: 'text' },
      { name: 'memo', label: '메모', type: 'textarea' },
    ]}
    defaults={{ code: '', name: '', phone: '', memo: '', active: 1 }}
    helpText="판매/구매 등 전표의 담당자로 선택할 사원을 등록하세요."
  />
);

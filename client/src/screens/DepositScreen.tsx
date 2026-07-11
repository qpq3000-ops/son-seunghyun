import { MasterScreen, FormField } from '../components/MasterScreen';
import type { ColumnDefinition } from '../components/DataGrid';
import type { Deposit } from '../types';
import { fmtWon } from '../format';

// 예적금현황 — 설계-R4-세무회계2.md §4.5. MasterScreen 재사용 얇은 래퍼(masters.tsx 패턴과 동일).
// 가입일/만기일은 MasterScreen에 date 타입이 없어 text(placeholder 'YYYY-MM-DD')로 입력한다(문서화된 제약).

const yn: ColumnDefinition['formatter'] = cell => (Number(cell.getValue()) === 1 ? 'O' : '');

const depositColumns: ColumnDefinition[] = [
  { title: '관리코드', field: 'code', width: 100 },
  { title: '예적금명', field: 'name', minWidth: 140 },
  { title: '은행', field: 'bank', width: 100 },
  { title: '종류', field: 'kind', width: 60, hozAlign: 'center' },
  { title: '원금', field: 'principal', width: 110, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
  { title: '이율(%)', field: 'rate', width: 70, hozAlign: 'right' },
  { title: '만기일', field: 'maturity_date', width: 100 },
  { title: '사용', field: 'active', width: 54, hozAlign: 'center', formatter: yn },
];

const depositFields: FormField[] = [
  { name: 'code', label: '관리코드', type: 'text', required: true, placeholder: '예: D001' },
  { name: 'name', label: '예적금명', type: 'text', required: true, placeholder: '예: 정기예금' },
  { name: 'bank', label: '은행', type: 'text' },
  { name: 'kind', label: '종류', type: 'select', options: ['예금', '적금'] },
  { name: 'account_no', label: '계좌번호', type: 'text' },
  { name: 'principal', label: '원금(원)', type: 'money' },
  { name: 'rate', label: '연이율(%)', type: 'number' },
  { name: 'start_date', label: '가입일', type: 'text', placeholder: 'YYYY-MM-DD' },
  { name: 'maturity_date', label: '만기일', type: 'text', placeholder: 'YYYY-MM-DD' },
  { name: 'memo', label: '메모', type: 'textarea' },
];

export const DepositScreen = () => (
  <MasterScreen<Deposit>
    title="예적금현황"
    endpoint="/api/deposits"
    columns={depositColumns}
    fields={depositFields}
    defaults={{ code: '', name: '', bank: '', account_no: '', kind: '예금', principal: 0, rate: 0, start_date: '', maturity_date: '', memo: '', active: 1 }}
    helpText="만기·금리는 참고용 수기 등록입니다."
  />
);

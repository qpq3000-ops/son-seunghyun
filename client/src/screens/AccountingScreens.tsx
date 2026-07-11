import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { MasterScreen, FormField } from '../components/MasterScreen';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, todayISO, monthStartISO } from '../format';
import type { Account, JournalRow, PartnerLedger, PartnerLedgerRow, MonthlyPL, VatBook, VatBookRow } from '../types';

// Phase 3 회계 코어 화면 5종 — 계정과목(AccountMaster)/분개장(JournalScreen)/거래처원장(PartnerLedger)/
// 월별손익(MonthlyPL)/매입매출장(VatBook, 보너스). 설계-Phase23-생산회계.md 4.1~4.5.

const wonCell = (v: number) => (v ? fmtWon(v) : '');

// ───────────────────────── 4.1 계정과목 ─────────────────────────
const accountColumns: ColumnDefinition[] = [
  { title: '계정코드', field: 'code', width: 90 },
  { title: '계정명', field: 'name', minWidth: 160 },
  { title: '구분', field: 'category', width: 80, hozAlign: 'center' },
  {
    title: '시스템', field: 'is_system', width: 70, hozAlign: 'center',
    formatter: c => (Number(c.getValue()) === 1 ? '<b class="link">기본</b>' : ''),
  },
  {
    title: '사용', field: 'active', width: 60, hozAlign: 'center',
    formatter: c => (Number(c.getValue()) === 1 ? 'O' : ''),
  },
];

const accountFields: FormField[] = [
  { name: 'code', label: '계정코드', type: 'text', required: true, placeholder: '예: 840' },
  { name: 'name', label: '계정명', type: 'text', required: true },
  { name: 'category', label: '계정구분', type: 'select', options: ['자산', '부채', '자본', '수익', '비용'] },
  { name: 'active', label: '사용여부', type: 'checkbox' },
  { name: 'memo', label: '메모', type: 'textarea' },
];

export const AccountMaster = () => (
  <MasterScreen<Account>
    title="계정과목"
    endpoint="/api/accounts"
    columns={accountColumns}
    fields={accountFields}
    defaults={{ code: '', name: '', category: '비용', active: 1, memo: '' }}
    helpText="기본 계정(외상매출금·부가세예수금 등)은 자동분개가 사용하므로 코드·구분 변경·삭제가 제한됩니다."
  />
);

// ───────────────────────── 4.2 분개장 ─────────────────────────
type EntryType = '전체' | '매출' | '매입' | '수금' | '지불';

export function JournalScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [entryType, setEntryType] = useState<EntryType>('전체');
  const [accountCode, setAccountCode] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [help, setHelp] = useState<'account' | 'partner' | null>(null);
  const [rows, setRows] = useState<JournalRow[]>([]);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ from, to });
      if (entryType !== '전체') qs.set('entry_type', entryType);
      if (accountCode) qs.set('account_code', accountCode);
      if (partnerId) qs.set('partner_id', String(partnerId));
      setRows(await api.get<JournalRow[]>(`/api/journal?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, entryType, accountCode, partnerId, toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '유형', field: 'entry_type', width: 70, hozAlign: 'center' },
    { title: '계정과목', field: 'account_name', minWidth: 130 },
    {
      title: '차변', field: 'dr', width: 110, hozAlign: 'right',
      formatter: c => wonCell(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '대변', field: 'cr', width: 110, hozAlign: 'right',
      formatter: c => wonCell(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    { title: '거래처', field: 'partner_name', minWidth: 130, formatter: c => String(c.getValue() ?? '') },
    { title: '적요', field: 'summary', minWidth: 140 },
  ];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <select className="input" style={{ width: 90 }} value={entryType} onChange={e => setEntryType(e.target.value as EntryType)}>
            <option>전체</option><option>매출</option><option>매입</option><option>수금</option><option>지불</option>
          </select>
          <input className="input lookup" style={{ width: 140 }} readOnly value={accountName}
            placeholder="계정(전체)" onClick={() => setHelp('account')} />
          {accountName && (
            <button className="icon-btn" title="계정 선택 해제" onClick={() => { setAccountCode(null); setAccountName(''); }}>✕</button>
          )}
          <input className="input lookup" style={{ width: 140 }} readOnly value={partnerName}
            placeholder="거래처(전체)" onClick={() => setHelp('partner')} />
          {partnerName && (
            <button className="icon-btn" title="거래처 선택 해제" onClick={() => { setPartnerId(null); setPartnerName(''); }}>✕</button>
          )}
          <button className="btn" onClick={load}>검색(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '분개장.xlsx', { sheetName: '분개장' })}>
            엑셀
          </button>
        </div>
      </div>
      <div className="screen-grid">
        <DataGrid<JournalRow> columns={columns} data={rows} gridRef={t => { gridRef.current = t; }} />
      </div>
      {help === 'account' && (
        <CodeHelp title="계정과목" endpoint="/api/accounts" onClose={() => setHelp(null)}
          onSelect={r => { setAccountCode(String(r.code)); setAccountName(r.name); }} />
      )}
      {help === 'partner' && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(null)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
    </div>
  );
}

// ───────────────────────── 4.3 거래처원장 ─────────────────────────
type Side = 'auto' | '매출' | '매입';

export function PartnerLedger() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [side, setSide] = useState<Side>('auto');
  const [help, setHelp] = useState(false);
  const [report, setReport] = useState<PartnerLedger | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    if (!partnerId) { toast.show('거래처를 선택하세요.', 'error'); return; }
    try {
      const qs = new URLSearchParams({ partner_id: String(partnerId), from, to });
      if (side !== 'auto') qs.set('side', side);
      setReport(await api.get<PartnerLedger>(`/api/partner-ledger?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [partnerId, from, to, side, toast]);

  useEffect(() => { if (partnerId) load(); }, [partnerId, load]);

  const increaseLabel = report?.side === '매입' ? '구매' : '매출';
  const decreaseLabel = report?.side === '매입' ? '지불' : '수금';

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '구분', field: 'entry_type', width: 70, hozAlign: 'center' },
    {
      title: `증가(${increaseLabel})`, field: 'increase', width: 110, hozAlign: 'right',
      formatter: c => wonCell(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: `감소(${decreaseLabel})`, field: 'decrease', width: 110, hozAlign: 'right',
      formatter: c => wonCell(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '잔액', field: 'balance', width: 120, hozAlign: 'right',
      formatter: c => `<b>${fmtWon(Number(c.getValue() ?? 0))}</b>`,
    },
    { title: '적요', field: 'summary', minWidth: 140 },
  ];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <input className="input lookup" style={{ width: 160 }} readOnly value={partnerName}
            placeholder="거래처 선택(필수)" onClick={() => setHelp(true)} />
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <select className="input" style={{ width: 110 }} value={side} onChange={e => setSide(e.target.value as Side)}>
            <option value="auto">자동</option>
            <option value="매출">매출(채권)</option>
            <option value="매입">매입(채무)</option>
          </select>
          <button className="btn" onClick={load}>검색(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '거래처원장.xlsx', { sheetName: '거래처원장' })}>
            엑셀
          </button>
        </div>
      </div>
      {report && (
        <p className="hint ledger-summary">
          <b>{report.partner.name}</b> · {report.side} · 이월 <b>{fmtWon(report.opening)}</b> /
          {' '}{increaseLabel} <b>{fmtWon(report.sum_increase)}</b> /
          {' '}{decreaseLabel} <b>{fmtWon(report.sum_decrease)}</b> /
          {' '}잔액 <b>{fmtWon(report.closing)}</b>
        </p>
      )}
      <div className="screen-grid">
        <DataGrid<PartnerLedgerRow> columns={columns} data={report?.rows ?? []} gridRef={t => { gridRef.current = t; }} />
      </div>
      {help && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(false)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
    </div>
  );
}

// ───────────────────────── 4.4 월별손익 ─────────────────────────
const monthLabel = (ym: string): string => `${parseInt(ym.slice(5, 7), 10)}월`;
const negRowKeys = new Set(['gross_profit', 'op_profit']);

export function MonthlyPL() {
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<MonthlyPL | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<MonthlyPL>(`/api/monthly-pl?year=${year}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [year, toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '항목', field: 'label', width: 140, frozen: true },
    ...(data?.months ?? []).map((ym, i): ColumnDefinition => ({
      title: monthLabel(ym), field: `m${i + 1}`, width: 90, hozAlign: 'right',
      formatter: c => {
        const v = Number(c.getValue() ?? 0);
        const d = c.getData() as { key: string };
        return negRowKeys.has(d.key) && v < 0 ? `<b class="danger-text">${fmtWon(v)}</b>` : fmtWon(v);
      },
    })),
    {
      title: '합계', field: 'total', width: 110, hozAlign: 'right',
      formatter: c => {
        const v = Number(c.getValue() ?? 0);
        const d = c.getData() as { key: string };
        const text = `<b>${fmtWon(v)}</b>`;
        return negRowKeys.has(d.key) && v < 0 ? `<b class="danger-text">${fmtWon(v)}</b>` : text;
      },
    },
  ];

  const gridData = (data?.rows ?? []).map(r => {
    const rec: Record<string, unknown> = { key: r.key, label: r.label, total: r.total };
    r.values.forEach((v, i) => { rec[`m${i + 1}`] = v; });
    return rec;
  });

  const years = [thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>연도</span>
          <select className="input" style={{ width: 100 }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button className="btn" onClick={load}>조회(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '월별손익.xlsx', { sheetName: '월별손익' })}>
            엑셀
          </button>
        </div>
      </div>
      <div className="screen-grid">
        <DataGrid key={data?.year ?? 'none'}
          columns={columns} data={gridData} gridRef={t => { gridRef.current = t; }}
          options={{ layout: 'fitDataFill' }} />
      </div>
    </div>
  );
}

// ───────────────────────── 4.5 매입매출장(보너스) ─────────────────────────
type VatKind = '전체' | '매출' | '매입';

export function VatBook() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [kind, setKind] = useState<VatKind>('전체');
  const [data, setData] = useState<VatBook | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ from, to });
      if (kind !== '전체') qs.set('kind', kind);
      setData(await api.get<VatBook>(`/api/vat-book?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, kind, toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '구분', field: 'kind', width: 60, hozAlign: 'center' },
    { title: '과세유형', field: 'tax_mode', width: 70, hozAlign: 'center' },
    { title: '거래처', field: 'partner_name', minWidth: 130 },
    { title: '품목요약', field: 'item_summary', minWidth: 180 },
    {
      title: '공급가액', field: 'supply', width: 110, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '부가세', field: 'vat', width: 100, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '합계', field: 'total', width: 110, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
  ];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <select className="input" style={{ width: 90 }} value={kind} onChange={e => setKind(e.target.value as VatKind)}>
            <option>전체</option><option>매출</option><option>매입</option>
          </select>
          <button className="btn" onClick={load}>검색(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '매입매출장.xlsx', { sheetName: '매입매출장' })}>
            엑셀
          </button>
        </div>
      </div>
      {data && (
        <p className="hint ledger-summary">
          매출 과세 <b>{fmtWon(data.summary.매출.과세공급)}</b>(부가세 <b>{fmtWon(data.summary.매출.부가세)}</b>) ·
          {' '}면세 <b>{fmtWon(data.summary.매출.면세공급)}</b> · 합계 <b>{fmtWon(data.summary.매출.합계)}</b>
          <br />
          매입 과세 <b>{fmtWon(data.summary.매입.과세공급)}</b>(부가세 <b>{fmtWon(data.summary.매입.부가세)}</b>) ·
          {' '}면세 <b>{fmtWon(data.summary.매입.면세공급)}</b> · 합계 <b>{fmtWon(data.summary.매입.합계)}</b>
        </p>
      )}
      <div className="screen-grid">
        <DataGrid<VatBookRow> columns={columns} data={data?.rows ?? []} gridRef={t => { gridRef.current = t; }} />
      </div>
    </div>
  );
}

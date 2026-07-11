import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, fmtQty, todayISO, monthStartISO } from '../format';
import type { DocListRow } from '../types';
import { QuoteInput, OrderInput, PurchaseOrderInput } from './DocChainScreen';

// 견적조회/주문조회/발주조회 — VoucherList와 동일 패턴(검색조건 + DataGrid + 더블클릭 → 입력화면 교체).
// 견적/주문/발주는 "입력/조회"를 이 한 화면으로 통합한다(리스트 진입 + [신규] 버튼/더블클릭으로 입력폼 교체 — 설계 4.9).

type Kind = 'quote' | 'order' | 'purchase_order';
type StatusFilter = '' | '대기' | '완료';

const TITLE: Record<Kind, string> = { quote: '견적조회', order: '주문조회', purchase_order: '발주조회' };
const INPUT_COMP = { quote: QuoteInput, order: OrderInput, purchase_order: PurchaseOrderInput };

const moneyCol = (field: string, title: string, width = 110): ColumnDefinition => ({
  title, field, width, hozAlign: 'right',
  formatter: c => fmtWon(Number(c.getValue() ?? 0)),
  bottomCalc: 'sum',
  bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
});

function DocChainListScreen({ kind }: { kind: Kind }) {
  const toast = useToast();
  const [rows, setRows] = useState<DocListRow[]>([]);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [help, setHelp] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ type: kind, from, to });
      if (partnerId) qs.set('partner_id', String(partnerId));
      if (status) qs.set('status', status);
      setRows(await api.get<DocListRow[]>(`/api/docs?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [kind, from, to, partnerId, status, toast]);

  useEffect(() => { load(); }, [load]);

  const completeStatus = async (id: number) => {
    try {
      await api.put(`/api/docs/${id}/status`, { status: '완료' });
      toast.show('완료 처리되었습니다.');
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '거래처', field: 'partner_name', minWidth: 140 },
    { title: '품목요약', field: 'item_summary', minWidth: 200 },
  ];
  if (kind !== 'quote') {
    columns.push({ title: '납기일자', field: 'time_date', width: 100 });
  }
  columns.push(
    {
      title: '수량', field: 'total_qty', width: 90, hozAlign: 'right',
      formatter: c => fmtQty(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtQty(Number(c.getValue() ?? 0)),
    },
    moneyCol('total_supply', '공급가액'),
    moneyCol('total_vat', '부가세', 100),
    moneyCol('total_amount', '합계'),
    {
      title: '진행상태', field: 'status', width: 90, hozAlign: 'center',
      formatter: c => (c.getValue() === '대기' ? `<b class="danger-text">대기</b>` : String(c.getValue() ?? '')),
    },
    { title: '적요', field: 'memo', minWidth: 120 },
    {
      title: '', width: 74, hozAlign: 'center', headerSort: false,
      formatter: c => ((c.getData() as DocListRow).status === '대기' ? '<span class="link">완료처리</span>' : ''),
      cellClick: (_e, cell) => {
        const row = cell.getData() as DocListRow;
        if (row.status === '대기') completeStatus(row.id);
      },
    },
  );

  const title = TITLE[kind];
  const InputComp = INPUT_COMP[kind];

  if (creating) {
    return (
      <InputComp
        mode="create"
        onSaved={() => { setCreating(false); load(); }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  if (editId !== null) {
    return (
      <InputComp
        mode="edit"
        docId={editId}
        onSaved={() => { setEditId(null); load(); }}
        onDeleted={() => { setEditId(null); load(); }}
        onCancel={() => setEditId(null)}
      />
    );
  }

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <input className="input lookup" style={{ width: 160 }} readOnly value={partnerName}
            placeholder="거래처(전체)" onClick={() => setHelp(true)} />
          {partnerName && (
            <button className="icon-btn" title="거래처 선택 해제" onClick={() => { setPartnerId(null); setPartnerName(''); }}>✕</button>
          )}
          <select className="input" style={{ width: 100 }} value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
            <option value="">전체</option>
            <option value="대기">대기</option>
            <option value="완료">완료</option>
          </select>
          <button className="btn" onClick={load}>검색</button>
        </div>
        <div className="btn-group">
          <button className="btn primary" onClick={() => setCreating(true)}>신규</button>
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', `${title}.xlsx`, { sheetName: title })}>
            엑셀
          </button>
        </div>
      </div>
      <div className="screen-grid">
        <DataGrid<DocListRow>
          columns={columns}
          data={rows}
          onRowDblClick={r => setEditId(r.id)}
          gridRef={t => { gridRef.current = t; }}
        />
      </div>
      {help && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(false)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
    </div>
  );
}

export const QuoteList = () => <DocChainListScreen kind="quote" />;
export const OrderList = () => <DocChainListScreen kind="order" />;
export const PurchaseOrderList = () => <DocChainListScreen kind="purchase_order" />;

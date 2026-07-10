import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, fmtQty, todayISO, monthStartISO } from '../format';
import type { DocListRow } from '../types';
import { VoucherScreen } from './VoucherScreen';

// 판매조회/구매조회 — 조건 검색 그리드. 행 더블클릭 시 같은 자리에서 VoucherScreen(수정모드)로 교체된다.

type Kind = 'sale' | 'purchase';

const moneyCol = (field: string, title: string, width = 110): ColumnDefinition => ({
  title, field, width, hozAlign: 'right',
  formatter: c => fmtWon(Number(c.getValue() ?? 0)),
  bottomCalc: 'sum',
  bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
});

function VoucherListScreen({ kind }: { kind: Kind }) {
  const toast = useToast();
  const [rows, setRows] = useState<DocListRow[]>([]);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [help, setHelp] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ type: kind, from, to });
      if (partnerId) qs.set('partner_id', String(partnerId));
      setRows(await api.get<DocListRow[]>(`/api/docs?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [kind, from, to, partnerId, toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '거래처', field: 'partner_name', minWidth: 140 },
    { title: '품목요약', field: 'item_summary', minWidth: 220 },
    {
      title: '수량', field: 'total_qty', width: 90, hozAlign: 'right',
      formatter: c => fmtQty(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtQty(Number(c.getValue() ?? 0)),
    },
    moneyCol('total_supply', '공급가액'),
    moneyCol('total_vat', '부가세', 100),
    moneyCol('total_amount', '합계'),
    { title: '적요', field: 'memo', minWidth: 120 },
  ];

  const title = kind === 'sale' ? '판매조회' : '구매조회';

  if (editId !== null) {
    return (
      <VoucherScreen
        kind={kind}
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
          <button className="btn" onClick={load}>검색</button>
        </div>
        <div className="btn-group">
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

export const SaleList = () => <VoucherListScreen kind="sale" />;
export const PurchaseList = () => <VoucherListScreen kind="purchase" />;

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, fmtWon } from '../format';
import type { BeanHistoryRow, BeanMonthRow, BeanPriceReport, BeanPriceRow } from '../types';

// 생두 단가비교 (설계-잔여메뉴.md 4.7) — 구매(purchase) 전표 라인 기반. 기간은 선택(비우면 전체 기간).

export function BeanPriceScreen() {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<BeanPriceReport | null>(null);
  const [sel, setSel] = useState<BeanPriceRow | null>(null);
  const [history, setHistory] = useState<BeanHistoryRow[]>([]);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const qstr = qs.toString();
      setData(await api.get<BeanPriceReport>(`/api/bean-price${qstr ? `?${qstr}` : ''}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  const openHistory = async (row: BeanPriceRow) => {
    setSel(row);
    try {
      setHistory(await api.get<BeanHistoryRow[]>(`/api/bean-price/${row.item_id}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  const columns: ColumnDefinition[] = [
    { title: '생두명', field: 'item_name', minWidth: 150 },
    { title: '최근구매가', field: 'recent_price', width: 100, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
    { title: '최근구매일', field: 'recent_date', width: 100 },
    { title: '최저가', field: 'min_price', width: 100, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
    { title: '최저가업체', field: 'min_partner', minWidth: 130, formatter: c => String(c.getValue() ?? '-') },
    { title: '평균가', field: 'avg_price', width: 100, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
    { title: '누적구매량', field: 'total_qty', width: 100, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '구매횟수', field: 'buy_count', width: 80, hozAlign: 'right' },
  ];

  const historyColumns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '거래처', field: 'partner_name', minWidth: 130, formatter: c => String(c.getValue() ?? '') },
    { title: '수량', field: 'qty', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '단가', field: 'price', width: 100, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
    { title: '공급가액', field: 'supply_amt', width: 110, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
  ];

  const monthColumns: ColumnDefinition[] = [
    { title: '월', field: 'ym', width: 90 },
    { title: '구매량(kg)', field: 'qty', width: 110, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '구매금액', field: 'supply', width: 120, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
  ];

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn" onClick={load}>검색(F3)</button>
          <span className="field-hint">기간을 비우면 전체 기간을 조회합니다</span>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '생두단가비교.xlsx', { sheetName: '생두단가비교' })}>
            엑셀
          </button>
        </div>
      </div>

      <DataGrid<BeanPriceRow> columns={columns} data={data?.rows ?? []} height={260} rowNumbers
        onRowClick={openHistory} gridRef={t => { gridRef.current = t; }} />

      {sel && (
        <div className="detail-panel">
          <div className="dp-title">구매 이력 — {sel.item_name}</div>
          <DataGrid<BeanHistoryRow> columns={historyColumns} data={history} height={200} rowNumbers />
        </div>
      )}

      <div className="vh-title" style={{ marginTop: 14 }}>월별 구매 합계</div>
      <DataGrid<BeanMonthRow> columns={monthColumns} data={data?.monthly ?? []} height={200} rowNumbers />
    </div>
  );
}

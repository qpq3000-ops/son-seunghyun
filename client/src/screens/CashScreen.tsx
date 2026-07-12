import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, monthStartISO, todayISO } from '../format';
import type { CashListRow, CashReport } from '../types';

// 자금현황 (설계-잔여메뉴.md 4.5) — receipt(수금/지불) 기반 결제수단별 요약 타일 + 일별 입출금 목록.

export function CashScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<CashReport | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<CashReport>(`/api/cash?from=${from}&to=${to}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '구분', field: 'kind', width: 60, hozAlign: 'center' },
    { title: '거래처', field: 'partner_name', minWidth: 140 },
    { title: '수단', field: 'method', width: 90, hozAlign: 'center' },
    { title: '전표번호', field: 'receipt_no', width: 120 },
    {
      title: '입금', field: 'in_amt', width: 110, hozAlign: 'right',
      formatter: c => { const v = Number(c.getValue() ?? 0); return v ? fmtWon(v) : ''; },
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '출금', field: 'out_amt', width: 110, hozAlign: 'right',
      formatter: c => { const v = Number(c.getValue() ?? 0); return v ? fmtWon(v) : ''; },
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    { title: '적요', field: 'memo', minWidth: 140 },
  ];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn" onClick={load}>검색(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '자금현황.xlsx', { sheetName: '자금현황' })}>
            엑셀
          </button>
        </div>
      </div>

      {data && (
        <div className="cash-tiles">
          {data.summary.map(s => (
            <div key={s.method} className="cash-tile">
              <div className="ct-title">{s.method}</div>
              <div className="ct-net" style={s.net < 0 ? { color: 'var(--danger)' } : undefined}>{fmtWon(s.net)}</div>
              <div className="ct-io"><span>입금 {fmtWon(s.in_amt)}</span><span>출금 {fmtWon(s.out_amt)}</span></div>
            </div>
          ))}
          <div className="cash-tile total">
            <div className="ct-title">총계</div>
            <div className="ct-net" style={data.totals.net < 0 ? { color: 'var(--danger)' } : undefined}>{fmtWon(data.totals.net)}</div>
            <div className="ct-io"><span>총입금 {fmtWon(data.totals.in_amt)}</span><span>총출금 {fmtWon(data.totals.out_amt)}</span></div>
          </div>
        </div>
      )}

      <div className="screen-grid">
        <DataGrid<CashListRow> columns={columns} data={data?.list ?? []} rowNumbers gridRef={t => { gridRef.current = t; }} />
      </div>
    </div>
  );
}

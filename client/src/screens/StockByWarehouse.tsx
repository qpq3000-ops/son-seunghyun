import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, todayISO } from '../format';
import type { StockWhMatrix } from '../types';

// 창고별재고현황 — 창고×품목 매트릭스(설계 4.8). 창고 컬럼은 응답(warehouses)에 따라 동적으로 생성된다.

export function StockByWarehouse() {
  const toast = useToast();
  const [asOf, setAsOf] = useState(todayISO());
  const [data, setData] = useState<StockWhMatrix | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<StockWhMatrix>(`/api/stock/by-warehouse?as_of=${asOf}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [asOf, toast]);

  useEffect(() => { load(); }, [load]);

  const warehouses = data?.warehouses ?? [];
  const whKey = warehouses.map(w => w.id).join(',') || 'none';

  const columns = useMemo<ColumnDefinition[]>(() => [
    { title: '품목코드', field: 'item_code', width: 110 },
    { title: '품목명', field: 'item_name', minWidth: 170 },
    { title: '단위', field: 'unit', width: 60, hozAlign: 'center' },
    ...warehouses.map((w): ColumnDefinition => ({
      title: w.name, field: `wh_${w.id}`, width: 100, hozAlign: 'right',
      formatter: c => fmtQty(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtQty(Number(c.getValue() ?? 0)),
    })),
    {
      title: '합계', field: 'total', width: 100, hozAlign: 'right',
      formatter: c => `<b>${fmtQty(Number(c.getValue() ?? 0))}</b>`,
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtQty(Number(c.getValue() ?? 0)),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [whKey]);

  const gridData = useMemo(() => (data?.rows ?? []).map(r => {
    const rec: Record<string, unknown> = { item_code: r.item_code, item_name: r.item_name, unit: r.unit, total: r.total };
    warehouses.forEach(w => { rec[`wh_${w.id}`] = r.by_wh[String(w.id)] ?? 0; });
    return rec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data]);

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기준일자</span>
          <input className="input" type="date" style={{ width: 150 }} value={asOf} onChange={e => setAsOf(e.target.value)} />
          <button className="btn" onClick={load}>조회(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '창고별재고현황.xlsx', { sheetName: '창고별재고현황' })}>
            엑셀
          </button>
        </div>
      </div>
      <div className="screen-grid">
        <DataGrid key={whKey} columns={columns} data={gridData} rowNumbers gridRef={t => { gridRef.current = t; }} />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty } from '../format';
import type { MrpReport, MrpRow } from '../types';

// 소요량계산 (설계-잔여메뉴.md 4.2) — 대기 상태 주문서 기준 품목별 필요량 → 현재고 차감 →
// 부족분을 paired 생두·수율로 환산해 발주 참고량까지 보여준다. 쿼리 없음(전량 기준, 설계 3.2).

const dash = (v: number | null): string => (v === null || v === undefined ? '-' : fmtQty(v));

export function MrpScreen() {
  const toast = useToast();
  const [rows, setRows] = useState<MrpRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<MrpReport>('/api/mrp');
      setRows(r.rows);
      setLoaded(true);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '품목', field: 'item_name', minWidth: 150 },
    { title: '필요', field: 'required', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '현재고', field: 'stock', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    {
      title: '부족', field: 'shortage', width: 90, hozAlign: 'right',
      formatter: c => {
        const v = Number(c.getValue() ?? 0);
        return v > 0 ? `<b class="danger-text">${fmtQty(v)}</b>` : fmtQty(v);
      },
    },
    { title: '연결생두', field: 'bean_name', minWidth: 140, formatter: c => String(c.getValue() ?? '-') },
    { title: '필요생두', field: 'bean_need', width: 90, hozAlign: 'right', formatter: c => dash(c.getValue() as number | null) },
    { title: '생두재고', field: 'bean_stock', width: 90, hozAlign: 'right', formatter: c => dash(c.getValue() as number | null) },
    {
      title: '생두부족(발주참고)', field: 'bean_short', width: 130, hozAlign: 'right',
      formatter: c => {
        const v = c.getValue() as number | null;
        if (v === null || v === undefined) return '-';
        return v > 0 ? `<b class="danger-text">${fmtQty(v)}</b>` : fmtQty(v);
      },
    },
  ];

  const shortageCount = rows.filter(r => r.shortage > 0).length;
  const beanShortCount = new Set(rows.filter(r => (r.bean_short ?? 0) > 0).map(r => r.bean_item_id)).size;

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <button className="btn r8-primary" onClick={load}>조회(F3)</button>
          <span className="hint" style={{ margin: 0 }}>대기 상태 주문서 기준으로 계산합니다</span>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '소요량계산.xlsx', { sheetName: '소요량계산' })}>
            엑셀
          </button>
        </div>
      </div>
      {loaded && (
        <p className="hint roast-yield">
          부족 품목 <b className={shortageCount ? 'danger-text' : ''}>{shortageCount}</b>종 &nbsp;/&nbsp;
          발주 필요 생두 <b className={beanShortCount ? 'danger-text' : ''}>{beanShortCount}</b>종
        </p>
      )}
      <div className="screen-grid r8-real">
        {rows.length > 0 || !loaded ? (
          <DataGrid<MrpRow> columns={columns} data={rows} rowNumbers gridRef={t => { gridRef.current = t; }} />
        ) : (
          <p className="hint" style={{ textAlign: 'center', marginTop: 40 }}>대기 중인 주문이 없습니다</p>
        )}
      </div>
    </div>
  );
}

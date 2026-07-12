import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { ReportFooter } from '../components/ReportScreen';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, todayISO } from '../format';
import type { StockWhMatrix } from '../types';

// 창고별재고현황 — 창고×품목 매트릭스(설계 4.8). 창고 컬럼은 응답(warehouses)에 따라 동적으로 생성된다.
// 실물 아키타입: 재고현황(StockStatus)의 형제 — r8-titlebar + r8-report-title/meta + r8-real 그리드.

export function StockByWarehouse() {
  const toast = useToast();
  const [asOf, setAsOf] = useState(todayISO());
  const [data, setData] = useState<StockWhMatrix | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [queriedAt, setQueriedAt] = useState<Date>(() => new Date());
  const gridRef = useRef<Tabulator | null>(null);

  useEffect(() => {
    api.get<Record<string, string>>('/api/settings')
      .then(s => setCompanyName(s.company_name ?? ''))
      .catch(() => setCompanyName(''));
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api.get<StockWhMatrix>(`/api/stock/by-warehouse?as_of=${asOf}`));
      setQueriedAt(new Date());
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [asOf, toast]);

  useEffect(() => { load(); }, [load]);

  // 이카운트 단축키: F8 검색(StockStatus와 동일 패턴)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); load(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load]);

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
      {/* 실물 타이틀바(설계-R8-실물매칭.md §4.2 패턴) — 검색은 아래 검색폼과 동일한 load()로 연결 */}
      <div className="r8-titlebar">
        <span className="r8-star">★</span>
        <h3>창고별재고현황</h3>
        <div className="r8-titlebar-right">
          <input className="r8-enter-input" placeholder="입력 후 Enter" readOnly title="검색조건은 아래 검색폼을 사용하세요" />
          <button className="btn r8-primary" onClick={load}>Search(F3)</button>
          <button className="btn r8-ghost" disabled title="옵션 설정은 연동 예정입니다">Option</button>
          <button className="btn r8-ghost" disabled title="도움말은 연동 예정입니다">도움말</button>
        </div>
      </div>

      <div className="screen-bar">
        <div className="search-group">
          <span>기준일자</span>
          <input className="input" type="date" style={{ width: 150 }} value={asOf} onChange={e => setAsOf(e.target.value)} />
          <button className="btn r8-primary" onClick={load}>조회(F3)</button>
        </div>
      </div>

      {/* 결과 화면 실물화(재고현황 형제) — 중앙제목 + 회사명·기준일 줄 + 그리드(r8-real) + 하단 인쇄/Excel/자동알림 */}
      <div className="r8-real">
        <div className="r8-report-title">창고별재고현황</div>
        <div className="r8-report-meta">
          <span>회사명 : {companyName}</span>
          <span>{asOf.split('-').join('/')}</span>
        </div>
        <div className="screen-grid">
          <DataGrid key={whKey} columns={columns} data={gridData} rowNumbers gridRef={t => { gridRef.current = t; }} />
        </div>
        <ReportFooter at={queriedAt} />
        <div className="r8-report-bottom">
          <button className="btn r8-primary r8-split" onClick={() => window.print()}>인쇄</button>
          <button className="btn r8-split-caret">▲</button>
          <button className="btn r8-ghost" onClick={() => gridRef.current?.download('xlsx', '창고별재고현황.xlsx', { sheetName: '창고별재고현황' })}>Excel</button>
          <button className="btn r8-ghost" disabled title="자동알림은 연동 예정입니다">자동알림</button>
        </div>
      </div>
    </div>
  );
}

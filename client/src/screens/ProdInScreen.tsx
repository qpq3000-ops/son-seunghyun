import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, monthStartISO, todayISO } from '../format';
import { RoastInput } from './RoastInput';
import type { RoastDocRow } from '../types';

// 생산입고 조회 (설계-잔여메뉴.md 4.3) — 이카운트 "생산입고 입력/조회" 관계 재현:
// 입력=roast-sheet(RoastInput) / 조회=prod-in. 더블클릭 시 RoastInput을 편집 모드로 재사용한다(설계 4.3 유일 예외).

const yieldCell = (v: number | null): string => (v === null || v === undefined ? '-' : `${fmtQty(v)}%`);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function ProdInScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<RoastDocRow[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async (f = from, t = to) => {
    try {
      setRows(await api.get<RoastDocRow[]>(`/api/roast-docs?from=${f}&to=${t}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  // 이카운트 단축키: F8 검색 (설계 4.3)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); load(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load]);

  // 기간 프리셋 (StatementPrint.tsx의 preset() 패턴 재사용, 설계 4.3)
  const preset = (kind: string) => {
    const now = new Date();
    let f = new Date(now), t = new Date(now);
    if (kind === '전일') { f.setDate(f.getDate() - 1); t = new Date(f); }
    else if (kind === '금주') { f.setDate(f.getDate() - ((f.getDay() + 6) % 7)); }
    else if (kind === '전주') { f.setDate(f.getDate() - ((f.getDay() + 6) % 7) - 7); t = new Date(f); t.setDate(t.getDate() + 6); }
    else if (kind === '금월') { f.setDate(1); }
    else if (kind === '전월') { f = new Date(now.getFullYear(), now.getMonth() - 1, 1); t = new Date(now.getFullYear(), now.getMonth(), 0); }
    const fs = iso(f), ts = iso(t);
    setFrom(fs); setTo(ts);
    load(fs, ts);
  };

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '공장', field: 'warehouse_name', width: 110 },
    { title: '산출품목', field: 'output_item_name', minWidth: 140 },
    { title: '투입합계', field: 'input_total', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '산출', field: 'output_total', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '수율', field: 'yield_pct', width: 80, hozAlign: 'right', formatter: c => yieldCell(c.getValue() as number | null) },
    { title: '적요', field: 'memo', minWidth: 140 },
  ];

  return (
    <div className="screen">
      <div className="stmt-search">
        <div className="stmt-cond">
          <label>기간</label>
          <input className="input w-140" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input w-140" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="stmt-presets">
          <button className="btn primary" onClick={() => load()}>검색(F8)</button>
          <button className="btn" onClick={() => preset('금일')}>금일</button>
          <button className="btn" onClick={() => preset('전일')}>전일</button>
          <button className="btn" onClick={() => preset('금주')}>금주(~오늘)</button>
          <button className="btn" onClick={() => preset('전주')}>전주</button>
          <button className="btn" onClick={() => preset('금월')}>금월(~오늘)</button>
          <button className="btn" onClick={() => preset('전월')}>전월</button>
          <button className="btn" onClick={() => { setFrom(monthStartISO()); setTo(todayISO()); load(monthStartISO(), todayISO()); }}>다시 작성</button>
        </div>
        <div className="btn-group" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '생산입고조회.xlsx', { sheetName: '생산입고' })}>
            엑셀
          </button>
        </div>
      </div>
      <div className="screen-grid" style={{ marginTop: 10 }}>
        <DataGrid<RoastDocRow> columns={columns} data={rows}
          onRowDblClick={r => setEditId(r.id)} gridRef={t => { gridRef.current = t; }} />
      </div>

      {editId !== null && (
        <div className="detail-panel">
          <div className="dp-title-row">
            <span className="dp-title">로스팅 전표 수정 — 더블클릭한 로트를 편집합니다.</span>
            <div className="vh-actions">
              <button className="btn small" onClick={() => load()}>목록 새로고침</button>
              <button className="btn small" onClick={() => { setEditId(null); load(); }}>닫기</button>
            </div>
          </div>
          <RoastInput initialEditId={editId} key={editId} />
        </div>
      )}
    </div>
  );
}

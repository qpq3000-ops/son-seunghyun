import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, monthStartISO, todayISO } from '../format';
import type { RoastDocRow } from '../types';

// 로트조회 (설계-잔여메뉴.md 4.1) — 로스팅 전표(=배치 로트)를 기간/산출품목으로 조회하고
// 행 클릭 시 투입 라인 상세를 하단 패널에 표시한다. prod-in(생산입고 조회)과 같은 /api/roast-docs를 쓰되
// 표시 컬럼·용도만 다르다(중복 엔드포인트 방지, 설계 3.1).

const yieldCell = (v: number | null): string => (v === null || v === undefined ? '-' : `${fmtQty(v)}%`);

export function LotScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [itemId, setItemId] = useState<number | null>(null);
  const [itemName, setItemName] = useState('');
  const [help, setHelp] = useState(false);
  const [rows, setRows] = useState<RoastDocRow[]>([]);
  const [sel, setSel] = useState<RoastDocRow | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ from, to });
      if (itemId) qs.set('item_id', String(itemId));
      setRows(await api.get<RoastDocRow[]>(`/api/roast-docs?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, itemId, toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '산출품목', field: 'output_item_name', minWidth: 140 },
    { title: '투입내역', field: 'input_summary', minWidth: 220 },
    { title: '투입합계', field: 'input_total', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '산출', field: 'output_total', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '수율', field: 'yield_pct', width: 80, hozAlign: 'right', formatter: c => yieldCell(c.getValue() as number | null) },
  ];

  const totalInput = rows.reduce((s, r) => s + r.input_total, 0);
  const totalOutput = rows.reduce((s, r) => s + r.output_total, 0);

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <input className="input lookup" style={{ width: 160 }} readOnly value={itemName}
            placeholder="산출품목(전체)" onClick={() => setHelp(true)} />
          {itemName && (
            <button className="icon-btn" title="품목 선택 해제" onClick={() => { setItemId(null); setItemName(''); }}>✕</button>
          )}
          <button className="btn" onClick={load}>검색(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '로트조회.xlsx', { sheetName: '로트조회' })}>
            엑셀
          </button>
        </div>
      </div>
      <p className="hint roast-yield">
        로트 <b>{rows.length}</b>건 &nbsp;/&nbsp; 총 투입 <b>{fmtQty(totalInput)}</b>kg &nbsp;/&nbsp; 총 산출 <b>{fmtQty(totalOutput)}</b>kg
      </p>
      <div className="screen-grid">
        <DataGrid<RoastDocRow> columns={columns} data={rows} onRowClick={r => setSel(r)} gridRef={t => { gridRef.current = t; }} />
      </div>

      {sel && (
        <div className="detail-panel">
          <div className="dp-title">
            투입 라인 상세 — {sel.doc_no} ({sel.io_date}) · 산출 {sel.output_item_name} {fmtQty(sel.output_total)}kg · 수율 {yieldCell(sel.yield_pct)}
          </div>
          <table className="mini-table">
            <thead>
              <tr><th style={{ width: 110 }}>품목코드</th><th>품목명</th><th className="num" style={{ width: 100 }}>투입(kg)</th></tr>
            </thead>
            <tbody>
              {sel.inputs.map(i => (
                <tr key={i.item_id}><td>{i.item_code}</td><td>{i.item_name}</td><td className="num">{fmtQty(i.qty)}</td></tr>
              ))}
              {!sel.inputs.length && <tr><td colSpan={3} className="empty">투입 라인이 없습니다</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {help && (
        <CodeHelp title="산출품목" endpoint="/api/items" onClose={() => setHelp(false)}
          onSelect={r => { setItemId(r.id); setItemName(r.name); }} />
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, todayISO, monthStartISO } from '../format';
import type { BomRow, ProductionSummary, ProdItemRow, ProdMonthRow } from '../types';

// Phase 2 잔여 — BOM등록(BomScreen) + 생산현황/수율분석(ProductionStatus). 설계 4.6~4.7.

// ───────────────────────── 4.6 BOM등록 ─────────────────────────
export function BomScreen() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<BomRow[]>([]);
  const [editing, setEditing] = useState<BomRow | null>(null);
  const [pairedItemId, setPairedItemId] = useState<number | null>(null);
  const [pairedItemName, setPairedItemName] = useState('');
  const [defaultYield, setDefaultYield] = useState(0);
  const [help, setHelp] = useState(false);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<BomRow[]>(`/api/bom?q=${encodeURIComponent(q)}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [q, toast]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (row: BomRow) => {
    setEditing(row);
    setPairedItemId(row.paired_item_id);
    setPairedItemName(row.paired_item_name ?? '');
    setDefaultYield(row.default_yield);
  };

  const save = async () => {
    if (!editing) return;
    if (!(defaultYield > 0) || defaultYield > 200) { toast.show('수율은 0 초과 200 이하로 입력하세요.', 'error'); return; }
    setSaving(true);
    try {
      await api.put(`/api/bom/${editing.item_id}`, { paired_item_id: pairedItemId, default_yield: defaultYield });
      toast.show('저장되었습니다.');
      setEditing(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDefinition[] = [
    { title: '제품코드', field: 'item_code', width: 100 },
    { title: '제품명', field: 'item_name', minWidth: 160 },
    { title: '구분', field: 'item_type', width: 70, hozAlign: 'center' },
    { title: '연결생두코드', field: 'paired_item_code', width: 110, formatter: c => String(c.getValue() ?? '') },
    { title: '연결생두명', field: 'paired_item_name', minWidth: 150, formatter: c => String(c.getValue() ?? '') },
    {
      title: '기본수율', field: 'default_yield', width: 90, hozAlign: 'right',
      formatter: c => `${fmtQty(Number(c.getValue() ?? 0))}%`,
    },
    {
      title: '편집', width: 60, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link">편집</span>',
      cellClick: (_e, cell) => openEdit(cell.getRow().getData() as BomRow),
    },
  ];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <input className="input" style={{ width: 260 }} placeholder="코드/이름 검색"
            value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={load}>검색(F3)</button>
        </div>
      </div>
      <p className="hint">
        코드 규칙(생두 a00xxx ↔ 원두 00xxx)이 안 맞아 자동 연결되지 않은 제품을 수동으로 짝지어 두면,
        로스팅입력에서 산출 원두 선택 시 이 생두가 투입 라인으로 자동 제안됩니다.
      </p>
      <div className="screen-grid">
        <DataGrid<BomRow> columns={columns} data={rows} onRowDblClick={openEdit} gridRef={t => { gridRef.current = t; }} />
      </div>

      {editing && (
        <Modal
          title={`BOM 편집 — ${editing.item_name}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
            </>
          }>
          <div className="form-grid">
            <label>
              <span className="form-label">제품명</span>
              <input className="input" readOnly value={editing.item_name} />
            </label>
            <label>
              <span className="form-label">연결 생두</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input lookup" readOnly value={pairedItemName}
                  placeholder="클릭하여 선택" onClick={() => setHelp(true)} />
                {pairedItemName && (
                  <button className="btn small" onClick={() => { setPairedItemId(null); setPairedItemName(''); }}>연결 해제</button>
                )}
              </div>
            </label>
            <label>
              <span className="form-label">기본수율(%)</span>
              <input className="input" type="number" step={0.1} value={defaultYield || ''}
                onChange={e => setDefaultYield(parseFloat(e.target.value) || 0)} />
            </label>
          </div>
        </Modal>
      )}

      {help && (
        <CodeHelp title="생두" endpoint="/api/items" onClose={() => setHelp(false)}
          onSelect={r => { setPairedItemId(r.id); setPairedItemName(r.name); setHelp(false); }} />
      )}
    </div>
  );
}

// ───────────────────────── 4.7 생산현황/수율분석 ─────────────────────────
const yieldCell = (v: number | null): string => (v === null || v === undefined ? '-' : `${fmtQty(v)}%`);

export function ProductionStatus() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<ProductionSummary | null>(null);
  const itemGridRef = useRef<Tabulator | null>(null);
  const monthGridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<ProductionSummary>(`/api/production/summary?from=${from}&to=${to}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  const itemColumns: ColumnDefinition[] = [
    { title: '산출원두', field: 'output_item_name', minWidth: 160 },
    { title: '배치수', field: 'batch_count', width: 80, hozAlign: 'right' },
    { title: '투입합계', field: 'input_total', width: 100, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '산출합계', field: 'output_total', width: 100, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '평균수율', field: 'avg_yield', width: 90, hozAlign: 'right', formatter: c => yieldCell(c.getValue() as number | null) },
  ];

  const monthColumns: ColumnDefinition[] = [
    { title: '월', field: 'ym', width: 90 },
    { title: '배치수', field: 'batch_count', width: 80, hozAlign: 'right' },
    { title: '투입합계', field: 'input_total', width: 100, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '산출합계', field: 'output_total', width: 100, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    {
      title: '평균수율', field: 'avg_yield', width: 140, hozAlign: 'right',
      formatter: c => {
        const v = c.getValue() as number | null;
        if (v === null || v === undefined) return '-';
        const pct = Math.max(0, Math.min(100, v));
        return `<div style="position:relative;height:14px;background:#eef2f8;border-radius:3px;">
          <div style="position:absolute;inset:0;width:${pct}%;background:var(--accent-soft);border-radius:3px;"></div>
          <span style="position:relative;">${fmtQty(v)}%</span>
        </div>`;
      },
    },
  ];

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn" onClick={load}>조회(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => itemGridRef.current?.download('xlsx', '생산현황.xlsx', { sheetName: '품목별' })}>
            엑셀
          </button>
        </div>
      </div>
      {data && (
        <p className="hint roast-yield">
          배치 <b>{data.totals.batch_count}</b>회 &nbsp;/&nbsp; 투입 <b>{fmtQty(data.totals.input_total)}</b>kg &nbsp;/&nbsp;
          산출 <b>{fmtQty(data.totals.output_total)}</b>kg &nbsp;/&nbsp; 평균수율 <b>{yieldCell(data.totals.avg_yield)}</b>
        </p>
      )}
      <div className="vh-title">산출품목별</div>
      <DataGrid<ProdItemRow> columns={itemColumns} data={data?.by_item ?? []} height={220} gridRef={t => { itemGridRef.current = t; }} />
      <div className="vh-title" style={{ marginTop: 12 }}>월별 추이</div>
      <DataGrid<ProdMonthRow> columns={monthColumns} data={data?.by_month ?? []} height={220} gridRef={t => { monthGridRef.current = t; }} />
    </div>
  );
}

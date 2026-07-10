import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, todayISO, monthStartISO } from '../format';
import type { StockRow, LedgerReport, LedgerRow } from '../types';

// 재고현황(StockStatus) + 재고수불부(StockLedger) — stock_ledger 원장 집계 조회 화면 2종.

// ───────────────────────── 재고현황 ─────────────────────────
export function StockStatus() {
  const toast = useToast();
  const [asOf, setAsOf] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [help, setHelp] = useState(false);
  const [rows, setRows] = useState<StockRow[]>([]);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ as_of: asOf });
      if (warehouseId) qs.set('warehouse_id', String(warehouseId));
      setRows(await api.get<StockRow[]>(`/api/stock/status?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [asOf, warehouseId, toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '품목코드', field: 'item_code', width: 110 },
    { title: '품목명', field: 'item_name', minWidth: 170 },
    { title: '규격', field: 'spec', width: 90 },
    { title: '단위', field: 'unit', width: 60, hozAlign: 'center' },
    {
      title: '재고수량', field: 'qty', width: 100, hozAlign: 'right',
      formatter: c => {
        const d = c.getData() as StockRow;
        const text = fmtQty(d.qty);
        return d.below_safety ? `<b class="danger-text">${text}</b>` : text;
      },
    },
    { title: '안전재고', field: 'safety_qty', width: 100, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
  ];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기준일자</span>
          <input className="input" type="date" style={{ width: 150 }} value={asOf} onChange={e => setAsOf(e.target.value)} />
          <input className="input lookup" style={{ width: 160 }} readOnly value={warehouseName}
            placeholder="창고(전체)" onClick={() => setHelp(true)} />
          {warehouseName && (
            <button className="icon-btn" title="창고 선택 해제" onClick={() => { setWarehouseId(null); setWarehouseName(''); }}>✕</button>
          )}
          <button className="btn" onClick={load}>조회</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '재고현황.xlsx', { sheetName: '재고현황' })}>
            엑셀
          </button>
        </div>
      </div>
      <p className="hint">붉은색 수량은 안전재고 미달 품목입니다.</p>
      <div className="screen-grid">
        <DataGrid<StockRow> columns={columns} data={rows} gridRef={t => { gridRef.current = t; }} />
      </div>
      {help && (
        <CodeHelp title="창고" endpoint="/api/warehouses" onClose={() => setHelp(false)}
          onSelect={r => { setWarehouseId(r.id); setWarehouseName(r.name); }} />
      )}
    </div>
  );
}

// ───────────────────────── 재고수불부 ─────────────────────────
export function StockLedger() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [itemId, setItemId] = useState<number | null>(null);
  const [itemName, setItemName] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [help, setHelp] = useState<'item' | 'warehouse' | null>(null);
  const [report, setReport] = useState<LedgerReport | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    if (!itemId) { toast.show('품목을 선택하세요.', 'error'); return; }
    try {
      const qs = new URLSearchParams({ item_id: String(itemId), from, to });
      if (warehouseId) qs.set('warehouse_id', String(warehouseId));
      setReport(await api.get<LedgerReport>(`/api/stock/ledger?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [itemId, from, to, warehouseId, toast]);

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '유형', field: 'io_type', width: 90, hozAlign: 'center' },
    { title: '거래처', field: 'partner_name', minWidth: 130, formatter: c => String(c.getValue() ?? '') },
    {
      title: '입고', field: 'in_qty', width: 90, hozAlign: 'right',
      formatter: c => { const v = Number(c.getValue() ?? 0); return v ? fmtQty(v) : ''; },
    },
    {
      title: '출고', field: 'out_qty', width: 90, hozAlign: 'right',
      formatter: c => { const v = Number(c.getValue() ?? 0); return v ? fmtQty(v) : ''; },
    },
    { title: '잔액', field: 'balance', width: 100, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '적요', field: 'memo', minWidth: 120 },
  ];

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <input className="input lookup" style={{ width: 160 }} readOnly value={itemName}
            placeholder="품목 선택(필수)" onClick={() => setHelp('item')} />
          <input className="input lookup" style={{ width: 140 }} readOnly value={warehouseName}
            placeholder="창고(전체)" onClick={() => setHelp('warehouse')} />
          {warehouseName && (
            <button className="icon-btn" title="창고 선택 해제" onClick={() => { setWarehouseId(null); setWarehouseName(''); }}>✕</button>
          )}
          <button className="btn" onClick={load}>조회</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '재고수불부.xlsx', { sheetName: '재고수불부' })}>
            엑셀
          </button>
        </div>
      </div>
      {report && (
        <p className="hint ledger-summary">
          이월 <b>{fmtQty(report.opening)}</b>kg &nbsp;/&nbsp; 입고 <b>{fmtQty(report.sum_in)}</b>kg &nbsp;/&nbsp;
          출고 <b>{fmtQty(report.sum_out)}</b>kg &nbsp;/&nbsp; 잔량 <b>{fmtQty(report.closing)}</b>kg
        </p>
      )}
      <div className="screen-grid">
        <DataGrid<LedgerRow> columns={columns} data={report?.rows ?? []} gridRef={t => { gridRef.current = t; }} />
      </div>
      {help === 'item' && (
        <CodeHelp title="품목" endpoint="/api/items" onClose={() => setHelp(null)}
          onSelect={r => { setItemId(r.id); setItemName(r.name); }} />
      )}
      {help === 'warehouse' && (
        <CodeHelp title="창고" endpoint="/api/warehouses" onClose={() => setHelp(null)}
          onSelect={r => { setWarehouseId(r.id); setWarehouseName(r.name); }} />
      )}
    </div>
  );
}

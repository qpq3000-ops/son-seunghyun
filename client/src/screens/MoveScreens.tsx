import { useCallback, useEffect, useRef, useState } from 'react';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, todayISO, monthStartISO } from '../format';
import type { MoveDetail, MoveListRow, StockRow } from '../types';

// 기타이동 4종(창고이동/자가사용/불량처리/재고조정) — VoucherForm이 아닌 자체 간이 라인 테이블.
// RoastInput의 voucher-*/voucher-lines 클래스를 재사용한다(설계 4.5). 각 화면은 단일 컴포넌트로
// 입력+최근이력(더블클릭→수정)을 겸한다(RoastInput과 동일 패턴, 별도 조회 화면 없음).

interface SimpleLine { item_id: number | null; item_code: string; item_name: string; unit: string; qty: number; remarks: string }
function emptySimpleLine(): SimpleLine {
  return { item_id: null, item_code: '', item_name: '', unit: 'kg', qty: 0, remarks: '' };
}
function lineToSimple(l: MoveDetail['lines'][number]): SimpleLine {
  return { item_id: l.item_id, item_code: l.item_code ?? '', item_name: l.item_name ?? '', unit: l.unit ?? 'kg', qty: l.qty, remarks: l.remarks ?? '' };
}

// 공용 라인 테이블(창고이동/자가사용/불량처리 공용 — 품목/수량/적요, No + [+ 라인 추가])
function SimpleLineTable({ lines, onQty, onRemarks, onRemove, onAdd, onPick }: {
  lines: SimpleLine[];
  onQty: (i: number, qty: number) => void;
  onRemarks: (i: number, remarks: string) => void;
  onRemove: (i: number) => void;
  onAdd: () => void;
  onPick: (i: number) => void;
}) {
  return (
    <table className="voucher-lines">
      <thead>
        <tr>
          <th style={{ width: 36 }}>No</th>
          <th style={{ width: 110 }}>품목코드</th>
          <th>품목명</th>
          <th style={{ width: 60 }}>단위</th>
          <th style={{ width: 100 }}>수량(kg)</th>
          <th>적요</th>
          <th style={{ width: 40 }}></th>
        </tr>
      </thead>
      <tbody>
        {lines.map((row, i) => (
          <tr key={i}>
            <td className="num">{i + 1}</td>
            <td><input className="cell lookup" readOnly value={row.item_code} placeholder="선택" onClick={() => onPick(i)} /></td>
            <td>{row.item_name}</td>
            <td>{row.unit}</td>
            <td><input className="cell num" type="number" step={0.1} value={row.qty || ''}
              onChange={e => onQty(i, parseFloat(e.target.value) || 0)} /></td>
            <td><input className="cell" value={row.remarks} onChange={e => onRemarks(i, e.target.value)} /></td>
            <td><button className="icon-btn" title="라인 삭제" onClick={() => onRemove(i)}>✕</button></td>
          </tr>
        ))}
        {!lines.length && (
          <tr><td colSpan={7} className="num" style={{ textAlign: 'center', color: 'var(--sub)' }}>품목을 추가하세요</td></tr>
        )}
      </tbody>
      <tfoot>
        <tr><td colSpan={7}><button className="btn small" onClick={onAdd}>+ 라인 추가</button></td></tr>
      </tfoot>
    </table>
  );
}

// 최근 이력 검색기간 바(공용) — RoastInput은 고정 1개월이지만 기타이동은 기간을 조절 가능하게 둔다
function HistoryBar({ from, to, setFrom, setTo, onSearch }: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; onSearch: () => void;
}) {
  return (
    <div className="vh-fields" style={{ marginBottom: 0 }}>
      <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
      <span>~</span>
      <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
      <button className="btn small" onClick={onSearch}>검색</button>
    </div>
  );
}

// ───────────────────────── 창고이동 ─────────────────────────
export function StockMove() {
  const toast = useToast();
  const [ioDate, setIoDate] = useState(todayISO());
  const [fromWhId, setFromWhId] = useState<number | null>(null);
  const [fromWhName, setFromWhName] = useState('');
  const [toWhId, setToWhId] = useState<number | null>(null);
  const [toWhName, setToWhName] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<SimpleLine[]>([emptySimpleLine()]);
  const [help, setHelp] = useState<'from' | 'to' | number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<MoveListRow[]>([]);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const historyRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.get<MoveListRow[]>(`/api/moves?type=move&from=${from}&to=${to}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const clearForEntry = () => { setEditingId(null); setLines([emptySimpleLine()]); setMemo(''); };

  const loadForEdit = async (id: number) => {
    try {
      const d = await api.get<MoveDetail>(`/api/moves/${id}`);
      setIoDate(d.io_date);
      setFromWhId(d.warehouse_id); setFromWhName(d.warehouse_name);
      setToWhId(d.wh_to_id ?? null); setToWhName(d.wh_to_name ?? '');
      setMemo(d.memo);
      setLines(d.lines.length ? d.lines.map(lineToSimple) : [emptySimpleLine()]);
      setEditingId(id);
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const save = async () => {
    if (!ioDate) { toast.show('일자를 입력하세요.', 'error'); return; }
    if (!fromWhId) { toast.show('보내는 창고를 선택하세요.', 'error'); return; }
    if (!toWhId) { toast.show('받는 창고를 선택하세요.', 'error'); return; }
    if (fromWhId === toWhId) { toast.show('보내는 창고와 받는 창고가 같습니다.', 'error'); return; }
    const validLines = lines.filter(l => l.item_id && l.qty > 0);
    if (!validLines.length) { toast.show('품목 라인을 1개 이상 입력하세요.', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        type: 'move', io_date: ioDate, warehouse_id: fromWhId, wh_to_id: toWhId, memo,
        lines: validLines.map(l => ({ item_id: l.item_id, qty: l.qty, remarks: l.remarks })),
      };
      const res = editingId
        ? await api.put<MoveDetail>(`/api/moves/${editingId}`, body)
        : await api.post<MoveDetail>('/api/moves', body);
      (res.warnings ?? []).forEach(w => toast.show(w, 'error'));
      toast.show(`저장되었습니다. (전표 ${res.doc_no})`);
      setEditingId(null);
      setLines([emptySimpleLine()]);
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!editingId) return;
    try {
      await api.del(`/api/moves/${editingId}`);
      toast.show('삭제되었습니다.');
      clearForEntry();
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setConfirmDel(false); }
  };

  const historyColumns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '보내는창고', field: 'warehouse_name', minWidth: 110 },
    { title: '받는창고', field: 'wh_to_name', minWidth: 110 },
    { title: '품목요약', field: 'item_summary', minWidth: 180 },
    { title: '수량', field: 'total_qty', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '적요', field: 'memo', minWidth: 120 },
  ];

  return (
    <div className="screen roast-screen">
      <div className="voucher-head">
        <div className="vh-title-row">
          <div className="vh-title">창고이동{editingId ? ' (수정 모드)' : ''}</div>
          {editingId && (
            <div className="vh-actions">
              <button className="btn small" onClick={clearForEntry}>신규입력</button>
              <button className="btn small danger" onClick={() => setConfirmDel(true)}>삭제</button>
            </div>
          )}
        </div>
        <div className="vh-fields">
          <label>일자
            <input className="input" type="date" value={ioDate} onChange={e => setIoDate(e.target.value)} />
          </label>
          <label>보내는창고
            <input className="input lookup" readOnly value={fromWhName} placeholder="클릭하여 선택" onClick={() => setHelp('from')} />
          </label>
          <label>받는창고
            <input className="input lookup" readOnly value={toWhName} placeholder="클릭하여 선택" onClick={() => setHelp('to')} />
          </label>
          <label className="grow">적요
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </label>
        </div>
      </div>

      <SimpleLineTable
        lines={lines}
        onQty={(i, qty) => setLines(prev => prev.map((r, j) => (j === i ? { ...r, qty } : r)))}
        onRemarks={(i, remarks) => setLines(prev => prev.map((r, j) => (j === i ? { ...r, remarks } : r)))}
        onRemove={i => setLines(prev => prev.filter((_, j) => j !== i))}
        onAdd={() => setLines(prev => [...prev, emptySimpleLine()])}
        onPick={i => setHelp(i)}
      />

      {/* 실물 하단 저장 바(RoastInput과 동일 아키타입) — 파랑 스플릿 저장 + 보조 다시 작성/리스트 */}
      <div className="r8-report-bottom">
        <span>
          <button className="btn r8-primary r8-split" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
          <button className="btn r8-split-caret">▲</button>
        </span>
        <button className="btn r8-ghost" onClick={clearForEntry}>다시 작성</button>
        <button className="btn r8-ghost" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}>리스트</button>
      </div>

      <div className="roast-history r8-real" ref={historyRef}>
        <div className="vh-title-row">
          <div className="vh-title">최근 이력</div>
          <HistoryBar from={from} to={to} setFrom={setFrom} setTo={setTo} onSearch={loadHistory} />
        </div>
        <DataGrid<MoveListRow> columns={historyColumns} data={history} height={240} rowNumbers onRowDblClick={r => loadForEdit(r.id)} />
      </div>

      {help === 'from' && (
        <CodeHelp title="보내는창고" endpoint="/api/warehouses" onClose={() => setHelp(null)}
          onSelect={r => { setFromWhId(r.id); setFromWhName(r.name); setHelp(null); }} />
      )}
      {help === 'to' && (
        <CodeHelp title="받는창고" endpoint="/api/warehouses" onClose={() => setHelp(null)}
          onSelect={r => { setToWhId(r.id); setToWhName(r.name); setHelp(null); }} />
      )}
      {typeof help === 'number' && (
        <CodeHelp title="품목" endpoint="/api/items" onClose={() => setHelp(null)}
          onSelect={r => setLines(prev => prev.map((row, i) => (i === help
            ? { ...row, item_id: r.id, item_code: r.code, item_name: r.name, unit: String(r.unit ?? 'kg') }
            : row)))} />
      )}

      {confirmDel && <Confirm text="이 전표를 삭제할까요?" onNo={() => setConfirmDel(false)} onYes={doDelete} />}
    </div>
  );
}

// ───────────────────────── 자가사용 ─────────────────────────
export function SelfUse() {
  const toast = useToast();
  const [ioDate, setIoDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [memo, setMemo] = useState(''); // 사유
  const [lines, setLines] = useState<SimpleLine[]>([emptySimpleLine()]);
  const [help, setHelp] = useState<'warehouse' | number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<MoveListRow[]>([]);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const historyRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.get<MoveListRow[]>(`/api/moves?type=self_use&from=${from}&to=${to}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const clearForEntry = () => { setEditingId(null); setLines([emptySimpleLine()]); setMemo(''); };

  const loadForEdit = async (id: number) => {
    try {
      const d = await api.get<MoveDetail>(`/api/moves/${id}`);
      setIoDate(d.io_date);
      setWarehouseId(d.warehouse_id); setWarehouseName(d.warehouse_name);
      setMemo(d.memo);
      setLines(d.lines.length ? d.lines.map(lineToSimple) : [emptySimpleLine()]);
      setEditingId(id);
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const save = async () => {
    if (!ioDate) { toast.show('일자를 입력하세요.', 'error'); return; }
    if (!warehouseId) { toast.show('창고를 선택하세요.', 'error'); return; }
    const validLines = lines.filter(l => l.item_id && l.qty > 0);
    if (!validLines.length) { toast.show('품목 라인을 1개 이상 입력하세요.', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        type: 'self_use', io_date: ioDate, warehouse_id: warehouseId, memo,
        lines: validLines.map(l => ({ item_id: l.item_id, qty: l.qty, remarks: l.remarks })),
      };
      const res = editingId
        ? await api.put<MoveDetail>(`/api/moves/${editingId}`, body)
        : await api.post<MoveDetail>('/api/moves', body);
      (res.warnings ?? []).forEach(w => toast.show(w, 'error'));
      toast.show(`저장되었습니다. (전표 ${res.doc_no})`);
      setEditingId(null);
      setLines([emptySimpleLine()]);
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!editingId) return;
    try {
      await api.del(`/api/moves/${editingId}`);
      toast.show('삭제되었습니다.');
      clearForEntry();
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setConfirmDel(false); }
  };

  const historyColumns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '창고', field: 'warehouse_name', minWidth: 110 },
    { title: '품목요약', field: 'item_summary', minWidth: 200 },
    { title: '수량', field: 'total_qty', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '사유', field: 'memo', minWidth: 140 },
  ];

  return (
    <div className="screen roast-screen">
      <div className="voucher-head">
        <div className="vh-title-row">
          <div className="vh-title">자가사용{editingId ? ' (수정 모드)' : ''}</div>
          {editingId && (
            <div className="vh-actions">
              <button className="btn small" onClick={clearForEntry}>신규입력</button>
              <button className="btn small danger" onClick={() => setConfirmDel(true)}>삭제</button>
            </div>
          )}
        </div>
        <div className="vh-fields">
          <label>일자
            <input className="input" type="date" value={ioDate} onChange={e => setIoDate(e.target.value)} />
          </label>
          <label>창고
            <input className="input lookup" readOnly value={warehouseName} placeholder="클릭하여 선택" onClick={() => setHelp('warehouse')} />
          </label>
          <label className="grow">사유
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </label>
        </div>
      </div>

      <SimpleLineTable
        lines={lines}
        onQty={(i, qty) => setLines(prev => prev.map((r, j) => (j === i ? { ...r, qty } : r)))}
        onRemarks={(i, remarks) => setLines(prev => prev.map((r, j) => (j === i ? { ...r, remarks } : r)))}
        onRemove={i => setLines(prev => prev.filter((_, j) => j !== i))}
        onAdd={() => setLines(prev => [...prev, emptySimpleLine()])}
        onPick={i => setHelp(i)}
      />

      {/* 실물 하단 저장 바(RoastInput과 동일 아키타입) — 파랑 스플릿 저장 + 보조 다시 작성/리스트 */}
      <div className="r8-report-bottom">
        <span>
          <button className="btn r8-primary r8-split" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
          <button className="btn r8-split-caret">▲</button>
        </span>
        <button className="btn r8-ghost" onClick={clearForEntry}>다시 작성</button>
        <button className="btn r8-ghost" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}>리스트</button>
      </div>

      <div className="roast-history r8-real" ref={historyRef}>
        <div className="vh-title-row">
          <div className="vh-title">최근 이력</div>
          <HistoryBar from={from} to={to} setFrom={setFrom} setTo={setTo} onSearch={loadHistory} />
        </div>
        <DataGrid<MoveListRow> columns={historyColumns} data={history} height={240} rowNumbers onRowDblClick={r => loadForEdit(r.id)} />
      </div>

      {help === 'warehouse' && (
        <CodeHelp title="창고" endpoint="/api/warehouses" onClose={() => setHelp(null)}
          onSelect={r => { setWarehouseId(r.id); setWarehouseName(r.name); setHelp(null); }} />
      )}
      {typeof help === 'number' && (
        <CodeHelp title="품목" endpoint="/api/items" onClose={() => setHelp(null)}
          onSelect={r => setLines(prev => prev.map((row, i) => (i === help
            ? { ...row, item_id: r.id, item_code: r.code, item_name: r.name, unit: String(r.unit ?? 'kg') }
            : row)))} />
      )}

      {confirmDel && <Confirm text="이 전표를 삭제할까요?" onNo={() => setConfirmDel(false)} onYes={doDelete} />}
    </div>
  );
}

// ───────────────────────── 불량처리 ─────────────────────────
export function Defect() {
  const toast = useToast();
  const [ioDate, setIoDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<SimpleLine[]>([emptySimpleLine()]);
  const [help, setHelp] = useState<'warehouse' | number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<MoveListRow[]>([]);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const historyRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.get<MoveListRow[]>(`/api/moves?type=defect&from=${from}&to=${to}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const clearForEntry = () => { setEditingId(null); setLines([emptySimpleLine()]); setMemo(''); };

  const loadForEdit = async (id: number) => {
    try {
      const d = await api.get<MoveDetail>(`/api/moves/${id}`);
      setIoDate(d.io_date);
      setWarehouseId(d.warehouse_id); setWarehouseName(d.warehouse_name);
      setMemo(d.memo);
      setLines(d.lines.length ? d.lines.map(lineToSimple) : [emptySimpleLine()]);
      setEditingId(id);
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const save = async () => {
    if (!ioDate) { toast.show('일자를 입력하세요.', 'error'); return; }
    if (!warehouseId) { toast.show('창고를 선택하세요.', 'error'); return; }
    const validLines = lines.filter(l => l.item_id && l.qty > 0);
    if (!validLines.length) { toast.show('품목 라인을 1개 이상 입력하세요.', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        type: 'defect', io_date: ioDate, warehouse_id: warehouseId, method: '폐기', memo,
        lines: validLines.map(l => ({ item_id: l.item_id, qty: l.qty, remarks: l.remarks })),
      };
      const res = editingId
        ? await api.put<MoveDetail>(`/api/moves/${editingId}`, body)
        : await api.post<MoveDetail>('/api/moves', body);
      (res.warnings ?? []).forEach(w => toast.show(w, 'error'));
      toast.show(`저장되었습니다. (전표 ${res.doc_no})`);
      setEditingId(null);
      setLines([emptySimpleLine()]);
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!editingId) return;
    try {
      await api.del(`/api/moves/${editingId}`);
      toast.show('삭제되었습니다.');
      clearForEntry();
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setConfirmDel(false); }
  };

  const historyColumns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '창고', field: 'warehouse_name', minWidth: 110 },
    { title: '처리방법', field: 'method', width: 80, hozAlign: 'center' },
    { title: '품목요약', field: 'item_summary', minWidth: 180 },
    { title: '수량', field: 'total_qty', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '적요', field: 'memo', minWidth: 120 },
  ];

  return (
    <div className="screen roast-screen">
      <div className="voucher-head">
        <div className="vh-title-row">
          <div className="vh-title">불량처리{editingId ? ' (수정 모드)' : ''}</div>
          {editingId && (
            <div className="vh-actions">
              <button className="btn small" onClick={clearForEntry}>신규입력</button>
              <button className="btn small danger" onClick={() => setConfirmDel(true)}>삭제</button>
            </div>
          )}
        </div>
        <div className="vh-fields">
          <label>일자
            <input className="input" type="date" value={ioDate} onChange={e => setIoDate(e.target.value)} />
          </label>
          <label>창고
            <input className="input lookup" readOnly value={warehouseName} placeholder="클릭하여 선택" onClick={() => setHelp('warehouse')} />
          </label>
          <label>처리방법
            <select className="input" value="폐기" disabled>
              <option>폐기</option>
            </select>
          </label>
          <label className="grow">적요
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </label>
        </div>
      </div>

      <SimpleLineTable
        lines={lines}
        onQty={(i, qty) => setLines(prev => prev.map((r, j) => (j === i ? { ...r, qty } : r)))}
        onRemarks={(i, remarks) => setLines(prev => prev.map((r, j) => (j === i ? { ...r, remarks } : r)))}
        onRemove={i => setLines(prev => prev.filter((_, j) => j !== i))}
        onAdd={() => setLines(prev => [...prev, emptySimpleLine()])}
        onPick={i => setHelp(i)}
      />

      {/* 실물 하단 저장 바(RoastInput과 동일 아키타입) — 파랑 스플릿 저장 + 보조 다시 작성/리스트 */}
      <div className="r8-report-bottom">
        <span>
          <button className="btn r8-primary r8-split" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
          <button className="btn r8-split-caret">▲</button>
        </span>
        <button className="btn r8-ghost" onClick={clearForEntry}>다시 작성</button>
        <button className="btn r8-ghost" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}>리스트</button>
      </div>

      <div className="roast-history r8-real" ref={historyRef}>
        <div className="vh-title-row">
          <div className="vh-title">최근 이력</div>
          <HistoryBar from={from} to={to} setFrom={setFrom} setTo={setTo} onSearch={loadHistory} />
        </div>
        <DataGrid<MoveListRow> columns={historyColumns} data={history} height={240} rowNumbers onRowDblClick={r => loadForEdit(r.id)} />
      </div>

      {help === 'warehouse' && (
        <CodeHelp title="창고" endpoint="/api/warehouses" onClose={() => setHelp(null)}
          onSelect={r => { setWarehouseId(r.id); setWarehouseName(r.name); setHelp(null); }} />
      )}
      {typeof help === 'number' && (
        <CodeHelp title="품목" endpoint="/api/items" onClose={() => setHelp(null)}
          onSelect={r => setLines(prev => prev.map((row, i) => (i === help
            ? { ...row, item_id: r.id, item_code: r.code, item_name: r.name, unit: String(r.unit ?? 'kg') }
            : row)))} />
      )}

      {confirmDel && <Confirm text="이 전표를 삭제할까요?" onNo={() => setConfirmDel(false)} onYes={doDelete} />}
    </div>
  );
}

// ───────────────────────── 재고조정 ─────────────────────────
interface AdjustLine {
  item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  book_qty: number;        // 장부수량(읽기전용)
  real_qty: number | null; // 실사수량(입력, null=미입력)
  remarks?: string;        // 수정모드 로딩 시 서버가 채운 "장부→실사(조정)" 텍스트(참고 표시)
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

export function StockAdjust() {
  const toast = useToast();
  const [ioDate, setIoDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState<AdjustLine[]>([]);
  const [hideZero, setHideZero] = useState(true);
  const [help, setHelp] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingStock, setLoadingStock] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<MoveListRow[]>([]);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const historyRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await api.get<MoveListRow[]>(`/api/moves?type=adjust&from=${from}&to=${to}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const clearForEntry = () => { setEditingId(null); setLines([]); setMemo(''); };

  const pullStock = useCallback(async () => {
    if (!warehouseId) { toast.show('창고를 선택하세요.', 'error'); return; }
    setLoadingStock(true);
    try {
      const rows = await api.get<StockRow[]>(`/api/stock/status?warehouse_id=${warehouseId}&as_of=${ioDate}`);
      setLines(rows.map(r => ({
        item_id: r.item_id, item_code: r.item_code, item_name: r.item_name, unit: r.unit,
        book_qty: r.qty, real_qty: null,
      })));
      setEditingId(null);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setLoadingStock(false); }
  }, [warehouseId, ioDate, toast]);

  const loadForEdit = async (id: number) => {
    try {
      const d = await api.get<MoveDetail>(`/api/moves/${id}`);
      setIoDate(d.io_date);
      setWarehouseId(d.warehouse_id); setWarehouseName(d.warehouse_name);
      setMemo(d.memo);
      setLines(d.lines.map(l => ({
        item_id: l.item_id, item_code: l.item_code ?? '', item_name: l.item_name ?? '', unit: l.unit ?? 'kg',
        book_qty: l.book_qty ?? 0, real_qty: l.qty, remarks: l.remarks,
      })));
      setEditingId(id);
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const setRealQty = (itemId: number, v: string) => {
    setLines(prev => prev.map(r => (r.item_id === itemId ? { ...r, real_qty: v === '' ? null : (parseFloat(v) || 0) } : r)));
  };

  const save = async () => {
    if (!ioDate) { toast.show('일자를 입력하세요.', 'error'); return; }
    if (!warehouseId) { toast.show('창고를 선택하세요.', 'error'); return; }
    const entered = lines.filter(l => l.real_qty !== null);
    if (!entered.length) { toast.show('실사수량을 입력한 품목이 없습니다.', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        type: 'adjust', io_date: ioDate, warehouse_id: warehouseId, memo,
        lines: entered.map(l => ({ item_id: l.item_id, real_qty: l.real_qty })),
      };
      const res = editingId
        ? await api.put<MoveDetail>(`/api/moves/${editingId}`, body)
        : await api.post<MoveDetail>('/api/moves', body);
      (res.warnings ?? []).forEach(w => toast.show(w, 'error'));
      toast.show(`저장되었습니다. (전표 ${res.doc_no})`);
      setEditingId(null);
      loadHistory();
      // 저장 성공 후 재고불러오기 재실행 권장(설계 4.5.4) — 조정 후 장부수량이 실사수량과 일치하는지 재확인
      pullStock();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    if (!editingId) return;
    try {
      await api.del(`/api/moves/${editingId}`);
      toast.show('삭제되었습니다.');
      clearForEntry();
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setConfirmDel(false); }
  };

  const visibleLines = hideZero ? lines.filter(l => l.book_qty !== 0 || (l.real_qty ?? 0) !== 0) : lines;

  const historyColumns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '창고', field: 'warehouse_name', minWidth: 110 },
    { title: '품목요약', field: 'item_summary', minWidth: 200 },
    { title: '조정건수', field: 'line_count', width: 90, hozAlign: 'right' },
    { title: '적요', field: 'memo', minWidth: 140 },
  ];

  return (
    <div className="screen roast-screen">
      <div className="voucher-head">
        <div className="vh-title-row">
          <div className="vh-title">재고조정{editingId ? ' (수정 모드)' : ''}</div>
          {editingId && (
            <div className="vh-actions">
              <button className="btn small" onClick={clearForEntry}>신규입력</button>
              <button className="btn small danger" onClick={() => setConfirmDel(true)}>삭제</button>
            </div>
          )}
        </div>
        <div className="vh-fields">
          <label>실사일자
            <input className="input" type="date" value={ioDate} onChange={e => setIoDate(e.target.value)} />
          </label>
          <label>창고
            <input className="input lookup" readOnly value={warehouseName} placeholder="클릭하여 선택" onClick={() => setHelp(true)} />
          </label>
          <label>&nbsp;
            <button className="btn small" disabled={loadingStock} onClick={pullStock}>
              {loadingStock ? '불러오는 중...' : '재고불러오기'}
            </button>
          </label>
          <label className="grow">적요
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </label>
        </div>
      </div>

      <label className="adjust-hide-zero">
        <input type="checkbox" className="check" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />
        장부수량 0인 품목 숨기기
      </label>

      <table className="voucher-lines">
        <thead>
          <tr>
            <th style={{ width: 110 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 60 }}>단위</th>
            <th style={{ width: 100 }}>장부수량</th>
            <th style={{ width: 100 }}>실사수량</th>
            <th style={{ width: 100 }}>조정수량</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {visibleLines.map(row => {
            const diff = row.real_qty === null ? null : round1(row.real_qty - row.book_qty);
            const diffClass = diff === null ? '' : diff > 0 ? 'ok-text' : diff < 0 ? 'danger-text' : '';
            return (
              <tr key={row.item_id}>
                <td>{row.item_code}</td>
                <td>{row.item_name}</td>
                <td>{row.unit}</td>
                <td className="num ro">{fmtQty(row.book_qty)}</td>
                <td>
                  <input className="cell num" type="number" step={0.1}
                    value={row.real_qty === null ? '' : row.real_qty}
                    onChange={e => setRealQty(row.item_id, e.target.value)} />
                </td>
                <td className={`num ro ${diffClass}`}>{diff === null ? '' : fmtQty(diff)}</td>
                <td className="ro">{row.remarks ?? ''}</td>
              </tr>
            );
          })}
          {!visibleLines.length && (
            <tr><td colSpan={7} className="num" style={{ textAlign: 'center', color: 'var(--sub)' }}>
              창고를 선택하고 [재고불러오기]를 눌러주세요
            </td></tr>
          )}
        </tbody>
      </table>

      {/* 실물 하단 저장 바(RoastInput과 동일 아키타입) — 파랑 스플릿 저장 + 보조 다시 작성/리스트 */}
      <div className="r8-report-bottom">
        <span>
          <button className="btn r8-primary r8-split" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
          <button className="btn r8-split-caret">▲</button>
        </span>
        <button className="btn r8-ghost" onClick={clearForEntry}>다시 작성</button>
        <button className="btn r8-ghost" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}>리스트</button>
      </div>

      <div className="roast-history r8-real" ref={historyRef}>
        <div className="vh-title-row">
          <div className="vh-title">최근 이력</div>
          <HistoryBar from={from} to={to} setFrom={setFrom} setTo={setTo} onSearch={loadHistory} />
        </div>
        <DataGrid<MoveListRow> columns={historyColumns} data={history} height={240} rowNumbers onRowDblClick={r => loadForEdit(r.id)} />
      </div>

      {help && (
        <CodeHelp title="창고" endpoint="/api/warehouses" onClose={() => setHelp(false)}
          onSelect={r => { setWarehouseId(r.id); setWarehouseName(r.name); setHelp(false); }} />
      )}

      {confirmDel && <Confirm text="이 전표를 삭제할까요?" onNo={() => setConfirmDel(false)} onYes={doDelete} />}
    </div>
  );
}

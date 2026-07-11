import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, todayISO } from '../format';
import type { Item, Warehouse, RoastDetail, RoastListRow } from '../types';

// 로스팅입력 — 산출 원두 1건 + 투입 생두 여러 건(블랜딩)을 한 화면·한 전표로 저장한다.
// VoucherForm은 판매/구매 전용 2컬럼(품목N:1) 구조라 로스팅(N투입:1산출)에는 맞지 않으므로
// voucher-* 클래스만 재사용한 자체 간이 폼으로 구성한다.

interface InputRow { item_id: number | null; item_code: string; item_name: string; unit: string; qty: number }
interface OutputSel { item_id: number; item_code: string; item_name: string; unit: string }

function emptyInputRow(): InputRow {
  return { item_id: null, item_code: '', item_name: '', unit: 'kg', qty: 0 };
}

// 최근 1개월(오늘 기준 한달 전 ~ 오늘) — 조회화면들의 '이번달' 기본값과는 별개(설계 4.4)
function oneMonthAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function RoastInput({ initialEditId }: { initialEditId?: number } = {}) {
  const toast = useToast();
  const [ioDate, setIoDate] = useState(todayISO());
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [warehouseName, setWarehouseName] = useState('');
  const [memo, setMemo] = useState('');
  const [outputItem, setOutputItem] = useState<OutputSel | null>(null);
  const [outputQty, setOutputQty] = useState(0);
  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [itemsById, setItemsById] = useState<Map<number, Item>>(new Map());
  const [help, setHelp] = useState<'warehouse' | 'output' | number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [history, setHistory] = useState<RoastListRow[]>([]);

  // 공장(창고) 기본값: wh_type='공장'인 첫 창고
  useEffect(() => {
    api.get<Warehouse[]>('/api/warehouses?active=1').then(list => {
      const factory = list.find(w => w.wh_type === '공장');
      if (factory) { setWarehouseId(factory.id); setWarehouseName(factory.name); }
    }).catch(() => {});
  }, []);

  // paired_item_id로 생두를 자동 제안하려면 품목 전체를 id로 조회할 수 있어야 함
  useEffect(() => {
    api.get<Item[]>('/api/items?active=1').then(list => {
      setItemsById(new Map(list.map(i => [i.id, i])));
    }).catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const from = oneMonthAgoISO();
      const to = todayISO();
      setHistory(await api.get<RoastListRow[]>(`/api/roast?from=${from}&to=${to}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const inputTotal = useMemo(() => inputs.reduce((s, r) => s + (r.qty || 0), 0), [inputs]);
  const yieldPct = useMemo(
    () => (inputTotal > 0 ? Math.round((outputQty / inputTotal) * 100 * 10) / 10 : null),
    [inputTotal, outputQty],
  );

  const clearForEntry = () => {
    setEditingId(null);
    setOutputItem(null);
    setOutputQty(0);
    setInputs([]);
    setMemo('');
  };

  const selectOutput = (r: { id: number; code: string; name: string; [k: string]: unknown }) => {
    setOutputItem({ item_id: r.id, item_code: r.code, item_name: r.name, unit: String(r.unit ?? 'kg') });
    const rawPaired = r.paired_item_id;
    const pairedId = rawPaired === null || rawPaired === undefined ? null : Number(rawPaired);
    if (pairedId) {
      const paired = itemsById.get(pairedId);
      if (paired) {
        setInputs(prev => prev.some(x => x.item_id === paired.id)
          ? prev
          : [...prev, { item_id: paired.id, item_code: paired.code, item_name: paired.name, unit: paired.unit, qty: 0 }]);
      }
    }
    setHelp(null);
  };

  const addInputRow = () => setInputs(prev => [...prev, emptyInputRow()]);
  const removeInputRow = (idx: number) => setInputs(prev => prev.filter((_, i) => i !== idx));
  const setInputQty = (idx: number, qty: number) => setInputs(prev => prev.map((r, i) => (i === idx ? { ...r, qty } : r)));
  const selectInputItem = (idx: number, r: { id: number; code: string; name: string; [k: string]: unknown }) => {
    setInputs(prev => prev.map((row, i) => (i === idx
      ? { ...row, item_id: r.id, item_code: r.code, item_name: r.name, unit: String(r.unit ?? 'kg') }
      : row)));
    setHelp(null);
  };

  const loadForEdit = async (id: number) => {
    try {
      const d = await api.get<RoastDetail>(`/api/roast/${id}`);
      setIoDate(d.io_date);
      setWarehouseId(d.warehouse_id);
      setWarehouseName(d.warehouse_name);
      setMemo(d.memo);
      setOutputItem({ item_id: d.output.item_id, item_code: d.output.item_code, item_name: d.output.item_name, unit: 'kg' });
      setOutputQty(d.output.qty);
      setInputs(d.inputs.map(i => ({ item_id: i.item_id, item_code: i.item_code, item_name: i.item_name, unit: 'kg', qty: i.qty })));
      setEditingId(id);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  // prod-in(생산입고 조회) 재사용 전용 — initialEditId가 오면 마운트 시 해당 로트를 편집 모드로 자동 로드한다.
  // 미전달 시(기존 roast-sheet 메뉴) 기존 동작과 100% 동일(하위호환). 설계-잔여메뉴.md 4.3.
  useEffect(() => { if (initialEditId) loadForEdit(initialEditId); /* eslint-disable-next-line */ }, [initialEditId]);

  const save = async () => {
    if (!ioDate) { toast.show('일자를 입력하세요.', 'error'); return; }
    const validInputs = inputs.filter(r => r.item_id && r.qty > 0);
    if (!validInputs.length) { toast.show('투입 생두를 1개 이상 입력하세요.', 'error'); return; }
    if (!outputItem || !(outputQty > 0)) { toast.show('산출 원두와 수량을 입력하세요.', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        io_date: ioDate,
        warehouse_id: warehouseId ?? undefined,
        memo,
        inputs: validInputs.map(r => ({ item_id: r.item_id, qty: r.qty })),
        output: { item_id: outputItem.item_id, qty: outputQty },
      };
      const res = editingId
        ? await api.put<RoastDetail>(`/api/roast/${editingId}`, body)
        : await api.post<RoastDetail>('/api/roast', body);
      (res.warnings ?? []).forEach(w => toast.show(w, 'error'));
      toast.show(`저장되었습니다. (전표 ${res.doc_no}, 수율 ${res.yield_pct}%)`);
      // 연속입력: 일자·공장(warehouseId/warehouseName)은 건드리지 않고 유지, 나머지는 초기화.
      // 수정 저장 후에도 동일하게 신규입력 상태로 복귀한다.
      setEditingId(null);
      setOutputItem(null);
      setOutputQty(0);
      setInputs([]);
      setMemo('');
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!editingId) return;
    try {
      await api.del(`/api/roast/${editingId}`);
      toast.show('삭제되었습니다.');
      clearForEntry();
      loadHistory();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setConfirmDel(false);
    }
  };

  const historyColumns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '산출원두', field: 'output_item_name', minWidth: 150 },
    { title: '투입합계', field: 'input_total', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    { title: '산출', field: 'output_total', width: 90, hozAlign: 'right', formatter: c => fmtQty(Number(c.getValue() ?? 0)) },
    {
      title: '수율', field: 'yield_pct', width: 80, hozAlign: 'right',
      formatter: c => { const v = c.getValue(); return v === null || v === undefined ? '-' : `${fmtQty(Number(v))}%`; },
    },
    { title: '적요', field: 'memo', minWidth: 140 },
  ];

  return (
    <div className="screen roast-screen">
      <div className="voucher-head">
        <div className="vh-title-row">
          <div className="vh-title">
            로스팅 입력{editingId ? ' (수정 모드)' : ''}
          </div>
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
          <label>공장
            <input className="input lookup" readOnly value={warehouseName}
              placeholder="클릭하여 선택" onClick={() => setHelp('warehouse')} />
          </label>
          <label className="grow">적요
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="voucher-head">
        <div className="vh-title">산출 원두</div>
        <div className="vh-fields">
          <label>품목
            <input className="input lookup" readOnly value={outputItem?.item_name ?? ''}
              placeholder="클릭하여 선택" onClick={() => setHelp('output')} />
          </label>
          <label>산출 수량(kg)
            <input className="input" type="number" step={0.1} value={outputQty || ''}
              onChange={e => setOutputQty(parseFloat(e.target.value) || 0)} />
          </label>
        </div>
      </div>

      <div>
        <div className="vh-title">투입 생두</div>
        <table className="voucher-lines">
          <thead>
            <tr>
              <th style={{ width: 36 }}>No</th>
              <th style={{ width: 110 }}>품목코드</th>
              <th>품목명</th>
              <th style={{ width: 60 }}>단위</th>
              <th style={{ width: 100 }}>수량(kg)</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((row, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td>
                  <input className="cell lookup" readOnly value={row.item_code}
                    placeholder="선택" onClick={() => setHelp(i)} />
                </td>
                <td>{row.item_name}</td>
                <td>{row.unit}</td>
                <td>
                  <input className="cell num" type="number" step={0.1} value={row.qty || ''}
                    onChange={e => setInputQty(i, parseFloat(e.target.value) || 0)} />
                </td>
                <td>
                  <button className="icon-btn" title="라인 삭제" onClick={() => removeInputRow(i)}>✕</button>
                </td>
              </tr>
            ))}
            {!inputs.length && (
              <tr><td colSpan={6} className="num" style={{ textAlign: 'center', color: 'var(--sub)' }}>투입 생두를 추가하세요</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr><td colSpan={6}><button className="btn small" onClick={addInputRow}>+ 투입 추가</button></td></tr>
          </tfoot>
        </table>
      </div>

      <p className="roast-yield">
        투입합계 <b>{fmtQty(inputTotal)}</b>kg &nbsp;/&nbsp; 산출 <b>{fmtQty(outputQty)}</b>kg &nbsp;/&nbsp;
        수율 <b>{yieldPct === null ? '-' : `${yieldPct}%`}</b>
      </p>

      <div className="voucher-actions">
        <button className="btn primary" disabled={saving} onClick={save}>
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>

      <div className="roast-history">
        <div className="vh-title">최근 로스팅 이력 (최근 1개월)</div>
        <DataGrid<RoastListRow>
          columns={historyColumns}
          data={history}
          height={240}
          onRowDblClick={r => loadForEdit(r.id)}
        />
      </div>

      {help === 'warehouse' && (
        <CodeHelp title="공장" endpoint="/api/warehouses" onClose={() => setHelp(null)}
          onSelect={r => { setWarehouseId(r.id); setWarehouseName(r.name); setHelp(null); }} />
      )}
      {help === 'output' && (
        <CodeHelp title="산출 원두" endpoint="/api/items" onClose={() => setHelp(null)} onSelect={selectOutput} />
      )}
      {typeof help === 'number' && (
        <CodeHelp title="투입 생두" endpoint="/api/items" onClose={() => setHelp(null)}
          onSelect={r => selectInputItem(help, r)} />
      )}

      {confirmDel && (
        <Confirm text="이 로스팅 전표를 삭제할까요?" onNo={() => setConfirmDel(false)} onYes={doDelete} />
      )}
    </div>
  );
}

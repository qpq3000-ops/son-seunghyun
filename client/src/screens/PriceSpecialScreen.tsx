import { useCallback, useEffect, useState } from 'react';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { Modal, Confirm } from '../components/Modal';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon } from '../format';
import type { PriceSpecial } from '../types';

// 단가관리(특별단가): 거래처 × 품목 예외단가 — 기존 앱의 '예외단가' 승격판
export function PriceSpecialScreen() {
  const toast = useToast();
  const [rows, setRows] = useState<PriceSpecial[]>([]);
  const [editing, setEditing] = useState<{
    id?: number;
    partner_id: number | null; partner_name: string;
    item_id: number | null; item_name: string; item_price_out?: number;
    price: number; memo: string;
  } | null>(null);
  const [help, setHelp] = useState<'partner' | 'item' | null>(null);
  const [confirmDel, setConfirmDel] = useState<PriceSpecial | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<PriceSpecial[]>('/api/price-special'));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const columns: ColumnDefinition[] = [
    { title: '거래처코드', field: 'partner_code', width: 100 },
    { title: '거래처명', field: 'partner_name', minWidth: 140 },
    { title: '품목코드', field: 'item_code', width: 100 },
    { title: '품목명', field: 'item_name', minWidth: 140 },
    {
      title: '기본단가', field: 'item_price_out', width: 100, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '특별단가', field: 'price', width: 100, hozAlign: 'right',
      formatter: c => `<b>${fmtWon(Number(c.getValue() ?? 0))}</b>`,
    },
    { title: '메모', field: 'memo', minWidth: 100 },
    {
      title: '삭제', width: 60, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link danger">삭제</span>',
      cellClick: (_e, cell) => setConfirmDel(cell.getRow().getData() as PriceSpecial),
    },
  ];

  const save = async () => {
    if (!editing) return;
    if (!editing.partner_id || !editing.item_id) {
      toast.show('거래처와 품목을 선택하세요.', 'error');
      return;
    }
    try {
      await api.post('/api/price-special', {
        partner_id: editing.partner_id,
        item_id: editing.item_id,
        price: Math.trunc(editing.price) || 0,
        memo: editing.memo,
      });
      toast.show('저장되었습니다. (같은 거래처×품목은 덮어씀)');
      setEditing(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  return (
    <div className="screen">
      <div className="screen-bar">
        <p className="hint" style={{ margin: 0 }}>
          거래처별 예외단가. 전표 입력 시 [특별단가 → 품목 기본단가] 순서로 자동 적용됩니다. (Phase 1에서 적용)
        </p>
        <button className="btn primary" onClick={() => setEditing({ partner_id: null, partner_name: '', item_id: null, item_name: '', price: 0, memo: '' })}>
          신규
        </button>
      </div>
      <div className="screen-grid">
        <DataGrid<PriceSpecial>
          rowNumbers
          columns={columns}
          data={rows}
          onRowDblClick={r => setEditing({
            id: r.id, partner_id: r.partner_id, partner_name: r.partner_name,
            item_id: r.item_id, item_name: r.item_name, item_price_out: r.item_price_out,
            price: r.price, memo: r.memo,
          })}
        />
      </div>

      {editing && (
        <Modal
          title="특별단가 등록"
          width={460}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" onClick={save}>저장</button>
            </>
          }>
          <div className="form-grid">
            <label>
              <span className="form-label">거래처<em className="req">*</em></span>
              <input className="input lookup" readOnly value={editing.partner_name}
                placeholder="클릭하여 선택" onClick={() => setHelp('partner')} />
            </label>
            <label>
              <span className="form-label">품목<em className="req">*</em></span>
              <input className="input lookup" readOnly value={editing.item_name}
                placeholder="클릭하여 선택" onClick={() => setHelp('item')} />
            </label>
            <label>
              <span className="form-label">특별단가(원)<em className="req">*</em></span>
              <input className="input" type="number" step={100} value={editing.price || ''}
                onChange={e => setEditing({ ...editing, price: parseInt(e.target.value, 10) || 0 })} />
              {editing.item_price_out !== undefined && (
                <span className="field-hint">품목 기본단가: {fmtWon(editing.item_price_out)}원</span>
              )}
            </label>
            <label className="span2">
              <span className="form-label">메모</span>
              <input className="input" value={editing.memo}
                onChange={e => setEditing({ ...editing, memo: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}

      {help === 'partner' && editing && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(null)}
          onSelect={r => setEditing({ ...editing, partner_id: r.id, partner_name: r.name })} />
      )}
      {help === 'item' && editing && (
        <CodeHelp title="품목" endpoint="/api/items"
          extraColumns={[{ field: 'price_out', label: '출고단가', money: true }]}
          onClose={() => setHelp(null)}
          onSelect={r => setEditing({
            ...editing, item_id: r.id, item_name: r.name,
            item_price_out: Number(r.price_out ?? 0),
            price: editing.price || Number(r.price_out ?? 0),
          })} />
      )}

      {confirmDel && (
        <Confirm text="이 특별단가를 삭제할까요?" onNo={() => setConfirmDel(null)}
          onYes={async () => {
            try {
              await api.del(`/api/price-special/${confirmDel.id}`);
              toast.show('삭제되었습니다.');
            } catch (e) {
              toast.show((e as Error).message, 'error');
            }
            setConfirmDel(null);
            load();
          }} />
      )}
    </div>
  );
}

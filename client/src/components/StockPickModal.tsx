import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import { fmtQty } from '../format';
import type { StockRow } from '../types';

// 재고불러오기 — 현재고 있는 품목을 다중선택해 판매입력 라인에 추가한다(설계-R3-IA재편성.md §5.2).
// 모달은 선택 목록(원자료)만 반환하고, 라인 생성(calcLine)은 호출부(VoucherScreen)가 수행한다.
interface Props {
  partnerId?: number | null;   // 현재는 미사용(향후 거래처별 필터 확장 여지) — 설계 Props 계약 유지
  onAdd: (rows: StockRow[]) => void;
  onClose: () => void;
}

export function StockPickModal({ onAdd, onClose }: Props) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;
    api.get<StockRow[]>('/api/stock/status')
      .then(r => { if (alive) setRows(r.filter(x => Math.abs(x.qty) > 0.001)); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const toggle = (id: number) => {
    setChecked(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked(s => (s.size === rows.length ? new Set() : new Set(rows.map(r => r.item_id))));
  };

  const add = () => {
    onAdd(rows.filter(r => checked.has(r.item_id)));
    onClose();
  };

  return (
    <Modal title="재고불러오기" width={640} onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={!checked.size} onClick={add}>추가</button>
        </>
      }>
      <div className="codehelp-list">
        <table className="mini-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input type="checkbox" className="check"
                  checked={rows.length > 0 && checked.size === rows.length}
                  onChange={toggleAll} />
              </th>
              <th style={{ width: 100 }}>품목코드</th>
              <th>품목명[규격]</th>
              <th style={{ width: 56 }}>단위</th>
              <th style={{ width: 100 }}>현재고</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.item_id} onClick={() => toggle(r.item_id)}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" className="check" checked={checked.has(r.item_id)} onChange={() => toggle(r.item_id)} />
                </td>
                <td>{r.item_code}</td>
                <td>{r.item_name}{r.spec ? ` [${r.spec}]` : ''}</td>
                <td>{r.unit}</td>
                <td className={`num ${r.qty < 0 ? 'neg' : ''}`}>{fmtQty(r.qty)}</td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr><td colSpan={5} className="empty">현재고가 있는 품목이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

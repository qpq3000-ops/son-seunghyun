import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import { fmtWon } from '../format';
import type { Item } from '../types';
import type { VoucherLine } from './VoucherForm';

// 이익계산 — 현재 라인의 판매액-원가 마진을 계산해 보여준다(설계-R3-IA재편성.md §5.3).
// 순수 클라 계산(신규 서버 0) — GET /api/items 1회로 원가(입고단가) 맵만 조회, 저장 없음(닫기 전용).
interface Props {
  lines: VoucherLine[];
  onClose: () => void;
}

interface Row {
  key: number;
  item_name: string;
  qty: number;
  sales: number;
  cost: number;
  margin: number;
  marginPct: number;
}

export function ProfitCalcModal({ lines, onClose }: Props) {
  const [priceInMap, setPriceInMap] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    let alive = true;
    api.get<Item[]>('/api/items')
      .then(items => { if (alive) setPriceInMap(new Map(items.map(i => [i.id, i.price_in]))); })
      .catch(() => { if (alive) setPriceInMap(new Map()); });
    return () => { alive = false; };
  }, []);

  const rows: Row[] = lines
    .filter((l): l is VoucherLine & { item_id: number } => !!l.item_id && l.qty > 0)
    .map((l, i) => {
      const sales = l.supply;
      const cost = Math.round((priceInMap.get(l.item_id) ?? 0) * l.qty);
      const margin = sales - cost;
      const marginPct = sales > 0 ? (margin / sales) * 100 : 0;
      return { key: i, item_name: l.item_name, qty: l.qty, sales, cost, margin, marginPct };
    });

  const totals = rows.reduce(
    (a, r) => ({ sales: a.sales + r.sales, cost: a.cost + r.cost, margin: a.margin + r.margin }),
    { sales: 0, cost: 0, margin: 0 },
  );
  const totalMarginPct = totals.sales > 0 ? (totals.margin / totals.sales) * 100 : 0;

  return (
    <Modal title="이익계산" width={620} onClose={onClose}
      footer={<button className="btn" onClick={onClose}>닫기</button>}>
      <div className="codehelp-list">
        <table className="mini-table">
          <thead>
            <tr>
              <th>품목명</th><th className="num">수량</th><th className="num">판매액</th>
              <th className="num">원가</th><th className="num">마진</th><th className="num">마진율</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td>{r.item_name}</td>
                <td className="num">{r.qty.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</td>
                <td className="num">{fmtWon(r.sales)}</td>
                <td className="num">{fmtWon(r.cost)}</td>
                <td className={`num ${r.margin < 0 ? 'neg' : ''}`}>{fmtWon(r.margin)}</td>
                <td className="num">{r.marginPct.toFixed(1)}%</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="empty">계산할 라인이 없습니다.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td><b>합계</b></td>
                <td></td>
                <td className="num"><b>{fmtWon(totals.sales)}</b></td>
                <td className="num"><b>{fmtWon(totals.cost)}</b></td>
                <td className={`num ${totals.margin < 0 ? 'neg' : ''}`}><b>{fmtWon(totals.margin)}</b></td>
                <td className="num"><b>{totalMarginPct.toFixed(1)}%</b></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Modal>
  );
}

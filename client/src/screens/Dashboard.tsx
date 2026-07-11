import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, fmtQty, monthStartISO, todayISO } from '../format';
import type { StockRow, DocListRow } from '../types';

// 메인 대시보드 — 이카운트 MyPage 위젯 구성 재현:
// [재고현황] [To Do] [판매현황] / [메모] [매입매출장(접힘)] 카드. 실데이터 연동.
export function Dashboard() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [sales, setSales] = useState<DocListRow[]>([]);
  const now = new Date();
  const ym = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    api.get<StockRow[]>('/api/stock/status')
      .then(rows => setStock(
        rows.filter(r => Math.abs(r.qty) > 0.001)
          .sort((a, b) => Math.abs(b.qty) - Math.abs(a.qty))
          .slice(0, 6)))
      .catch(() => {});
    api.get<DocListRow[]>(`/api/docs?type=sale&from=${monthStartISO()}&to=${todayISO()}`)
      .then(rows => setSales(rows.slice(0, 6)))
      .catch(() => {});
  }, []);

  const icons = (
    <span className="widget-icons" title="위젯 도구 (Phase 4)">
      <span>⟳</span><span>⋯</span>
    </span>
  );

  return (
    <div className="screen mypage">
      <div className="mypage-head">
        <span className="mp-nav">&lt;</span>
        <b>{ym}</b>
        <span className="mp-nav">&gt;</span>
        <span className="mp-title">일정관리</span>
      </div>

      <div className="widgets">
        <div className="widget">
          <div className="widget-head"><b>재고현황</b>{icons}</div>
          {stock.length ? (
            <table className="widget-table">
              <thead><tr><th>품목코드</th><th>품목명[규격]</th><th className="num">재고수량</th></tr></thead>
              <tbody>
                {stock.map(r => (
                  <tr key={r.item_id}>
                    <td className="blue">{r.item_code}</td>
                    <td>{r.item_name}{r.spec ? ` [${r.spec}]` : ''}</td>
                    <td className="num">{fmtQty(r.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        <div className="widget">
          <div className="widget-head"><b>To Do</b>{icons}</div>
          <p className="widget-empty">등록된 데이터가 없습니다.</p>
        </div>

        <div className="widget wide">
          <div className="widget-head"><b>판매현황</b>{icons}</div>
          {sales.length ? (
            <table className="widget-table">
              <thead>
                <tr><th>일자-No.</th><th>품목명[규격]</th><th className="num">수량</th>
                  <th className="num">공급가액</th><th className="num">부가세</th><th className="num">합계</th><th>거래처</th></tr>
              </thead>
              <tbody>
                {sales.map(r => (
                  <tr key={r.id}>
                    <td className="blue">{r.io_date.slice(0, 10).split('-').join('/')} -{r.doc_no.split('-')[1]}</td>
                    <td>{r.item_summary}</td>
                    <td className="num">{fmtQty(r.total_qty)}</td>
                    <td className="num">{fmtWon(r.total_supply)}</td>
                    <td className="num">{fmtWon(r.total_vat)}</td>
                    <td className="num">{fmtWon(r.total_amount)}</td>
                    <td>{r.partner_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">이번달 판매 내역이 없습니다. [영업 &gt; 판매입력]에서 시작하세요.</p>}
        </div>

        <div className="widget">
          <div className="widget-head"><b>메모</b>{icons}</div>
          <p className="widget-empty">등록된 데이터가 없습니다.</p>
        </div>

        <div className="widget slim">
          <div className="widget-head"><b>매입매출장</b>{icons}</div>
        </div>
        <div className="widget slim">
          <div className="widget-head"><b>미수금현황</b>{icons}</div>
        </div>
      </div>
    </div>
  );
}

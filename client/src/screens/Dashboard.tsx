import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, fmtQty, todayISO } from '../format';
import type { MyPageData } from '../types';

// 메인 대시보드 — 이카운트 MyPage 위젯 구성 재현(설계-R3-IA재편성.md §4):
// [재고현황] [To Do] [판매현황(wide)] / [미수금 TOP] [달력 미니]. /api/mypage 1콜로 전량 조회.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function Dashboard() {
  const [data, setData] = useState<MyPageData | null>(null);

  useEffect(() => {
    api.get<MyPageData>('/api/mypage').then(setData).catch(() => {});
  }, []);

  const icons = (
    <span className="widget-icons" title="위젯 도구 (Phase 4)">
      <span>⟳</span><span>⋯</span>
    </span>
  );

  const ym = data?.ym ?? '';
  const stock = data?.stock ?? [];
  const sales = data?.sales ?? [];
  const receivables = data?.receivables_top ?? [];
  const cal = data?.calendar;
  const today = todayISO();

  // 이번달 요일 그리드용 날짜 셀(선행 공백 + 1~마지막일)
  const calCells: (number | null)[] = [];
  if (cal) {
    const firstDow = new Date(cal.year, cal.month - 1, 1).getDay();
    const lastDate = new Date(cal.year, cal.month, 0).getDate();
    for (let i = 0; i < firstDow; i++) calCells.push(null);
    for (let d = 1; d <= lastDate; d++) calCells.push(d);
  }

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
                    <td className={`num ${r.qty < 0 ? 'neg' : ''}`}>
                      {fmtQty(r.qty)}
                      {r.below_safety && <span title="안전재고 미달"> ⚠</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        <div className="widget">
          <div className="widget-head"><b>To Do</b>{icons}</div>
          {(data?.todos?.length ?? 0) ? (
            <ul className="todo-widget">
              {data!.todos.map(t => (
                <li key={t.id} className={t.due_date && t.due_date < today ? 'overdue' : ''}>
                  <span className="td-dot" />
                  <span className="td-text">{t.content}</span>
                  {t.due_date && <span className="td-due">{t.due_date.slice(5)}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="widget-empty">할 일이 없습니다. [그룹웨어 &gt; To Do]에서 등록하세요.</p>}
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
          ) : <p className="widget-empty">이번달 판매 내역이 없습니다. [재고Ⅰ &gt; 영업관리 &gt; 판매입력]에서 시작하세요.</p>}
        </div>

        <div className="widget">
          <div className="widget-head"><b>미수금 TOP</b>{icons}</div>
          {receivables.length ? (
            <table className="widget-table">
              <thead><tr><th>거래처명</th><th className="num">미수 잔액</th></tr></thead>
              <tbody>
                {receivables.map(r => (
                  <tr key={r.partner_id}>
                    <td>{r.partner_name}</td>
                    <td className="num">{fmtWon(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">미수금이 없습니다.</p>}
        </div>

        <div className="widget">
          <div className="widget-head"><b>달력 미니</b>{icons}</div>
          {cal ? (
            <div className="mini-cal">
              {WEEKDAYS.map(w => <div key={w} className="mc-day dow">{w}</div>)}
              {calCells.map((d, i) => {
                if (d === null) return <div key={`b${i}`} className="mc-day" />;
                const date = `${cal.year}-${String(cal.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const info = cal.days[date];
                const isToday = date === today;
                const title = info
                  ? `로스팅 ${info.roast_count}건 · 판매 ${info.sale_count}건 · 납기 ${info.order_due_count}건`
                  : undefined;
                return (
                  <div key={date} className={`mc-day ${isToday ? 'today' : ''}`} title={title}>
                    <span>{d}</span>
                    {info && (
                      <span className="mc-dot">
                        {info.roast_count > 0 && <i className="d-roast" />}
                        {info.sale_count > 0 && <i className="d-sale" />}
                        {info.order_due_count > 0 && <i className="d-due" />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}

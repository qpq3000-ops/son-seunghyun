import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, fmtQty, todayISO } from '../format';
import type { MyPageData } from '../types';

// 메인 대시보드 — 이카운트 MyPage 위젯 구성 재현(참고-실물실측-20260712.md §2, 설계-R8-실물매칭.md §3):
// 3열 배치 [재고현황/To Do/판매현황(넓음)] [쪽지함리스트/To Do 계속/매입매출장] [쪽지함 계속/계산서진행단계(2~3열 스팬)].
// /api/mypage 1콜로 전량 조회.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 참고서 §2: 실물엔 없는 위젯이라 기본 화면에서 제외. 코드는 보존(추후 위젯 설정 기능용).
const SHOW_LEGACY_WIDGETS = false;

// 얇은 회색 위젯 아이콘(§13.6). currentColor로 기존 .widget-icons/.mp-head-icons 색 상속.
const WI = {
  open:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4.2h5.8V10" /><path d="M11.4 4.6 4.3 11.7" /></svg>,
  refresh: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" /><path d="M12.8 3v2.3h-2.3" /></svg>,
  edit:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10.8 2.6 13.4 5.2" /><path d="M11 2.4 13.6 5 6 12.6l-3.1.7.7-3.1z" /></svg>,
  more:    <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3.4" r="1.15" /><circle cx="8" cy="8" r="1.15" /><circle cx="8" cy="12.6" r="1.15" /></svg>,
};

export function Dashboard() {
  const [data, setData] = useState<MyPageData | null>(null);

  useEffect(() => {
    api.get<MyPageData>('/api/mypage').then(setData).catch(() => {});
  }, []);

  const icons = (
    <span className="widget-icons">
      <span title="새 창으로 열기 (기능 예정)">{WI.open}</span>
      <span title="새로고침 (기능 예정)">{WI.refresh}</span>
      <span title="편집 (기능 예정)">{WI.edit}</span>
      <span title="위젯 옵션 (기능 예정)">{WI.more}</span>
    </span>
  );

  const headIcons = (
    <span className="mp-head-icons">
      <span title="새 창으로 열기 (기능 예정)">{WI.open}</span>
      <span title="편집 (기능 예정)">{WI.edit}</span>
      <span title="옵션 (기능 예정)">{WI.more}</span>
    </span>
  );

  const ym = data?.ym ?? '';
  const stock = data?.stock ?? [];
  const sales = data?.sales ?? [];
  const messages = data?.messages ?? [];
  const pnlLedger = data?.pnl_ledger ?? [];
  const taxInvoice = data?.tax_invoice ?? [];
  const receivables = data?.receivables_top ?? [];
  const cal = data?.calendar;
  const today = todayISO();

  // 이번달 요일 그리드용 날짜 셀(선행 공백 + 1~마지막일) — 달력 미니(SHOW_LEGACY_WIDGETS) 전용
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
        {headIcons}
      </div>

      <div className="widgets mp6">
        <div className="widget w-stock">
          <div className="widget-head"><b>재고현황</b>{icons}</div>
          {stock.length ? (
            <table className="widget-table">
              <thead><tr><th>품목코드</th><th>품목명[규격]</th><th className="num">재고수량</th></tr></thead>
              <tbody>
                {stock.map(r => (
                  <tr key={r.item_id}>
                    <td className="blue">{r.item_code}</td>
                    <td>{r.item_name}{r.spec ? ` [${r.spec}]` : ` [${r.unit}]`}</td>
                    <td className={`num ${r.qty < 0 ? 'neg' : ''}`}>{fmtQty(r.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        <div className="widget w-todo">
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
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        <div className="widget w-sales">
          <div className="widget-head"><b>판매현황</b>{icons}</div>
          {sales.length ? (
            <table className="widget-table">
              <thead>
                <tr>
                  <th>일자-No.</th><th>품목명[규격]</th><th className="num">수량</th><th className="num">단가</th>
                  <th className="num">공급가액</th><th className="num">부가세</th><th className="num">합계</th><th>거래처명</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((r, i) => (
                  <tr key={`${r.doc_no}-${i}`}>
                    <td className="blue">{r.io_date.split('-').join('/')} -{r.doc_no.split('-')[1]}</td>
                    <td>{r.item_name}{r.spec ? `[${r.spec}]` : `[${r.unit}]`}</td>
                    <td className="num">{fmtQty(r.qty)}</td>
                    <td className="num">{fmtWon(r.unit_price)}</td>
                    <td className="num">{fmtWon(r.supply)}</td>
                    <td className="num">{fmtWon(r.vat)}</td>
                    <td className="num">{fmtWon(r.total)}</td>
                    <td>{r.partner_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        <div className="widget w-note">
          <div className="widget-head"><b>쪽지함리스트</b>{icons}</div>
          {messages.length ? (
            <table className="widget-table">
              <thead><tr><th>보낸사람</th><th>내용</th><th>일시</th></tr></thead>
              <tbody>
                {messages.map(msg => (
                  <tr key={msg.id}>
                    <td>{msg.from_name}</td>
                    <td>{msg.content}</td>
                    <td>{msg.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        <div className="widget w-vatbook">
          <div className="widget-head"><b>매입매출장</b>{icons}</div>
          {pnlLedger.length ? (
            <table className="widget-table">
              <thead><tr><th>일자</th><th>구분</th><th>거래처</th><th>품목</th><th className="num">합계</th></tr></thead>
              <tbody>
                {pnlLedger.map((r, i) => (
                  <tr key={`${r.doc_no}-${i}`}>
                    <td className="blue">{r.io_date.split('-').join('/')}</td>
                    <td>{r.kind}</td>
                    <td>{r.partner_name}</td>
                    <td>{r.item_summary}</td>
                    <td className="num">{fmtWon(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        <div className="widget w-taxinv">
          <div className="widget-head"><b>(세금)계산서진행단계</b>{icons}</div>
          {taxInvoice.length ? (
            <table className="widget-table">
              <thead><tr><th>일자</th><th>거래처</th><th className="num">금액</th><th>상태</th></tr></thead>
              <tbody>
                {taxInvoice.map(r => (
                  <tr key={r.doc_id}>
                    <td className="blue">{r.io_date.split('-').join('/')}</td>
                    <td>{r.partner_name}</td>
                    <td className="num">{fmtWon(r.total)}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="widget-empty">등록된 데이터가 없습니다.</p>}
        </div>

        {SHOW_LEGACY_WIDGETS && (
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
        )}

        {SHOW_LEGACY_WIDGETS && (
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
        )}
      </div>
    </div>
  );
}

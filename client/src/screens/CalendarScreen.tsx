import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtQty, fmtWon, todayISO, addMonths } from '../format';
import type { CalendarMonth, CalendarDayDetail } from '../types';

// 달력(로스팅/납기) — 이카운트 index.html 달력 UX 계승: 로스팅함=빨강, 주문납기 예정=주황.
// Tabulator가 아닌 자체 월 그리드(styles.css의 cal-* 클래스, 설계 4.9).

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function buildCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad2(month)}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function CalendarScreen() {
  const toast = useToast();
  const today = todayISO();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)));
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarDayDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<CalendarMonth>(`/api/calendar?year=${year}&month=${month}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [year, month, toast]);

  useEffect(() => { load(); }, [load]);

  const loadDay = useCallback(async (date: string) => {
    setSelected(date);
    try {
      setDetail(await api.get<CalendarDayDetail>(`/api/calendar/day?date=${date}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [toast]);

  const move = (delta: number) => {
    const n = addMonths(year, month, delta);
    setYear(n.year);
    setMonth(n.month);
  };

  const goToday = () => {
    setYear(Number(today.slice(0, 4)));
    setMonth(Number(today.slice(5, 7)));
    loadDay(today);
  };

  const cells = buildCells(year, month);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="screen cal-wrap">
      <div className="cal-nav">
        <button className="btn small" onClick={() => move(-1)}>◀</button>
        <b>{year}년 {month}월</b>
        <button className="btn small" onClick={() => move(1)}>▶</button>
        <button className="btn small" onClick={goToday}>오늘</button>
      </div>

      <table className="cal-table">
        <thead>
          <tr>{WEEKDAYS.map(w => <th key={w}>{w}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((date, di) => {
                if (!date) return <td key={di} className="empty" />;
                const day = data?.days?.[date];
                const classes: string[] = [];
                if (day && day.roast_count > 0) classes.push('has-done');
                else if (day && day.order_due_count > 0) classes.push('has-future');
                if (date === today) classes.push('today');
                if (date === selected) classes.push('sel');
                return (
                  <td key={di} className={classes.join(' ')} onClick={() => loadDay(date)}>
                    <div className="cal-dnum">{Number(date.slice(8, 10))}</div>
                    {day && day.roast_kg > 0 && <span className="cal-badge kg">{fmtQty(day.roast_kg)}kg</span>}
                    {day && day.sale_count > 0 && <span className="cal-badge">판매 {day.sale_count}건</span>}
                    {day && day.order_due_count > 0 && <span className="cal-badge due">납기 {day.order_due_count}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="cal-legend">
        <span><span className="cal-legdot" style={{ background: '#b3261e' }} />로스팅함</span>
        <span><span className="cal-legdot" style={{ background: '#c67c00' }} />주문납기 예정</span>
      </div>

      <div className="cal-detail">
        <b>[{selected ?? '날짜를 선택하세요'}] 전표</b>
        {selected && (!detail || detail.events.length === 0) && (
          <p className="hint">이 날짜에는 전표가 없습니다.</p>
        )}
        {detail && detail.events.map((ev, i) => (
          <div key={i} className="row-ev">
            <span className="k">{ev.kind}</span>
            <span>{ev.doc_no}</span>
            <span>{ev.partner_name ?? ''}</span>
            <span>{ev.title}</span>
            <span>{ev.qty ? `${fmtQty(ev.qty)}kg` : ''}</span>
            <span>{ev.amount ? fmtWon(ev.amount) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

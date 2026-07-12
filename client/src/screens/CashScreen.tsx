import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, monthStartISO, todayISO } from '../format';
import type { CashListRow, CashReport } from '../types';

// 자금현황 (설계-잔여메뉴.md 4.5) — receipt(수금/지불) 기반 결제수단별 요약 타일 + 일별 입출금 목록.
// R9-A(설계-R9-실물매칭.md §5): 입/출금계좌 조회 실물화 — 은행 전용 컬럼은 stub, 출금행 연분홍.
// /api/cash 계약·요약 타일은 그대로 유지, 잔액(원화잔액)은 클라에서 누적 계산한다.

interface CashRowView extends CashListRow { balance: number }

export function CashScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<CashReport | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<CashReport>(`/api/cash?from=${from}&to=${to}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  // 원화잔액 = 클라 running balance(위→아래 누적 입금-출금, 설계 §5)
  const viewRows = useMemo<CashRowView[]>(() => {
    let bal = 0;
    return (data?.list ?? []).map(r => {
      bal += (r.in_amt || 0) - (r.out_amt || 0);
      return { ...r, balance: bal };
    });
  }, [data]);

  const pageCount = Math.max(1, Math.ceil(viewRows.length / 15));

  const columns: ColumnDefinition[] = [
    { title: '입/출금일자', field: 'io_date', width: 100 },
    {
      title: '구분', width: 64, hozAlign: 'center', headerSort: false,
      formatter: c => {
        const d = c.getData() as CashRowView;
        c.getRow().getElement().classList.toggle('r9-cash-out', d.out_amt > 0);
        return d.kind === '수금' ? '입금' : '출금';
      },
    },
    {
      title: '계좌번호', width: 120, hozAlign: 'center', headerSort: false,
      formatter: () => '<span title="계좌 연동은 은행 연동 예정입니다">301***-**-******</span>',
    },
    { title: '계좌명', width: 90, headerSort: false, formatter: () => '' },
    { title: '거래처코드', width: 90, headerSort: false, formatter: () => '' },
    { title: '거래처명', field: 'partner_name', minWidth: 130 },
    { title: '입금처/출금처', width: 110, headerSort: false, formatter: () => '' },
    {
      title: '금액', width: 110, hozAlign: 'right', headerSort: false,
      formatter: c => { const d = c.getData() as CashRowView; return fmtWon(d.in_amt > 0 ? d.in_amt : d.out_amt); },
    },
    {
      title: '원화잔액', field: 'balance', width: 120, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    { title: '상대은행명', width: 100, headerSort: false, formatter: () => '' },
    {
      title: '회계전표', width: 80, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="r8-badge-green" title="회계반영">✓</span>',
    },
  ];

  return (
    <div className="screen">
      {/* 실물 타이틀바(설계 §5) — 상태 pill은 데이터 없어 전체만 동작 */}
      <div className="r8-titlebar">
        <span className="r8-star">★</span>
        <h3>입/출금계좌 조회</h3>
        <div className="r8-pills">
          <button className="r8-pill on" onClick={() => load()}>전체</button>
          <button className="r8-pill" disabled title="은행 연동 예정입니다">미반영</button>
          <button className="r8-pill" disabled title="은행 연동 예정입니다">회계반영</button>
          <button className="r8-pill" disabled title="은행 연동 예정입니다">강제회계반영</button>
        </div>
        <div className="r8-titlebar-right">
          <button className="btn r8-primary" onClick={() => load()}>Search(F3)</button>
          <button className="btn r8-ghost" disabled title="옵션 설정은 연동 예정입니다">Option</button>
          <button className="btn r8-ghost" disabled title="도움말은 연동 예정입니다">도움말</button>
        </div>
      </div>
      <div className="r8-listbar">
        <span className="r8-pager">① 2 » <b className="on">1</b>/{pageCount}</span>
        <span className="r8-period">{from.split('-').join('/')} ~ {to.split('-').join('/')}</span>
      </div>

      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn" onClick={load}>검색(F3)</button>
        </div>
      </div>

      {data && (
        <div className="cash-tiles">
          {data.summary.map(s => (
            <div key={s.method} className="cash-tile">
              <div className="ct-title">{s.method}</div>
              <div className="ct-net" style={s.net < 0 ? { color: 'var(--danger)' } : undefined}>{fmtWon(s.net)}</div>
              <div className="ct-io"><span>입금 {fmtWon(s.in_amt)}</span><span>출금 {fmtWon(s.out_amt)}</span></div>
            </div>
          ))}
          <div className="cash-tile total">
            <div className="ct-title">총계</div>
            <div className="ct-net" style={data.totals.net < 0 ? { color: 'var(--danger)' } : undefined}>{fmtWon(data.totals.net)}</div>
            <div className="ct-io"><span>총입금 {fmtWon(data.totals.in_amt)}</span><span>총출금 {fmtWon(data.totals.out_amt)}</span></div>
          </div>
        </div>
      )}

      <div className="screen-grid r8-real">
        <DataGrid<CashRowView>
          columns={columns}
          data={viewRows}
          rowNumbers
          gridRef={t => { gridRef.current = t; }}
          options={{ pagination: true, paginationSize: 15 }}
        />
      </div>

      {/* 실물 하단 버튼바(설계 §5) — 은행 연동류는 disabled+stub, Excel만 실제 */}
      <div className="r8-report-bottom">
        <button className="btn r8-ghost" disabled title="연동 예정입니다">지출결의서작성 ▲</button>
        <button className="btn r8-primary" onClick={load}>즉시조회 ▲</button>
        <button className="btn r8-ghost" disabled title="은행 연동 예정입니다">통장등록</button>
        <button className="btn r8-ghost" disabled title="은행 연동 예정입니다">매핑조회</button>
        <button className="btn r8-ghost" onClick={() => gridRef.current?.download('xlsx', '입출금계좌조회.xlsx', { sheetName: '입출금계좌조회' })}>
          Excel
        </button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">자동알림</button>
        <button className="btn r8-ghost" disabled title="은행 연동 예정입니다">수집처별확인사항</button>
      </div>
    </div>
  );
}

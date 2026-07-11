import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset, todayISO, PERIOD_PRESETS } from '../format';
import { useToast } from '../components/Toast';
import type { IncomeStatement, Settings } from '../types';

// 손익계산서(서식형) — 설계-R1-보고서엔진.md §4.
// StatementPrint.tsx의 검색바/인쇄 패턴을 따르는 개별 화면(그리드 아님). GET /api/income-statement 1회 조회.

export function PnlStatement() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => { api.get<Settings>('/api/settings').then(setSettings).catch(() => {}); }, []);

  const search = useCallback(async (f = from, t = to) => {
    try {
      setData(await api.get<IncomeStatement>(`/api/income-statement?from=${f}&to=${t}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  // 마운트 시 1회 자동조회(기본 기간: 이번달 1일~오늘)
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 이카운트 단축키: F8 조회(StatementPrint와 동일)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); search(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search]);

  const preset = (kind: string) => {
    const { from: f, to: t } = periodPreset(kind);
    setFrom(f); setTo(t);
    search(f, t);
  };

  const companyName = settings.company_name || data?.company_name || '';

  return (
    <div className="screen pnl-screen">
      <div className="stmt-search">
        <div className="stmt-cond">
          <label>기준일자</label>
          <input className="input w-140" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input w-140" type="date" value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn primary" style={{ marginLeft: 14 }} onClick={() => search()}>조회(F8)</button>
          <button className="btn" onClick={() => window.print()} disabled={!data}>인쇄</button>
        </div>
        <div className="stmt-presets">
          {PERIOD_PRESETS.map(p => <button key={p} className="btn" onClick={() => preset(p)}>{p}</button>)}
        </div>
      </div>

      {data && (
        <>
          <PnlSheet data={data} companyName={companyName} />
          {/* 인쇄 전용 사본 (StatementPrint의 인쇄 패턴 재사용) */}
          <div className="print-only">
            <div className="print-sheet">
              <PnlSheet data={data} companyName={companyName} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PnlSheet({ data, companyName }: { data: IncomeStatement; companyName: string }) {
  const dot = (s: string) => s.split('-').join('/');
  return (
    <div className="pnl-sheet">
      <div className="pnl-title">손 익 계 산 서</div>
      <div className="pnl-meta">
        <span>회사명 : {companyName || '(환경설정에서 상호 입력)'}</span>
        <span>기간 : {dot(data.from)} ~ {dot(data.to)}</span>
      </div>
      <table className="pnl-table">
        <thead>
          <tr><th>과 목</th><th className="num">금 액</th></tr>
        </thead>
        <tbody>
          {data.sections.map(s => (
            <Fragment key={s.key}>
              <tr className={s.emphasis ? 'pnl-emph' : ''}>
                <td>{s.no}. {s.label}</td>
                <td className={`num${s.emphasis && s.amount < 0 ? ' danger-text' : ''}`}>
                  {s.emphasis ? <b>{fmtWon(s.amount)}</b> : fmtWon(s.amount)}
                </td>
              </tr>
              {s.details.map((d, i) => (
                <tr key={i} className="pnl-detail">
                  <td className="pnl-detail-name">{d.name}</td>
                  <td className="num">{fmtWon(d.amount)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          {!data.sections.length && (
            <tr><td colSpan={2} className="pnl-empty">기간 내 손익 데이터가 없습니다</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

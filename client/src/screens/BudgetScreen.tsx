import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, parseWon } from '../format';
import { useToast } from '../components/Toast';
import type { BudgetReport, BudgetRow } from '../types';

// 예산관리 — 설계-R4-세무회계2.md §4.5. 계정×12월 편성 입력 + 실적(분개장 집계) 대비 + 집행률.
// 실적은 읽기전용(회색, 서버가 journal에서 집계). [저장] 시 화면의 전체 그리드를 bulk upsert한다
// (PUT /api/budget {fiscal_year, entries:[{account_code,month,amount}]}) — 트랜잭션 1회, 0원도 저장.

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function BudgetScreen() {
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [totals, setTotals] = useState<BudgetReport['totals'] | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (y = year) => {
    try {
      const data = await api.get<BudgetReport>(`/api/budget?year=${y}`);
      setRows(data.rows.map(r => ({ ...r, budget: [...r.budget], actual: [...r.actual] })));
      setTotals(data.totals);
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [year, toast]);

  useEffect(() => { load(); }, [load]);

  const setCell = (code: string, monthIdx: number, v: number) => {
    setRows(prev => prev.map(r => {
      if (r.account_code !== code) return r;
      const budget = [...r.budget];
      budget[monthIdx] = v;
      const budget_total = budget.reduce((a, b) => a + b, 0);
      const rate_pct = budget_total ? Math.round((r.actual_total / budget_total) * 100) : 0;
      return { ...r, budget, budget_total, variance: budget_total - r.actual_total, rate_pct };
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const entries = rows.flatMap(r => r.budget.map((amount, i) => ({ account_code: r.account_code, month: i + 1, amount })));
      await api.put('/api/budget', { fiscal_year: year, entries });
      toast.show('저장되었습니다.');
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2];

  return (
    <div className="screen budget-screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>연도</span>
          <select className="input" style={{ width: 100 }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button className="btn" onClick={() => load()}>조회(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn r8-primary" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </div>
      <p className="hint">편성액(입력 칸)과 실적(회색, 분개장 자동집계)을 대비합니다. 집행률 100% 초과 시 빨간색으로 강조됩니다.</p>

      <div className="budget-grid-wrap">
        <table className="budget-grid">
          <thead>
            <tr>
              <th className="budget-acct">계정과목</th>
              {MONTHS.map(m => <th key={m} className="num">{m}월</th>)}
              <th className="num">편성합계</th>
              <th className="num">실적합계</th>
              <th className="num">집행률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.account_code}>
                <td className="budget-acct">
                  {r.account_name}
                  <span style={{ color: 'var(--sub)', fontSize: 11 }}> ({r.account_code})</span>
                </td>
                {MONTHS.map((m, i) => (
                  <td key={m} className="num budget-cell">
                    <input className="cell num" type="number" step={1000} value={r.budget[i] || ''}
                      onChange={e => setCell(r.account_code, i, parseWon(e.target.value))} />
                    <span className="budget-actual">{fmtWon(r.actual[i])}</span>
                  </td>
                ))}
                <td className="num"><b>{fmtWon(r.budget_total)}</b></td>
                <td className="num">{fmtWon(r.actual_total)}</td>
                <td className={`num ${r.rate_pct > 100 ? 'over' : ''}`}>{r.rate_pct}%</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={16} className="empty-cell">편성 대상 계정(비용 계정)이 없습니다</td></tr>
            )}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="budget-acct">합계</td>
                <td colSpan={12}></td>
                <td className="num"><b>{fmtWon(totals.budget_total)}</b></td>
                <td className="num">{fmtWon(totals.actual_total)}</td>
                <td className={`num ${totals.rate_pct > 100 ? 'over' : ''}`}>{totals.rate_pct}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset, todayISO, PERIOD_PRESETS } from '../format';
import { CodeHelp } from '../components/CodeHelp';
import { Modal, Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { FundPlanList, FundPlanRow } from '../types';

// 자금계획 — 설계-R4-세무회계2.md §4.5. 월별 예정 수입/지출 수기 등록 + 기간 요약.
// 이카운트의 '추정자금일보'(실적+계획 통합 잔액)는 R4 범위 밖 — 예정치 등록·월 요약까지만 제공한다.
// TODO(은행연동): 계좌 자동수집·확정 반영은 R6+ 연동 예정.

type NewPlan = {
  plan_date: string; flow: '수입' | '지출'; amount: number;
  partner_id: number | null; partner_name: string; title: string; memo: string;
};
const emptyPlan = (): NewPlan => ({ plan_date: todayISO(), flow: '수입', amount: 0, partner_id: null, partner_name: '', title: '', memo: '' });

export function FundPlanScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<FundPlanList | null>(null);
  const [editing, setEditing] = useState<NewPlan | null>(null);
  const [help, setHelp] = useState(false);
  const [confirmDel, setConfirmDel] = useState<FundPlanRow | null>(null);

  const load = useCallback(async (f = from, t = to) => {
    try {
      setData(await api.get<FundPlanList>(`/api/fund-plans?from=${f}&to=${t}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  // 이카운트 단축키: F2 신규
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); setEditing(emptyPlan()); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const preset = (kind: string) => {
    const { from: f, to: t } = periodPreset(kind);
    setFrom(f); setTo(t);
    load(f, t);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.plan_date) { toast.show('예정일자를 입력하세요.', 'error'); return; }
    if (editing.amount <= 0) { toast.show('금액을 입력하세요.', 'error'); return; }
    try {
      await api.post('/api/fund-plans', {
        plan_date: editing.plan_date, flow: editing.flow, amount: editing.amount,
        partner_id: editing.partner_id, title: editing.title, memo: editing.memo,
      });
      toast.show('저장되었습니다.');
      setEditing(null);
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/fund-plans/${confirmDel.id}`);
      toast.show('삭제되었습니다.');
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
      setConfirmDel(null);
    }
  };

  const rows = data?.rows ?? [];

  return (
    <div className="screen fund-screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <button className="btn" onClick={() => load()}>조회(F3)</button>
        </div>
        <div className="btn-group">
          {PERIOD_PRESETS.map(p => <button key={p} className="btn small" onClick={() => preset(p)}>{p}</button>)}
          <button className="btn primary" onClick={() => setEditing(emptyPlan())}>신규(F2)</button>
        </div>
      </div>

      {data && (
        <div className="fund-summary">
          <span>예정수입 <b>{fmtWon(data.summary.in_total)}</b></span>
          <span>예정지출 <b>{fmtWon(data.summary.out_total)}</b></span>
          <span>순증감 <b className={data.summary.net < 0 ? 'danger-text' : ''}>{fmtWon(data.summary.net)}</b></span>
          <span>건수 {data.summary.count}</span>
        </div>
      )}

      <table className="stmt-table">
        <thead>
          <tr>
            <th style={{ width: 96 }}>예정일자</th>
            <th style={{ width: 60 }}>구분</th>
            <th className="num" style={{ width: 110 }}>금액</th>
            <th style={{ width: 130 }}>거래처</th>
            <th>내용</th>
            <th style={{ width: 60 }}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.plan_date}</td>
              <td className={r.flow === '지출' ? 'danger-text' : 'ok-text'}>{r.flow}</td>
              <td className="num">{fmtWon(r.amount)}</td>
              <td>{r.partner_name ?? ''}</td>
              <td>{r.title}</td>
              <td className="ctr"><button className="link danger" onClick={() => setConfirmDel(r)}>삭제</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="empty-cell">기간 내 자금계획이 없습니다</td></tr>}
        </tbody>
      </table>

      {editing && (
        <Modal title="자금계획 신규" onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" onClick={save}>저장</button>
            </>
          }>
          <div className="form-grid">
            <label>
              <span className="form-label">예정일자<em className="req">*</em></span>
              <input className="input" type="date" value={editing.plan_date}
                onChange={e => setEditing({ ...editing, plan_date: e.target.value })} />
            </label>
            <label>
              <span className="form-label">구분</span>
              <select className="input" value={editing.flow}
                onChange={e => setEditing({ ...editing, flow: e.target.value as '수입' | '지출' })}>
                <option value="수입">수입</option>
                <option value="지출">지출</option>
              </select>
            </label>
            <label>
              <span className="form-label">금액(원)<em className="req">*</em></span>
              <input className="input" type="number" step={1000} value={editing.amount || ''}
                onChange={e => setEditing({ ...editing, amount: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label>
              <span className="form-label">거래처</span>
              <input className="input lookup" readOnly value={editing.partner_name} placeholder="선택(선택)" onClick={() => setHelp(true)} />
            </label>
            <label className="span2">
              <span className="form-label">내용</span>
              <input className="input" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <label className="span2">
              <span className="form-label">메모</span>
              <textarea className="input" rows={2} value={editing.memo} onChange={e => setEditing({ ...editing, memo: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}

      {help && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(false)}
          onSelect={r => setEditing(prev => prev && ({ ...prev, partner_id: r.id, partner_name: r.name }))} />
      )}

      {confirmDel && (
        <Confirm text={`이 자금계획을 삭제할까요?\n(${confirmDel.title || confirmDel.plan_date})`} onNo={() => setConfirmDel(null)} onYes={doDelete} />
      )}
    </div>
  );
}

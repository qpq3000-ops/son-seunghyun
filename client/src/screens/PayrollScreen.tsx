import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';
import { addMonths, fmtWon, todayISO, wonToKorean } from '../format';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { Employee, PayrollList, PayrollRates, PayrollRow, PayslipData } from '../types';

// 급여대장 + 급여명세서 — 설계-R5-관리그룹웨어유틸.md §4.1.
// 주의(간이 계산·참고용): 4대보험·소득세는 요율(settings) 기반 근사치이며 실제 원천징수와 다를 수 있다(§3.2).
// 급여 CRUD·요율 계산은 hr.mjs 내부에 격리 복제되어 있다(masters.mjs 무수정).

const DEDUCTION_FIELDS = ['national_pension', 'health_ins', 'longterm_care', 'employment_ins', 'income_tax', 'local_income_tax', 'other_deduction'] as const;
type DeductionField = typeof DEDUCTION_FIELDS[number];

const DEDUCTION_LABELS: Record<DeductionField, string> = {
  national_pension: '국민연금', health_ins: '건강보험', longterm_care: '장기요양', employment_ins: '고용보험',
  income_tax: '소득세', local_income_tax: '지방소득세', other_deduction: '기타공제',
};

type NewPayroll = {
  payroll_id: number | null;
  emp_id: number; emp_code: string; emp_name: string;
  pay_ym: string; pay_date: string;
  base_pay: number; allowance: number; meal_allowance: number;
  national_pension: number; health_ins: number; longterm_care: number; employment_ins: number;
  income_tax: number; local_income_tax: number; other_deduction: number;
  memo: string; auto: boolean;
};

// hr.mjs calcDeductions()와 동일 공식(간이 계산). 자동계산 미리보기용 — 저장 시 최종 값은 서버(auto:true)가 재계산한다.
function calcDeductions(basePay: number, allowance: number, rates: PayrollRates) {
  const taxable = basePay + allowance;
  const national_pension = Math.round((taxable * rates.pension) / 100);
  const health_ins = Math.round((taxable * rates.health) / 100);
  const longterm_care = Math.round((health_ins * rates.longterm) / 100);
  const employment_ins = Math.round((taxable * rates.employment) / 100);
  const income_tax = Math.round((taxable * rates.income_tax) / 100);
  const local_income_tax = Math.round(income_tax * 0.1);
  return { national_pension, health_ins, longterm_care, employment_ins, income_tax, local_income_tax };
}

function fromRow(r: PayrollRow): NewPayroll {
  return {
    payroll_id: r.payroll_id, emp_id: r.emp_id, emp_code: r.emp_code, emp_name: r.emp_name,
    pay_ym: r.pay_ym ?? '', pay_date: r.pay_date || todayISO(),
    base_pay: r.base_pay, allowance: r.allowance, meal_allowance: r.meal_allowance,
    national_pension: r.national_pension, health_ins: r.health_ins, longterm_care: r.longterm_care,
    employment_ins: r.employment_ins, income_tax: r.income_tax, local_income_tax: r.local_income_tax,
    other_deduction: r.other_deduction, memo: r.memo, auto: false,
  };
}

export function PayrollScreen() {
  const toast = useToast();
  const [ym, setYm] = useState(todayISO().slice(0, 7));
  const [data, setData] = useState<PayrollList | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<NewPayroll | null>(null);
  const [rates, setRates] = useState<PayrollRates | null>(null);
  const [rateEditing, setRateEditing] = useState<PayrollRates | null>(null);
  const [payslip, setPayslip] = useState<PayslipData | null>(null);

  useEffect(() => { api.get<Employee[]>('/api/employees?active=1').then(setEmployees).catch(() => {}); }, []);
  useEffect(() => { api.get<PayrollRates>('/api/payroll/rates').then(setRates).catch(() => {}); }, []);

  const load = useCallback(async (y = ym) => {
    try {
      setData(await api.get<PayrollList>(`/api/payroll?ym=${y}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [ym, toast]);

  useEffect(() => { load(); }, [load]);

  const shiftMonth = (delta: number) => {
    const [y, m] = ym.split('-').map(Number);
    const n = addMonths(y, m, delta);
    const next = `${n.year}-${String(n.month).padStart(2, '0')}`;
    setYm(next);
    load(next);
  };

  const setDeduction = (field: DeductionField, v: number) => {
    setEditing(prev => prev && ({ ...prev, [field]: v, auto: false }));
  };

  const autoCalc = () => {
    if (!editing || !rates) return;
    const d = calcDeductions(editing.base_pay, editing.allowance, rates);
    setEditing({ ...editing, ...d, auto: true });
  };

  const save = async () => {
    if (!editing) return;
    try {
      await api.post('/api/payroll', {
        emp_id: editing.emp_id, pay_ym: ym, pay_date: editing.pay_date,
        base_pay: editing.base_pay, allowance: editing.allowance, meal_allowance: editing.meal_allowance,
        memo: editing.memo, auto: editing.auto,
        national_pension: editing.national_pension, health_ins: editing.health_ins, longterm_care: editing.longterm_care,
        employment_ins: editing.employment_ins, income_tax: editing.income_tax, local_income_tax: editing.local_income_tax,
        other_deduction: editing.other_deduction,
      });
      toast.show('저장되었습니다.');
      setEditing(null);
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const removePayroll = async (id: number) => {
    try {
      await api.del(`/api/payroll/${id}`);
      toast.show('삭제되었습니다.');
      setEditing(null);
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const saveRates = async () => {
    if (!rateEditing) return;
    try {
      setRates(await api.put<PayrollRates>('/api/payroll/rates', rateEditing));
      toast.show('요율이 저장되었습니다.');
      setRateEditing(null);
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const openStatement = async (id: number) => {
    try {
      setPayslip(await api.get<PayslipData>(`/api/payroll/${id}/statement`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const exportExcel = () => {
    const rows = (data?.rows ?? []).map(r => ({
      사원코드: r.emp_code, 사원명: r.emp_name, 기본급: r.base_pay, 과세수당: r.allowance, 식대: r.meal_allowance,
      지급총액: r.gross_pay, 공제총액: r.deduction_total, 실지급액: r.net_pay,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '급여대장');
    XLSX.writeFile(wb, `급여대장_${ym}.xlsx`);
  };

  const rows = data?.rows ?? [];
  const gross = editing ? editing.base_pay + editing.allowance + editing.meal_allowance : 0;
  const deductionTotal = editing ? DEDUCTION_FIELDS.reduce((s, f) => s + editing[f], 0) : 0;

  return (
    <div className="screen payroll-screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>귀속연월</span>
          <button className="btn small" onClick={() => shiftMonth(-1)}>◀</button>
          <input className="input" type="month" style={{ width: 130 }} value={ym} onChange={e => setYm(e.target.value)} />
          <button className="btn small" onClick={() => shiftMonth(1)}>▶</button>
          <button className="btn" onClick={() => load()}>조회(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => setRateEditing(rates)}>요율설정</button>
          <button className="btn" onClick={exportExcel}>엑셀</button>
          <span className="payroll-badge">간이 계산 · 참고용</span>
        </div>
      </div>

      {!employees.length && (
        <p className="hint">먼저 [재고Ⅰ &gt; 기초등록 &gt; 사원등록]에서 사원을 등록하세요.</p>
      )}

      <table className="stmt-table payroll-grid">
        <thead>
          <tr>
            <th>사원코드</th><th>사원명</th>
            <th className="num">기본급</th><th className="num">과세수당</th><th className="num">식대</th>
            <th className="num">지급총액</th><th className="num">공제총액</th><th className="num">실지급액</th>
            <th style={{ width: 120 }}>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.emp_id} className={r.payroll_id == null ? 'payroll-blank' : ''}>
              <td>{r.emp_code}</td><td>{r.emp_name}</td>
              <td className="num">{fmtWon(r.base_pay)}</td>
              <td className="num">{fmtWon(r.allowance)}</td>
              <td className="num">{fmtWon(r.meal_allowance)}</td>
              <td className="num">{fmtWon(r.gross_pay)}</td>
              <td className="num">{fmtWon(r.deduction_total)}</td>
              <td className="num"><b>{fmtWon(r.net_pay)}</b></td>
              <td className="ctr">
                <button className="link" onClick={() => setEditing(fromRow(r))}>편집</button>
                {r.payroll_id != null && (
                  <button className="link" onClick={() => openStatement(r.payroll_id!)} style={{ marginLeft: 8 }}>명세서</button>
                )}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={9} className="empty-cell">대상 사원이 없습니다</td></tr>}
        </tbody>
        {data && rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={5}>합계(작성 {data.totals.count}건)</td>
              <td className="num"><b>{fmtWon(data.totals.gross_pay)}</b></td>
              <td className="num"><b>{fmtWon(data.totals.deduction_total)}</b></td>
              <td className="num"><b>{fmtWon(data.totals.net_pay)}</b></td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>

      {editing && (
        <Modal title={`급여 입력 — ${editing.emp_code} ${editing.emp_name}`} width={640} onClose={() => setEditing(null)}
          footer={
            <>
              {editing.payroll_id != null && (
                <button className="btn danger" onClick={() => removePayroll(editing.payroll_id!)} style={{ marginRight: 'auto' }}>삭제</button>
              )}
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn r8-primary" onClick={save}>저장</button>
            </>
          }>
          <div className="form-grid">
            <label>
              <span className="form-label">기본급(원)</span>
              <input className="input" type="number" step={1000} value={editing.base_pay}
                onChange={e => setEditing({ ...editing, base_pay: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label>
              <span className="form-label">과세수당(원)</span>
              <input className="input" type="number" step={1000} value={editing.allowance}
                onChange={e => setEditing({ ...editing, allowance: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label>
              <span className="form-label">비과세 식대(원)</span>
              <input className="input" type="number" step={1000} value={editing.meal_allowance}
                onChange={e => setEditing({ ...editing, meal_allowance: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label>
              <span className="form-label">지급일</span>
              <input className="input" type="date" value={editing.pay_date}
                onChange={e => setEditing({ ...editing, pay_date: e.target.value })} />
            </label>
          </div>

          <div className="payroll-deduction-head">
            <b>공제 항목</b>
            <button className="btn small" onClick={autoCalc}>자동계산</button>
            <span className="field-hint">값을 직접 수정하면 자동계산이 해제됩니다.</span>
          </div>
          <div className="form-grid">
            {DEDUCTION_FIELDS.map(f => (
              <label key={f}>
                <span className="form-label">{DEDUCTION_LABELS[f]}(원)</span>
                <input className="input" type="number" step={100} value={editing[f]}
                  onChange={e => setDeduction(f, parseInt(e.target.value, 10) || 0)} />
              </label>
            ))}
            <label className="span2">
              <span className="form-label">메모</span>
              <textarea className="input" rows={2} value={editing.memo}
                onChange={e => setEditing({ ...editing, memo: e.target.value })} />
            </label>
          </div>

          <div className="payroll-summary">
            <span>지급총액 <b>{fmtWon(gross)}</b></span>
            <span>공제총액 <b>{fmtWon(deductionTotal)}</b></span>
            <span>실지급액 <b>{fmtWon(gross - deductionTotal)}</b></span>
          </div>
          <p className="hint">간이 계산(참고용) — 4대보험·소득세 상세 규정(상하한·부양가족 등)은 반영되지 않습니다.</p>
        </Modal>
      )}

      {rateEditing && (
        <Modal title="급여 요율 설정" onClose={() => setRateEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRateEditing(null)}>취소</button>
              <button className="btn r8-primary" onClick={saveRates}>저장</button>
            </>
          }>
          <div className="form-grid">
            <label>
              <span className="form-label">국민연금(%)</span>
              <input className="input" type="number" step={0.001} value={rateEditing.pension}
                onChange={e => setRateEditing({ ...rateEditing, pension: parseFloat(e.target.value) || 0 })} />
            </label>
            <label>
              <span className="form-label">건강보험(%)</span>
              <input className="input" type="number" step={0.001} value={rateEditing.health}
                onChange={e => setRateEditing({ ...rateEditing, health: parseFloat(e.target.value) || 0 })} />
            </label>
            <label>
              <span className="form-label">장기요양(건보료의 %)</span>
              <input className="input" type="number" step={0.001} value={rateEditing.longterm}
                onChange={e => setRateEditing({ ...rateEditing, longterm: parseFloat(e.target.value) || 0 })} />
            </label>
            <label>
              <span className="form-label">고용보험(%)</span>
              <input className="input" type="number" step={0.001} value={rateEditing.employment}
                onChange={e => setRateEditing({ ...rateEditing, employment: parseFloat(e.target.value) || 0 })} />
            </label>
            <label>
              <span className="form-label">소득세 근사(%)</span>
              <input className="input" type="number" step={0.001} value={rateEditing.income_tax}
                onChange={e => setRateEditing({ ...rateEditing, income_tax: parseFloat(e.target.value) || 0 })} />
            </label>
          </div>
          <p className="hint">장기요양은 건강보험료의 %, 지방소득세는 소득세의 10%(고정)입니다.</p>
        </Modal>
      )}

      {payslip && (
        <Modal title="급여명세서" width={640} onClose={() => setPayslip(null)}
          footer={
            <>
              <button className="btn r8-primary" onClick={() => window.print()}>인쇄</button>
              <button className="btn" onClick={() => setPayslip(null)}>닫기</button>
            </>
          }>
          <PayslipSheet data={payslip} />
        </Modal>
      )}
      {payslip && (
        <div className="print-only">
          <div className="print-sheet">
            <PayslipSheet data={payslip} />
          </div>
        </div>
      )}
    </div>
  );
}

function PayslipSheet({ data }: { data: PayslipData }) {
  return (
    <div className="payslip-sheet">
      <div className="payslip-title">급 여 명 세 서</div>
      <div className="payslip-meta">
        <span>회사명 : {data.company.name || '(환경설정에서 상호 입력)'}</span>
        <span>사업자번호 : {data.company.biz_no}</span>
        <span>대표자 : {data.company.ceo}</span>
      </div>
      <div className="payslip-meta">
        <span>귀속연월 : {data.pay_ym}</span>
        <span>지급일 : {data.pay_date || '-'}</span>
        <span>사원 : {data.emp.code} {data.emp.name}</span>
      </div>
      <div className="payslip-tables">
        <table className="stmt-table">
          <thead><tr><th colSpan={2}>지급 항목</th></tr></thead>
          <tbody>
            {data.earnings.map(e => (
              <tr key={e.label}><td>{e.label}</td><td className="num">{fmtWon(e.amount)}</td></tr>
            ))}
            <tr className="payslip-sub"><td>지급총액</td><td className="num"><b>{fmtWon(data.gross_pay)}</b></td></tr>
          </tbody>
        </table>
        <table className="stmt-table">
          <thead><tr><th colSpan={2}>공제 항목</th></tr></thead>
          <tbody>
            {data.deductions.map(d => (
              <tr key={d.label}><td>{d.label}</td><td className="num">{fmtWon(d.amount)}</td></tr>
            ))}
            <tr className="payslip-sub"><td>공제총액</td><td className="num"><b>{fmtWon(data.deduction_total)}</b></td></tr>
          </tbody>
        </table>
      </div>
      <div className="payslip-net">
        <span>차인지급액</span>
        <b>{fmtWon(data.net_pay)}</b>
      </div>
      <p className="payslip-korean">{wonToKorean(data.net_pay)} 원정</p>
      <p className="hint">본 명세서의 4대보험·소득세는 간이 계산(참고용)이며 실제 원천징수액과 다를 수 있습니다.</p>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { monthStartISO, todayISO } from '../format';
import { CodeHelp } from '../components/CodeHelp';
import { Modal, Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { AttendanceList, AttendanceRow, Employee } from '../types';

// 근태관리 — 설계-R5-관리그룹웨어유틸.md §4.2. 사원×일자 출퇴근/휴가 기록 + 월 집계.
// 근태 CRUD/검증은 hr.mjs 내부에 격리 복제되어 있다(masters.mjs 무수정).

const ATT_TYPES = ['출근', '지각', '조퇴', '결근', '휴가', '반차', '연장'];

type NewAtt = {
  emp_id: number | null; emp_name: string; work_date: string; att_type: string;
  check_in: string; check_out: string; memo: string;
};
const emptyAtt = (): NewAtt => ({ emp_id: null, emp_name: '', work_date: todayISO(), att_type: '출근', check_in: '', check_out: '', memo: '' });

export function AttendanceScreen() {
  const toast = useToast();
  const [ym, setYm] = useState(monthStartISO().slice(0, 7));
  const [empFilter, setEmpFilter] = useState<{ id: number; name: string } | null>(null);
  const [data, setData] = useState<AttendanceList | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<NewAtt | null>(null);
  const [help, setHelp] = useState<'filter' | 'modal' | null>(null);
  const [confirmDel, setConfirmDel] = useState<AttendanceRow | null>(null);

  useEffect(() => { api.get<Employee[]>('/api/employees?active=1').then(setEmployees).catch(() => {}); }, []);

  const load = useCallback(async (y = ym, emp = empFilter) => {
    try {
      const q = `ym=${y}` + (emp ? `&emp_id=${emp.id}` : '');
      setData(await api.get<AttendanceList>(`/api/attendance?${q}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [ym, empFilter, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.emp_id) { toast.show('사원을 선택하세요.', 'error'); return; }
    if (!editing.work_date) { toast.show('근무일자를 입력하세요.', 'error'); return; }
    try {
      await api.post('/api/attendance', {
        emp_id: editing.emp_id, work_date: editing.work_date, att_type: editing.att_type,
        check_in: editing.check_in, check_out: editing.check_out, memo: editing.memo,
      });
      toast.show('저장되었습니다.');
      setEditing(null);
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/attendance/${confirmDel.id}`);
      toast.show('삭제되었습니다.');
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
      setConfirmDel(null);
    }
  };

  const openEdit = (row?: AttendanceRow) => {
    if (row) {
      setEditing({
        emp_id: row.emp_id, emp_name: `${row.emp_code} ${row.emp_name}`, work_date: row.work_date,
        att_type: row.att_type, check_in: row.check_in, check_out: row.check_out, memo: row.memo,
      });
    } else {
      setEditing(emptyAtt());
    }
  };

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? [];

  return (
    <div className="screen att-screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>조회연월</span>
          <input className="input" type="month" style={{ width: 140 }} value={ym} onChange={e => setYm(e.target.value)} />
          <span>사원</span>
          <input className="input lookup" style={{ width: 140 }} readOnly value={empFilter?.name ?? ''} placeholder="전체"
            onClick={() => setHelp('filter')} />
          {empFilter && <button className="icon-btn" onClick={() => setEmpFilter(null)}>✕</button>}
          <button className="btn" onClick={() => load()}>조회(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn r8-primary" onClick={() => openEdit()}>신규</button>
        </div>
      </div>

      {!employees.length && (
        <p className="hint">먼저 [재고Ⅰ &gt; 기초등록 &gt; 사원등록]에서 사원을 등록하세요.</p>
      )}

      <div className="att-summary">
        <table className="stmt-table">
          <thead>
            <tr><th>사원코드</th><th>사원명</th><th className="num">근무일수</th><th className="num">휴가</th>
              <th className="num">반차</th><th className="num">결근</th><th className="num">연장</th></tr>
          </thead>
          <tbody>
            {summary.map(s => (
              <tr key={s.emp_id}>
                <td>{s.emp_code}</td><td>{s.emp_name}</td>
                <td className="num">{s.work_days}</td><td className="num">{s.leave_days}</td>
                <td className="num">{s.half_days}</td>
                <td className={`num ${s.absent_days > 0 ? 'danger-text' : ''}`}>{s.absent_days}</td>
                <td className="num">{s.overtime_days}</td>
              </tr>
            ))}
            {!summary.length && <tr><td colSpan={7} className="empty-cell">해당 월의 근태 집계가 없습니다</td></tr>}
          </tbody>
        </table>
      </div>

      <table className="stmt-table att-grid">
        <thead>
          <tr>
            <th style={{ width: 96 }}>일자</th><th style={{ width: 130 }}>사원</th><th style={{ width: 70 }}>구분</th>
            <th style={{ width: 70 }}>출근</th><th style={{ width: 70 }}>퇴근</th><th>메모</th><th style={{ width: 56 }}>삭제</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} onDoubleClick={() => openEdit(r)}>
              <td>{r.work_date}</td>
              <td>{r.emp_code} {r.emp_name}</td>
              <td className="ctr">{r.att_type}</td>
              <td className="ctr">{r.check_in}</td>
              <td className="ctr">{r.check_out}</td>
              <td>{r.memo}</td>
              <td className="ctr"><button className="link danger" onClick={() => setConfirmDel(r)}>삭제</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="empty-cell">기간 내 근태 기록이 없습니다</td></tr>}
        </tbody>
      </table>

      {editing && (
        <Modal title="근태 입력" onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn r8-primary" onClick={save}>저장</button>
            </>
          }>
          <div className="form-grid">
            <label>
              <span className="form-label">사원<em className="req">*</em></span>
              <input className="input lookup" readOnly value={editing.emp_name} placeholder="선택"
                onClick={() => setHelp('modal')} />
            </label>
            <label>
              <span className="form-label">근무일자<em className="req">*</em></span>
              <input className="input" type="date" value={editing.work_date}
                onChange={e => setEditing({ ...editing, work_date: e.target.value })} />
            </label>
            <label>
              <span className="form-label">구분</span>
              <select className="input" value={editing.att_type}
                onChange={e => setEditing({ ...editing, att_type: e.target.value })}>
                {ATT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span className="form-label">출근시각</span>
              <input className="input" type="time" value={editing.check_in}
                onChange={e => setEditing({ ...editing, check_in: e.target.value })} />
            </label>
            <label>
              <span className="form-label">퇴근시각</span>
              <input className="input" type="time" value={editing.check_out}
                onChange={e => setEditing({ ...editing, check_out: e.target.value })} />
            </label>
            <label className="span2">
              <span className="form-label">메모</span>
              <textarea className="input" rows={2} value={editing.memo}
                onChange={e => setEditing({ ...editing, memo: e.target.value })} />
            </label>
          </div>
          <p className="hint">같은 사원·같은 날짜로 다시 저장하면 기존 기록을 덮어씁니다(하루 1행).</p>
        </Modal>
      )}

      {help === 'filter' && (
        <CodeHelp title="사원" endpoint="/api/employees" onClose={() => setHelp(null)}
          onSelect={r => setEmpFilter({ id: r.id, name: `${r.code} ${r.name}` })} />
      )}
      {help === 'modal' && (
        <CodeHelp title="사원" endpoint="/api/employees" onClose={() => setHelp(null)}
          onSelect={r => setEditing(prev => prev && ({ ...prev, emp_id: r.id, emp_name: `${r.code} ${r.name}` }))} />
      )}

      {confirmDel && (
        <Confirm text={`이 근태 기록을 삭제할까요?\n(${confirmDel.work_date} ${confirmDel.emp_name})`} onYes={doDelete} onNo={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

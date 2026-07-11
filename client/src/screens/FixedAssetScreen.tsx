import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { Modal, Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset, todayISO, PERIOD_PRESETS } from '../format';
import type { FixedAsset, DepSchedule, DepreciationReport } from '../types';

// 고정자산등록 + 감가상각(정액법) — 설계-R4-세무회계2.md §4.4.
// 좌: 자산 목록(신규/수정/삭제) — masters.tsx의 마스터 CRUD 패턴을 커스텀 화면 안에 자체 구현(설계상 MasterScreen 미사용,
// 우측 스케줄 패널이 함께 있어야 하므로). 우: 선택 자산의 감가상각 스케줄(GET /api/fixed-assets/:id/schedule).
// 하: 기간별 자산별/월별 상각현황(GET /api/depreciation). 감가상각 자동분개는 제공하지 않는다(조회·계산 전용, §3.4).

const ASSET_ACCOUNTS = ['건물', '기계장치', '차량운반구', '비품', '무형자산'];

// 목록 그리드의 월상각액·미상각잔액은 서버 스케줄 계산(§3.4 schedule())과 동일한 정액법 공식을
// 클라이언트에서 근사 재현한 값이다(오늘 기준) — 정확한 월별 수치는 우측 스케줄 패널(서버 응답)을 따른다.
function assetAsOfSummary(a: FixedAsset, asOfISO: string): { monthlyDep: number; bookValue: number } {
  const base = Math.max(0, a.acq_cost - a.salvage_value);
  const n = Math.max(1, a.life_years * 12);
  const per = Math.round(base / n);
  const [ay, am] = a.acq_date.slice(0, 7).split('-').map(Number);
  const [oy, om] = asOfISO.slice(0, 7).split('-').map(Number);
  let elapsed = (oy - ay) * 12 + (om - am) + 1; // 취득월 포함 경과 개월수
  if (elapsed < 0) elapsed = 0;
  if (elapsed > n) elapsed = n;
  const accum = elapsed >= n ? base : Math.min(per * elapsed, base);
  return { monthlyDep: per, bookValue: a.acq_cost - accum };
}

function emptyAsset(): Record<string, unknown> {
  return { code: '', name: '', asset_account: '비품', acq_date: todayISO(), acq_cost: 0, salvage_value: 0, life_years: 5, method: '정액법', memo: '', active: 1 };
}

export function FixedAssetScreen() {
  const toast = useToast();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [confirmDel, setConfirmDel] = useState<FixedAsset | null>(null);
  const [selected, setSelected] = useState<FixedAsset | null>(null);
  const [schedule, setSchedule] = useState<DepSchedule | null>(null);

  const [depFrom, setDepFrom] = useState(monthStartISO());
  const [depTo, setDepTo] = useState(todayISO());
  const [depReport, setDepReport] = useState<DepreciationReport | null>(null);

  const loadAssets = useCallback(async (query = q) => {
    try {
      setAssets(await api.get<FixedAsset[]>(`/api/fixed-assets?q=${encodeURIComponent(query)}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [q, toast]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const loadDep = useCallback(async (f = depFrom, t = depTo) => {
    try {
      setDepReport(await api.get<DepreciationReport>(`/api/depreciation?from=${f}&to=${t}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [depFrom, depTo, toast]);

  useEffect(() => { loadDep(); }, [loadDep]);

  // 이카운트 단축키: F2 신규
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F2') { e.preventDefault(); setEditing(emptyAsset()); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const depPreset = (kind: string) => {
    const { from: f, to: t } = periodPreset(kind);
    setDepFrom(f); setDepTo(t);
    loadDep(f, t);
  };

  const selectAsset = async (a: FixedAsset) => {
    setSelected(a);
    try {
      setSchedule(await api.get<DepSchedule>(`/api/fixed-assets/${a.id}/schedule`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const save = async () => {
    if (!editing) return;
    if (!String(editing.code ?? '').trim()) { toast.show('자산코드는 필수입니다.', 'error'); return; }
    if (!String(editing.name ?? '').trim()) { toast.show('자산명은 필수입니다.', 'error'); return; }
    try {
      if (editing.id) {
        await api.put(`/api/fixed-assets/${editing.id}`, editing);
        toast.show('수정되었습니다.');
      } else {
        await api.post('/api/fixed-assets', editing);
        toast.show('저장되었습니다.');
      }
      setEditing(null);
      loadAssets();
      loadDep();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/fixed-assets/${confirmDel.id}`);
      toast.show('삭제되었습니다.');
      if (selected?.id === confirmDel.id) { setSelected(null); setSchedule(null); }
      setConfirmDel(null);
      loadAssets();
      loadDep();
    } catch (e) {
      toast.show((e as Error).message, 'error');
      setConfirmDel(null);
    }
  };

  const gridData = useMemo(() => assets.map(a => {
    const { monthlyDep, bookValue } = assetAsOfSummary(a, todayISO());
    return { ...a, _monthly: monthlyDep, _book: bookValue };
  }), [assets]);

  const columns: ColumnDefinition[] = [
    { title: '자산코드', field: 'code', width: 100 },
    { title: '자산명', field: 'name', minWidth: 140 },
    { title: '자산계정', field: 'asset_account', width: 90, hozAlign: 'center' },
    { title: '취득일', field: 'acq_date', width: 96 },
    { title: '취득가액', field: 'acq_cost', width: 110, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
    { title: '내용연수', field: 'life_years', width: 74, hozAlign: 'right', formatter: c => `${c.getValue()}년` },
    { title: '월상각액', field: '_monthly', width: 100, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
    { title: '미상각잔액', field: '_book', width: 110, hozAlign: 'right', formatter: c => fmtWon(Number(c.getValue() ?? 0)) },
    {
      title: '삭제', width: 56, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link danger">삭제</span>',
      cellClick: (e, cell) => { e.stopPropagation(); setConfirmDel(cell.getRow().getData() as FixedAsset); },
    },
  ];

  return (
    <div className="screen fa-screen">
      <div className="screen-bar">
        <div className="search-group">
          <input className="input" style={{ width: 220 }} placeholder="자산코드/자산명 검색"
            value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn" onClick={() => loadAssets()}>검색(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn primary" onClick={() => setEditing(emptyAsset())}>신규(F2)</button>
        </div>
      </div>

      <div className="screen-grid" style={{ minHeight: 220 }}>
        <DataGrid<FixedAsset> columns={columns} data={gridData}
          onRowClick={r => selectAsset(r)} onRowDblClick={r => setEditing({ ...r })} />
      </div>

      {schedule && (
        <div className="fa-schedule">
          <div className="fa-schedule-head">
            <b>{schedule.asset.code} · {schedule.asset.name}</b>
            <span>월상각액 {fmtWon(schedule.monthly_dep)}</span>
            <span>총상각액 {fmtWon(schedule.total_dep)}</span>
            <span>상각완료월 {schedule.rows[schedule.rows.length - 1]?.ym ?? '-'}</span>
          </div>
          <div className="fa-schedule-scroll">
            <table className="stmt-table">
              <thead>
                <tr><th>월</th><th className="num">당월상각</th><th className="num">누계</th><th className="num">미상각잔액</th></tr>
              </thead>
              <tbody>
                {schedule.rows.map(r => (
                  <tr key={r.ym}>
                    <td>{r.ym}</td>
                    <td className="num">{fmtWon(r.dep)}</td>
                    <td className="num">{fmtWon(r.accum)}</td>
                    <td className="num">{fmtWon(r.book_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="fa-dep-section">
        <div className="screen-bar">
          <div className="search-group">
            <span>기간</span>
            <input className="input" type="date" style={{ width: 140 }} value={depFrom} onChange={e => setDepFrom(e.target.value)} />
            <span>~</span>
            <input className="input" type="date" style={{ width: 140 }} value={depTo} onChange={e => setDepTo(e.target.value)} />
            <button className="btn" onClick={() => loadDep()}>조회(F3)</button>
          </div>
          <div className="btn-group">
            {PERIOD_PRESETS.map(p => <button key={p} className="btn small" onClick={() => depPreset(p)}>{p}</button>)}
          </div>
        </div>

        {depReport && (
          <p className="hint dep-summary">
            자산 <b>{depReport.totals.asset_count}</b>건 · 기간상각 합계 <b>{fmtWon(depReport.totals.dep_in_range)}</b> ·
            {' '}{depTo} 기준 누계 <b>{fmtWon(depReport.totals.accum_to)}</b>
          </p>
        )}

        <div className="dep-tables">
          <table className="stmt-table dep-table">
            <thead>
              <tr><th>자산코드</th><th>자산명</th><th>자산계정</th>
                <th className="num">월상각액</th><th className="num">기간상각</th><th className="num">누계</th><th className="num">잔액</th></tr>
            </thead>
            <tbody>
              {(depReport?.by_asset ?? []).map(r => (
                <tr key={r.code}>
                  <td>{r.code}</td><td>{r.name}</td><td>{r.asset_account}</td>
                  <td className="num">{fmtWon(r.monthly_dep)}</td>
                  <td className="num">{fmtWon(r.dep_in_range)}</td>
                  <td className="num">{fmtWon(r.accum_to)}</td>
                  <td className="num">{fmtWon(r.book_value)}</td>
                </tr>
              ))}
              {!depReport?.by_asset.length && <tr><td colSpan={7} className="empty-cell">등록된 고정자산이 없습니다</td></tr>}
            </tbody>
          </table>

          <table className="stmt-table dep-table">
            <thead><tr><th>월</th><th className="num">상각액(전자산 합)</th></tr></thead>
            <tbody>
              {(depReport?.by_month ?? []).map(r => (
                <tr key={r.ym}><td>{r.ym}</td><td className="num">{fmtWon(r.dep)}</td></tr>
              ))}
              {!depReport?.by_month.length && <tr><td colSpan={2} className="empty-cell">해당 기간 상각 내역이 없습니다</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint">감가상각 자동분개는 제공하지 않습니다(조회·계산 전용).</p>

      {editing && (
        <Modal title={`고정자산 ${editing.id ? '수정' : '신규'}`} onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" onClick={save}>저장</button>
            </>
          }>
          <div className="form-grid">
            <label>
              <span className="form-label">자산코드<em className="req">*</em></span>
              <input className="input" placeholder="예: A001" value={String(editing.code ?? '')}
                onChange={e => setEditing({ ...editing, code: e.target.value })} />
            </label>
            <label>
              <span className="form-label">자산명<em className="req">*</em></span>
              <input className="input" value={String(editing.name ?? '')}
                onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label>
              <span className="form-label">자산계정</span>
              <select className="input" value={String(editing.asset_account ?? '비품')}
                onChange={e => setEditing({ ...editing, asset_account: e.target.value })}>
                {ASSET_ACCOUNTS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label>
              <span className="form-label">취득일</span>
              <input className="input" type="date" value={String(editing.acq_date ?? todayISO())}
                onChange={e => setEditing({ ...editing, acq_date: e.target.value })} />
            </label>
            <label>
              <span className="form-label">취득가액(원)</span>
              <input className="input" type="number" step={100} value={String(editing.acq_cost ?? 0)}
                onChange={e => setEditing({ ...editing, acq_cost: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label>
              <span className="form-label">잔존가치(원)</span>
              <input className="input" type="number" step={100} value={String(editing.salvage_value ?? 0)}
                onChange={e => setEditing({ ...editing, salvage_value: parseInt(e.target.value, 10) || 0 })} />
            </label>
            <label>
              <span className="form-label">내용연수(년)</span>
              <input className="input" type="number" step={1} value={String(editing.life_years ?? 5)}
                onChange={e => setEditing({ ...editing, life_years: parseInt(e.target.value, 10) || 1 })} />
            </label>
            <label className="span2">
              <span className="form-label">메모</span>
              <textarea className="input" rows={3} value={String(editing.memo ?? '')}
                onChange={e => setEditing({ ...editing, memo: e.target.value })} />
            </label>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm text={`정말 삭제할까요?\n(${confirmDel.name})`} onYes={doDelete} onNo={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

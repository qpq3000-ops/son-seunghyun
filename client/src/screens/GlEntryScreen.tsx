import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, todayISO, monthStartISO } from '../format';
import type { GlEntry, GlLine } from '../types';

// 일반전표(경비) — 설계-잔여메뉴.md 4.4 ⭐ 가장 중요한 화면.
// 입력부(수동 분개, 원천 전표 없는 독립 분개) + 조회부(기간 목록·삭제) 한 화면.
// journal/journal_line에 entry_type='일반'으로 그대로 들어가므로 분개장·월별손익·거래처원장에 자동 합류한다(마이그레이션 006).

interface LineForm {
  account_code: string;
  account_name: string;
  dr: number;
  cr: number;
  partner_id: number | null;
  partner_name: string;
  remarks: string;
}
const emptyLine = (): LineForm => ({ account_code: '', account_name: '', dr: 0, cr: 0, partner_id: null, partner_name: '', remarks: '' });

type HelpTarget = { idx: number; kind: 'account' | 'partner' } | null;

export function GlEntryScreen() {
  const toast = useToast();

  // ── 입력부 ──
  const [ioDate, setIoDate] = useState(todayISO());
  const [summary, setSummary] = useState('');
  const [lines, setLines] = useState<LineForm[]>([emptyLine(), emptyLine()]);
  const [help, setHelp] = useState<HelpTarget>(null);
  const [saving, setSaving] = useState(false);

  // ── 조회부 ──
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [entries, setEntries] = useState<GlEntry[]>([]);
  const [sel, setSel] = useState<GlEntry | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const loadList = useCallback(async (f = from, t = to) => {
    try {
      setEntries(await api.get<GlEntry[]>(`/api/gl-entries?from=${f}&to=${t}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, toast]);

  useEffect(() => { loadList(); }, [loadList]);

  // 차변/대변 동시 입력 방지: 한쪽 입력 시 다른 쪽은 0으로 강제(설계 4.4)
  const setDr = (idx: number, v: number) => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, dr: v, cr: v > 0 ? 0 : l.cr } : l)));
  const setCr = (idx: number, v: number) => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, cr: v, dr: v > 0 ? 0 : l.dr } : l)));
  const setRemarks = (idx: number, v: string) => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, remarks: v } : l)));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const selectAccount = (idx: number, r: { id: number; code: string; name: string }) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, account_code: r.code, account_name: r.name } : l)));
  const selectPartner = (idx: number, r: { id: number; code: string; name: string }) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, partner_id: r.id, partner_name: r.name } : l)));
  const clearPartner = (idx: number) => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, partner_id: null, partner_name: '' } : l)));

  const validLines = useMemo(() => lines.filter(l => l.account_code && (l.dr > 0 || l.cr > 0)), [lines]);
  const sumDr = useMemo(() => validLines.reduce((s, l) => s + l.dr, 0), [validLines]);
  const sumCr = useMemo(() => validLines.reduce((s, l) => s + l.cr, 0), [validLines]);
  const diff = sumDr - sumCr;
  const balanced = diff === 0 && validLines.length >= 2;

  const resetForm = () => {
    setSummary('');
    setLines([emptyLine(), emptyLine()]);
  };

  const save = async () => {
    if (!ioDate) { toast.show('일자를 입력하세요.', 'error'); return; }
    if (!balanced) { toast.show('차변합계와 대변합계가 일치해야 저장할 수 있습니다.', 'error'); return; }
    setSaving(true);
    try {
      const body = {
        io_date: ioDate,
        summary,
        lines: validLines.map(l => ({
          account_code: l.account_code, dr: l.dr, cr: l.cr, partner_id: l.partner_id, remarks: l.remarks,
        })),
      };
      const res = await api.post<{ id: number; doc_no: string }>('/api/gl-entries', body);
      toast.show(`전표 ${res.doc_no} 저장`);
      resetForm();
      loadList();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (delId === null) return;
    try {
      await api.del(`/api/gl-entries/${delId}`);
      toast.show('삭제되었습니다.');
      if (sel?.id === delId) setSel(null);
      loadList();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setDelId(null);
    }
  };

  const columns: ColumnDefinition[] = [
    { title: '일자', field: 'io_date', width: 100 },
    { title: '전표번호', field: 'doc_no', width: 120 },
    { title: '적요', field: 'summary', minWidth: 180 },
    {
      title: '금액', field: 'amount', width: 110, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '삭제', width: 56, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link danger">삭제</span>',
      cellClick: (e, cell) => { e.stopPropagation(); setDelId((cell.getData() as GlEntry).id); },
    },
  ];

  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <p className="hint">
        경비·대체 분개를 직접 입력합니다. 저장 시 분개장·월별손익(판매관리비)·거래처원장에 자동 반영됩니다.
      </p>

      {/* 입력 헤더 (RoastInput의 voucher-head 레이아웃 재사용) */}
      <div className="voucher-head">
        <div className="vh-title">일반전표 입력</div>
        <div className="vh-fields">
          <label>일자
            <input className="input" type="date" value={ioDate} onChange={e => setIoDate(e.target.value)} />
          </label>
          <label className="grow">적요
            <input className="input" value={summary} onChange={e => setSummary(e.target.value)} />
          </label>
        </div>
      </div>

      <table className="voucher-lines">
        <thead>
          <tr>
            <th style={{ width: 36 }}>No</th>
            <th style={{ width: 130 }}>계정</th>
            <th style={{ width: 110 }}>차변</th>
            <th style={{ width: 110 }}>대변</th>
            <th style={{ width: 130 }}>거래처</th>
            <th>적요</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td>
                <input className="cell lookup" readOnly value={l.account_name}
                  placeholder="선택" onClick={() => setHelp({ idx: i, kind: 'account' })} />
              </td>
              <td>
                <input className="cell num" type="number" step={1} value={l.dr || ''}
                  onChange={e => setDr(i, parseInt(e.target.value, 10) || 0)} />
              </td>
              <td>
                <input className="cell num" type="number" step={1} value={l.cr || ''}
                  onChange={e => setCr(i, parseInt(e.target.value, 10) || 0)} />
              </td>
              <td style={{ display: 'flex', alignItems: 'center' }}>
                <input className="cell lookup" readOnly value={l.partner_name}
                  placeholder="선택(선택)" onClick={() => setHelp({ idx: i, kind: 'partner' })} />
                {l.partner_name && (
                  <button className="icon-btn" title="거래처 해제" onClick={() => clearPartner(i)}>✕</button>
                )}
              </td>
              <td>
                <input className="cell" value={l.remarks} onChange={e => setRemarks(i, e.target.value)} />
              </td>
              <td>
                <button className="icon-btn" title="라인 삭제" onClick={() => removeLine(i)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={7}><button className="btn small" onClick={addLine}>+ 라인 추가</button></td></tr>
        </tfoot>
      </table>

      <div className={`gl-balance ${diff !== 0 ? 'off' : (validLines.length >= 2 ? 'on' : '')}`}>
        <span>차변합계 <b>{fmtWon(sumDr)}</b></span>
        <span>대변합계 <b>{fmtWon(sumCr)}</b></span>
        <span className={diff !== 0 ? 'danger-text' : ''}>차액 <b>{fmtWon(diff)}</b></span>
      </div>

      <div className="voucher-actions">
        <button className="btn primary" disabled={saving || !balanced} onClick={save}>
          {saving ? '저장 중...' : '저장(F8)'}
        </button>
      </div>

      {/* 조회부 */}
      <div style={{ marginTop: 20 }}>
        <div className="screen-bar">
          <div className="search-group">
            <span>기간</span>
            <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
            <span>~</span>
            <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
            <button className="btn" onClick={() => loadList()}>검색(F3)</button>
          </div>
          <div className="btn-group">
            <button className="btn" onClick={() => gridRef.current?.download('xlsx', '일반전표.xlsx', { sheetName: '일반전표' })}>
              엑셀
            </button>
          </div>
        </div>
        <DataGrid<GlEntry> columns={columns} data={entries} height={260} rowNumbers
          onRowClick={r => setSel(r)} gridRef={t => { gridRef.current = t; }} />
      </div>

      {sel && (
        <div className="detail-panel">
          <div className="dp-title">{sel.doc_no} · {sel.io_date} · {sel.summary}</div>
          <table className="mini-table">
            <thead>
              <tr><th>계정</th><th className="num">차변</th><th className="num">대변</th><th>거래처</th><th>적요</th></tr>
            </thead>
            <tbody>
              {sel.lines.map((l: GlLine, i: number) => (
                <tr key={i}>
                  <td>{l.account_name ?? l.account_code}</td>
                  <td className="num">{l.dr ? fmtWon(l.dr) : ''}</td>
                  <td className="num">{l.cr ? fmtWon(l.cr) : ''}</td>
                  <td>{l.partner_name ?? ''}</td>
                  <td>{l.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {help?.kind === 'account' && (
        <CodeHelp title="계정과목" endpoint="/api/accounts" onClose={() => setHelp(null)}
          onSelect={r => selectAccount(help.idx, r)} />
      )}
      {help?.kind === 'partner' && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(null)}
          onSelect={r => selectPartner(help.idx, r)} />
      )}
      {delId !== null && (
        <Confirm text="이 일반전표를 삭제할까요?" onNo={() => setDelId(null)} onYes={doDelete} />
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset, todayISO, PERIOD_PRESETS } from '../format';
import { useToast } from '../components/Toast';
import type { EtaxList } from '../types';

// 전자세금계산서 진행단계 대장 — 설계-R4-세무회계2.md §4.3.
// 판매 과세 전표를 doc LEFT JOIN tax_invoice_status로 항상 전량 표시(미발행 행은 저장 안 함, §3.3).
// TODO(국세청 연동): 발행 → 홈택스 전송 → 승인번호(approval_no) 수신 → status='전송완료'. R6+ 연동 예정.
// [국세청 전송]은 항상 비활성(stub). [전송예정 표시]는 로컬 상태 변경만 하는 활성 버튼.

const STATUS_FILTERS = ['전체', '미발행', '발행', '전송예정', '전송완료'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];
// 전송완료는 국세청 연동 전용(서버가 로컬 변경 거부, §3.3) — 셀렉트에서 제외
const ROW_STATUS_OPTIONS = ['미발행', '발행', '전송예정'] as const;

export function EtaxInvoiceScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState<StatusFilter>('전체');
  const [data, setData] = useState<EtaxList | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());

  const load = useCallback(async (f = from, t = to, s = status) => {
    try {
      const qs = new URLSearchParams({ from: f, to: t });
      if (s !== '전체') qs.set('status', s);
      setData(await api.get<EtaxList>(`/api/tax-invoices?${qs.toString()}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, status, toast]);

  useEffect(() => { load(); }, [load]);

  const preset = (kind: string) => {
    const { from: f, to: t } = periodPreset(kind);
    setFrom(f); setTo(t);
    load(f, t, status);
  };

  const filterBy = (s: StatusFilter) => { setStatus(s); load(from, to, s); };

  const changeStatus = async (docId: number, next: string) => {
    try {
      await api.put(`/api/tax-invoices/${docId}`, { status: next });
      toast.show('상태가 변경되었습니다.');
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const markPending = async () => {
    if (!sel.size) { toast.show('선택된 전표가 없습니다.', 'error'); return; }
    try {
      for (const docId of sel) await api.put(`/api/tax-invoices/${docId}`, { status: '전송예정' });
      toast.show(`${sel.size}건을 전송예정으로 표시했습니다.`);
      setSel(new Set());
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const toggleSel = (docId: number) => {
    setSel(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  };

  const rows = data?.rows ?? [];
  const counts = data?.counts ?? {};

  return (
    <div className="screen etax-screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <select className="input" style={{ width: 100 }} value={status} onChange={e => filterBy(e.target.value as StatusFilter)}>
            {STATUS_FILTERS.map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn" onClick={() => load()}>조회(F3)</button>
        </div>
        <div className="btn-group">
          {PERIOD_PRESETS.map(p => <button key={p} className="btn small" onClick={() => preset(p)}>{p}</button>)}
        </div>
      </div>

      {/* 단계별 배지 행(counts) — 클릭 시 상태 필터 */}
      <div className="etax-badges">
        {STATUS_FILTERS.map(s => (
          <button key={s} className={`etax-badge ${status === s ? 'on' : ''}`} onClick={() => filterBy(s)}>
            {s} <b>{counts[s] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className="screen-grid" style={{ overflow: 'auto' }}>
        <table className="stmt-table">
          <thead>
            <tr>
              <th style={{ width: 26 }}></th>
              <th style={{ width: 90 }}>일자</th>
              <th style={{ width: 120 }}>전표번호</th>
              <th>거래처</th>
              <th style={{ width: 110 }}>사업자번호</th>
              <th>품목요약</th>
              <th className="num" style={{ width: 100 }}>공급가액</th>
              <th className="num" style={{ width: 90 }}>세액</th>
              <th className="num" style={{ width: 100 }}>합계</th>
              <th style={{ width: 100 }}>상태</th>
              <th style={{ width: 140 }}>메모</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.doc_id}>
                <td className="ctr">
                  <input type="checkbox" className="check" checked={sel.has(r.doc_id)} onChange={() => toggleSel(r.doc_id)} />
                </td>
                <td>{r.io_date}</td>
                <td>{r.doc_no}</td>
                <td>{r.partner_name ?? '(거래처 미지정)'}</td>
                <td>{r.biz_no}</td>
                <td>{r.item_summary}</td>
                <td className="num">{fmtWon(r.supply)}</td>
                <td className="num">{fmtWon(r.vat)}</td>
                <td className="num">{fmtWon(r.total)}</td>
                <td>
                  <select className="input" value={r.status} onChange={e => changeStatus(r.doc_id, e.target.value)}>
                    {ROW_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    {r.status === '전송완료' && <option value="전송완료">전송완료</option>}
                  </select>
                </td>
                <td>{r.memo}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={11} className="empty-cell">해당 기간 과세 판매전표가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="voucher-actions">
        <button className="btn" onClick={markPending}>전송예정 표시</button>
        <button className="btn stub-btn" disabled title="공동인증서 국세청 연동 예정">국세청 전송</button>
      </div>
    </div>
  );
}

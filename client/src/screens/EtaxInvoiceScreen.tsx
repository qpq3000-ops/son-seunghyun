import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset, todayISO, PERIOD_PRESETS } from '../format';
import { useToast } from '../components/Toast';
import type { EtaxList } from '../types';

// 전자세금계산서 진행단계 대장 — 설계-R4-세무회계2.md §4.3 + 설계-R9-실물매칭.md §4(실물 상태보드/5단계 인디케이터/하단 11버튼).
// 판매 과세 전표를 doc LEFT JOIN tax_invoice_status로 항상 전량 표시(미발행 행은 저장 안 함, §3.3).
// TODO(국세청 연동): 발행 → 홈택스 전송 → 승인번호(approval_no) 수신 → status='전송완료'. R6+ 연동 예정.
// [국세청 전송류]는 항상 비활성(stub). [발행 ▲]은 기존 전송예정 표시(markPending) 로컬 상태 변경만 하는 활성 버튼.

const STATUS_FILTERS = ['전체', '미발행', '발행', '전송예정', '전송완료'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];
// 전송완료는 국세청 연동 전용(서버가 로컬 변경 거부, §3.3) — 셀렉트에서 제외
const ROW_STATUS_OPTIONS = ['미발행', '발행', '전송예정'] as const;

// 실물 상태보드(설계 §4.1) — 그룹헤더 4개 아래 카운트 박스 14개. 우리 데이터에 개념이 없는 박스는 0/disabled.
// 그룹 배정(전송대기/결과대기/전송완료/기타)은 실측 문서에 세부 매핑이 없어 이름 의미로 근사 배정.
const BOX_COUNT_MAP: Partial<Record<string, StatusFilter>> = {
  '전체': '전체', '미발행': '미발행', '발행중': '발행', 'Email예약': '전송예정', 'Email발송완료': '전송완료',
};
const BOARD_GROUPS: { header: string; boxes: { key: string; err?: boolean }[] }[] = [
  { header: '전송대기', boxes: [{ key: '전체' }, { key: '생성오류', err: true }, { key: '국세청오류', err: true }, { key: '미발행' }] },
  { header: '결과대기', boxes: [{ key: '발행중' }, { key: 'Email예약' }, { key: 'Email미예약' }, { key: '10분미만' }] },
  { header: '전송완료', boxes: [{ key: 'Email미발송' }, { key: 'Email발송실패' }, { key: 'Email발송완료' }] },
  { header: '기타', boxes: [{ key: '종이' }, { key: '타발행' }, { key: '기한후발행' }] },
];

// 5단계 점 인디케이터(설계 §4.2) — status→채움 인덱스
const stepFilled = (status: string): number => {
  if (status === '발행') return 1;
  if (status === '전송예정') return 3;
  if (status === '전송완료') return 5;
  return 0; // 미발행
};

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

  const downloadExcel = () => {
    const sheetRows = rows.map(r => ({
      일자: r.io_date, 전표번호: r.doc_no, 거래처: r.partner_name ?? '', 공급가액: r.supply, 부가세: r.vat, 합계: r.total,
      진행단계: r.status === '전송완료' ? 'Email발송완료' : r.status, 승인번호: r.approval_no,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '계산서진행단계');
    XLSX.writeFile(wb, '계산서진행단계.xlsx');
  };

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

      {/* 실물 상태 요약 보드(설계 §4.1) — 그룹헤더 4개 + 카운트 박스 14개, 클릭 시 상태 필터(매핑된 5개만 활성) */}
      <div className="r9-etax-board">
        {BOARD_GROUPS.map(g => (
          <div key={g.header} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="r9-etax-group">{g.header}</span>
            {g.boxes.map(b => {
              const mapped = BOX_COUNT_MAP[b.key];
              const count = mapped ? (counts[mapped] ?? 0) : 0;
              const active = mapped ? status === mapped : false;
              return (
                <button
                  key={b.key}
                  className={`r9-etax-box${active ? ' on' : ''}${b.err ? ' err' : ''}`}
                  disabled={!mapped}
                  title={mapped ? undefined : '국세청 연동 시 집계됩니다'}
                  onClick={() => { if (mapped) filterBy(mapped); }}
                >
                  <b>{count}</b>
                  <span>{b.key}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="screen-grid" style={{ overflow: 'auto' }}>
        <table className="stmt-table">
          <thead>
            <tr>
              <th style={{ width: 26 }}></th>
              <th style={{ width: 40 }}>순번</th>
              <th style={{ width: 110 }}>일자-No.</th>
              <th style={{ width: 90 }}>발행일자</th>
              <th>거래처명</th>
              <th className="num" style={{ width: 100 }}>공급가액</th>
              <th className="num" style={{ width: 90 }}>부가세</th>
              <th className="num" style={{ width: 100 }}>합계금액</th>
              <th style={{ width: 54 }}>종류</th>
              <th style={{ width: 190 }}>전자(세금)계산서 진행단계</th>
              <th style={{ width: 160 }}>단계별기능</th>
              <th style={{ width: 130 }}>승인번호</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.doc_id}>
                <td className="ctr">
                  <input type="checkbox" className="check" checked={sel.has(r.doc_id)} onChange={() => toggleSel(r.doc_id)} />
                </td>
                <td className="num sub">{i + 1}</td>
                <td style={{ color: 'var(--r8-link)' }}>{r.io_date.split('-').join('/')} -{r.doc_no.split('-')[1] ?? r.doc_no}</td>
                <td>{r.issued_at ? r.issued_at.split('-').join('/') : ''}</td>
                <td>{r.partner_name ?? '(거래처 미지정)'}</td>
                <td className="num">{fmtWon(r.supply)}</td>
                <td className="num">{fmtWon(r.vat)}</td>
                <td className="num">{fmtWon(r.total)}</td>
                <td className="ctr">전자</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="r9-etax-steps">
                      {[0, 1, 2, 3, 4].map(d => <i key={d} className={`r9-etax-dot${d < stepFilled(r.status) ? ' fill' : ''}`} />)}
                    </span>
                    <span>{r.status === '전송완료' ? 'Email발송완료' : r.status}</span>
                  </div>
                  <select className="input" style={{ width: 110, marginTop: 4 }} value={r.status} onChange={e => changeStatus(r.doc_id, e.target.value)}>
                    {ROW_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    {r.status === '전송완료' && <option value="전송완료">전송완료</option>}
                  </select>
                </td>
                <td>
                  <span className="link" title="Email 재발송은 국세청 연동 예정입니다">Email재발송</span>
                  {' '}
                  <span className="link" title="수정(세금)계산서 발행은 국세청 연동 예정입니다">수정(세금)계산서</span>
                </td>
                <td>{r.approval_no}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={12} className="empty-cell">해당 기간 과세 판매전표가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 하단 버튼바(설계 §4.3) — 국세청 전송류는 전부 disabled+stub, Excel만 실제 */}
      <div className="r8-report-bottom">
        <span>
          <button className="btn r8-primary r8-split" onClick={markPending}>발행</button>
          <button className="btn r8-split-caret">▲</button>
        </span>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">발행취소</button>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">매출전표Ⅰ생성 ▲</button>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">즉시전송</button>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">Email ▲</button>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">Email예약</button>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">Email예약취소</button>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">인쇄 ▲</button>
        <button className="btn r8-ghost" disabled title="국세청 연동 예정입니다">인증서관리</button>
        <button className="btn r8-ghost" onClick={downloadExcel}>Excel</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">자동알림</button>
      </div>
    </div>
  );
}

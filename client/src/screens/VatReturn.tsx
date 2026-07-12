import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, monthStartISO, todayISO } from '../format';
import { useToast } from '../components/Toast';
import { ReportFooter } from '../components/ReportScreen';
import type { VatReturnData, Settings } from '../types';

// 부가가치세신고서(서식형+인쇄) — 설계-R4-세무회계2.md §4.1.
// PnlStatement.tsx의 검색바/인쇄 패턴을 그대로 따른다. 숫자는 매입매출장(VatBook, accounting.mjs)과
// 동일한 doc 집계이므로(§3.1) 두 화면 숫자가 항상 일치한다 — journal에서 다시 집계하지 않는다.
// [국세청 전송]은 항상 비활성(stub) — 홈택스 전자신고 연동은 R6+ 예정.

type PeriodKind = '1기예정' | '1기확정' | '2기예정' | '2기확정' | '상반기' | '하반기' | '직접입력';
const PERIOD_KINDS: PeriodKind[] = ['1기예정', '1기확정', '2기예정', '2기확정', '상반기', '하반기', '직접입력'];

// 과세기간 프리셋 — VatReturn 전용 로컬 헬퍼(format.ts는 R4 클라 파일 목록에 없어 여기 둔다, 설계 §4.1)
function vatPeriodPreset(kind: PeriodKind, year: number): { from: string; to: string } {
  const mm = (m: number) => String(m).padStart(2, '0');
  const lastDay = (m: number) => new Date(year, m, 0).getDate(); // m=1~12
  const range = (f: number, t: number) => ({
    from: `${year}-${mm(f)}-01`,
    to: `${year}-${mm(t)}-${String(lastDay(t)).padStart(2, '0')}`,
  });
  switch (kind) {
    case '1기예정': return range(1, 3);
    case '1기확정': return range(4, 6);
    case '2기예정': return range(7, 9);
    case '2기확정': return range(10, 12);
    case '상반기': return range(1, 6);
    case '하반기': return range(7, 12);
    default: return { from: monthStartISO(), to: todayISO() };
  }
}

export function VatReturn() {
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [kind, setKind] = useState<PeriodKind>('직접입력');
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<VatReturnData | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [queriedAt, setQueriedAt] = useState<Date>(() => new Date());

  useEffect(() => { api.get<Settings>('/api/settings').then(setSettings).catch(() => {}); }, []);

  const search = useCallback(async (f = from, t = to) => {
    try {
      setData(await api.get<VatReturnData>(`/api/vat-return?from=${f}&to=${t}`));
      setQueriedAt(new Date());
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  // 마운트 시 1회 자동조회(기본 기간: 이번달 1일~오늘)
  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 이카운트 단축키: F8 조회
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); search(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search]);

  const applyPreset = (k: PeriodKind, y = year) => {
    setKind(k);
    if (k === '직접입력') return;
    const { from: f, to: t } = vatPeriodPreset(k, y);
    setFrom(f); setTo(t);
    search(f, t);
  };

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const companyName = settings.company_name || data?.company_name || '';
  const companyBizNo = settings.company_biz_no || data?.company_biz_no || '';
  const companyCeo = settings.company_ceo || data?.company_ceo || '';

  return (
    <div className="screen vat-screen">
      <div className="stmt-search">
        <div className="stmt-cond">
          <label>과세기간</label>
          <select className="input w-140" value={year}
            onChange={e => { const y = Number(e.target.value); setYear(y); if (kind !== '직접입력') applyPreset(kind, y); }}>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="input w-140" value={kind} onChange={e => applyPreset(e.target.value as PeriodKind)}>
            {PERIOD_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input className="input w-140" type="date" value={from} onChange={e => { setFrom(e.target.value); setKind('직접입력'); }} />
          <span>~</span>
          <input className="input w-140" type="date" value={to} onChange={e => { setTo(e.target.value); setKind('직접입력'); }} />
          <button className="btn r8-primary" style={{ marginLeft: 14 }} onClick={() => search()}>조회(F8)</button>
          <button className="btn" onClick={() => window.print()} disabled={!data}>인쇄</button>
          <button className="btn stub-btn" disabled title="국세청 연동 예정입니다">국세청 전송</button>
        </div>
      </div>

      {data && (
        <>
          <VatSheet data={data} companyName={companyName} companyBizNo={companyBizNo} companyCeo={companyCeo} />
          <ReportFooter at={queriedAt} />
          {/* 인쇄 전용 사본 (StatementPrint의 인쇄 패턴 재사용) */}
          <div className="print-only">
            <div className="print-sheet">
              <VatSheet data={data} companyName={companyName} companyBizNo={companyBizNo} companyCeo={companyCeo} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function VatSheet({ data, companyName, companyBizNo, companyCeo }: {
  data: VatReturnData; companyName: string; companyBizNo: string; companyCeo: string;
}) {
  const dot = (s: string) => s.split('-').join('/');
  const isRefund = data.payable < 0;
  return (
    <div className="vat-sheet">
      <div className="vat-title r8-report-title">부 가 가 치 세 신 고 서</div>
      <div className="vat-meta r8-report-meta">
        <span>상호 : {companyName || '(환경설정에서 상호 입력)'}</span>
        <span>사업자등록번호 : {companyBizNo || '-'}</span>
        <span>성명 : {companyCeo || '-'}</span>
      </div>
      <div className="vat-meta">
        <span>과세기간 : {dot(data.from)} ~ {dot(data.to)}</span>
        <span>매출 {data.sales.count}건 · 매입 {data.purchase.count}건</span>
      </div>
      <table className="vat-table">
        <thead>
          <tr><th>구분</th><th>항목</th><th className="num">금액</th><th className="num">세액</th></tr>
        </thead>
        <tbody>
          <tr>
            <td rowSpan={4} className="vat-sec">① 과세표준<br />및 매출세액</td>
            <td>(1) 과세 · 세금계산서 발급분</td>
            <td className="num">{fmtWon(data.sales.taxable_supply)}</td>
            <td className="num">{fmtWon(data.sales_vat)}</td>
          </tr>
          <tr>
            <td>(5) 영세율(해당없음)</td>
            <td className="num">0</td>
            <td className="num">0</td>
          </tr>
          <tr>
            <td>(7) 면세수입금액(참고)</td>
            <td className="num">{fmtWon(data.sales.free_supply)}</td>
            <td className="num">—</td>
          </tr>
          <tr className="vat-emph">
            <td>과세표준 및 매출세액 합계(A)</td>
            <td className="num">{fmtWon(data.tax_base)}</td>
            <td className="num">{fmtWon(data.sales_vat)}</td>
          </tr>

          <tr>
            <td rowSpan={3} className="vat-sec">② 매입세액</td>
            <td>(10) 세금계산서 수취분 · 일반매입</td>
            <td className="num">{fmtWon(data.purchase.taxable_supply)}</td>
            <td className="num">{fmtWon(data.purchase_vat)}</td>
          </tr>
          <tr>
            <td>(11) 면세 매입(참고)</td>
            <td className="num">{fmtWon(data.purchase.free_supply)}</td>
            <td className="num">—</td>
          </tr>
          <tr className="vat-emph">
            <td>매입세액 합계(B)</td>
            <td className="num">—</td>
            <td className="num">{fmtWon(data.purchase_vat)}</td>
          </tr>

          <tr className="vat-emph vat-final">
            <td colSpan={2}><b>③ 차가감 납부(환급)세액 (A－B)</b></td>
            <td colSpan={2} className={`num${isRefund ? ' danger-text' : ''}`}>
              <b>{fmtWon(Math.abs(data.payable))}{isRefund ? ' (환급)' : ''}</b>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="vat-note hint">본 신고서는 매입매출장(회계Ⅰ)과 동일 자료로 자동 집계됩니다. 국세청 전자신고 전송은 연동 예정입니다.</p>
    </div>
  );
}

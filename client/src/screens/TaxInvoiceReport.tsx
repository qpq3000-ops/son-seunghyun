import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset, todayISO, PERIOD_PRESETS } from '../format';
import { useToast } from '../components/Toast';
import type { TaxInvoiceReportData, TaxInvoiceSide, Settings } from '../types';

// 세금계산서합계표(서식형+인쇄) — 설계-R4-세무회계2.md §4.2.
// StatementPrint.tsx의 검색바/인쇄 패턴을 따른다. 매출/매입 각각 과세 거래처별 매수·공급가액·세액을 집계한다.
// 매출 블록 합계(=totals.supply/vat)는 부가세신고서(VatReturn)의 과세표준/매출세액과 항상 일치(§5.2 대조 지점).
// 첨부서류 성격이라 외부 전송 버튼은 없다(전송 stub 불필요).

export function TaxInvoiceReport() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<TaxInvoiceReportData | null>(null);
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => { api.get<Settings>('/api/settings').then(setSettings).catch(() => {}); }, []);

  const search = useCallback(async (f = from, t = to) => {
    try {
      setData(await api.get<TaxInvoiceReportData>(`/api/tax-invoice-report?from=${f}&to=${t}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, toast]);

  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const companyBizNo = settings.company_biz_no || data?.company_biz_no || '';

  return (
    <div className="screen tax-sum-screen">
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
          <TaxSumSheet data={data} companyName={companyName} companyBizNo={companyBizNo} />
          <div className="print-only">
            <div className="print-sheet">
              <TaxSumSheet data={data} companyName={companyName} companyBizNo={companyBizNo} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TaxSumSheet({ data, companyName, companyBizNo }: {
  data: TaxInvoiceReportData; companyName: string; companyBizNo: string;
}) {
  const dot = (s: string) => s.split('-').join('/');
  return (
    <div className="tax-sum-sheet">
      <TaxSumBlock title="매출처별 세금계산서합계표" side={data.sales}
        companyName={companyName} companyBizNo={companyBizNo} from={data.from} to={data.to} dot={dot} />
      <TaxSumBlock title="매입처별 세금계산서합계표" side={data.purchase}
        companyName={companyName} companyBizNo={companyBizNo} from={data.from} to={data.to} dot={dot} />
    </div>
  );
}

function TaxSumBlock({ title, side, companyName, companyBizNo, from, to, dot }: {
  title: string; side: TaxInvoiceSide; companyName: string; companyBizNo: string;
  from: string; to: string; dot: (s: string) => string;
}) {
  return (
    <div className="tax-sum-block">
      <div className="tax-sum-title">{title}</div>
      <div className="tax-sum-meta">
        <span>상호 : {companyName || '(환경설정에서 상호 입력)'}</span>
        <span>사업자등록번호 : {companyBizNo || '-'}</span>
        <span>과세기간 : {dot(from)} ~ {dot(to)}</span>
      </div>
      <table className="stmt-table">
        <thead>
          <tr>
            <th style={{ width: 44 }}>순번</th>
            <th>거래처명</th>
            <th style={{ width: 120 }}>사업자등록번호</th>
            <th className="num" style={{ width: 70 }}>매수</th>
            <th className="num" style={{ width: 120 }}>공급가액</th>
            <th className="num" style={{ width: 110 }}>세액</th>
          </tr>
        </thead>
        <tbody>
          {side.rows.map((r, i) => (
            <tr key={r.partner_id ?? `none-${i}`}>
              <td className="num sub">{i + 1}</td>
              <td>{r.partner_name}</td>
              <td>{r.biz_no}</td>
              <td className="num">{r.sheet_count}</td>
              <td className="num">{fmtWon(r.supply)}</td>
              <td className="num">{fmtWon(r.vat)}</td>
            </tr>
          ))}
          {!side.rows.length && <tr><td colSpan={6} className="empty-cell">기간 내 과세 거래가 없습니다</td></tr>}
        </tbody>
        {side.rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={2}>거래처 {side.totals.partner_count}</td>
              <td></td>
              <td className="num"><b>{side.totals.sheet_count}</b></td>
              <td className="num"><b>{fmtWon(side.totals.supply)}</b></td>
              <td className="num"><b>{fmtWon(side.totals.vat)}</b></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtWon, fmtQty, monthStartISO, periodPreset, todayISO, wonToKorean } from '../format';
import { CodeHelp } from '../components/CodeHelp';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { Settings } from '../types';

// 거래명세서인쇄 (docs/설계-거래명세서인쇄.md) — 이카운트 실화면 동선:
// 기간 프리셋 검색 → 거래명세표리스트(거래처별 합산) → [상세] → 명세서 팝업(전잔/후잔·한글금액·입금계좌) → 인쇄

interface SummaryRow {
  partner_id: number; partner_name: string; item_summary: string;
  doc_cnt: number; qty: number; supply: number; vat: number; total: number;
}
interface StatementDetail {
  partner: { id: number; name: string; biz_no: string; ceo: string; phone: string; address: string };
  lines: { io_date: string; doc_no: string; item_name: string; spec: string; unit: string; qty: number; price: number; supply: number; vat: number }[];
  totals: { qty: number; supply: number; vat: number; total: number };
  prev_balance: number; receipt_period: number; after_balance: number; last_doc_no: string;
}

export function StatementPrint() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [partner, setPartner] = useState<{ id: number; name: string } | null>(null);
  const [help, setHelp] = useState(false);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => { api.get<Settings>('/api/settings').then(setSettings).catch(() => {}); }, []);

  const search = useCallback(async (f = from, t = to) => {
    try {
      const q = `from=${f}&to=${t}` + (partner ? `&partner_id=${partner.id}` : '');
      setRows(await api.get<SummaryRow[]>(`/api/statements?${q}`));
      setSearched(true);
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, partner, toast]);

  // 이카운트 단축키: F8 검색 (이 화면은 저장이 없음)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); search(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [search]);

  // 기간 프리셋 (이카운트 하단 버튼 바: 금일/전일/금주/전주/금월/전월) — format.ts의 periodPreset()으로 승격(설계-R1-보고서엔진.md)
  const preset = (kind: string) => {
    const { from: f, to: t } = periodPreset(kind);
    setFrom(f); setTo(t);
    search(f, t);
  };

  const openDetail = async (partnerId: number) => {
    try {
      setDetail(await api.get<StatementDetail>(`/api/statements/${partnerId}?from=${from}&to=${to}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const totals = rows.reduce((a, r) => ({ qty: a.qty + r.qty, supply: a.supply + r.supply, vat: a.vat + r.vat, total: a.total + r.total }),
    { qty: 0, supply: 0, vat: 0, total: 0 });

  const dot = (s: string) => s.split('-').join('/');

  return (
    <div className="screen stmt-screen">
      {/* 검색조건 저장 탭 (이카운트 거래명세서인쇄: 기본 / 전체 + 추가) */}
      <div className="cond-tabs">
        <button className="cond-tab on">기본</button>
        <button className="cond-tab add" title="검색조건 추가(Phase 4)">+</button>
      </div>
      {/* 검색조건 (이카운트: 기준일자 + 거래처 + 프리셋 버튼 바) */}
      <div className="stmt-search">
        <div className="stmt-cond">
          <label>기준일자</label>
          <input className="input w-140" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input w-140" type="date" value={to} onChange={e => setTo(e.target.value)} />
          <label style={{ marginLeft: 14 }}>거래처</label>
          <input className="input lookup w-180" readOnly value={partner?.name ?? ''} placeholder="전체"
            onClick={() => setHelp(true)} />
          {partner && <button className="icon-btn" onClick={() => setPartner(null)}>✕</button>}
        </div>
        <div className="stmt-presets">
          <button className="btn primary" onClick={() => search()}>검색(F8)</button>
          <button className="btn" onClick={() => preset('금일')}>금일</button>
          <button className="btn" onClick={() => preset('전일')}>전일</button>
          <button className="btn" onClick={() => preset('금주')}>금주(~오늘)</button>
          <button className="btn" onClick={() => preset('전주')}>전주</button>
          <button className="btn" onClick={() => preset('금월')}>금월(~오늘)</button>
          <button className="btn" onClick={() => preset('전월')}>전월</button>
          <button className="btn" onClick={() => { setFrom(monthStartISO()); setTo(todayISO()); setPartner(null); setRows([]); setSearched(false); }}>다시 작성</button>
        </div>
      </div>

      {/* 거래명세표리스트 */}
      {searched && (
        <div className="stmt-list">
          <h2 className="stmt-list-title">거래명세표리스트</h2>
          <div className="stmt-list-meta">
            <span>회사명 : {settings.company_name || '(환경설정에서 상호 입력)'}</span>
            <span>{dot(from)} ~ {dot(to)}</span>
          </div>
          <table className="stmt-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>거래처명</th><th>품목명[규격명]</th>
                <th className="num" style={{ width: 70 }}>수량</th>
                <th className="num" style={{ width: 110 }}>금액</th>
                <th className="num" style={{ width: 100 }}>부가세</th>
                <th className="num" style={{ width: 110 }}>합계</th>
                <th style={{ width: 54 }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.partner_id}>
                  <td className="num sub">{i + 1}</td>
                  <td>{r.partner_name}</td>
                  <td>{r.item_summary}</td>
                  <td className="num">{fmtQty(r.qty)}</td>
                  <td className="num">{fmtWon(r.supply)}</td>
                  <td className="num">{fmtWon(r.vat)}</td>
                  <td className="num">{fmtWon(r.total)}</td>
                  <td><button className="link" onClick={() => openDetail(r.partner_id)}>상세</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="empty-cell">기간 내 판매 내역이 없습니다</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td></td><td colSpan={2}>합계</td>
                  <td className="num"><b>{fmtQty(totals.qty)}</b></td>
                  <td className="num"><b>{fmtWon(totals.supply)}</b></td>
                  <td className="num"><b>{fmtWon(totals.vat)}</b></td>
                  <td className="num"><b>{fmtWon(totals.total)}</b></td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {help && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(false)}
          onSelect={r => setPartner({ id: r.id, name: r.name })} />
      )}

      {/* 명세서 팝업 (이카운트 파란 타이틀바 팝업) */}
      {detail && (
        <Modal title="거래명세서" width={860} onClose={() => setDetail(null)}
          footer={
            <>
              <button className="btn primary" onClick={() => window.print()}>인쇄</button>
              <button className="btn" onClick={() => setDetail(null)}>닫기</button>
            </>
          }>
          <StatementSheet detail={detail} settings={settings} from={from} to={to} />
        </Modal>
      )}
      {/* 인쇄 전용 사본 */}
      {detail && (
        <div className="print-only">
          <div className="print-sheet">
            <StatementSheet detail={detail} settings={settings} from={from} to={to} />
          </div>
        </div>
      )}
    </div>
  );
}

// 명세서 양식 (이카운트 거래명세서 구성 재현: 貴中/공급자박스/한글금액/품목표/전잔·후잔/입금계좌)
function StatementSheet({ detail, settings, from, to }: {
  detail: StatementDetail; settings: Settings; from: string; to: string;
}) {
  const { partner, lines, totals } = detail;
  return (
    <div className="stmt-sheet">
      <div className="stmt-head">
        <div className="stmt-left">
          <div className="stmt-title">거 래 명 세 서</div>
          <div className="stmt-recv">
            <b>{partner.name} 貴中</b>
            {partner.address && <div>{partner.address}</div>}
            {partner.phone && (
              <div>
                <svg viewBox="0 0 16 16" width="11" height="11" fill="#333" aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 3 }}>
                  <path d="M4.2 2.2 6 2l1.1 2.6-1.3 1a8 8 0 0 0 3.6 3.6l1-1.3L13 9l-.2 1.8a1 1 0 0 1-1.1.85A9.5 9.5 0 0 1 3.35 3.3 1 1 0 0 1 4.2 2.2z" />
                </svg>
                {partner.phone}
              </div>
            )}
            <div className="sub">기간: {from.split('-').join('/')} ~ {to.split('-').join('/')}</div>
          </div>
        </div>
        <table className="stmt-supplier">
          <tbody>
            <tr><th rowSpan={4} className="stmt-sup-label">공<br />급<br />자</th>
              <th>일련번호</th><td>{detail.last_doc_no || '-'}</td><th>TEL</th><td>{settings.company_phone || ''}</td></tr>
            <tr><th>사업자등록번호</th><td>{settings.company_biz_no || ''}</td><th>성명</th><td>{settings.company_ceo || ''}</td></tr>
            <tr><th>상호</th><td colSpan={3}>{settings.company_name || ''}</td></tr>
            <tr><th>주소</th><td colSpan={3}>{settings.company_address || ''}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="stmt-amount">
        <span>금 액 : {wonToKorean(totals.total)}원 정</span>
        <span>(₩{fmtWon(totals.total)})</span>
      </div>

      <table className="stmt-lines">
        <thead>
          <tr><th style={{ width: 56 }}>일자</th><th>품목명[규격]</th><th style={{ width: 90 }}>수량(단위포함)</th>
            <th style={{ width: 80 }}>단가</th><th style={{ width: 95 }}>공급가액</th><th style={{ width: 85 }}>부가세</th></tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="ctr">{l.io_date.slice(5).replace('-', '/')}</td>
              <td>{l.item_name}{l.spec ? ` [${l.spec}]` : ''}</td>
              <td className="num">{fmtQty(l.qty)}{l.unit}</td>
              <td className="num">{fmtWon(l.price)}</td>
              <td className="num">{fmtWon(l.supply)}</td>
              <td className="num">{fmtWon(l.vat)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="stmt-totals">
        <tbody>
          <tr>
            <th>수량</th><td className="num">{fmtQty(totals.qty)}</td>
            <th>공급가액</th><td className="num">{fmtWon(totals.supply)}</td>
            <th>VAT</th><td className="num">{fmtWon(totals.vat)}</td>
            <th>합계</th><td className="num"><b>{fmtWon(totals.total)}</b></td>
            <th className="ctr">인수</th><td className="ctr" style={{ width: 60 }}>(인)</td>
          </tr>
          <tr>
            <th>전잔</th><td className="num">{fmtWon(detail.prev_balance)}</td>
            <th>기간수금</th><td className="num">{fmtWon(detail.receipt_period)}</td>
            <th>후잔</th><td className="num" colSpan={5}><b>{fmtWon(detail.after_balance)}</b></td>
          </tr>
        </tbody>
      </table>

      {settings.bank_account_info && (
        <div className="stmt-bank">
          <div className="stmt-bank-label">입금 계좌</div>
          <div className="stmt-bank-body">{settings.bank_account_info}</div>
        </div>
      )}
    </div>
  );
}

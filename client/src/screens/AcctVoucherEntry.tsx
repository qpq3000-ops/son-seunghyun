import { useState } from 'react';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, todayISO } from '../format';
import type { GlEntrySaveResult } from '../types';

// 매출전표Ⅰ / 매입전표Ⅰ (회계Ⅰ>매출매입거래, §4.3/§12.7) — 신규 화면.
// VoucherForm은 import하지 않는다(설계-R11-입력화면.md §1 겹침 규칙) — GlEntryScreen이 하는 방식대로
// voucher-head/form-grid 등 기존 CSS 클래스만 직접 조립해 POST /api/gl-entries로 균형 분개를 저장한다(§5.1).

type Side = '매출' | '매입';
type VatType = '세금계산서' | '카드' | '현금영수증' | '면세';
type HelpKind = 'partner' | 'acct' | 'bank' | null;

const DEFAULTS: Record<Side, { acctCode: string; acctName: string; bankCode: string; bankName: string }> = {
  매출: { acctCode: '404', acctName: '제품매출', bankCode: '108', bankName: '외상매출금' },
  매입: { acctCode: '153', acctName: '원재료', bankCode: '251', bankName: '외상매입금' },
};

function AcctVoucherForm({ side }: { side: Side }) {
  const toast = useToast();
  const def = DEFAULTS[side];

  const [ioDate, setIoDate] = useState(todayISO());
  const [vatType, setVatType] = useState<VatType>('세금계산서');
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [supply, setSupply] = useState(0);
  const [vat, setVat] = useState(0);
  const [detail, setDetail] = useState('');
  const [summary, setSummary] = useState('');
  const [acctCode, setAcctCode] = useState(def.acctCode);
  const [acctName, setAcctName] = useState(def.acctName);
  const [bankCode, setBankCode] = useState(def.bankCode);
  const [bankName, setBankName] = useState(def.bankName);
  const [receivableNo, setReceivableNo] = useState(todayISO());
  const [fee, setFee] = useState(0);
  const [help, setHelp] = useState<HelpKind>(null);
  const [saving, setSaving] = useState(false);

  // 공급가액 변경 시 부가세 기본값(공급가액×10%) 자동 계산 — '면세' 유형은 항상 0(설계 4.3).
  const onSupplyChange = (v: number) => {
    setSupply(v);
    if (vatType !== '면세') setVat(Math.round(v * 0.1));
  };
  const onVatTypeChange = (v: VatType) => {
    setVatType(v);
    setVat(v === '면세' ? 0 : Math.round(supply * 0.1));
  };

  const resetForm = () => {
    setIoDate(todayISO());
    setVatType('세금계산서');
    setPartnerId(null); setPartnerName('');
    setSupply(0); setVat(0);
    setDetail(''); setSummary('');
    setAcctCode(def.acctCode); setAcctName(def.acctName);
    setBankCode(def.bankCode); setBankName(def.bankName);
    setReceivableNo(todayISO());
    setFee(0);
  };

  const total = supply + vat;

  const save = async () => {
    if (!partnerId) { toast.show('거래처를 선택하세요.', 'error'); return; }
    if (!(supply > 0)) { toast.show('공급가액은 0보다 커야 합니다.', 'error'); return; }
    setSaving(true);
    try {
      const remarks = [detail, receivableNo ? `채권번호:${receivableNo}` : ''].filter(Boolean).join(' ');
      const feeAmt = fee > 0 ? fee : 0;
      const lines: { account_code: string; dr: number; cr: number; partner_id: number | null; remarks: string }[] = [];
      if (side === '매출') {
        // §5.1 매출전표Ⅰ: (차)입금계좌=total-fee[거래처] + (차,fee>0)831지급수수료 + (대)매출계정 + (대,vat>0)255부가세예수금
        lines.push({ account_code: bankCode, dr: total - feeAmt, cr: 0, partner_id: partnerId, remarks });
        if (feeAmt > 0) lines.push({ account_code: '831', dr: feeAmt, cr: 0, partner_id: null, remarks });
        lines.push({ account_code: acctCode, dr: 0, cr: supply, partner_id: null, remarks });
        if (vat > 0) lines.push({ account_code: '255', dr: 0, cr: vat, partner_id: null, remarks });
      } else {
        // §5.1 매입전표Ⅰ: (차)매입계정 + (차,vat>0)135부가세대급금 + (차,fee>0)831지급수수료 + (대)출금계좌=total+fee[거래처]
        lines.push({ account_code: acctCode, dr: supply, cr: 0, partner_id: null, remarks });
        if (vat > 0) lines.push({ account_code: '135', dr: vat, cr: 0, partner_id: null, remarks });
        if (feeAmt > 0) lines.push({ account_code: '831', dr: feeAmt, cr: 0, partner_id: null, remarks });
        lines.push({ account_code: bankCode, dr: 0, cr: total + feeAmt, partner_id: partnerId, remarks });
      }
      const res = await api.post<GlEntrySaveResult>('/api/gl-entries', { io_date: ioDate, summary, lines });
      toast.show(`전표 ${res.doc_no} 저장`);
      resetForm();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // 차변합계=대변합계는 §5.1 조립 규칙상 항상 성립(매출: total, 매입: total+수수료) — 미리보기용(설계 4.3).
  const feePreview = fee > 0 ? fee : 0;
  const balancePreview = side === '매출' ? total : total + feePreview;

  return (
    <div className="voucher">
      <div className="voucher-head">
        <div className="vh-title">{side}전표Ⅰ</div>
      </div>

      <div className="form-grid">
        <label>
          <span className="form-label">전표일자</span>
          <input className="input" type="date" value={ioDate} onChange={e => setIoDate(e.target.value)} />
        </label>
        <label>
          <span className="form-label">연결전표</span>
          <input className="input" readOnly disabled value="없음" />
        </label>
        <label>
          <span className="form-label">부가세유형</span>
          <select className="input" value={vatType} onChange={e => onVatTypeChange(e.target.value as VatType)}>
            <option value="세금계산서">세금계산서</option>
            <option value="카드">카드</option>
            <option value="현금영수증">현금영수증</option>
            <option value="면세">면세</option>
          </select>
        </label>
        <label>
          <span className="form-label">거래처</span>
          <input className="input lookup" readOnly value={partnerName} placeholder="클릭하여 선택"
            onClick={() => setHelp('partner')} />
        </label>
        <label>
          <span className="form-label">공급가액</span>
          <input className="input" type="number" step={100} style={{ textAlign: 'right' }} value={supply || ''}
            onChange={e => onSupplyChange(parseInt(e.target.value, 10) || 0)} />
        </label>
        <label>
          <span className="form-label">부가세</span>
          <input className="input" type="number" step={1} style={{ textAlign: 'right' }} value={vat || ''}
            disabled={vatType === '면세'} onChange={e => setVat(parseInt(e.target.value, 10) || 0)} />
        </label>
        <label>
          <span className="form-label">세부내역</span>
          <input className="input" value={detail} onChange={e => setDetail(e.target.value)} title="참고용(전표 remarks에 기록)" />
        </label>
        <label>
          <span className="form-label">적요</span>
          <input className="input" value={summary} onChange={e => setSummary(e.target.value)} />
        </label>
        <label>
          <span className="form-label">{side === '매출' ? '매출계정' : '매입계정'}</span>
          <input className="input lookup" readOnly value={acctName} placeholder="클릭하여 선택"
            onClick={() => setHelp('acct')} />
        </label>
        <label>
          <span className="form-label">{side === '매출' ? '입금계좌' : '출금계좌'}</span>
          <input className="input lookup" readOnly value={bankName} placeholder="클릭하여 선택"
            onClick={() => setHelp('bank')} />
        </label>
        <label>
          <span className="form-label">채권번호</span>
          <input className="input" value={receivableNo} onChange={e => setReceivableNo(e.target.value)} title="참고용(UI만)" />
        </label>
        <label>
          <span className="form-label">수수료</span>
          <input className="input" type="number" step={100} style={{ textAlign: 'right' }} value={fee || ''}
            onChange={e => setFee(parseInt(e.target.value, 10) || 0)} />
        </label>
        <label>
          <span className="form-label">첨부</span>
          <button className="btn small" disabled title="연동 예정입니다">+</button>
        </label>
      </div>

      <div className="gl-balance on">
        <span>차변합계 <b>{fmtWon(balancePreview)}</b></span>
        <span>대변합계 <b>{fmtWon(balancePreview)}</b></span>
      </div>

      <div className="voucher-actions">
        <button className="btn primary" disabled={saving} onClick={save}>
          {saving ? '저장 중...' : '저장(F8)'}
        </button>
        <button className="btn" disabled title="연동 예정입니다">저장/전표(F7)</button>
        <button className="btn" onClick={resetForm}>다시작성</button>
        <button className="btn" onClick={() => toast.show('목록 화면은 준비 중입니다.')}>리스트</button>
        <button className="btn" disabled title="연동 예정입니다">웹자료올리기</button>
      </div>

      {help === 'partner' && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(null)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
      {help === 'acct' && (
        <CodeHelp title="계정과목" endpoint="/api/accounts" onClose={() => setHelp(null)}
          onSelect={r => { setAcctCode(r.code); setAcctName(r.name); }} />
      )}
      {help === 'bank' && (
        <CodeHelp title="계좌" endpoint="/api/accounts" onClose={() => setHelp(null)}
          onSelect={r => { setBankCode(r.code); setBankName(r.name); }} />
      )}
    </div>
  );
}

export const SalesVoucher1Input = () => <AcctVoucherForm side="매출" />;
export const PurchaseVoucher1Input = () => <AcctVoucherForm side="매입" />;

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, todayISO } from '../format';
import type { Payable } from '../types';

// 지불입력(PaymentScreen) + 미지급금현황(PayableScreen) — ReceiptScreen.tsx(수금/미수금현황)와
// 동일 패턴, 매입 기준(kind='지불', GET /api/payables). 공용화 대신 별도 파일로 두어 겹침 0 유지(설계 4.6).

type Method = '현금' | '보통예금' | '받을어음' | '카드' | '기타';

interface PayablesGridProps {
  asOf: string;
  reloadToken?: number;
  onPay?: (row: Payable) => void;
  gridRef?: (t: Tabulator | null) => void;
}

function PayablesGrid({ asOf, reloadToken, onPay, gridRef }: PayablesGridProps) {
  const toast = useToast();
  const [rows, setRows] = useState<Payable[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Payable[]>(`/api/payables?as_of=${asOf}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [asOf, toast]);

  useEffect(() => { load(); }, [load, reloadToken]);

  const columns: ColumnDefinition[] = [
    { title: '거래처코드', field: 'partner_code', width: 90 },
    { title: '거래처명', field: 'partner_name', minWidth: 150 },
    {
      title: '입금주기', field: 'pay_cycle', width: 90, hozAlign: 'center',
      formatter: c => (c.getValue() === '월별' ? '<b class="link">월별</b>' : String(c.getValue() ?? '')),
    },
    {
      title: '매입합계', field: 'purchase_total', width: 110, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '지불합계', field: 'payment_total', width: 110, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '미지급잔액', field: 'balance', width: 110, hozAlign: 'right',
      formatter: c => {
        const v = Number(c.getValue() ?? 0);
        return v > 0 ? `<b class="danger-text">${fmtWon(v)}</b>` : fmtWon(v);
      },
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
  ];
  if (onPay) {
    columns.push({
      title: '지불', width: 64, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link">지불</span>',
      cellClick: (_e, cell) => onPay(cell.getData() as Payable),
    });
  }

  return (
    <div className="screen-grid">
      <DataGrid<Payable> columns={columns} data={rows} rowNumbers gridRef={gridRef} />
    </div>
  );
}

// ───────────────────────── 지불입력 ─────────────────────────
export function PaymentScreen() {
  const [asOf, setAsOf] = useState(todayISO());
  const [target, setTarget] = useState<Payable | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기준일자</span>
          <input className="input" type="date" style={{ width: 150 }} value={asOf} onChange={e => setAsOf(e.target.value)} />
          <button className="btn" onClick={() => setReloadToken(k => k + 1)}>새로고침</button>
        </div>
      </div>
      <PayablesGrid asOf={asOf} reloadToken={reloadToken} onPay={row => setTarget(row)} />
      {target && (
        <PaymentModal
          partner={target}
          onClose={() => setTarget(null)}
          onSaved={() => { setTarget(null); setReloadToken(k => k + 1); }}
        />
      )}
    </div>
  );
}

function PaymentModal({ partner, onClose, onSaved }: { partner: Payable; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [ioDate, setIoDate] = useState(todayISO());
  const [method, setMethod] = useState<Method>('보통예금');
  const [amount, setAmount] = useState(partner.balance > 0 ? partner.balance : 0);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!(amount > 0)) { toast.show('금액은 0보다 커야 합니다.', 'error'); return; }
    setSaving(true);
    try {
      await api.post('/api/receipts', {
        kind: '지불', io_date: ioDate, partner_id: partner.partner_id,
        method, amount, project_id: null, memo,
      });
      toast.show('지불 처리되었습니다.');
      onSaved();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`지불 입력 — ${partner.partner_name}`}
      width={440}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
        </>
      }>
      <div className="form-grid">
        <label>
          <span className="form-label">일자</span>
          <input className="input" type="date" value={ioDate} onChange={e => setIoDate(e.target.value)} />
        </label>
        <label>
          <span className="form-label">거래처</span>
          <input className="input" readOnly value={partner.partner_name} />
        </label>
        <label>
          <span className="form-label">지불구분</span>
          <select className="input" value={method} onChange={e => setMethod(e.target.value as Method)}>
            <option>현금</option><option>보통예금</option><option>받을어음</option><option>카드</option><option>기타</option>
          </select>
        </label>
        <label>
          <span className="form-label">금액(원)</span>
          <input className="input" type="number" step={100} value={amount || ''}
            onChange={e => setAmount(parseInt(e.target.value, 10) || 0)} />
          <span className="field-hint">미지급잔액: {fmtWon(partner.balance)}원</span>
        </label>
        <label className="span2">
          <span className="form-label">적요</span>
          <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

// ───────────────────────── 미지급금현황(조회 전용) ─────────────────────────
export function PayableScreen() {
  const [asOf, setAsOf] = useState(todayISO());
  const gridRef = useRef<Tabulator | null>(null);

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <span>기준일자</span>
          <input className="input" type="date" style={{ width: 150 }} value={asOf} onChange={e => setAsOf(e.target.value)} />
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '미지급금현황.xlsx', { sheetName: '미지급금현황' })}>
            엑셀
          </button>
        </div>
      </div>
      <PayablesGrid asOf={asOf} gridRef={t => { gridRef.current = t; }} />
    </div>
  );
}

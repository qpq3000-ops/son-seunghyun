import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, todayISO } from '../format';
import type { Receivable } from '../types';

// 수금입력(ReceiptScreen) + 미수금현황(ReceivableScreen) — 미수금 그리드는
// 공용 ReceivablesGrid로 뽑아 두 화면이 함께 사용한다(수금 버튼 유무만 다름).

type Method = '현금' | '보통예금' | '받을어음' | '카드' | '기타';

interface ReceivablesGridProps {
  asOf: string;
  reloadToken?: number;
  onReceipt?: (row: Receivable) => void;
  gridRef?: (t: Tabulator | null) => void;
}

export function ReceivablesGrid({ asOf, reloadToken, onReceipt, gridRef }: ReceivablesGridProps) {
  const toast = useToast();
  const [rows, setRows] = useState<Receivable[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Receivable[]>(`/api/receivables?as_of=${asOf}`));
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
      title: '매출합계', field: 'sales_total', width: 110, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '수금합계', field: 'receipt_total', width: 110, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '미수잔액', field: 'balance', width: 110, hozAlign: 'right',
      formatter: c => {
        const v = Number(c.getValue() ?? 0);
        return v > 0 ? `<b class="danger-text">${fmtWon(v)}</b>` : fmtWon(v);
      },
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
  ];
  if (onReceipt) {
    columns.push({
      title: '수금', width: 64, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link">수금</span>',
      cellClick: (_e, cell) => onReceipt(cell.getData() as Receivable),
    });
  }

  return (
    <div className="screen-grid">
      <DataGrid<Receivable> columns={columns} data={rows} gridRef={gridRef} />
    </div>
  );
}

// ───────────────────────── 수금입력 ─────────────────────────
export function ReceiptScreen() {
  const [asOf, setAsOf] = useState(todayISO());
  const [target, setTarget] = useState<Receivable | null>(null);
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
      <ReceivablesGrid asOf={asOf} reloadToken={reloadToken} onReceipt={row => setTarget(row)} />
      {target && (
        <ReceiptModal
          partner={target}
          onClose={() => setTarget(null)}
          onSaved={() => { setTarget(null); setReloadToken(k => k + 1); }}
        />
      )}
    </div>
  );
}

function ReceiptModal({ partner, onClose, onSaved }: { partner: Receivable; onClose: () => void; onSaved: () => void }) {
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
        kind: '수금', io_date: ioDate, partner_id: partner.partner_id,
        method, amount, project_id: null, memo,
      });
      toast.show('수금 처리되었습니다.');
      onSaved();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`수금 입력 — ${partner.partner_name}`}
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
          <span className="form-label">수금구분</span>
          <select className="input" value={method} onChange={e => setMethod(e.target.value as Method)}>
            <option>현금</option><option>보통예금</option><option>받을어음</option><option>카드</option><option>기타</option>
          </select>
        </label>
        <label>
          <span className="form-label">금액(원)</span>
          <input className="input" type="number" step={100} value={amount || ''}
            onChange={e => setAmount(parseInt(e.target.value, 10) || 0)} />
          <span className="field-hint">미수잔액: {fmtWon(partner.balance)}원</span>
        </label>
        <label className="span2">
          <span className="form-label">적요</span>
          <input className="input" value={memo} onChange={e => setMemo(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

// ───────────────────────── 미수금현황(조회 전용) ─────────────────────────
export function ReceivableScreen() {
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
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', '미수금현황.xlsx', { sheetName: '미수금현황' })}>
            엑셀
          </button>
        </div>
      </div>
      <ReceivablesGrid asOf={asOf} gridRef={t => { gridRef.current = t; }} />
    </div>
  );
}

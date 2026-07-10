import { useMemo, useState } from 'react';
import { fmtWon, todayISO } from '../format';
import { CodeHelp } from './CodeHelp';

// 전표 공통 폼 (이카운트 입력 화면의 2단 구조: 상단 헤더 + 하단 품목 라인 그리드)
// Phase 0에서는 컴포넌트만 준비하고, Phase 1의 주문/판매/발주/구매 화면이 이것을 사용한다.

export interface VoucherLine {
  item_id: number | null;
  item_code: string;
  item_name: string;
  unit: string;
  qty: number;
  price: number;       // 원 단위 정수
  supply: number;      // 공급가액
  vat: number;         // 부가세
  memo: string;
}

export interface VoucherHeader {
  date: string;
  partner_id: number | null;
  partner_name: string;
  warehouse_id: number | null;
  warehouse_name: string;
  tax_mode: '과세' | '면세';
  memo: string;
}

export function emptyLine(): VoucherLine {
  return { item_id: null, item_code: '', item_name: '', unit: 'kg', qty: 0, price: 0, supply: 0, vat: 0, memo: '' };
}

export function calcLine(line: VoucherLine, taxMode: '과세' | '면세', vatRound: 'floor' | 'round'): VoucherLine {
  const supply = Math.round(line.qty * line.price); // 수량(소수) × 단가(정수) → 원 단위 반올림
  const rawVat = taxMode === '과세' ? supply * 0.1 : 0;
  const vat = vatRound === 'round' ? Math.round(rawVat) : Math.floor(rawVat);
  return { ...line, supply, vat };
}

interface Props {
  title: string;
  header: VoucherHeader;
  lines: VoucherLine[];
  vatRound?: 'floor' | 'round';
  onChange: (header: VoucherHeader, lines: VoucherLine[]) => void;
  onSave: () => void;
  saving?: boolean;
}

export function VoucherForm({ title, header, lines, vatRound = 'floor', onChange, onSave, saving }: Props) {
  const [help, setHelp] = useState<{ kind: 'partner' | 'warehouse' | 'item'; lineIdx?: number } | null>(null);

  const totals = useMemo(() => lines.reduce(
    (a, l) => ({ qty: a.qty + l.qty, supply: a.supply + l.supply, vat: a.vat + l.vat }),
    { qty: 0, supply: 0, vat: 0 },
  ), [lines]);

  const setLine = (idx: number, patch: Partial<VoucherLine>) => {
    const next = lines.map((l, i) => i === idx ? calcLine({ ...l, ...patch }, header.tax_mode, vatRound) : l);
    onChange(header, next);
  };

  const setHeader = (patch: Partial<VoucherHeader>) => {
    const h = { ...header, ...patch };
    // 과세/면세 변경 시 전 라인 재계산
    const next = patch.tax_mode ? lines.map(l => calcLine(l, h.tax_mode, vatRound)) : lines;
    onChange(h, next);
  };

  return (
    <div className="voucher">
      <div className="voucher-head">
        <div className="vh-title">{title}</div>
        <div className="vh-fields">
          <label>일자
            <input className="input" type="date" value={header.date || todayISO()}
              onChange={e => setHeader({ date: e.target.value })} />
          </label>
          <label>거래처
            <input className="input lookup" readOnly value={header.partner_name}
              placeholder="클릭하여 선택" onClick={() => setHelp({ kind: 'partner' })} />
          </label>
          <label>창고
            <input className="input lookup" readOnly value={header.warehouse_name}
              placeholder="클릭하여 선택" onClick={() => setHelp({ kind: 'warehouse' })} />
          </label>
          <label>거래유형
            <select className="input" value={header.tax_mode}
              onChange={e => setHeader({ tax_mode: e.target.value as '과세' | '면세' })}>
              <option>과세</option><option>면세</option>
            </select>
          </label>
          <label className="grow">적요
            <input className="input" value={header.memo}
              onChange={e => setHeader({ memo: e.target.value })} />
          </label>
        </div>
      </div>

      <table className="voucher-lines">
        <thead>
          <tr>
            <th style={{ width: 36 }}>No</th>
            <th style={{ width: 110 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 60 }}>단위</th>
            <th style={{ width: 90 }}>수량</th>
            <th style={{ width: 110 }}>단가</th>
            <th style={{ width: 120 }}>공급가액</th>
            <th style={{ width: 100 }}>부가세</th>
            <th>적요</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td>
                <input className="cell lookup" readOnly value={l.item_code}
                  placeholder="선택" onClick={() => setHelp({ kind: 'item', lineIdx: i })} />
              </td>
              <td>{l.item_name}</td>
              <td>{l.unit}</td>
              <td><input className="cell num" type="number" step={0.1} value={l.qty || ''}
                onChange={e => setLine(i, { qty: parseFloat(e.target.value) || 0 })} /></td>
              <td><input className="cell num" type="number" step={100} value={l.price || ''}
                onChange={e => setLine(i, { price: parseInt(e.target.value, 10) || 0 })} /></td>
              <td className="num ro">{fmtWon(l.supply)}</td>
              <td className="num ro">{fmtWon(l.vat)}</td>
              <td><input className="cell" value={l.memo}
                onChange={e => setLine(i, { memo: e.target.value })} /></td>
              <td>
                <button className="icon-btn" title="라인 삭제"
                  onClick={() => onChange(header, lines.filter((_, j) => j !== i))}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>
              <button className="btn small" onClick={() => onChange(header, [...lines, emptyLine()])}>+ 라인 추가</button>
            </td>
            <td className="num"><b>{totals.qty.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}</b></td>
            <td></td>
            <td className="num"><b>{fmtWon(totals.supply)}</b></td>
            <td className="num"><b>{fmtWon(totals.vat)}</b></td>
            <td colSpan={2} className="num"><b>합계 {fmtWon(totals.supply + totals.vat)}원</b></td>
          </tr>
        </tfoot>
      </table>

      <div className="voucher-actions">
        <button className="btn primary" disabled={saving} onClick={onSave}>
          {saving ? '저장 중...' : '저장 (연속입력)'}
        </button>
      </div>

      {help?.kind === 'partner' && (
        <CodeHelp title="거래처" endpoint="/api/partners"
          onClose={() => setHelp(null)}
          onSelect={r => setHeader({ partner_id: r.id, partner_name: r.name })} />
      )}
      {help?.kind === 'warehouse' && (
        <CodeHelp title="창고" endpoint="/api/warehouses"
          onClose={() => setHelp(null)}
          onSelect={r => setHeader({ warehouse_id: r.id, warehouse_name: r.name })} />
      )}
      {help?.kind === 'item' && help.lineIdx !== undefined && (
        <CodeHelp title="품목" endpoint="/api/items"
          extraColumns={[{ field: 'price_out', label: '출고단가', money: true }]}
          onClose={() => setHelp(null)}
          onSelect={r => setLine(help.lineIdx!, {
            item_id: r.id, item_code: r.code, item_name: r.name,
            unit: String(r.unit ?? 'kg'), price: Number(r.price_out ?? 0),
          })} />
      )}
    </div>
  );
}

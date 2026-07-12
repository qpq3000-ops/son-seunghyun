import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset } from '../format';
import type { DocListRow } from '../types';

// 판매일괄회계반영 검색폼 실물화 — 설계-R9-실물매칭.md §3(B). 클론은 판매 저장 시 자동분개되므로
// "일괄반영"은 정보성 화면이다. 검색폼을 실물로 만들고 결과는 기존 /api/docs?type=sale 재사용(VoucherList §5 근사).
// 창고/프로젝트/담당자/거래처관리담당자·거래유형·내외자/거래구분·기타 체크박스는 표시만(연동 예정 stub) —
// /api/docs가 partner_id 필터만 지원하므로 실제 결과 필터링은 거래처만 반영한다.

// format.ts에 말일 계산 유틸이 없어 이 화면 전용으로 로컬 계산(당월 1일~말일 기본, §3.2 기준일자 기본값)
const monthEndISO = (): string => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
};

type Kind = '거래처별' | '전표별';
type TxKind = '전체' | '내자' | '외자';
type TxType = '전체' | '일반' | '반품';

export function SaleBulkPostScreen() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('거래처별');
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(monthEndISO());
  const [presetLabel, setPresetLabel] = useState('직접입력');
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [partnerHelp, setPartnerHelp] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemHelp, setItemHelp] = useState(false);
  const [txKind, setTxKind] = useState<TxKind>('내자');
  const [txType, setTxType] = useState<TxType>('전체');
  const [noPartnerPrint, setNoPartnerPrint] = useState(false);
  const [rows, setRows] = useState<DocListRow[]>([]);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async (f = from, t = to) => {
    try {
      const qs = new URLSearchParams({ type: 'sale', from: f, to: t });
      if (partnerId) qs.set('partner_id', String(partnerId));
      setRows(await api.get<DocListRow[]>(`/api/docs?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, partnerId, toast]);

  useEffect(() => { load(); }, [load]);

  // 이카운트 단축키: F8 검색
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); load(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load]);

  const preset = (label: string, presetKind: string) => {
    const { from: f, to: t } = periodPreset(presetKind);
    setFrom(f); setTo(t); setPresetLabel(label);
    load(f, t);
  };

  const reset = () => {
    const f = monthStartISO(), t = monthEndISO();
    setFrom(f); setTo(t); setPresetLabel('직접입력');
    setPartnerId(null); setPartnerName('');
    setItemName('');
    load(f, t);
  };

  const columns: ColumnDefinition[] = [
    { title: '', formatter: 'rowSelection', titleFormatter: 'rowSelection', hozAlign: 'center', headerSort: false, width: 40 },
    {
      title: '일자-No.', field: 'io_date', width: 120,
      formatter: c => {
        c.getElement().classList.add('r8-code');
        const d = c.getData() as DocListRow;
        return `${d.io_date.split('-').join('/')} -${d.doc_no.split('-')[1] ?? d.doc_no}`;
      },
    },
    { title: '거래처명', field: 'partner_name', minWidth: 140 },
    { title: '품목명(요약)', field: 'item_summary', minWidth: 200 },
    {
      title: '금액합계', field: 'total_amount', width: 120, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    {
      title: '회계반영여부', width: 100, hozAlign: 'center', headerSort: false,
      // 판매 저장 시 자동분개되므로 전량 회계반영 완료로 근사(설계 §3)
      formatter: () => '<span class="r8-badge-green" title="회계반영">✓</span>',
    },
  ];

  return (
    <div className="screen">
      <div className="r8-titlebar">
        <span className="r8-star">★</span>
        <h3>판매일괄회계반영</h3>
        <div className="r8-titlebar-right">
          <input className="r8-enter-input" placeholder="입력 후 Enter" readOnly title="검색은 아래 검색폼을 사용하세요" />
          <button className="btn r8-primary" onClick={() => load()}>Search(F3)</button>
          <button className="btn r8-ghost" disabled title="옵션 설정은 연동 예정입니다">Option</button>
          <button className="btn r8-ghost" disabled title="도움말은 연동 예정입니다">도움말</button>
        </div>
      </div>

      <div className="search-form">
        <div className="r9-radio-row">
          <label><input type="radio" checked={kind === '거래처별'} onChange={() => setKind('거래처별')} /> 거래처별</label>
          <label>
            <input type="radio" checked={kind === '전표별'} onChange={() => setKind('전표별')}
              title="전표별 조회는 연동 예정입니다(거래처별과 동일 결과)" /> 전표별
          </label>
        </div>

        <div className="sf-row">
          <span className="sf-label">기준일자</span>
          <div className="sf-field">
            <span className="r9-preset-badge on">{presetLabel}</span>
            <input className="input" type="date" style={{ width: 140 }} value={from}
              onChange={e => { setFrom(e.target.value); setPresetLabel('직접입력'); }} />
            <span>~</span>
            <input className="input" type="date" style={{ width: 140 }} value={to}
              onChange={e => { setTo(e.target.value); setPresetLabel('직접입력'); }} />
          </div>
        </div>

        <div className="sf-row">
          <span className="sf-label">검색조건</span>
          <div className="sf-field" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 120 }} disabled placeholder="창고(전체)" title="창고 필터는 연동 예정입니다" />
            <input className="input lookup" style={{ width: 150 }} readOnly value={partnerName}
              placeholder="거래처(전체)" onClick={() => setPartnerHelp(true)} />
            {partnerName && (
              <button className="icon-btn" title="거래처 선택 해제" onClick={() => { setPartnerId(null); setPartnerName(''); }}>✕</button>
            )}
            <input className="input lookup" style={{ width: 150 }} readOnly value={itemName}
              placeholder="품목(전체)" onClick={() => setItemHelp(true)} />
            {itemName && (
              <button className="icon-btn" title="품목 선택 해제" onClick={() => setItemName('')}>✕</button>
            )}
            <input className="input" style={{ width: 110 }} disabled placeholder="프로젝트(전체)" title="프로젝트 필터는 연동 예정입니다" />
            <input className="input" style={{ width: 110 }} disabled placeholder="담당자(전체)" title="담당자 필터는 연동 예정입니다" />
            <input className="input" style={{ width: 140 }} disabled placeholder="거래처관리담당자(전체)" title="거래처관리담당자 필터는 연동 예정입니다" />
          </div>
        </div>

        <div className="sf-row">
          <span className="sf-label">거래유형</span>
          <div className="sf-field" style={{ flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 130 }} disabled title="거래유형 상세는 연동 예정입니다">
              <option>부가세율 적용</option>
            </select>
            <span className="r9-radio-row">
              <label><input type="radio" checked={txKind === '전체'} onChange={() => setTxKind('전체')} /> 전체</label>
              <label><input type="radio" checked={txKind === '내자'} onChange={() => setTxKind('내자')} /> 내자</label>
              <label><input type="radio" checked={txKind === '외자'} onChange={() => setTxKind('외자')} /> 외자</label>
            </span>
            <span className="r9-radio-row">
              <label><input type="radio" checked={txType === '전체'} onChange={() => setTxType('전체')} /> 전체</label>
              <label><input type="radio" checked={txType === '일반'} onChange={() => setTxType('일반')} /> 일반</label>
              <label><input type="radio" checked={txType === '반품'} onChange={() => setTxType('반품')} /> 반품</label>
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" className="check" checked={noPartnerPrint}
                onChange={e => setNoPartnerPrint(e.target.checked)}
                title="거래처코드없는자료인쇄는 연동 예정입니다" />
              거래처코드없는자료인쇄
            </label>
          </div>
        </div>
      </div>

      <div className="r9-preset-bar">
        <button className="btn r8-primary" onClick={() => load()}>검색(F8)</button>
        <button className="btn r8-ghost" onClick={() => preset('금일', '금일')}>금일</button>
        <button className="btn r8-ghost" onClick={() => preset('전일', '전일')}>전일</button>
        <button className="btn r8-ghost" onClick={() => preset('금주(~오늘)', '금주')}>금주(~오늘)</button>
        <button className="btn r8-ghost" onClick={() => preset('전주', '전주')}>전주</button>
        <button className="btn r8-ghost" onClick={() => preset('금월(~오늘)', '금월')}>금월(~오늘)</button>
        <button className="btn r8-ghost" onClick={() => preset('전월', '전월')}>전월</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">종료일</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">금년</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">금월</button>
        <button className="btn r8-ghost" onClick={reset}>다시작성</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">∨</button>
      </div>

      <div className="screen-grid r8-real">
        <DataGrid<DocListRow>
          columns={columns}
          data={rows}
          gridRef={t => { gridRef.current = t; }}
          options={{ selectableRows: true, pagination: true, paginationSize: 15 }}
        />
      </div>

      {partnerHelp && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setPartnerHelp(false)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
      {itemHelp && (
        <CodeHelp title="품목" endpoint="/api/items" onClose={() => setItemHelp(false)}
          onSelect={r => setItemName(r.name)} />
      )}
    </div>
  );
}

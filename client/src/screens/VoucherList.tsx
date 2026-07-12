import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, todayISO, monthStartISO } from '../format';
import type { DocListRow } from '../types';
import { VoucherScreen } from './VoucherScreen';

// 판매조회/구매조회 — 조건 검색 그리드. 행 더블클릭 시 같은 자리에서 VoucherScreen(수정모드)로 교체된다.

type Kind = 'sale' | 'purchase';

// R10-A: types.ts 무수정 원칙(설계-R10-커버리지.md §A-1-3) — '불러온전표' 컬럼용 로컬 확장 타입.
// A-3(server/vouchers.mjs 가산) 미적용 시 이 두 필드는 undefined → 빈 셀로 graceful 처리된다.
type SaleListRow = DocListRow & { source_doc_id?: number | null; source_doc_no?: string | null };

// doc_no("YYYYMMDD-N") → 실물 표기("YYYY/MM/DD -N")
const fmtDocNo = (no: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d+)$/.exec(no);
  return m ? `${m[1]}/${m[2]}/${m[3]} -${m[4]}` : no;
};

const moneyCol = (field: string, title: string, width = 110): ColumnDefinition => ({
  title, field, width, hozAlign: 'right',
  formatter: c => fmtWon(Number(c.getValue() ?? 0)),
  bottomCalc: 'sum',
  bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
});

function VoucherListScreen({ kind }: { kind: Kind }) {
  const toast = useToast();
  const [rows, setRows] = useState<SaleListRow[]>([]);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [help, setHelp] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);   // R10-A: 신규(F2) — 목록 자리에서 VoucherScreen(create)로 교체
  const gridRef = useRef<Tabulator | null>(null);
  const pageCount = Math.max(1, Math.ceil(rows.length / 15));   // 실물 §4: 표기 위주 스텁(실제 페이징은 Tabulator local pagination)

  const load = useCallback(async (f = from, t = to) => {
    try {
      const qs = new URLSearchParams({ type: kind, from: f, to: t });
      if (partnerId) qs.set('partner_id', String(partnerId));
      setRows(await api.get<SaleListRow[]>(`/api/docs?${qs.toString()}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [kind, from, to, partnerId, toast]);

  // 이카운트 단축키(F3 검색·F2 신규) + 기간 프리셋
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3' && editId === null) { e.preventDefault(); load(); }
      else if (e.key === 'F2' && editId === null && !creating) { e.preventDefault(); setCreating(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load, editId, creating]);

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const preset = (kindName: string) => {
    const now = new Date();
    let f = new Date(now), t = new Date(now);
    if (kindName === '전일') { f.setDate(f.getDate() - 1); t = new Date(f); }
    else if (kindName === '금주') { f.setDate(f.getDate() - ((f.getDay() + 6) % 7)); }
    else if (kindName === '전주') { f.setDate(f.getDate() - ((f.getDay() + 6) % 7) - 7); t = new Date(f); t.setDate(t.getDate() + 6); }
    else if (kindName === '금월') { f.setDate(1); }
    else if (kindName === '전월') { f = new Date(now.getFullYear(), now.getMonth() - 1, 1); t = new Date(now.getFullYear(), now.getMonth(), 0); }
    const fs = iso(f), ts = iso(t);
    setFrom(fs); setTo(ts);
    load(fs, ts);
  };

  useEffect(() => { load(); }, [load]);

  // 실물 컬럼(설계-R8-실물매칭.md §5): 체크박스/일자-No./거래처명/품목명(요약)/금액합계/거래유형명/창고명/회계반영여부/인쇄
  const columns: ColumnDefinition[] = [
    { title: '', formatter: 'rowSelection', titleFormatter: 'rowSelection', hozAlign: 'center', headerSort: false, width: 40 },
    {
      title: '일자-No.', field: 'io_date', width: 120,
      formatter: c => {
        c.getElement().classList.add('r8-code');
        const d = c.getData() as DocListRow;
        return `${d.io_date.split('-').join('/')} -${d.doc_no.split('-')[1]}`;
      },
    },
    { title: '거래처명', field: 'partner_name', minWidth: 140 },
    { title: '품목명(요약)', field: 'item_summary', minWidth: 200 },
    moneyCol('total_amount', '금액합계'),
    {
      title: '거래유형명', width: 110, hozAlign: 'center', headerSort: false,
      // 우리 판매전표는 전부 과세 기준 — 상세 거래유형 구분 데이터가 없어 상수 표기(설계 §5)
      formatter: () => '<span title="거래유형 상세는 연동 예정입니다">부가세율 적용</span>',
    },
    {
      // R10-A(§A-1-3): 끌어오기 원본 전표번호 — 파랑 링크(.r8-code), 클릭 시 원본 열람(setEditId 재사용).
      // A-3(server/vouchers.mjs 가산) 미적용 시 source_doc_no가 없어 빈 셀로 graceful 처리된다.
      title: '불러온전표', width: 120, headerSort: false,
      formatter: c => {
        const d = c.getData() as SaleListRow;
        if (!d.source_doc_no) return '';
        c.getElement().classList.add('r8-code');
        return fmtDocNo(d.source_doc_no);
      },
      cellClick: (_e, cell) => {
        const d = cell.getData() as SaleListRow;
        if (d.source_doc_id) setEditId(d.source_doc_id);
      },
    },
    { title: '창고명', field: 'warehouse_name', width: 110 },
    {
      title: '회계반영여부', width: 100, hozAlign: 'center', headerSort: false,
      // 백필 분개로 전 판매·구매가 회계 반영되므로 상수 초록 체크로 근사(설계 §5)
      formatter: () => '<span class="r8-badge-green" title="회계반영">✓</span>',
    },
    {
      title: '인쇄', width: 70, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link">인쇄</span>',
      cellClick: () => toast.show('인쇄 기능은 연동 예정입니다.'),
    },
    {
      // R10-A(§A-1-2): 실물 '조회' 링크 — 기존 행 열람 로직(setEditId) 재사용(실연결, stub 아님)
      title: '조회', width: 60, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link">조회</span>',
      cellClick: (_e, cell) => setEditId((cell.getData() as SaleListRow).id),
    },
  ];

  const title = kind === 'sale' ? '판매조회' : '구매조회';

  if (editId !== null) {
    return (
      <VoucherScreen
        kind={kind}
        mode="edit"
        docId={editId}
        onSaved={() => { setEditId(null); load(); }}
        onDeleted={() => { setEditId(null); load(); }}
        onCancel={() => setEditId(null)}
      />
    );
  }

  // R10-A(§A-1-1): 신규(F2) — edit 분기와 동형으로 목록 자리에서 VoucherScreen(create)로 교체
  if (creating) {
    return (
      <VoucherScreen
        kind={kind}
        mode="create"
        onSaved={() => { setCreating(false); load(); }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="screen">
      {/* 실물 타이틀바(설계-R8-실물매칭.md §5) — 상태 pill은 데이터 없어 전체만 동작 */}
      <div className="r8-titlebar">
        <span className="r8-star">★</span>
        <h3>{title}</h3>
        <div className="r8-pills">
          <button className="r8-pill on" onClick={() => load()}>전체</button>
          <button className="r8-pill" disabled title="결재 상태 관리는 연동 예정입니다">결재중</button>
          <button className="r8-pill" disabled title="결재 상태 관리는 연동 예정입니다">미확인</button>
          <button className="r8-pill" disabled title="결재 상태 관리는 연동 예정입니다">확인</button>
        </div>
        <div className="r8-titlebar-right">
          <input className="r8-enter-input" placeholder="입력 후 Enter" readOnly title="검색은 아래 기간 검색을 사용하세요" />
          <button className="btn r8-ghost" disabled title="Fn 기능은 연동 예정입니다">Fn</button>
          <button className="btn r8-primary" onClick={() => load()}>Search(F3)</button>
          <button className="btn r8-ghost" disabled title="옵션 설정은 연동 예정입니다">Option</button>
          <button className="btn r8-ghost" disabled title="도움말은 연동 예정입니다">도움말</button>
        </div>
      </div>
      <div className="r8-listbar">
        <span className="r8-pager">① 2 » <b className="on">1</b>/{pageCount}</span>
        <span className="r8-period">{from.split('-').join('/')} ~ {to.split('-').join('/')}</span>
      </div>

      <div className="screen-bar">
        <div className="search-group">
          <span>기간</span>
          <input className="input" type="date" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span>~</span>
          <input className="input" type="date" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
          <input className="input lookup" style={{ width: 160 }} readOnly value={partnerName}
            placeholder="거래처(전체)" onClick={() => setHelp(true)} />
          {partnerName && (
            <button className="icon-btn" title="거래처 선택 해제" onClick={() => { setPartnerId(null); setPartnerName(''); }}>✕</button>
          )}
          <button className="btn primary" onClick={() => load()}>검색(F3)</button>
          <button className="btn" onClick={() => preset('금일')}>금일</button>
          <button className="btn" onClick={() => preset('전일')}>전일</button>
          <button className="btn" onClick={() => preset('금주')}>금주(~오늘)</button>
          <button className="btn" onClick={() => preset('전주')}>전주</button>
          <button className="btn" onClick={() => preset('금월')}>금월(~오늘)</button>
          <button className="btn" onClick={() => preset('전월')}>전월</button>
        </div>
      </div>
      <div className="screen-grid r8-real">
        <DataGrid<SaleListRow>
          rowNumbers
          columns={columns}
          data={rows}
          onRowDblClick={r => setEditId(r.id)}
          gridRef={t => { gridRef.current = t; }}
          options={{ selectableRows: true, pagination: true, paginationSize: 15 }}
        />
      </div>

      {/* R10-A(§A-1-1): 실물 하단 버튼바 10종 — 신규(F2)·Excel만 실동작, 나머지는 disabled + 안내 title(연동 예정) */}
      <div className="r8-report-bottom">
        <button className="btn r8-primary" onClick={() => setCreating(true)}>신규(F2)</button>
        <button className="btn r8-ghost" disabled title="이메일 발송은 연동 예정입니다.">Email</button>
        <button className="btn r8-ghost" disabled title="전표 진행상태 관리는 연동 예정입니다.">진행상태변경</button>
        <button className="btn r8-ghost" disabled title="보내기는 연동 예정입니다.">보내기</button>
        <button className="btn r8-ghost" disabled title="인쇄는 연동 예정입니다.">인쇄</button>
        <button className="btn r8-ghost" disabled title="바코드 조회는 연동 예정입니다.">바코드(품목)</button>
        <button className="btn r8-ghost" disabled title="전자결재는 연동 예정입니다.">전자결재</button>
        <button className="btn r8-ghost" disabled title="선택삭제는 연동 예정입니다. (안전을 위해 삭제는 지원하지 않습니다)">선택삭제</button>
        <button className="btn r8-ghost" onClick={() => gridRef.current?.download('xlsx', `${title}.xlsx`, { sheetName: title })}>Excel</button>
        <button className="btn r8-ghost" disabled title="이력조회는 연동 예정입니다.">이력조회</button>
      </div>
      {help && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setHelp(false)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
    </div>
  );
}

export const SaleList = () => <VoucherListScreen kind="sale" />;
export const PurchaseList = () => <VoucherListScreen kind="purchase" />;

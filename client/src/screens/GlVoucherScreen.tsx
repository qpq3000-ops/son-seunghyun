import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, monthStartISO, periodPreset, todayISO, PERIOD_PRESETS } from '../format';
import type { GlVoucherRow } from '../types';

// 전표조회(회계거래조회) — 설계-R9-실물매칭.md §6(E). 신규 GET /api/gl-vouchers(§1.1) 사용.
// 결재중/미확인/확인 같은 결재 상태 관리 개념이 우리 스키마에 없어 '전체' pill만 동작(나머지 disabled stub).

const STATE_PILLS = ['결재중', '미확인', '확인'] as const;

export function GlVoucherScreen() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<GlVoucherRow[]>([]);
  const gridRef = useRef<Tabulator | null>(null);
  const pageCount = Math.max(1, Math.ceil(rows.length / 15));

  const load = useCallback(async (f = from, t = to) => {
    try {
      setRows(await api.get<GlVoucherRow[]>(`/api/gl-vouchers?from=${f}&to=${t}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [from, to, toast]);

  useEffect(() => { load(); }, [load]);

  // 이카운트 단축키: F3 검색
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F3') { e.preventDefault(); load(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load]);

  const preset = (kind: string) => {
    const { from: f, to: t } = periodPreset(kind);
    setFrom(f); setTo(t);
    load(f, t);
  };

  const downloadExcel = () => gridRef.current?.download('xlsx', '전표조회.xlsx', { sheetName: '전표조회' });

  const columns: ColumnDefinition[] = [
    { title: '', formatter: 'rowSelection', titleFormatter: 'rowSelection', hozAlign: 'center', headerSort: false, width: 40 },
    {
      title: '전표번호', field: 'io_date', width: 130,
      formatter: c => {
        const d = c.getData() as GlVoucherRow;
        // 매출전표Ⅰ(entry_type='매출') 행은 연분홍 배경(설계 §6, 실측 §10.5)
        c.getRow().getElement().classList.toggle('r9-glv-sale', d.entry_type === '매출');
        c.getElement().classList.add('r8-code');
        return `${d.io_date.split('-').join('/')} -${d.doc_no.split('-')[1] ?? d.doc_no}`;
      },
    },
    { title: '입력메뉴', field: 'source_menu', width: 110 },
    {
      title: '금액', field: 'amount', width: 120, hozAlign: 'right',
      formatter: c => fmtWon(Number(c.getValue() ?? 0)),
      bottomCalc: 'sum', bottomCalcFormatter: c => fmtWon(Number(c.getValue() ?? 0)),
    },
    { title: '거래처명', field: 'partner_name', minWidth: 130 },
    { title: '적요명', field: 'summary', minWidth: 180 },
    {
      title: '전표', width: 60, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link danger">인쇄</span>',
      cellClick: () => toast.show('전표 인쇄는 연동 예정입니다.'),
    },
    {
      title: '결의서', width: 60, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link danger">인쇄</span>',
      cellClick: () => toast.show('결의서 인쇄는 연동 예정입니다.'),
    },
  ];

  return (
    <div className="screen">
      <div className="r8-titlebar">
        <span className="r8-star">★</span>
        <h3>전표조회</h3>
        <div className="r8-pills">
          <button className="r8-pill on" onClick={() => load()}>전체</button>
          {STATE_PILLS.map(s => (
            <button key={s} className="r8-pill" disabled title="결재 상태 관리는 연동 예정입니다">{s}</button>
          ))}
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
          <button className="btn" onClick={() => load()}>검색(F3)</button>
          {PERIOD_PRESETS.map(p => <button key={p} className="btn small" onClick={() => preset(p)}>{p}</button>)}
        </div>
        <div className="btn-group">
          <button className="btn" onClick={downloadExcel}>Excel</button>
        </div>
      </div>

      <div className="screen-grid r8-real">
        <DataGrid<GlVoucherRow>
          columns={columns}
          data={rows}
          gridRef={t => { gridRef.current = t; }}
          options={{ selectableRows: true, pagination: true, paginationSize: 15 }}
        />
      </div>

      {/* 하단 버튼바 8종(설계 §6) — 결재/전자결재/보내기/선택삭제는 연동 예정 stub, Excel만 실제 */}
      <div className="r8-report-bottom">
        <span>
          <button className="btn r8-primary r8-split" disabled title="신규 작성은 [회계Ⅰ > 일반전표(경비)]를 사용하세요">신규</button>
          <button className="btn r8-split-caret" disabled>▲</button>
        </span>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">보내기 ▲</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">인쇄 ▲</button>
        <button className="btn r8-ghost" disabled title="결재 상태 관리는 연동 예정입니다">확인</button>
        <button className="btn r8-ghost" disabled title="결재 상태 관리는 연동 예정입니다">확인취소</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">전자결재</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">선택삭제</button>
        <button className="btn r8-ghost" onClick={downloadExcel}>Excel</button>
      </div>
    </div>
  );
}

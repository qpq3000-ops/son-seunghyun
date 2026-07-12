import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator, CellComponent } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from '../components/DataGrid';
import { CodeHelp } from '../components/CodeHelp';
import { ReportFooter } from '../components/ReportScreen';
import { useToast } from '../components/Toast';
import { api } from '../api';
import { fmtWon, periodPreset, todayISO } from '../format';
import type { ArByPartnerRow } from '../types';

// 거래처별채권 — 설계-R9-실물매칭.md §7(F) 검색폼 + 설계-R12-시각100.md §4.3(결과 실물화).
// 검색폼은 R9 그대로 유지, 결과는 신규 GET /api/ar-by-partner?from=&to=(기간 집계 7열)로 교체.
// 담당자별은 표시만(연동 예정) stub.

type GroupBy = '거래처별' | '담당자별';
type SumBasis = '거래처관계기준' | '개별거래처기준';

export function ArByPartnerScreen() {
  const toast = useToast();
  const [groupBy, setGroupBy] = useState<GroupBy>('거래처별');
  const [from, setFrom] = useState(() => periodPreset('전월').from);
  const [to, setTo] = useState(todayISO());
  const [presetLabel, setPresetLabel] = useState('전월+금월');
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [partnerHelp, setPartnerHelp] = useState(false);
  const [sumBasis, setSumBasis] = useState<SumBasis>('거래처관계기준');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [rows, setRows] = useState<ArByPartnerRow[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [queriedAt, setQueriedAt] = useState<Date>(() => new Date());
  const gridRef = useRef<Tabulator | null>(null);

  useEffect(() => {
    api.get<Record<string, string>>('/api/settings')
      .then(s => setCompanyName(s.company_name ?? ''))
      .catch(() => setCompanyName(''));
  }, []);

  const load = useCallback(async (f = from, t = to) => {
    try {
      const all = await api.get<ArByPartnerRow[]>(`/api/ar-by-partner?from=${f}&to=${t}`);
      setRows(partnerId ? all.filter(r => r.partner_id === partnerId) : all);
      setQueriedAt(new Date());
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [from, to, partnerId, toast]);

  useEffect(() => { load(); }, [load]);

  // 이카운트 단축키: F8 검색
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); load(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load]);

  const preset = (label: string, kind: string) => {
    const { from: f, to: t } = periodPreset(kind);
    setFrom(f); setTo(t); setPresetLabel(label);
    load(f, t);
  };

  // 전월+금월 = 전월 1일 ~ 오늘(로컬 계산, 설계 §7 "미지원 중 전월+금월만 활성")
  const presetMonthPlus = () => {
    const f = periodPreset('전월').from;
    const t = todayISO();
    setFrom(f); setTo(t); setPresetLabel('전월+금월');
    load(f, t);
  };

  const reset = () => {
    const f = periodPreset('전월').from, t = todayISO();
    setFrom(f); setTo(t); setPresetLabel('전월+금월');
    setPartnerId(null); setPartnerName('');
    load(f, t);
  };

  // 실물 7열(설계-R12-시각100.md §4.3) — 전부 우측정렬·콤마, 음수 그대로 검정(danger-text 미사용).
  // 하단 소계행은 Tabulator bottomCalc로 굵은 '합계' 행.
  const won = (c: CellComponent) => fmtWon(Number(c.getValue() ?? 0));
  const wonBold = (c: CellComponent) => `<b>${fmtWon(Number(c.getValue() ?? 0))}</b>`;
  const columns: ColumnDefinition[] = [
    { title: '거래처명', field: 'partner_name', minWidth: 160, hozAlign: 'left',
      bottomCalc: () => '합계', bottomCalcFormatter: c => `<b>${c.getValue() ?? ''}</b>` },
    { title: '기초채권', field: 'opening',       width: 120, hozAlign: 'right', formatter: won, bottomCalc: 'sum', bottomCalcFormatter: wonBold },
    { title: '재고매출', field: 'stock_sales',   width: 120, hozAlign: 'right', formatter: won, bottomCalc: 'sum', bottomCalcFormatter: wonBold },
    { title: '회계매출', field: 'acct_sales',    width: 120, hozAlign: 'right', formatter: won, bottomCalc: 'sum', bottomCalcFormatter: wonBold },
    { title: '수금합계', field: 'receipt_total', width: 120, hozAlign: 'right', formatter: won, bottomCalc: 'sum', bottomCalcFormatter: wonBold },
    { title: '기타할인등차액', field: 'etc_diff', width: 130, hozAlign: 'right', formatter: won, bottomCalc: 'sum', bottomCalcFormatter: wonBold },
    { title: '잔액', field: 'balance', width: 130, hozAlign: 'right', formatter: c => `<b>${fmtWon(Number(c.getValue() ?? 0))}</b>`, bottomCalc: 'sum', bottomCalcFormatter: wonBold },
  ];

  return (
    <div className="screen">
      <div className="r8-titlebar">
        <span className="r8-star">★</span>
        <h3>거래처별채권</h3>
        <div className="r8-titlebar-right">
          <button className="btn r8-primary" onClick={() => load()}>Search(F3)</button>
          <button className="btn r8-ghost" disabled title="옵션 설정은 연동 예정입니다">Option</button>
          <button className="btn r8-ghost" disabled title="도움말은 연동 예정입니다">도움말</button>
        </div>
      </div>

      <div className="search-form">
        <div className="r9-radio-row">
          <label><input type="radio" checked={groupBy === '거래처별'} onChange={() => setGroupBy('거래처별')} /> 거래처별</label>
          <label>
            <input type="radio" checked={groupBy === '담당자별'} onChange={() => setGroupBy('담당자별')}
              title="담당자별 조회는 연동 예정입니다(거래처별과 동일 결과)" /> 담당자별
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
          <span className="sf-label">거래처</span>
          <div className="sf-field" style={{ flexWrap: 'wrap' }}>
            <input className="input lookup" style={{ width: 160 }} readOnly value={partnerName}
              placeholder="전체" onClick={() => setPartnerHelp(true)} />
            {partnerName && (
              <button className="icon-btn" title="거래처 선택 해제" onClick={() => { setPartnerId(null); setPartnerName(''); }}>✕</button>
            )}
            <span className="r9-radio-row">
              <label><input type="radio" checked={sumBasis === '거래처관계기준'} onChange={() => setSumBasis('거래처관계기준')} /> 거래처관계기준</label>
              <label><input type="radio" checked={sumBasis === '개별거래처기준'} onChange={() => setSumBasis('개별거래처기준')} /> 개별거래처기준</label>
            </span>
            <input className="input" style={{ width: 140 }} disabled placeholder="거래처관리담당자(전체)" title="거래처관리담당자 필터는 연동 예정입니다" />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" className="check" checked={includeInactive}
                onChange={e => setIncludeInactive(e.target.checked)}
                title="사용중단거래처포함은 연동 예정입니다" />
              사용중단거래처포함
            </label>
          </div>
        </div>

        <div className="sf-row">
          <span className="sf-label">잔액</span>
          <div className="sf-field">
            <span className="r9-balance-badge">잔액(채권)</span>
            <span className="r9-balance-badge">0 포함</span>
            <input className="input" style={{ width: 120 }} disabled placeholder="금액 범위" title="잔액 범위 필터는 연동 예정입니다" />
            <button className="icon-btn" disabled title="연동 예정입니다">✕</button>
          </div>
        </div>

        <div className="r9-form-sec">
          <div className="sf-row">
            <span className="sf-label">적용양식</span>
            <span>기본(수정불가)</span>
          </div>
          <div className="sf-row">
            <span className="sf-label">양식구분</span>
            <select className="input" style={{ width: 140 }} disabled title="양식구분 변경은 연동 예정입니다">
              <option>결재방표시</option>
            </select>
          </div>
          <div className="sf-row">
            <span className="sf-label">정렬·소계기준</span>
            <span className="link muted" title="정렬·소계 설정은 연동 예정입니다">설정</span>
          </div>
          <div className="sf-row">
            <span className="sf-label">데이터 보기형식</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" className="check" disabled title="그래프 보기는 연동 예정입니다" /> 그래프로 보기
            </label>
          </div>
        </div>
      </div>

      <div className="r9-preset-bar">
        <button className="btn r8-primary" onClick={() => load()}>검색(F8)</button>
        <button className="btn r8-ghost" onClick={() => preset('금일', '금일')}>금일</button>
        <button className="btn r8-ghost" onClick={() => preset('전일', '전일')}>전일</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">금년</button>
        <button className="btn r8-ghost" onClick={() => preset('전주', '전주')}>전주</button>
        <button className="btn r8-ghost" onClick={() => preset('금월(~오늘)', '금월')}>금월(~오늘)</button>
        <button className="btn r8-ghost" onClick={() => preset('전월', '전월')}>전월</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">종료일</button>
        <button className="btn r8-ghost" onClick={presetMonthPlus}>전월+금월</button>
        <button className="btn r8-ghost" disabled title="연동 예정입니다">설정</button>
        <button className="btn r8-ghost" onClick={reset}>다시작성</button>
      </div>

      <div className="r8-real">
        <div className="r8-report-title">거래처별채권</div>
        <div className="r8-report-meta">
          <span>회사명 : {companyName}</span>
          <span>{from.split('-').join('/')} ~ {to.split('-').join('/')}</span>
        </div>
        <div className="screen-grid">
          <DataGrid<ArByPartnerRow> columns={columns} data={rows}
            gridRef={t => { gridRef.current = t; }} />
        </div>
        <ReportFooter at={queriedAt} />
        <div className="r8-report-bottom">
          <button className="btn r8-primary r8-split" onClick={() => window.print()}>인쇄</button>
          <button className="btn r8-split-caret">▲</button>
          <button className="btn r8-ghost"
            onClick={() => gridRef.current?.download('xlsx', '거래처별채권.xlsx', { sheetName: '거래처별채권' })}>Excel</button>
          <button className="btn r8-ghost" disabled title="자동알림은 연동 예정입니다">자동알림</button>
        </div>
      </div>

      {partnerHelp && (
        <CodeHelp title="거래처" endpoint="/api/partners" onClose={() => setPartnerHelp(false)}
          onSelect={r => { setPartnerId(r.id); setPartnerName(r.name); }} />
      )}
    </div>
  );
}

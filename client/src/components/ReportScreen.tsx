import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from './DataGrid';
import { CodeHelp } from './CodeHelp';
import { useToast } from './Toast';
import { api } from '../api';
import { fmtWon, fmtQty, monthStartISO, todayISO, periodPreset, PERIOD_PRESETS } from '../format';

// 공통 보고서 화면(R1) — 설계-R1-보고서엔진.md §3.
// 계정별원장·총계정원장·현금출납장·합계잔액시산표·수금현황·지급현황·이익현황 7종은 이 컴포넌트 +
// 정의 객체(screens/reportDefs.ts)만으로 완성된다. 손익계산서는 서식형이라 별도 화면(PnlStatement.tsx).

export type FilterKind = 'date-range' | 'account' | 'partner' | 'item' | 'select' | 'as-of';

export interface ReportFilter {
  key: string;                          // 쿼리 파라미터 이름(date-range는 무시 — from/to 고정)
  kind: FilterKind;
  label?: string;
  required?: boolean;                   // true면 값 없을 때 조회 보류(수동 검색 시 토스트 안내)
  requiredMsg?: string;                  // required 미충족 토스트 문구(생략 시 label 기반 기본 문구)
  default?: string;                      // select/as-of 초기값
  options?: string[];                    // select 옵션(표시값 그대로 렌더)
  omitWhen?: string;                     // 이 값이면 쿼리 파라미터 미전송
  mapValue?: Record<string, string>;     // select 표시값→실제 쿼리값 매핑(예: '101 현금'→'101')
  helpEndpoint?: string;                 // account/partner 코드도움 endpoint
  width?: number;
}

export interface ReportColumn {
  title: string; field: string; width?: number; minWidth?: number;
  align?: 'left' | 'center' | 'right';
  fmt?: 'won' | 'qty' | 'pct' | 'text';
  sum?: boolean;                         // 하단 bottomCalc 합계
  bold?: boolean;                        // 값 굵게(잔액 컬럼 등)
}

// 실물 보고서 결과 프레임 옵션 (설계-R8-실물매칭.md §4.1) — 지정된 보고서만 실물 헤더/하단바 렌더
export interface ReportRealOpt {
  centerTitle?: string;        // 중앙 24/700 제목(예: '재고현황'). 없으면 def.title 사용
  companyLine?: boolean;       // 좌측 "회사명 : {설정 상호}" 줄
  asOfLine?: boolean;          // 우측 기준일 표기(= vals.as_of 또는 오늘)
  negativeField?: string;      // 이 숫자 컬럼이 음수면 셀 배경 #F2DEDE(.r8-neg)
  bottomButtons?: { label: string; primary?: boolean; split?: boolean; stub?: string }[];
  footer?: boolean;            // 보고서 공통 푸터([P:1]+조회시각). 기본 true — false면 미표기(설계-R12-시각100.md §4.1)
}

// 조회시각 표기 — "2026/07/12 오후 11:12:49"(참고 §13.1). 로컬 24→12시제 + 오전/오후.
function fmtQueryStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  let h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  h = h % 12 || 12;
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${ampm} ${h}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 결과형 화면 공통 푸터(좌 [P:n] + 우 조회시각). 재고현황·거래처별채권·ReportScreen real 이 공유(설계-R12-시각100.md §4.1).
export function ReportFooter({ page = 1, at }: { page?: number; at?: Date }) {
  return (
    <div className="r12-report-footer">
      <span className="r12-pagemark">[P:{page}]</span>
      <span className="r12-querystamp">{fmtQueryStamp(at ?? new Date())}</span>
    </div>
  );
}

export interface ReportDef {
  id: string;
  title: string;
  endpoint: string;                      // 예: '/api/account-ledger'
  filters: ReportFilter[];
  columns: ReportColumn[];
  rowsPath?: 'rows';                     // 응답에서 rows 배열을 꺼낼 경로(기본 'rows')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summaryLine?: (env: any) => string;    // 조회 힌트 문자열(원장 요약 등)
  fileName?: string;                     // 엑셀 파일명(기본 `${title}.xlsx`)
  autoSearch?: boolean;                  // 마운트/필터 변경 시 자동조회(기본 true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform?: (env: any) => Record<string, unknown>[]; // 예약 필드 — R1엔 미사용
  real?: ReportRealOpt;                  // 실물 결과 프레임(미설정 보고서는 현행 그대로)
}

interface SavedTab { name: string; cond: Record<string, string> }

const LABEL_SUFFIX = '__label';

const tabsKey = (id: string) => `reportTabs:${id}`;

const loadTabs = (id: string): SavedTab[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(tabsKey(id)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};

const persistTabs = (id: string, tabs: SavedTab[]) => {
  localStorage.setItem(tabsKey(id), JSON.stringify(tabs));
};

const initVals = (def: ReportDef): Record<string, string> => {
  const v: Record<string, string> = {};
  for (const f of def.filters) {
    if (f.kind === 'date-range') { v.from = monthStartISO(); v.to = todayISO(); }
    else if (f.kind === 'as-of') v.as_of = f.default ?? todayISO();
    else if (f.kind === 'select') v[f.key] = f.default ?? (f.options?.[0] ?? '');
    else v[f.key] = '';
  }
  return v;
};

const initLabels = (def: ReportDef): Record<string, string> => {
  const l: Record<string, string> = {};
  for (const f of def.filters) if (f.kind === 'account' || f.kind === 'partner' || f.kind === 'item') l[f.key] = '';
  return l;
};

const snapshotCond = (v: Record<string, string>, l: Record<string, string>): Record<string, string> => {
  const cond: Record<string, string> = { ...v };
  for (const [k, val] of Object.entries(l)) cond[`${k}${LABEL_SUFFIX}`] = val;
  return cond;
};

const applyCond = (cond: Record<string, string>): { vals: Record<string, string>; labels: Record<string, string> } => {
  const vals: Record<string, string> = {};
  const labels: Record<string, string> = {};
  for (const [k, val] of Object.entries(cond)) {
    if (k.endsWith(LABEL_SUFFIX)) labels[k.slice(0, -LABEL_SUFFIX.length)] = val;
    else vals[k] = val;
  }
  return { vals, labels };
};

const missingRequired = (def: ReportDef, v: Record<string, string>): ReportFilter | undefined =>
  def.filters.find(f => f.required && !v[f.key]);

const buildQuery = (def: ReportDef, v: Record<string, string>): string => {
  const qs = new URLSearchParams();
  for (const f of def.filters) {
    if (f.kind === 'date-range') { qs.set('from', v.from ?? ''); qs.set('to', v.to ?? ''); continue; }
    if (f.kind === 'as-of') { if (v.as_of) qs.set('as_of', v.as_of); continue; }
    const raw = v[f.key];
    if (raw === undefined || raw === '') continue;
    if (f.omitWhen !== undefined && raw === f.omitWhen) continue;
    qs.set(f.key, f.mapValue?.[raw] ?? raw);
  }
  return qs.toString();
};

const extractRows = (env: unknown, path: string): unknown[] => {
  if (Array.isArray(env)) return env;
  if (env && typeof env === 'object') {
    const r = (env as Record<string, unknown>)[path];
    if (Array.isArray(r)) return r;
  }
  return [];
};

const buildColumns = (columns: ReportColumn[], negativeField?: string): ColumnDefinition[] =>
  columns.map(c => {
    const align = c.align ?? (c.fmt === 'won' || c.fmt === 'qty' || c.fmt === 'pct' ? 'right' : undefined);
    const fmtOne = (raw: unknown): string => {
      if (c.fmt === 'won') return fmtWon(Number(raw ?? 0));
      if (c.fmt === 'qty') return fmtQty(Number(raw ?? 0));
      if (c.fmt === 'pct') return `${raw ?? 0}%`;
      return raw === null || raw === undefined ? '' : String(raw);
    };
    const col: ColumnDefinition = {
      title: c.title, field: c.field, width: c.width, minWidth: c.minWidth,
      hozAlign: align,
      formatter: cell => {
        const text = fmtOne(cell.getValue());
        // 실물 매칭: 지정 컬럼이 음수면 셀 배경 #F2DEDE(.r8-neg, 설계-R8 §4.1)
        if (negativeField && c.field === negativeField && Number(cell.getValue() ?? 0) < 0) {
          cell.getElement().classList.add('r8-neg');
        }
        return c.bold ? `<b>${text}</b>` : text;
      },
    };
    if (c.sum) {
      col.bottomCalc = 'sum';
      col.bottomCalcFormatter = cell => fmtOne(cell.getValue());
    }
    return col;
  });

interface ReportScreenProps { def: ReportDef }

export function ReportScreen({ def }: ReportScreenProps) {
  const toast = useToast();
  const gridRef = useRef<Tabulator | null>(null);
  const [vals, setVals] = useState<Record<string, string>>(() => initVals(def));
  const [labels, setLabels] = useState<Record<string, string>>(() => initLabels(def));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [env, setEnv] = useState<any>(null);
  const [helpFilter, setHelpFilter] = useState<ReportFilter | null>(null);
  const [savedTabs, setSavedTabs] = useState<SavedTab[]>(() => loadTabs(def.id));
  const [activeTab, setActiveTab] = useState(0);
  const [companyName, setCompanyName] = useState('');
  const [queriedAt, setQueriedAt] = useState<Date>(() => new Date());

  const columns = useMemo(() => buildColumns(def.columns, def.real?.negativeField), [def]);
  const hasDateRange = useMemo(() => def.filters.some(f => f.kind === 'date-range'), [def]);
  const rows = useMemo(() => (env ? extractRows(env, def.rowsPath ?? 'rows') : []), [env, def]);

  // 실물 헤더의 "회사명 : {상호}" 줄(설계-R8 §4.1) — real 옵션이 있는 보고서만 1회 조회
  useEffect(() => {
    if (!def.real?.companyLine) return;
    api.get<Record<string, string>>('/api/settings')
      .then(s => setCompanyName(s.company_name ?? ''))
      .catch(() => setCompanyName(''));
  }, [def.real?.companyLine]);

  const runSearch = useCallback(async (v: Record<string, string> = vals, silent = false) => {
    const missing = missingRequired(def, v);
    if (missing) {
      if (!silent) toast.show(missing.requiredMsg ?? `${missing.label ?? '필수 항목'}을(를) 선택하세요.`, 'error');
      return;
    }
    try {
      const qs = buildQuery(def, v);
      const data = await api.get<unknown>(`${def.endpoint}${qs ? `?${qs}` : ''}`);
      setEnv(data);
      setQueriedAt(new Date());
      if (activeTab > 0 && activeTab - 1 < savedTabs.length) {
        const next = savedTabs.map((t, i) => (i === activeTab - 1 ? { ...t, cond: snapshotCond(v, labels) } : t));
        setSavedTabs(next);
        persistTabs(def.id, next);
      }
    } catch (e) {
      if (!silent) toast.show((e as Error).message, 'error');
    }
  }, [vals, labels, activeTab, savedTabs, def, toast]);

  // 마운트/필터 변경 시 자동조회(필수 필터 충족 시에만·조용히 — 거래처원장 패턴과 동일)
  useEffect(() => {
    if (def.autoSearch === false) return;
    runSearch(vals, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals]);

  // 이카운트 단축키: F3/F8 둘 다 조회(조회 전용 화면이라 입력폼과 충돌 없음)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F3' || e.key === 'F8') { e.preventDefault(); runSearch(vals); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runSearch, vals]);

  const setVal = (key: string, value: string) => setVals(v => ({ ...v, [key]: value }));

  const applyPreset = (kind: string) => {
    const { from, to } = periodPreset(kind);
    const next = { ...vals, from, to };
    setVals(next);
    runSearch(next);
  };

  const selectTab = (idx: number) => {
    setActiveTab(idx);
    if (idx === 0) {
      const v = initVals(def), l = initLabels(def);
      setVals(v); setLabels(l);
      runSearch(v);
    } else {
      const t = savedTabs[idx - 1];
      if (!t) return;
      const { vals: v, labels: l } = applyCond(t.cond);
      setVals(v); setLabels(l);
      runSearch(v);
    }
  };

  const addTab = () => {
    const name = window.prompt('검색조건 이름');
    if (!name || !name.trim()) return;
    const next = [...savedTabs, { name: name.trim(), cond: snapshotCond(vals, labels) }];
    setSavedTabs(next);
    persistTabs(def.id, next);
    setActiveTab(next.length);
  };

  const removeTab = (idx: number) => {
    const next = savedTabs.filter((_, i) => i !== idx);
    setSavedTabs(next);
    persistTabs(def.id, next);
    selectTab(0);
  };

  const real = def.real;

  return (
    <div className={`screen report-screen${real ? ' r8-real' : ''}`}>
      <div className="screen-bar">
        <div className="search-group">
          {def.filters.map(f => {
            if (f.kind === 'date-range') {
              return (
                <Fragment key="range">
                  <span>기간</span>
                  <input className="input" type="date" style={{ width: 140 }} value={vals.from ?? ''}
                    onChange={e => setVal('from', e.target.value)} />
                  <span>~</span>
                  <input className="input" type="date" style={{ width: 140 }} value={vals.to ?? ''}
                    onChange={e => setVal('to', e.target.value)} />
                </Fragment>
              );
            }
            if (f.kind === 'as-of') {
              return (
                <Fragment key={f.key}>
                  <span>{f.label ?? '기준일'}</span>
                  <input className="input" type="date" style={{ width: 140 }} value={vals.as_of ?? ''}
                    onChange={e => setVal('as_of', e.target.value)} />
                </Fragment>
              );
            }
            if (f.kind === 'select') {
              return (
                <Fragment key={f.key}>
                  {f.label && <span>{f.label}</span>}
                  <select className="input" style={{ width: f.width ?? 130 }} value={vals[f.key] ?? ''}
                    onChange={e => setVal(f.key, e.target.value)}>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Fragment>
              );
            }
            // account / partner — CodeHelp 코드도움 팝업
            return (
              <Fragment key={f.key}>
                {f.label && <span>{f.label}</span>}
                <input className="input lookup" style={{ width: f.width ?? 150 }} readOnly
                  value={labels[f.key] ?? ''} placeholder={f.required ? '선택(필수)' : '전체'}
                  onClick={() => setHelpFilter(f)} />
                {labels[f.key] && (
                  <button className="icon-btn" title="선택 해제"
                    onClick={() => { setVal(f.key, ''); setLabels(l => ({ ...l, [f.key]: '' })); }}>
                    ✕
                  </button>
                )}
              </Fragment>
            );
          })}
          <button className="btn" onClick={() => runSearch(vals)}>검색(F3)</button>
        </div>
        <div className="btn-group">
          <button className="btn"
            onClick={() => gridRef.current?.download('xlsx', def.fileName ?? `${def.title}.xlsx`, { sheetName: def.title })}>
            엑셀
          </button>
        </div>
      </div>

      {hasDateRange && (
        <div className="rpt-presets">
          {PERIOD_PRESETS.map(p => (
            <button key={p} className="btn small" onClick={() => applyPreset(p)}>{p}</button>
          ))}
        </div>
      )}

      <div className="report-tabs">
        <button className={`report-tab ${activeTab === 0 ? 'on' : ''}`} onClick={() => selectTab(0)}>기본</button>
        {savedTabs.map((t, i) => (
          <button key={i} className={`report-tab ${activeTab === i + 1 ? 'on' : ''}`} onClick={() => selectTab(i + 1)}>
            {t.name}
            <span className="report-tab-x" onClick={e => { e.stopPropagation(); removeTab(i); }}>✕</span>
          </button>
        ))}
        <button className="report-tab-add" title="현재 검색조건 저장" onClick={addTab}>+</button>
      </div>

      {env && def.summaryLine && <p className="hint ledger-summary">{def.summaryLine(env)}</p>}

      {real && (
        <>
          <div className="r8-report-title">{real.centerTitle ?? def.title}</div>
          <div className="r8-report-meta">
            <span>{real.companyLine ? `회사명 : ${companyName}` : ''}</span>
            <span>{real.asOfLine ? (vals.as_of || todayISO()) : ''}</span>
          </div>
        </>
      )}

      <div className="screen-grid">
        <DataGrid key={def.id} columns={columns} data={rows} rowNumbers gridRef={t => { gridRef.current = t; }} />
      </div>

      {real && real.footer !== false && <ReportFooter at={queriedAt} />}

      {real?.bottomButtons && (
        <div className="r8-report-bottom">
          {real.bottomButtons.map((b, i) => (
            <span key={i}>
              <button
                className={`btn ${b.primary ? `r8-primary${b.split ? ' r8-split' : ''}` : 'r8-ghost'}`}
                disabled={!!b.stub}
                title={b.stub}
                onClick={() => { if (b.label === '인쇄') window.print(); }}>
                {b.label}
              </button>
              {b.split && (
                <button className="btn r8-split-caret" disabled={!!b.stub} title={b.stub}>▲</button>
              )}
            </span>
          ))}
        </div>
      )}

      {helpFilter && (
        <CodeHelp
          title={helpFilter.label ?? (helpFilter.kind === 'account' ? '계정과목' : helpFilter.kind === 'item' ? '품목' : '거래처')}
          endpoint={helpFilter.helpEndpoint ?? (helpFilter.kind === 'account' ? '/api/accounts' : '/api/partners')}
          onClose={() => setHelpFilter(null)}
          onSelect={r => {
            const val = helpFilter.kind === 'account' ? String(r.code) : String(r.id);
            setVal(helpFilter.key, val);
            setLabels(l => ({ ...l, [helpFilter.key]: r.name }));
          }}
        />
      )}
    </div>
  );
}

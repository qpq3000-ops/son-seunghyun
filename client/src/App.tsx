import { useCallback, useEffect, useMemo, useState } from 'react';
import { MENUS, MENU_GROUPS, SUBGROUP_ORDER, findMenu, MenuDef } from './menus';
import { ToastProvider } from './components/Toast';
import { HeaderIcons } from './components/HeaderIcons';

// AppShell — 이카운트 실화면(2026) 레이아웃 재현:
// [최상단 즐겨찾기 바: 메뉴검색 + 사이트맵 + 고정 메뉴 링크] → [로고/대메뉴 바] → [서브탭 스트립] → [좌측 메뉴트리(서브그룹 섹션) + 콘텐츠]
// 로고·아이콘은 자체 제작(자산 비복제), 배치·크기·동선만 맞춘다.
// R3: 대메뉴 재편성(설계-R3-IA재편성.md §2) — activeId + subOverride를 단일 진실원으로 서브탭/사이드바를 파생시킨다.

const FAV_KEY = 'erp_favorites';
const FAV_SEEDED = 'erp_favorites_seeded';   // 기본 시드 1회 표식(참고-실물실측-20260712.md §13.6-3)
const FAV_SEED = [
  'stock-status', 'partner-acct', 'prod-in', 'sale-status', 'statement-print',
  'ar-by-partner', 'sale-bulk-acct', 'e-tax-invoice', 'bank-link', 'gl-voucher',
];

export default function App() {
  const [activeId, setActiveId] = useState('dashboard');
  const [sitemap, setSitemap] = useState(false);
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as string[];
      if (!localStorage.getItem(FAV_SEEDED)) {          // 최초 1회
        localStorage.setItem(FAV_SEEDED, '1');
        if (!stored.length) return FAV_SEED;            // 비어 있으면 실물 10종 시드
      }
      return stored;                                    // 이후엔 저장값 그대로(사용자 변경 유지)
    } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }, [favs]);

  const menu = findMenu(activeId) ?? MENUS[0];
  const activeGroup = menu.group;
  const groupItems = useMemo(() => MENUS.filter(x => x.group === activeGroup), [activeGroup]);

  // 현재 대메뉴가 갖는 서브그룹 목록(정의 순서 우선, 없으면 배열 등장 순서)
  const subgroups = useMemo(() => {
    const present = [...new Set(groupItems.map(x => x.subgroup).filter(Boolean))] as string[];
    const order = SUBGROUP_ORDER[activeGroup];
    return order ? order.filter(s => present.includes(s)) : present;
  }, [groupItems, activeGroup]);

  // 서브탭 브라우징용 override. 실제 네비게이션(open) 시 null로 리셋 → 활성 메뉴의 subgroup으로 재동기화
  const [subOverride, setSubOverride] = useState<string | null>(null);
  const activeSubgroup =
    (subOverride && subgroups.includes(subOverride)) ? subOverride
    : (menu.subgroup ?? subgroups[0] ?? null);

  // 사이드바에 그릴 항목: 서브그룹이 있으면 활성 서브그룹만, 없으면 그룹 전체(현행 동작)
  const sideItems = useMemo(
    () => subgroups.length ? groupItems.filter(x => x.subgroup === activeSubgroup) : groupItems,
    [groupItems, subgroups.length, activeSubgroup],
  );

  const open = useCallback((id: string) => {
    setActiveId(id);
    setSubOverride(null);
    setSitemap(false);
    setQ('');
  }, []);

  const toggleFav = useCallback((id: string) => {
    setFavs(f => (f.includes(id) ? f.filter(x => x !== id) : [...f, id]));
  }, []);

  const results = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    return MENUS.filter(x => x.name.includes(t) || x.group.includes(t)).slice(0, 10);
  }, [q]);

  const Comp = menu.component;

  const renderSitemapBtn = (x: MenuDef) => (
    <button key={x.id} className={x.implemented ? '' : 'dim'} onClick={() => open(x.id)}>
      {x.name}{!x.implemented && <span className="phase-tag">P{x.phase}</span>}
    </button>
  );

  return (
    <ToastProvider>
      <div className="shell">
        {/* ── 최상단 즐겨찾기 바 ── */}
        <div className="favbar">
          <div className="menusearch">
            <span className="ms-icon">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="#8a94a6" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="7" cy="7" r="4.3" /><path d="M13.2 13.2 10 10" />
              </svg>
            </span>
            <input
              placeholder="메뉴검색"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && results.length) open(results[0].id); }}
            />
            {results.length > 0 && (
              <div className="menusearch-drop">
                {results.map(r => (
                  <button key={r.id} onClick={() => open(r.id)}>
                    <span className="ms-group">{r.group}</span> {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="sitemap-btn" onClick={() => setSitemap(s => !s)}>사이트맵</button>
          <nav className="favlinks">
            {favs.map(id => {
              const f = findMenu(id);
              return f ? (
                <button key={id} className="favlink" onClick={() => open(id)}>{f.name}</button>
              ) : null;
            })}
            {!favs.length && <span className="favhint">메뉴 옆 ★를 눌러 자주 쓰는 메뉴를 여기에 고정하세요</span>}
          </nav>
          <span className="favbar-pin" title="즐겨찾기 바">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="#8a94a6" aria-hidden="true">
              <path d="M9 2.2h6a1 1 0 0 1 0 2h-.5l.7 5.1 2.1 1.9a1.2 1.2 0 0 1 .4.9v.4a.6.6 0 0 1-.6.6H13v5.2a1 1 0 0 1-2 0V13.6H6.4a.6.6 0 0 1-.6-.6v-.4a1.2 1.2 0 0 1 .4-.9l2.1-1.9.7-5.1H9a1 1 0 0 1 0-2z" />
            </svg>
          </span>
        </div>

        {/* ── 로고 / 대메뉴 바 ── */}
        <header className="logobar">
          <button className="logo" onClick={() => open('dashboard')} aria-label="ECOUNT 홈">
            <svg className="brandmark" viewBox="0 0 132 30" role="img" aria-label="ECOUNT">
              {/* 빨강 스트라이프 E 심볼 */}
              <rect x="2"   y="3"    width="5.5" height="24"  rx="1.4" fill="#e5231b" />
              <rect x="2"   y="3"    width="20"  height="5.2" rx="1.4" fill="#e5231b" />
              <rect x="2"   y="12.4" width="15.5" height="5.2" rx="1.4" fill="#e5231b" />
              <rect x="2"   y="21.8" width="20"  height="5.2" rx="1.4" fill="#e5231b" />
              {/* COUNT 회색 볼드 */}
              <text x="29.5" y="22.6" fontFamily="'Malgun Gothic',Arial,sans-serif"
                    fontSize="22" fontWeight="800" letterSpacing="0.4" fill="#333">COUNT</text>
            </svg>
          </button>
          <nav className="groupmenu">
            {MENU_GROUPS.map(g => {
              const first = MENUS.find(x => x.group === g);
              return (
                <button
                  key={g}
                  className={`${g === activeGroup ? 'on' : ''} ${first ? '' : 'reserved'}`}
                  title={first ? undefined : 'R4·R5에서 추가될 메뉴 자리입니다'}
                  onClick={() => { if (first) open(first.id); }}>
                  {g}
                </button>
              );
            })}
          </nav>
          <div className="logobar-right">
            <HeaderIcons onProfile={() => open('settings')} />
          </div>
        </header>

        {/* ── 서브탭 스트립 (서브그룹이 있는 대메뉴에서만 렌더) ── */}
        {subgroups.length > 0 && (
          <div className="subtabs">
            {subgroups.map(sg => (
              <button
                key={sg}
                className={sg === activeSubgroup ? 'on' : ''}
                onClick={() => setSubOverride(sg)}>
                {sg}
              </button>
            ))}
          </div>
        )}

        {/* ── 본문: 좌측 메뉴트리(서브그룹 섹션) + 콘텐츠 ── */}
        <div className="body">
          <aside className="sidebar">
            {subgroups.length > 0 && <div className="side-section">{activeSubgroup}</div>}
            {sideItems.map(x => (
              <div key={x.id} className={`side-item ${x.id === activeId ? 'on' : ''}`}>
                <button className={`side-link ${x.implemented ? '' : 'dim'}`} onClick={() => open(x.id)}>
                  {x.id === activeId && <span className="side-dot">●</span>}
                  {x.name}
                  {!x.implemented && <span className="phase-tag">P{x.phase}</span>}
                </button>
                <button
                  className={`star ${favs.includes(x.id) ? 'on' : ''}`}
                  title="즐겨찾기 바에 고정"
                  onClick={() => toggleFav(x.id)}>★</button>
              </div>
            ))}
          </aside>

          <main className="content">
            <div className="titlebar">
              <button
                className={`star big ${favs.includes(activeId) ? 'on' : ''}`}
                title="즐겨찾기 바에 고정"
                onClick={() => toggleFav(activeId)}>★</button>
              <h2>{menu.name}</h2>
              <div className="titlebar-right">
                <button className="btn small" title="입력화면설정 — Phase 4">Option</button>
                <button className="btn small" title="docs/02 기능분석 참고">도움말</button>
              </div>
            </div>
            <div className="screen-card">
              <Comp key={activeId} />
            </div>
          </main>
        </div>

        {/* ── 사이트맵 오버레이 (이카운트 출력물 카탈로그 스타일, 재고Ⅰ은 서브그룹 소제목으로 중첩) ── */}
        {sitemap && (
          <div className="sitemap-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSitemap(false); }}>
            <div className="sitemap">
              {MENU_GROUPS.map(g => {
                const items = MENUS.filter(x => x.group === g);
                const subs = SUBGROUP_ORDER[g]?.filter(s => items.some(x => x.subgroup === s));
                return (
                  <div key={g} className="sitemap-group">
                    <h3>{g}</h3>
                    {!items.length && <span className="sm-reserved">R4·R5 예정</span>}
                    {subs?.length
                      ? subs.map(sg => (
                          <div key={sg} className="sitemap-sub">
                            <h4>{sg}</h4>
                            {items.filter(x => x.subgroup === sg).map(renderSitemapBtn)}
                          </div>
                        ))
                      : items.map(renderSitemapBtn)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ToastProvider>
  );
}

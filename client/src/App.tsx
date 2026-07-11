import { useCallback, useEffect, useMemo, useState } from 'react';
import { MENUS, MENU_GROUPS, findMenu } from './menus';
import { ToastProvider } from './components/Toast';

// AppShell — 이카운트 실화면(2026) 레이아웃 재현:
// [최상단 즐겨찾기 바: 메뉴검색 + 사이트맵 + 고정 메뉴 링크] → [로고/대메뉴 바] → [좌측 메뉴트리 + 콘텐츠]
// 로고·아이콘은 자체 제작(자산 비복제), 배치·크기·동선만 맞춘다.

const FAV_KEY = 'erp_favorites';

export default function App() {
  const [activeId, setActiveId] = useState('dashboard');
  const [sitemap, setSitemap] = useState(false);
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }, [favs]);

  const menu = findMenu(activeId) ?? MENUS[0];
  const activeGroup = menu.group;
  const groupItems = useMemo(() => MENUS.filter(x => x.group === activeGroup), [activeGroup]);

  const open = useCallback((id: string) => {
    setActiveId(id);
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

  return (
    <ToastProvider>
      <div className="shell">
        {/* ── 최상단 즐겨찾기 바 ── */}
        <div className="favbar">
          <div className="menusearch">
            <span className="ms-icon">🔍</span>
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
          <span className="favbar-pin" title="즐겨찾기 바">📌</span>
        </div>

        {/* ── 로고 / 대메뉴 바 ── */}
        <header className="logobar">
          <button className="logo" onClick={() => open('dashboard')}>
            <span className="logo-mark">☕</span><b>로스팅</b>ERP
          </button>
          <nav className="groupmenu">
            {MENU_GROUPS.map(g => (
              <button
                key={g}
                className={g === activeGroup ? 'on' : ''}
                onClick={() => {
                  const first = MENUS.find(x => x.group === g);
                  if (first) open(first.id);
                }}>
                {g}
              </button>
            ))}
          </nav>
          <div className="logobar-right">
            <button className="icon-btn" title="환경설정" onClick={() => open('settings')}>⚙️</button>
            <div className="profile-dot" title="단일 사용자">☺</div>
          </div>
        </header>

        {/* ── 본문: 좌측 메뉴트리 + 콘텐츠 ── */}
        <div className="body">
          <aside className="sidebar">
            {groupItems.map(x => (
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

        {/* ── 사이트맵 오버레이 (이카운트 출력물 카탈로그 스타일) ── */}
        {sitemap && (
          <div className="sitemap-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSitemap(false); }}>
            <div className="sitemap">
              {MENU_GROUPS.map(g => (
                <div key={g} className="sitemap-group">
                  <h3>{g}</h3>
                  {MENUS.filter(x => x.group === g).map(x => (
                    <button key={x.id} className={x.implemented ? '' : 'dim'} onClick={() => open(x.id)}>
                      {x.name}{!x.implemented && <span className="phase-tag">P{x.phase}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ToastProvider>
  );
}

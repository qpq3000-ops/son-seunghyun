import { useCallback, useEffect, useMemo, useState } from 'react';
import { MENUS, MENU_GROUPS, findMenu } from './menus';
import { ToastProvider } from './components/Toast';

// AppShell: 상단 대메뉴 바 + 즐겨찾기(☆) + 멀티 탭(MDI) — 이카운트 전역 레이아웃 패턴
interface OpenTab { menuId: string }

const FAV_KEY = 'erp_favorites';

export default function App() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);       // 펼쳐진 대메뉴
  const [tabs, setTabs] = useState<OpenTab[]>([{ menuId: 'dashboard' }]);
  const [active, setActive] = useState('dashboard');
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }, [favs]);

  const openTab = useCallback((menuId: string) => {
    setTabs(t => (t.some(x => x.menuId === menuId) ? t : [...t, { menuId }]));
    setActive(menuId);
    setOpenMenu(null);
  }, []);

  const closeTab = useCallback((menuId: string) => {
    setTabs(t => {
      const next = t.filter(x => x.menuId !== menuId);
      if (!next.length) next.push({ menuId: 'dashboard' });
      setActive(a => (a === menuId ? next[next.length - 1].menuId : a));
      return next;
    });
  }, []);

  const toggleFav = useCallback((menuId: string) => {
    setFavs(f => (f.includes(menuId) ? f.filter(x => x !== menuId) : [...f, menuId]));
  }, []);

  const grouped = useMemo(() => MENU_GROUPS.map(g => ({
    group: g,
    items: MENUS.filter(x => x.group === g),
  })), []);

  return (
    <ToastProvider>
      <div className="shell" onClick={() => setOpenMenu(null)}>
        <header className="topbar" onClick={e => e.stopPropagation()}>
          <div className="brand">☕ 로스팅 ERP</div>
          <nav className="topmenu">
            {grouped.map(({ group, items }) => (
              <div key={group} className="topmenu-item">
                <button
                  className={`topmenu-btn ${openMenu === group ? 'open' : ''}`}
                  onClick={() => {
                    if (items.length === 1) { openTab(items[0].id); return; }
                    setOpenMenu(o => (o === group ? null : group));
                  }}
                  onMouseEnter={() => { if (openMenu && openMenu !== group && items.length > 1) setOpenMenu(group); }}>
                  {group}
                </button>
                {openMenu === group && items.length > 1 && (
                  <div className="submenu">
                    {items.map(x => (
                      <div key={x.id} className="submenu-row">
                        <button className={`submenu-btn ${x.implemented ? '' : 'dim'}`} onClick={() => openTab(x.id)}>
                          {x.name}
                          {!x.implemented && <span className="phase-tag">P{x.phase}</span>}
                        </button>
                        <button
                          className={`star ${favs.includes(x.id) ? 'on' : ''}`}
                          title="즐겨찾기"
                          onClick={() => toggleFav(x.id)}>★</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="fav-bar">
            {favs.map(id => {
              const menu = findMenu(id);
              return menu ? (
                <button key={id} className="fav-chip" onClick={() => openTab(id)}>★ {menu.name}</button>
              ) : null;
            })}
          </div>
        </header>

        <div className="tabbar">
          {tabs.map(t => {
            const menu = findMenu(t.menuId);
            if (!menu) return null;
            return (
              <div key={t.menuId} className={`tab ${active === t.menuId ? 'active' : ''}`}
                onClick={() => setActive(t.menuId)}>
                <span>{menu.name}</span>
                {t.menuId !== 'dashboard' && (
                  <button className="tab-close" onClick={e => { e.stopPropagation(); closeTab(t.menuId); }}>✕</button>
                )}
              </div>
            );
          })}
        </div>

        <main className="content">
          {tabs.map(t => {
            const menu = findMenu(t.menuId);
            if (!menu) return null;
            const Comp = menu.component;
            // 열린 탭은 모두 마운트 유지(입력 중 내용 보존), 활성 탭만 표시 — MDI 패턴
            return (
              <div key={t.menuId} className="tab-pane" style={{ display: active === t.menuId ? 'flex' : 'none' }}>
                <Comp />
              </div>
            );
          })}
        </main>
      </div>
    </ToastProvider>
  );
}

// 연동 예정 안내(공용) — 설계-R5-관리그룹웨어유틸.md §4.7.
// bank-link(계좌/카드 연동)·wms(WMS)·pos(POS판매)·shopping-mall(쇼핑몰관리)·forex(외화관리)
// 5개 메뉴가 title/description만 달리해 재사용한다(menus.tsx의 stub() 래퍼).
export function StubScreen({ title, description }: { title: string; description: string }) {
  return (
    <div className="screen stub-screen">
      <div className="stub-box">
        <div className="stub-icon">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#8a94a6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9.5 14.5 14.5 9.5" /><path d="M8 11 6 13a3.5 3.5 0 0 0 5 5l2-2" /><path d="M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
          </svg>
        </div>
        <h3>{title}</h3>
        <p>{description}</p>
        <span className="stub-badge">연동 예정</span>
      </div>
    </div>
  );
}

// 연동 예정 안내(공용) — 설계-R5-관리그룹웨어유틸.md §4.7.
// bank-link(계좌/카드 연동)·wms(WMS)·pos(POS판매)·shopping-mall(쇼핑몰관리)·forex(외화관리)
// 5개 메뉴가 title/description만 달리해 재사용한다(menus.tsx의 stub() 래퍼).
export function StubScreen({ title, description }: { title: string; description: string }) {
  return (
    <div className="screen stub-screen">
      <div className="stub-box">
        <div className="stub-icon">🔌</div>
        <h3>{title}</h3>
        <p>{description}</p>
        <span className="stub-badge">연동 예정</span>
      </div>
    </div>
  );
}

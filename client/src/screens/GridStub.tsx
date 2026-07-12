import { DataGrid } from '../components/DataGrid';

// R10-B: 실물 메뉴 뼈대 컴포넌트 — 설계-R10-커버리지.md §B-0.
// StubScreen(🔌 "연동 예정")·Placeholder(🚧 "Phase N")와 달리, 이 컴포넌트는
// "과업이 준비 중"이라는 뜻이 아니다 — 실물 메뉴명 그대로 + 실물형 타이틀바 + 빈 그리드(자료 없음)로
// 화면의 뼈대만 우선 갖춰두고, 데이터·검색 연결은 이후 라운드에서 진행한다는 안내만 옅게 덧붙인다.
interface GridStubProps {
  title: string;
  columns?: string[];
  note?: string;
}

export function GridStub({ title, columns, note }: GridStubProps) {
  const heads = columns ?? ['코드', '명칭', '일자', '금액'];
  const cols = heads.map((t, i) => ({ title: t, field: `c${i}`, minWidth: 120 }));
  return (
    <div className="screen r10b-stub r8-real">
      <div className="r8-titlebar">
        <span className="r8-star">★</span><h3>{title}</h3>
        <div className="r8-titlebar-right">
          <input className="r8-enter-input" placeholder="입력 후 Enter" readOnly />
          <button className="btn r8-primary" disabled title="메뉴 뼈대입니다">Search(F3)</button>
          <button className="btn r8-ghost" disabled>Option</button>
          <button className="btn r8-ghost" disabled>도움말</button>
        </div>
      </div>
      <div className="r8-listbar"><span className="r8-pager">① »</span><span className="r8-period"></span></div>
      <div className="screen-grid r8-real"><DataGrid columns={cols} data={[]} rowNumbers /></div>
      <p className="r10b-stub-note">{note ?? '실물 메뉴 뼈대입니다. 데이터·검색 연결은 이후 라운드에서 진행됩니다.'}</p>
    </div>
  );
}

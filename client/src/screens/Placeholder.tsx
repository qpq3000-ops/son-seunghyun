// 아직 구현되지 않은 메뉴의 자리 표시 — 전체 메뉴 트리를 Phase 0부터 보이게 한다
export function Placeholder({ name, phase }: { name: string; phase: number }) {
  return (
    <div className="screen placeholder">
      <div className="ph-box">
        <div className="ph-icon">🚧</div>
        <h3>{name}</h3>
        <p>이 메뉴는 <b>Phase {phase}</b>에서 구현됩니다.</p>
        <p className="hint">구현 스펙: docs/02-이카운트-기능-분석.md 의 해당 메뉴 섹션</p>
      </div>
    </div>
  );
}

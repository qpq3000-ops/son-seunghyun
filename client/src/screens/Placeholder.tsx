// 아직 구현되지 않은 메뉴의 자리 표시 — 전체 메뉴 트리를 Phase 0부터 보이게 한다
export function Placeholder({ name, phase }: { name: string; phase: number }) {
  return (
    <div className="screen placeholder">
      <div className="ph-box">
        <div className="ph-icon">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#c3a24a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.7 6.3a3.7 3.7 0 0 0-4.9 4.7l-6 6a1.6 1.6 0 0 0 2.3 2.3l6-6a3.7 3.7 0 0 0 4.7-4.9l-2.2 2.2-2-2z" />
          </svg>
        </div>
        <h3>{name}</h3>
        <p>이 메뉴는 <b>Phase {phase}</b>에서 구현됩니다.</p>
        <p className="hint">구현 스펙: docs/02-이카운트-기능-분석.md 의 해당 메뉴 섹션</p>
      </div>
    </div>
  );
}

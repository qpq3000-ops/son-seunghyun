// 상단 헤더 아이콘줄 (참고-실물실측 §13.5) — 실물 순서·크기·간격 시각 재현.
// 전부 기능 무관 스텁(title 안내). 프로필 원형만 onProfile(환경설정) 연결.
const ICONS: { g: string; t: string }[] = [
  { g: '❄️', t: '즐겨찾기 정리 (기능 예정)' },
  { g: '🌙', t: '화면 모드 (기능 예정)' },
  { g: '🔍', t: '검색 (기능 예정)' },
  { g: '🎧', t: '고객센터 (기능 예정)' },
  { g: '📄', t: '새 문서 (기능 예정)' },
  { g: '📝', t: '메모 (기능 예정)' },
  { g: '🔔', t: '알림 (기능 예정)' },
  { g: '🎀', t: '이벤트 (기능 예정)' },
  { g: '💬', t: '쪽지 (기능 예정)' },
  { g: '📱', t: '문자(SMS) (기능 예정)' },
  { g: '✉️', t: '메일 (기능 예정)' },
  { g: '🔒', t: '보안 (기능 예정)' },
  { g: '🖥️', t: '원격지원 (기능 예정)' },
  { g: '🕐', t: '최근 실행 (기능 예정)' },
  { g: '📒', t: '장부 (기능 예정)' },
  { g: '💰', t: '자금 (기능 예정)' },
];

// 17번: 컬러 도트 그리드(전체 아이콘/앱런처) — 이모지로 대체 불가 → 인라인 SVG
function AppGrid() {
  const cols = ['#e5484d', '#f5a623', '#30a46c', '#1f9d55', '#3b82f6', '#8b5cf6',
                '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#6366f1', '#ef4444'];
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {cols.map((c, i) => (
        <rect key={i} x={2 + (i % 3) * 6} y={1 + Math.floor(i / 3) * 5}
              width={4} height={4} rx={1} fill={c} />
      ))}
    </svg>
  );
}

export function HeaderIcons({ onProfile }: { onProfile?: () => void }) {
  return (
    <div className="hdr-icons">
      {ICONS.map((it, i) => (
        <button key={i} type="button" className="hdr-icon" title={it.t}>{it.g}</button>
      ))}
      <button type="button" className="hdr-icon" title="전체 아이콘 (기능 예정)"><AppGrid /></button>
      <button type="button" className="hdr-profile" title="내 정보 / 환경설정" onClick={onProfile}>👤</button>
    </div>
  );
}

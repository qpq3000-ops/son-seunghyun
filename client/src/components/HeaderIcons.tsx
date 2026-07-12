// 상단 헤더 아이콘줄 (참고-실물실측 §13.5) — 컬러 인라인 SVG 17종 + 프로필 원형.
// 전부 기능 무관 시각 스텁(title 안내). 프로필만 onProfile(환경설정) 연결. 이모지 미사용(§13.6-4).
import { ReactNode } from 'react';

type IconDef = { key: string; t: string; svg: ReactNode };

// 1. 눈송이(파랑)
const Snowflake = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#2f6fed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.5v19M3.8 7.25l16.4 9.5M20.2 7.25 3.8 16.75" />
    <path d="M12 6.2 9.8 4M12 6.2 14.2 4M12 17.8 9.8 20M12 17.8 14.2 20" />
    <path d="M5.9 9 3 8.2M5.9 15 3 15.8M18.1 9 21 8.2M18.1 15 21 15.8" />
  </svg>
);
// 2. 달(남색)
const Moon = (
  <svg viewBox="0 0 24 24"><path fill="#1e2f6b" d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z" /></svg>
);
// 3. 돋보기(파랑)
const Search = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#2f6fed" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.6-4.6" />
  </svg>
);
// 4. 헤드셋(슬레이트)
const Headset = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13.5v-2a7 7 0 0 1 14 0v2" />
    <path d="M19 18a2 2 0 0 1-2 2h-2.5" />
    <rect x="3" y="12.5" width="3.6" height="6" rx="1.5" fill="#4b5563" stroke="none" />
    <rect x="17.4" y="12.5" width="3.6" height="6" rx="1.5" fill="#4b5563" stroke="none" />
  </svg>
);
// 5. 문서 + 초록 플러스
const DocPlus = (
  <svg viewBox="0 0 24 24">
    <path fill="#eef1f6" stroke="#8a94a6" strokeWidth="1.3" strokeLinejoin="round" d="M6 2.6h6.8L18 7.8V19a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 19V4.2A1.6 1.6 0 0 1 6 2.6z" />
    <path fill="none" stroke="#8a94a6" strokeWidth="1.3" strokeLinejoin="round" d="M12.6 2.8v5.2H17.8" />
    <circle cx="16.8" cy="16.8" r="5" fill="#2ba24c" />
    <path stroke="#fff" strokeWidth="1.7" strokeLinecap="round" d="M16.8 14.6v4.4M14.6 16.8h4.4" />
  </svg>
);
// 6. 스프링노트 + 연필
const NotePencil = (
  <svg viewBox="0 0 24 24">
    <rect x="5.2" y="4" width="11.5" height="16" rx="1.6" fill="#eef1f6" stroke="#8a94a6" strokeWidth="1.3" />
    <path stroke="#8a94a6" strokeWidth="1.1" strokeLinecap="round" d="M8.4 8.5h5.5M8.4 11.4h5.5M8.4 14.3h3" />
    <path stroke="#f5872b" strokeWidth="1.5" strokeLinecap="round" d="M5.2 6.6H3.4M5.2 10H3.4M5.2 13.4H3.4M5.2 16.8H3.4" />
    <path fill="#f6c445" stroke="#d99a1f" strokeWidth="0.7" strokeLinejoin="round" d="M17.3 12.8l2.7 2.7-5 5-3.3.6.6-3.3z" />
    <path fill="#5b6472" d="M17.3 12.8l2.7 2.7 1-1a1.1 1.1 0 0 0 0-1.6l-1.1-1.1a1.1 1.1 0 0 0-1.6 0z" />
  </svg>
);
// 7. 종(노랑)
const Bell = (
  <svg viewBox="0 0 24 24">
    <path fill="#f6c445" stroke="#e0a91e" strokeWidth="0.9" strokeLinejoin="round" d="M12 3.2a4.8 4.8 0 0 0-4.8 4.8c0 3.8-1.4 5.6-2.3 6.6a.7.7 0 0 0 .5 1.2h13.2a.7.7 0 0 0 .5-1.2c-.9-1-2.3-2.8-2.3-6.6A4.8 4.8 0 0 0 12 3.2z" />
    <path fill="#e0a91e" d="M9.8 18a2.2 2.2 0 0 0 4.4 0z" />
    <circle cx="12" cy="3" r="1.35" fill="#f6c445" stroke="#e0a91e" strokeWidth="0.7" />
  </svg>
);
// 8. 리본/로제트(청록)
const Ribbon = (
  <svg viewBox="0 0 24 24">
    <path fill="#0f9488" d="M9.6 13.3 7.4 19.4l2.5-1 1.1 2.4 2-5.6z" />
    <path fill="#0f9488" d="M14.4 13.3l2.2 6.1-2.5-1-1.1 2.4-2-5.6z" />
    <circle cx="12" cy="8.4" r="5.9" fill="#14b8a6" />
    <circle cx="12" cy="8.4" r="3" fill="#0b7c72" />
  </svg>
);
// 9. 말풍선 2개(파랑)
const Chat2 = (
  <svg viewBox="0 0 24 24">
    <path fill="#9cc0fb" d="M11 3.6h8.5a1.8 1.8 0 0 1 1.8 1.8v4.4a1.8 1.8 0 0 1-1.8 1.8h-.6v2.6l-2.9-2.6H11a1.8 1.8 0 0 1-1.8-1.8V5.4A1.8 1.8 0 0 1 11 3.6z" />
    <path fill="#2f6fed" d="M4 7.4h8.5a1.8 1.8 0 0 1 1.8 1.8v4.4a1.8 1.8 0 0 1-1.8 1.8H8l-3.2 2.6v-2.6H4a1.8 1.8 0 0 1-1.8-1.8V9.2A1.8 1.8 0 0 1 4 7.4z" />
  </svg>
);
// 10. 폰 + 말풍선(SMS)
const PhoneChat = (
  <svg viewBox="0 0 24 24">
    <rect x="4.5" y="2.6" width="10.5" height="18.8" rx="2.2" fill="#4b5563" />
    <rect x="5.9" y="4.6" width="7.7" height="12.2" rx="0.6" fill="#eef1f6" />
    <circle cx="9.75" cy="19.1" r="0.9" fill="#cbd2dc" />
    <path fill="#2ec3a6" d="M12.8 6.2h6.4a1.7 1.7 0 0 1 1.7 1.7v3.2a1.7 1.7 0 0 1-1.7 1.7h-2.7l-2.2 1.9v-1.9h-1.5a1.7 1.7 0 0 1-1.7-1.7V7.9a1.7 1.7 0 0 1 1.7-1.7z" />
  </svg>
);
// 11. 봉투(노랑)
const Envelope = (
  <svg viewBox="0 0 24 24">
    <rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2" fill="#f6c445" stroke="#e0a91e" strokeWidth="0.9" />
    <path fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M4 7.2l8 5.6 8-5.6" />
  </svg>
);
// 12. 모니터 + 자물쇠
const MonitorLock = (
  <svg viewBox="0 0 24 24">
    <rect x="2.4" y="3.8" width="19.2" height="12.6" rx="1.7" fill="#4b5563" />
    <rect x="3.9" y="5.3" width="16.2" height="9.6" rx="0.6" fill="#dbe3ef" />
    <path stroke="#4b5563" strokeWidth="1.6" strokeLinecap="round" d="M8.5 20h7M12 16.4V20" />
    <rect x="9.4" y="9.2" width="5.2" height="4.4" rx="0.9" fill="#f5872b" />
    <path fill="none" stroke="#f5872b" strokeWidth="1.3" d="M10.6 9.2V7.9a1.4 1.4 0 0 1 2.8 0v1.3" />
  </svg>
);
// 13. 모니터(주황)
const MonitorOrange = (
  <svg viewBox="0 0 24 24">
    <rect x="2.4" y="3.8" width="19.2" height="12.6" rx="1.7" fill="#4b5563" />
    <rect x="3.9" y="5.3" width="16.2" height="9.6" rx="0.6" fill="#f5872b" />
    <path fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M8.3 10.2l2.4 2.4 4.9-4.7" />
    <path stroke="#4b5563" strokeWidth="1.6" strokeLinecap="round" d="M8.5 20h7M12 16.4V20" />
  </svg>
);
// 14. 시계(파랑)
const Clock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="#2f6fed" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.3" /><path d="M12 7.4v5.1l3.2 2" />
  </svg>
);
// 15. 장부(주황)
const Ledger = (
  <svg viewBox="0 0 24 24">
    <path fill="#f5872b" d="M6.4 3.4h11.2a1 1 0 0 1 1 1v16.2H8.2a1.8 1.8 0 0 1-1.8-1.8z" />
    <path fill="#d96e1c" d="M6.4 3.4A2.4 2.4 0 0 0 4 5.8v13.4A2.4 2.4 0 0 1 6.4 16.8h1.1V3.4z" />
    <path stroke="#fff" strokeWidth="1.4" strokeLinecap="round" d="M11 8h5M11 11h5M11 14h3.4" />
  </svg>
);
// 16. 손 + 지폐
const HandMoney = (
  <svg viewBox="0 0 24 24">
    <rect x="6.4" y="3.4" width="13.2" height="8" rx="1.2" fill="#2ba24c" />
    <circle cx="13" cy="7.4" r="1.9" fill="#bfe7c8" />
    <path fill="#eab98d" stroke="#cf9b68" strokeWidth="0.6" strokeLinejoin="round" strokeLinecap="round"
          d="M2.6 15c.9-.6 2-.5 2.9.1l2.5 1.8h3.7a1.15 1.15 0 0 1 0 2.3H8.4M2.6 15v5.4h2.2a2.1 2.1 0 0 0 1.4-.5l4.2-3.6" />
  </svg>
);
// 17. 컬러 도트 그리드(3×4 멀티컬러 — 앱런처)
const AppGrid = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {['#e5484d', '#f5a623', '#30a46c', '#1f9d55', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#6366f1', '#ef4444']
      .map((c, i) => (
        <rect key={i} x={3 + (i % 3) * 7} y={2 + Math.floor(i / 3) * 5.4} width={5} height={5} rx={1.2} fill={c} />
      ))}
  </svg>
);

const ICONS: IconDef[] = [
  { key: 'snow',    t: '즐겨찾기 정리 (기능 예정)', svg: Snowflake },
  { key: 'moon',    t: '화면 모드 (기능 예정)',     svg: Moon },
  { key: 'search',  t: '검색 (기능 예정)',          svg: Search },
  { key: 'headset', t: '고객센터 (기능 예정)',      svg: Headset },
  { key: 'docplus', t: '새 문서 (기능 예정)',       svg: DocPlus },
  { key: 'note',    t: '메모 (기능 예정)',          svg: NotePencil },
  { key: 'bell',    t: '알림 (기능 예정)',          svg: Bell },
  { key: 'ribbon',  t: '이벤트 (기능 예정)',        svg: Ribbon },
  { key: 'chat',    t: '쪽지 (기능 예정)',          svg: Chat2 },
  { key: 'sms',     t: '문자(SMS) (기능 예정)',     svg: PhoneChat },
  { key: 'mail',    t: '메일 (기능 예정)',          svg: Envelope },
  { key: 'lock',    t: '보안 (기능 예정)',          svg: MonitorLock },
  { key: 'remote',  t: '원격지원 (기능 예정)',      svg: MonitorOrange },
  { key: 'clock',   t: '최근 실행 (기능 예정)',     svg: Clock },
  { key: 'ledger',  t: '장부 (기능 예정)',          svg: Ledger },
  { key: 'fund',    t: '자금 (기능 예정)',          svg: HandMoney },
  { key: 'grid',    t: '전체 아이콘 (기능 예정)',   svg: AppGrid },
];

// 프로필 원형 안 사람 실루엣(회색). 원형 테두리·배경은 .hdr-profile CSS가 담당.
const ProfileMark = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="9" r="3.7" fill="#8a93a1" />
    <path fill="#8a93a1" d="M4.8 20.5a7.2 7.2 0 0 1 14.4 0z" />
  </svg>
);

export function HeaderIcons({ onProfile }: { onProfile?: () => void }) {
  return (
    <div className="hdr-icons">
      {ICONS.map(it => (
        <button key={it.key} type="button" className="hdr-icon" title={it.t}>{it.svg}</button>
      ))}
      <button type="button" className="hdr-profile" title="내 정보 / 환경설정" onClick={onProfile}>{ProfileMark}</button>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';

// 메인 대시보드 — Phase 0에서는 마스터 현황 + 로드맵 안내. Phase 4에서 포틀릿 완성.
export function Dashboard() {
  const [counts, setCounts] = useState({ items: 0, partners: 0, warehouses: 0 });

  useEffect(() => {
    Promise.all([
      api.get<unknown[]>('/api/items'),
      api.get<unknown[]>('/api/partners'),
      api.get<unknown[]>('/api/warehouses'),
    ]).then(([i, p, w]) => setCounts({ items: i.length, partners: p.length, warehouses: w.length }))
      .catch(() => {});
  }, []);

  const cards: { title: string; body: string; phase?: string }[] = [
    { title: '📦 품목', body: `${counts.items}건 등록됨` },
    { title: '🏪 거래처', body: `${counts.partners}건 등록됨` },
    { title: '🏭 창고/공장', body: `${counts.warehouses}건 등록됨` },
    { title: '🔥 오늘의 로스팅', body: '주문서/로스팅시트 연동', phase: 'Phase 2' },
    { title: '✅ 주문 누락 체크', body: '주문 없는 거래처 표시', phase: 'Phase 1' },
    { title: '💰 미수금 TOP', body: '입금주기 경과 거래처 강조', phase: 'Phase 1' },
    { title: '⚠️ 안전재고 미달', body: '재고 부족 품목 알림', phase: 'Phase 4' },
    { title: '📈 이번달 매출/매입', body: '월 손익 요약', phase: 'Phase 3' },
  ];

  return (
    <div className="screen dashboard">
      <p className="hint">
        시작하기: <b>기초등록</b>에서 품목(생두/제품)과 거래처를 먼저 등록하세요. 회색 카드는 다음 Phase에서 켜집니다.
      </p>
      <div className="portlets">
        {cards.map(c => (
          <div key={c.title} className={`portlet ${c.phase ? 'off' : ''}`}>
            <div className="portlet-title">{c.title}</div>
            <div className="portlet-body">{c.body}</div>
            {c.phase && <div className="portlet-phase">{c.phase}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

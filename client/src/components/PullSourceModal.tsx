import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import { fmtWon } from '../format';
import type { PullRow } from '../types';

// 끌어오기 팝업 — 견적→주문, 주문→판매, 발주→구매 전환 시 미완료(status='대기') 원본 목록을 보여주고
// 선택하면 onPick(docId)로 알려준다. 실제 헤더/라인 로딩은 호출 화면이 GET /api/docs/:id로 수행한다(설계 4.3).

interface Props {
  target: 'sale' | 'order' | 'purchase';   // 저장하려는 전표 종류
  partnerId?: number | null;                // 있으면 그 거래처만, 없으면 전체
  onPick: (docId: number) => void;
  onClose: () => void;
}

const TARGET_LABEL: Record<Props['target'], string> = {
  sale: '주문서',
  order: '견적서',
  purchase: '발주서',
};

export function PullSourceModal({ target, partnerId, onPick, onClose }: Props) {
  const [rows, setRows] = useState<PullRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams({ target });
    if (partnerId) qs.set('partner_id', String(partnerId));
    api.get<PullRow[]>(`/api/docs/pullable?${qs.toString()}`)
      .then(r => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [target, partnerId]);

  const label = TARGET_LABEL[target];
  const showTimeDate = rows.some(r => r.time_date);
  const colCount = showTimeDate ? 6 : 5;

  const pick = (id: number) => {
    onPick(id);
    onClose();
  };

  return (
    <Modal title={`${label} 불러오기`} width={720} onClose={onClose}>
      <div className="codehelp-list">
        <table className="mini-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>일자</th>
              <th style={{ width: 120 }}>전표번호</th>
              <th>거래처</th>
              <th>품목요약</th>
              {showTimeDate && <th style={{ width: 100 }}>납기일자</th>}
              <th style={{ width: 110 }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} onClick={() => pick(r.id)}>
                <td>{r.io_date}</td>
                <td>{r.doc_no}</td>
                <td>{r.partner_name}</td>
                <td>{r.item_summary}</td>
                {showTimeDate && <td>{r.time_date ?? ''}</td>}
                <td className="num">{fmtWon(r.total_amount)}</td>
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr><td colSpan={colCount} className="empty">대기 중인 {label}가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import { fmtWon } from '../format';
import type { DocListRow } from '../types';

// 찾기(F3) — 판매 전표 목록에서 골라 현재 폼에 템플릿으로 불러온다(설계-R3-IA재편성.md §5.4).
// 기존 GET /api/docs 재사용(신규 서버 없음). 상단 입력으로 전표번호/거래처 클라 필터.
interface Props {
  onLoad: (docId: number) => void;
  onClose: () => void;
}

export function DocFindModal({ onLoad, onClose }: Props) {
  const [rows, setRows] = useState<DocListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    api.get<DocListRow[]>('/api/docs?type=sale')
      .then(r => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim();
    if (!t) return rows;
    return rows.filter(r => r.doc_no.includes(t) || (r.partner_name ?? '').includes(t));
  }, [rows, q]);

  const pick = (id: number) => {
    onLoad(id);
    onClose();
  };

  return (
    <Modal title="찾기(F3)" width={760} onClose={onClose}>
      <input
        autoFocus
        className="input"
        placeholder="전표번호 또는 거래처로 검색"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div className="codehelp-list" style={{ marginTop: 10 }}>
        <table className="mini-table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>일자</th>
              <th style={{ width: 130 }}>전표번호</th>
              <th>거래처</th>
              <th>품목요약</th>
              <th style={{ width: 110 }}>합계</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} onClick={() => pick(r.id)}>
                <td>{r.io_date}</td>
                <td>{r.doc_no}</td>
                <td>{r.partner_name}</td>
                <td>{r.item_summary}</td>
                <td className="num">{fmtWon(r.total_amount)}</td>
              </tr>
            ))}
            {!loading && !filtered.length && (
              <tr><td colSpan={5} className="empty">판매 전표가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

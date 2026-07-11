import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Modal, Confirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { BoardPost } from '../types';

// 게시판 — 설계-R5-관리그룹웨어유틸.md §4.3. `memo` id 재사용(메뉴명 '메모'→'게시판').
// 기존 memo 화면은 Placeholder였고, R5에서 board_post 테이블 기반 실화면으로 교체된다.
// 목록은 서버가 이미 pinned DESC, id DESC(고정글 상단)로 정렬해 내려준다(별도 클라 정렬 불필요).

function emptyPost(): Record<string, unknown> {
  return { title: '', content: '', pinned: 0, author: '' };
}

export function BoardScreen() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<BoardPost[]>([]);
  const [detail, setDetail] = useState<BoardPost | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [confirmDel, setConfirmDel] = useState<BoardPost | null>(null);

  const load = useCallback(async (query = q) => {
    try {
      setRows(await api.get<BoardPost[]>(`/api/board?q=${encodeURIComponent(query)}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [q, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!String(editing.title ?? '').trim()) { toast.show('제목은 필수입니다.', 'error'); return; }
    try {
      if (editing.id) {
        await api.put(`/api/board/${editing.id}`, editing);
        toast.show('수정되었습니다.');
      } else {
        await api.post('/api/board', editing);
        toast.show('저장되었습니다.');
      }
      setEditing(null);
      setDetail(null);
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const togglePin = async (row: BoardPost) => {
    try {
      const updated = await api.put<BoardPost>(`/api/board/${row.id}`, { pinned: row.pinned ? 0 : 1 });
      toast.show(updated.pinned ? '상단에 고정했습니다.' : '고정을 해제했습니다.');
      setDetail(updated);
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/board/${confirmDel.id}`);
      toast.show('삭제되었습니다.');
      setConfirmDel(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
      setConfirmDel(null);
    }
  };

  return (
    <div className="screen board-screen">
      <div className="screen-bar">
        <div className="search-group">
          <input className="input" style={{ width: 220 }} placeholder="제목/내용 검색"
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') load(); }} />
          <button className="btn" onClick={() => load()}>검색</button>
        </div>
        <div className="btn-group">
          <button className="btn primary" onClick={() => setEditing(emptyPost())}>글쓰기</button>
        </div>
      </div>

      <table className="mini-table board-list">
        <thead>
          <tr><th style={{ width: 34 }}></th><th>제목</th><th style={{ width: 110 }}>작성일</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} onClick={() => setDetail(r)} className={r.pinned ? 'board-pin' : ''}>
              <td className="ctr">{r.pinned ? '📌' : ''}</td>
              <td>{r.title}</td>
              <td>{r.created_at.slice(0, 10)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} className="empty">등록된 게시글이 없습니다.</td></tr>}
        </tbody>
      </table>

      {detail && (
        <Modal title="게시글 상세" onClose={() => setDetail(null)}
          footer={
            <>
              <button className="btn" onClick={() => togglePin(detail)}>{detail.pinned ? '고정해제' : '고정'}</button>
              <button className="btn" onClick={() => setEditing({ ...detail })}>수정</button>
              <button className="btn danger" onClick={() => setConfirmDel(detail)}>삭제</button>
              <button className="btn" onClick={() => setDetail(null)}>닫기</button>
            </>
          }>
          <h3 style={{ margin: '0 0 8px' }}>{detail.title}</h3>
          <p className="hint" style={{ margin: '0 0 10px' }}>작성일 {detail.created_at.slice(0, 16).replace('T', ' ')}</p>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detail.content || '(내용 없음)'}</p>
        </Modal>
      )}

      {editing && (
        <Modal title={`게시글 ${editing.id ? '수정' : '작성'}`} onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" onClick={save}>저장</button>
            </>
          }>
          <div className="form-grid">
            <label className="span2">
              <span className="form-label">제목<em className="req">*</em></span>
              <input className="input" value={String(editing.title ?? '')}
                onChange={e => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <label className="span2">
              <span className="form-label">내용</span>
              <textarea className="input" rows={8} value={String(editing.content ?? '')}
                onChange={e => setEditing({ ...editing, content: e.target.value })} />
            </label>
            <label>
              <span className="form-label">상단 고정</span>
              <input type="checkbox" className="check" checked={Number(editing.pinned ?? 0) === 1}
                onChange={e => setEditing({ ...editing, pinned: e.target.checked ? 1 : 0 })} />
            </label>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm text={`이 게시글을 삭제할까요?\n(${confirmDel.title})`} onYes={doDelete} onNo={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

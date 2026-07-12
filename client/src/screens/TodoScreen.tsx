import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { todayISO } from '../format';
import { useToast } from '../components/Toast';
import { Confirm } from '../components/Modal';
import type { Todo } from '../types';

// To Do — 설계-R5-관리그룹웨어유틸.md §4.4. MyPage 대시보드 To Do 위젯과 같은 todo 테이블을 공유한다
// (여기서 추가/완료하면 다음 대시보드 진입 시 위젯에 자동 반영 — 별도 연동 호출 불필요, §4.8).

type Filter = 'all' | 'open' | 'done';

export function TodoScreen() {
  const toast = useToast();
  const today = todayISO();
  const [filter, setFilter] = useState<Filter>('open');
  const [rows, setRows] = useState<Todo[]>([]);
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [confirmDel, setConfirmDel] = useState<Todo | null>(null);

  const load = useCallback(async (f = filter) => {
    try {
      const q = f === 'all' ? '' : `?done=${f === 'done' ? 1 : 0}`;
      setRows(await api.get<Todo[]>(`/api/todos${q}`));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [filter, toast]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!content.trim()) { toast.show('할 일 내용을 입력하세요.', 'error'); return; }
    try {
      await api.post('/api/todos', { content: content.trim(), due_date: dueDate });
      setContent('');
      setDueDate('');
      toast.show('추가되었습니다.');
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const toggleDone = async (row: Todo) => {
    try {
      await api.put(`/api/todos/${row.id}`, { done: row.done ? 0 : 1 });
      load();
    } catch (e) { toast.show((e as Error).message, 'error'); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.del(`/api/todos/${confirmDel.id}`);
      toast.show('삭제되었습니다.');
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
      setConfirmDel(null);
    }
  };

  return (
    <div className="screen todo-screen">
      <div className="screen-bar">
        <div className="search-group">
          {(['all', 'open', 'done'] as Filter[]).map(f => (
            <button key={f} className={`r8-pill ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? '전체' : f === 'open' ? '미완료' : '완료'}
            </button>
          ))}
        </div>
        <div className="btn-group">
          <input className="input" style={{ width: 220 }} placeholder="할 일 내용"
            value={content} onChange={e => setContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          <input className="input" type="date" style={{ width: 150 }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          <button className="btn r8-primary" onClick={add}>추가</button>
        </div>
      </div>

      <ul className="todo-list">
        {rows.map(r => (
          <li key={r.id} className={`${r.done ? 'done' : ''} ${!r.done && r.due_date && r.due_date < today ? 'overdue' : ''}`}>
            <input type="checkbox" className="check" checked={!!r.done} onChange={() => toggleDone(r)} />
            <span className="td-content">{r.content}</span>
            <span className="td-due">{r.due_date || '기한 없음'}</span>
            <button className="link danger" onClick={() => setConfirmDel(r)}>삭제</button>
          </li>
        ))}
        {!rows.length && <li className="todo-empty">등록된 할 일이 없습니다.</li>}
      </ul>

      {confirmDel && (
        <Confirm text={`이 할 일을 삭제할까요?\n(${confirmDel.content})`} onYes={doDelete} onNo={() => setConfirmDel(null)} />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { api } from '../api';
import { fmtWon } from '../format';

// 코드도움: 거래처/품목 등 마스터를 검색해서 선택하는 공통 팝업 (이카운트의 코드도움 패턴)
interface Row { id: number; code: string; name: string; [k: string]: unknown }

interface Props {
  title: string;
  endpoint: string;              // 예: /api/partners
  extraColumns?: { field: string; label: string; money?: boolean }[];
  onSelect: (row: Row) => void;
  onClose: () => void;
}

export function CodeHelp({ title, endpoint, extraColumns = [], onSelect, onClose }: Props) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get<Row[]>(`${endpoint}?active=1&q=${encodeURIComponent(q)}`)
      .then(r => { if (alive) { setRows(r); setCursor(0); } })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [endpoint, q]);

  const pick = (row?: Row) => {
    const r = row ?? rows[cursor];
    if (r) { onSelect(r); onClose(); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(); }
  };

  const cols = useMemo(() => extraColumns, [extraColumns]);

  return (
    <Modal title={`${title} 코드도움`} width={640} onClose={onClose}>
      <input
        autoFocus
        className="input"
        placeholder="코드 또는 이름으로 검색 (↑↓ 이동, Enter 선택)"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="codehelp-list">
        <table className="mini-table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>코드</th>
              <th>이름</th>
              {cols.map(c => <th key={c.field}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}
                className={i === cursor ? 'sel' : ''}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(r)}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                {cols.map(c => (
                  <td key={c.field} className={c.money ? 'num' : ''}>
                    {c.money ? fmtWon(Number(r[c.field] ?? 0)) : String(r[c.field] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={2 + cols.length} className="empty">검색 결과가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

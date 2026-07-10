import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabulatorFull as Tabulator } from 'tabulator-tables';
import { DataGrid, ColumnDefinition } from './DataGrid';
import { Modal, Confirm } from './Modal';
import { useToast } from './Toast';
import { api } from '../api';

// 마스터 등록 화면 공통 패턴: 검색바 + 목록 그리드 + [신규]/더블클릭 편집 폼 모달
// 이카운트 기초등록 화면의 공통 구조를 재현한다.

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'money' | 'select' | 'textarea' | 'checkbox';
  options?: string[];          // select 용
  required?: boolean;
  placeholder?: string;
  hint?: string;
}

interface Props<T extends { id: number }> {
  title: string;
  endpoint: string;                     // 예: /api/items
  columns: ColumnDefinition[];
  fields: FormField[];
  defaults: Record<string, unknown>;
  helpText?: string;
}

export function MasterScreen<T extends { id: number }>({ title, endpoint, columns, fields, defaults, helpText }: Props<T>) {
  const toast = useToast();
  const [rows, setRows] = useState<T[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [confirmDel, setConfirmDel] = useState<T | null>(null);
  const gridRef = useRef<Tabulator | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<T[]>(`${endpoint}?q=${encodeURIComponent(q)}`));
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  }, [endpoint, q, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    for (const f of fields) {
      if (f.required && !String(editing[f.name] ?? '').trim()) {
        toast.show(`${f.label}은(는) 필수입니다.`, 'error');
        return;
      }
    }
    try {
      const body = { ...editing };
      if (editing.id) {
        await api.put(`${endpoint}/${editing.id}`, body);
        toast.show('수정되었습니다.');
      } else {
        await api.post(endpoint, body);
        toast.show('저장되었습니다.');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    try {
      await api.del(`${endpoint}/${confirmDel.id}`);
      toast.show('삭제되었습니다.');
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
      setConfirmDel(null);
    }
  };

  const gridColumns = useMemo<ColumnDefinition[]>(() => [
    ...columns,
    {
      title: '삭제', width: 60, hozAlign: 'center', headerSort: false,
      formatter: () => '<span class="link danger">삭제</span>',
      cellClick: (_e, cell) => setConfirmDel(cell.getRow().getData() as T),
    },
  ], [columns]);

  return (
    <div className="screen">
      <div className="screen-bar">
        <div className="search-group">
          <input
            className="input"
            style={{ width: 260 }}
            placeholder="코드/이름 검색"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <button className="btn" onClick={load}>검색</button>
        </div>
        <div className="btn-group">
          <button className="btn" onClick={() => gridRef.current?.download('xlsx', `${title}.xlsx`, { sheetName: title })}>
            엑셀
          </button>
          <button className="btn primary" onClick={() => setEditing({ ...defaults })}>신규</button>
        </div>
      </div>
      {helpText && <p className="hint">{helpText}</p>}
      <div className="screen-grid">
        <DataGrid<T>
          columns={gridColumns}
          data={rows}
          onRowDblClick={r => setEditing({ ...r })}
          gridRef={t => { gridRef.current = t; }}
        />
      </div>

      {editing && (
        <Modal
          title={`${title} ${editing.id ? '수정' : '신규'}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" onClick={save}>저장</button>
            </>
          }>
          <div className="form-grid">
            {fields.map(f => (
              <label key={f.name} className={f.type === 'textarea' ? 'span2' : ''}>
                <span className="form-label">
                  {f.label}{f.required && <em className="req">*</em>}
                </span>
                {f.type === 'select' ? (
                  <select
                    className="input"
                    value={String(editing[f.name] ?? '')}
                    onChange={e => setEditing({ ...editing, [f.name]: e.target.value })}>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    className="input"
                    rows={3}
                    value={String(editing[f.name] ?? '')}
                    onChange={e => setEditing({ ...editing, [f.name]: e.target.value })}
                  />
                ) : f.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    className="check"
                    checked={Number(editing[f.name] ?? 0) === 1}
                    onChange={e => setEditing({ ...editing, [f.name]: e.target.checked ? 1 : 0 })}
                  />
                ) : (
                  <input
                    className="input"
                    type={f.type === 'text' ? 'text' : 'number'}
                    step={f.type === 'money' ? 100 : f.type === 'number' ? 0.1 : undefined}
                    placeholder={f.placeholder}
                    value={String(editing[f.name] ?? '')}
                    onChange={e => setEditing({
                      ...editing,
                      [f.name]: f.type === 'text' ? e.target.value
                        : f.type === 'money' ? (e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)
                        : (e.target.value === '' ? 0 : parseFloat(e.target.value) || 0),
                    })}
                  />
                )}
                {f.hint && <span className="field-hint">{f.hint}</span>}
              </label>
            ))}
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Confirm
          text={`정말 삭제할까요?\n(연결된 자료가 있으면 삭제되지 않습니다)`}
          onYes={remove}
          onNo={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}

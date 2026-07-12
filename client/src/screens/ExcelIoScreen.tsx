import { useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import type { IoApplyResult, IoPreview } from '../types';

// 엑셀 업로드/다운로드 — 설계-R5-관리그룹웨어유틸.md §4.4b. `io` id 재사용.
// 다운로드는 브라우저 첨부 다운로드(window.location.href), 업로드는 base64 JSON dry-run 위저드(§3.8·3.9).

type ImportType = 'items' | 'partners';

// data:...;base64,XXXX 형태에서 base64 본문만 추출
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

export function ExcelIoScreen() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<ImportType>('items');
  const [filename, setFilename] = useState('');
  const [base64, setBase64] = useState('');
  const [preview, setPreview] = useState<IoPreview | null>(null);
  const [ignoreErrors, setIgnoreErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  const download = (kind: 'items' | 'partners' | 'sales') => {
    window.location.href = `/api/io/export?type=${kind}`;
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await readFileAsBase64(file);
      setFilename(file.name);
      setBase64(b64);
      setPreview(null);
      setIgnoreErrors(false);
    } catch (err) { toast.show((err as Error).message, 'error'); }
  };

  const doPreview = async () => {
    if (!base64) { toast.show('파일을 선택하세요.', 'error'); return; }
    setBusy(true);
    try {
      setPreview(await api.post<IoPreview>('/api/io/import/preview', { type, filename, base64 }));
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const doApply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await api.post<IoApplyResult>('/api/io/import/apply', { type, filename, base64 });
      toast.show(`신규 ${result.created}건, 수정 ${result.updated}건 반영되었습니다.`);
      setPreview(null);
      setBase64('');
      setFilename('');
      setIgnoreErrors(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const canApply = !!preview && (preview.stats.error === 0 || ignoreErrors);

  return (
    <div className="screen io-screen">
      <div className="io-section">
        <h3>엑셀 다운로드</h3>
        <p className="hint">이카운트 이관/백업용 엑셀을 내려받습니다.</p>
        <div className="btn-group">
          <button className="btn" onClick={() => download('items')}>품목 XLSX</button>
          <button className="btn" onClick={() => download('partners')}>거래처 XLSX</button>
          <button className="btn" onClick={() => download('sales')}>판매전표 XLSX</button>
        </div>
      </div>

      <div className="io-section io-wizard">
        <h3>엑셀 업로드(미리보기 후 반영)</h3>
        <div className="io-wizard-step">
          <span className="io-step-no">1</span>
          <select className="input" style={{ width: 140 }} value={type}
            onChange={e => { setType(e.target.value as ImportType); setPreview(null); }}>
            <option value="items">품목</option>
            <option value="partners">거래처</option>
          </select>
          <input ref={fileRef} className="input" type="file" accept=".xlsx,.xls" onChange={onFileChange} />
          <button className="btn r8-primary" disabled={!base64 || busy} onClick={doPreview}>미리보기</button>
        </div>

        {preview && (
          <>
            <div className="io-wizard-step">
              <span className="io-step-no">2</span>
              <span className="io-stat">전체 <b>{preview.stats.total}</b></span>
              <span className="io-stat new">신규 <b>{preview.stats.new}</b></span>
              <span className="io-stat update">수정 <b>{preview.stats.update}</b></span>
              <span className={`io-stat ${preview.stats.error ? 'error' : ''}`}>오류 <b>{preview.stats.error}</b></span>
            </div>

            <div className="io-preview-scroll">
              <table className="mini-table">
                <thead>
                  <tr>{preview.columns.map(c => <th key={c}>{c}</th>)}<th>처리</th></tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, i) => (
                    <tr key={i}>
                      {preview.columns.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}
                      <td>
                        <span className={`io-badge ${row._action === '신규' ? 'io-new' : 'io-update'}`}>
                          {String(row._action ?? '')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!preview.preview.length && <tr><td colSpan={preview.columns.length + 1} className="empty">미리볼 데이터가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>

            {preview.errors.length > 0 && (
              <div className="io-errors">
                <b>오류 {preview.errors.length}건</b>
                <ul>
                  {preview.errors.map((e, i) => <li key={i}>{e.row}행: {e.reason}</li>)}
                </ul>
                <label className="io-ignore">
                  <input type="checkbox" className="check" checked={ignoreErrors} onChange={e => setIgnoreErrors(e.target.checked)} />
                  오류 항목을 무시하고 나머지만 반영합니다.
                </label>
              </div>
            )}

            <div className="io-wizard-step">
              <span className="io-step-no">3</span>
              <button className="btn r8-primary" disabled={!canApply || busy} onClick={doApply}>반영</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

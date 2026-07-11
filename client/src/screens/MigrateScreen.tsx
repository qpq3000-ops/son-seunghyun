import { useRef, useState } from 'react';
import { api } from '../api';
import { fmtWon } from '../format';
import { useToast } from '../components/Toast';
import { Confirm } from '../components/Modal';
import type { MigrateApplyResult, MigratePreview } from '../types';

// 기존앱 데이터 이관(판매현황 엑셀) — 설계-R5-관리그룹웨어유틸.md §4.6. `migrate` id 재사용.
// scripts/import-sales-excel.mjs --dry-run과 동일한 매핑표를 보여준다(§3.10). 원본 스크립트는 무수정.

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

const ACTION_CLASS: Record<string, string> = { 병합: 'migrate-merge', 신규생성: 'migrate-new', 기존: 'migrate-exist', 매칭실패: 'migrate-fail' };

export function MigrateScreen() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState('');
  const [base64, setBase64] = useState('');
  const [preview, setPreview] = useState<MigratePreview | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<MigrateApplyResult | null>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await readFileAsBase64(file);
      setFilename(file.name);
      setBase64(b64);
      setPreview(null);
      setDone(null);
    } catch (err) { toast.show((err as Error).message, 'error'); }
  };

  const doPreview = async () => {
    if (!base64) { toast.show('판매현황 엑셀 파일을 선택하세요.', 'error'); return; }
    setBusy(true);
    try {
      setPreview(await api.post<MigratePreview>('/api/migrate/sales/preview', { filename, base64 }));
      setDone(null);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const doApply = async () => {
    setConfirmApply(false);
    setBusy(true);
    try {
      const result = await api.post<MigrateApplyResult>('/api/migrate/sales/apply', { filename, base64 });
      toast.show(`${result.created}건 생성되었습니다.`);
      setDone(result);
      setPreview(null);
      setBase64('');
      setFilename('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="screen migrate-screen">
      <p className="hint">
        이 매핑표는 <code>scripts/import-sales-excel.mjs --dry-run</code>과 동일 결과입니다.
        매칭 실패 거래처의 전표는 생성되지 않습니다.
      </p>

      <div className="io-wizard-step">
        <span className="io-step-no">1</span>
        <input ref={fileRef} className="input" type="file" accept=".xlsx,.xls" onChange={onFileChange} />
        <button className="btn primary" disabled={!base64 || busy} onClick={doPreview}>미리보기(dry-run)</button>
      </div>

      {preview && (
        <>
          <div className="io-wizard-step">
            <span className="io-step-no">2</span>
            <span className="io-stat">전표 <b>{preview.stats.sheet_docs}</b></span>
            <span className="io-stat new">생성대상 <b>{preview.stats.planned}</b></span>
            <span className="io-stat">이미존재 <b>{preview.stats.skipped_existing}</b></span>
            <span className={`io-stat ${preview.stats.skipped_no_partner ? 'error' : ''}`}>거래처실패 <b>{preview.stats.skipped_no_partner}</b></span>
            <span className="io-stat">품목매칭 <b>{preview.stats.item_ok}</b>/{preview.stats.item_ok + preview.stats.item_fail}</span>
          </div>
          <p className="hint">
            기간 {preview.period.from} ~ {preview.period.to} · 공급가액합 {fmtWon(preview.total_supply)}
          </p>

          <table className="mini-table migrate-map">
            <thead><tr><th>원본 거래처명</th><th>처리</th><th>대상명(코드)</th></tr></thead>
            <tbody>
              {preview.partner_map.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td><span className={`migrate-badge ${ACTION_CLASS[p.action] ?? ''}`}>{p.action}</span></td>
                  <td>{p.target_code ? `${p.target_name} (${p.target_code})` : p.target_name}</td>
                </tr>
              ))}
              {!preview.partner_map.length && <tr><td colSpan={3} className="empty">거래처 매핑 대상이 없습니다.</td></tr>}
            </tbody>
          </table>

          {preview.item_fail.length > 0 && (
            <div className="io-errors">
              <b>품목 매칭 실패 {preview.item_fail.length}건</b>
              <ul>
                {preview.item_fail.map((f, i) => <li key={i}>{f.doc_no} · {f.partner_name} · {f.item_text}</li>)}
              </ul>
            </div>
          )}

          <div className="io-wizard-step">
            <span className="io-step-no">3</span>
            {preview.stats.planned > 0 ? (
              <button className="btn primary" disabled={busy} onClick={() => setConfirmApply(true)}>승인·실행</button>
            ) : (
              <p className="hint" style={{ margin: 0 }}>생성할 전표가 없습니다(전부 이미 존재/매칭 실패).</p>
            )}
          </div>
        </>
      )}

      {done && (
        <p className="hint">이관 완료: {done.created}건 생성되었습니다.</p>
      )}

      {confirmApply && (
        <Confirm
          text={`판매현황 이관을 실행할까요?\n생성대상 ${preview?.stats.planned ?? 0}건 · 되돌릴 수 없습니다.`}
          onYes={doApply}
          onNo={() => setConfirmApply(false)}
        />
      )}
    </div>
  );
}

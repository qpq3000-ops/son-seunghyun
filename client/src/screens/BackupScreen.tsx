import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Confirm } from '../components/Modal';
import type { BackupFile, BackupList, BackupNowResult, BackupRestoreResult } from '../types';

// 백업/복원 — 설계-R5-관리그룹웨어유틸.md §4.5. `backup` id 재사용.
// 복원은 better-sqlite3 단일 오픈 핸들 제약상 서버 프로세스 재시작이 필요하다(§3.13) —
// 복원 API 호출 성공 시 서버가 종료되므로, 이 화면은 그 이후 재시작 안내 화면으로 고정된다.

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupScreen() {
  const toast = useToast();
  const [list, setList] = useState<BackupList | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage1, setStage1] = useState<BackupFile | null>(null);
  const [stage2, setStage2] = useState<BackupFile | null>(null);
  const [restarted, setRestarted] = useState<BackupRestoreResult | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.get<BackupList>('/api/backup/list'));
    } catch (e) { toast.show((e as Error).message, 'error'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const backupNow = async () => {
    setBusy(true);
    try {
      const result = await api.post<BackupNowResult>('/api/backup/now', {});
      toast.show(`백업이 생성되었습니다. (${result.file.name})`);
      load();
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  const doRestore = async () => {
    if (!stage2) return;
    setBusy(true);
    try {
      const result = await api.post<BackupRestoreResult>('/api/backup/restore', { file: stage2.name, confirm: true });
      setRestarted(result);
    } catch (e) {
      toast.show((e as Error).message, 'error');
    } finally {
      setBusy(false);
      setStage2(null);
    }
  };

  if (restarted) {
    return (
      <div className="screen backup-screen">
        <div className="backup-restarted">
          <div className="stub-icon">🔄</div>
          <h3>복원이 적용되었습니다</h3>
          <p>{restarted.message}</p>
          <p className="hint">복원 전 자동 백업: {restarted.pre_backup}</p>
          <p className="hint">서버가 종료되었습니다. 실행 창을 다시 열거나 <code>npm start</code>로 재시작하세요.</p>
        </div>
      </div>
    );
  }

  const files = list?.files ?? [];

  return (
    <div className="screen backup-screen">
      <div className="screen-bar">
        <p className="hint" style={{ margin: 0 }}>백업 파일은 {list?.dir ?? 'data/backup'}에 저장됩니다.</p>
        <div className="btn-group">
          <button className="btn primary" disabled={busy} onClick={backupNow}>지금 백업</button>
        </div>
      </div>

      <table className="stmt-table backup-list">
        <thead>
          <tr><th>파일명</th><th style={{ width: 100 }}>크기</th><th style={{ width: 160 }}>일시</th><th style={{ width: 70 }}>복원</th></tr>
        </thead>
        <tbody>
          {files.map(f => (
            <tr key={f.name}>
              <td>{f.name}</td>
              <td className="num">{humanSize(f.size)}</td>
              <td>{f.mtime.slice(0, 19).replace('T', ' ')}</td>
              <td className="ctr"><button className="link danger" onClick={() => setStage1(f)}>복원</button></td>
            </tr>
          ))}
          {!files.length && (
            <tr><td colSpan={4} className="empty-cell">백업 파일이 없습니다. [지금 백업]을 눌러 첫 백업을 만드세요.</td></tr>
          )}
        </tbody>
      </table>

      {stage1 && (
        <Confirm
          text={`현재 데이터를 이 백업으로 덮어씁니다.\n(${stage1.name})\n복원 전 자동으로 백업됩니다.`}
          onYes={() => { setStage2(stage1); setStage1(null); }}
          onNo={() => setStage1(null)}
        />
      )}
      {stage2 && (
        <Confirm
          text={`정말 이 파일로 복원할까요?\n(${stage2.name})\n복원 후 서버가 종료되며 재시작이 필요합니다.`}
          onYes={doRestore}
          onNo={() => setStage2(null)}
        />
      )}
    </div>
  );
}

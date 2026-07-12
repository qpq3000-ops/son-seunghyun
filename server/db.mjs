import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'erp.sqlite');
fs.mkdirSync(dataDir, { recursive: true });

const hadExistingDb = fs.existsSync(dbPath);

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 기동 시 자동 백업 (기존 DB가 있을 때만, 최근 30개 보관)
// 반드시 DB를 연 뒤 WAL 체크포인트로 -wal의 커밋 데이터를 본 파일에 합치고 복사한다.
// (DB를 열기 전에 본 파일만 복사하면 WAL에 남은 데이터가 전부 빠진 빈 백업이 된다)
if (hadExistingDb) {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const backupDir = path.join(dataDir, 'backup');
    fs.mkdirSync(backupDir, { recursive: true });
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
    const dest = path.join(backupDir, `erp-${stamp}.sqlite`);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(dbPath, dest);
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.sqlite')).sort();
      while (backups.length > 30) fs.unlinkSync(path.join(backupDir, backups.shift()));
    }
  } catch (e) {
    console.warn('[백업] 자동 백업 실패:', e.message);
  }
}

// 마이그레이션: server/migrations/*.sql 을 파일명 순으로 1회씩 적용
export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  const dir = path.join(root, 'server', 'migrations');
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    })();
    console.log(`[DB] 마이그레이션 적용: ${file}`);
  }
}

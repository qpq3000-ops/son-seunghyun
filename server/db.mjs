import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'erp.sqlite');
fs.mkdirSync(dataDir, { recursive: true });

// 기동 시 자동 백업 (파일이 이미 있을 때만, 최근 30개 보관)
if (fs.existsSync(dbPath)) {
  const backupDir = path.join(dataDir, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '');
  fs.copyFileSync(dbPath, path.join(backupDir, `erp-${stamp}.sqlite`));
  const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.sqlite')).sort();
  while (backups.length > 30) fs.unlinkSync(path.join(backupDir, backups.shift()));
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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

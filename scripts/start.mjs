// 로스팅 ERP 실행 스크립트: 클라이언트 빌드가 없으면 빌드 후 서버 기동, 브라우저 오픈
import { existsSync } from 'fs';
import { execSync, exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'client', 'dist', 'index.html');

if (!existsSync(dist)) {
  console.log('[시작] 클라이언트 빌드가 없어 빌드합니다 (최초 1회, 1~2분)...');
  execSync('npm run build --workspace client', { cwd: root, stdio: 'inherit' });
}

const url = 'http://localhost:8010';
const opener =
  process.platform === 'win32' ? `start "" ${url}` :
  process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;

setTimeout(() => {
  exec(opener, () => {}); // 브라우저 오픈 실패는 무시 (수동 접속 안내가 서버 로그에 있음)
}, 800);

await import('../server/index.mjs');

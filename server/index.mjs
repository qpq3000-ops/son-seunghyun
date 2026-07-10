import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { migrate } from './db.mjs';
import { masters } from './masters.mjs';

migrate();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, name: '로스팅 ERP', phase: 0 }));
app.route('/api', masters);

// 정적 파일: client/dist (SPA fallback 포함)
const distRel = path.relative(process.cwd(), path.join(root, 'client', 'dist')) || '.';
app.use('/*', serveStatic({ root: distRel }));
app.get('*', (c) => {
  const indexPath = path.join(root, 'client', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) return c.html(fs.readFileSync(indexPath, 'utf8'));
  return c.text('클라이언트 빌드가 없습니다. npm run build 를 먼저 실행하세요.', 404);
});

const port = Number(process.env.PORT || 8010);
serve({ fetch: app.fetch, port }, () => {
  console.log(`\n☕ 로스팅 ERP 실행 중: http://localhost:${port}\n   (종료: Ctrl+C)\n`);
});

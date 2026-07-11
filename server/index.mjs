import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { migrate } from './db.mjs';
import { masters } from './masters.mjs';
import { ecount } from './ecount.mjs';
import { vouchers } from './vouchers.mjs';
import { moves } from './moves.mjs';
import { receipts } from './receipts.mjs';
import { reports } from './reports.mjs';
import { statements } from './statements.mjs';
import { accounting, backfillJournals } from './accounting.mjs';
import { production } from './production.mjs';

migrate();
try { backfillJournals(); } catch (e) { console.warn('[분개 백필] 실패:', e.message); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, name: '로스팅 ERP', phase: 0 }));
app.route('/api', masters);
app.route('/api', vouchers);   // /api/docs*, /api/roast*
app.route('/api', moves);      // /api/moves* (창고이동/자가사용/불량처리/재고조정)
app.route('/api', receipts);   // /api/receipts*, /api/receivables, /api/payables
app.route('/api', reports);    // /api/stock/status, /api/stock/ledger, /api/stock/by-warehouse, /api/calendar*
app.route('/api', statements); // /api/statements* (거래명세서인쇄)
app.route('/api', accounting); // /api/accounts*, /api/journal, /api/partner-ledger, /api/monthly-pl, /api/vat-book
app.route('/api', production); // /api/bom(/:itemId), /api/production/summary
app.route('/api/ecount', ecount);
// 미등록 API 경로는 SPA fallback으로 흘려보내지 않고 404 JSON 반환
app.all('/api/*', (c) => c.json({ error: '알 수 없는 API 경로입니다.' }, 404));

// 정적 파일: client/dist (SPA fallback 포함)
const distRel = path.relative(process.cwd(), path.join(root, 'client', 'dist')) || '.';
app.use('/*', serveStatic({ root: distRel }));
app.get('*', (c) => {
  const indexPath = path.join(root, 'client', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) return c.html(fs.readFileSync(indexPath, 'utf8'));
  return c.text('클라이언트 빌드가 없습니다. npm run build 를 먼저 실행하세요.', 404);
});

const port = Number(process.env.PORT || 8010);
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`\n☕ 로스팅 ERP 실행 중: http://localhost:${port}`);
  console.log(`   같은 네트워크(사내)의 다른 PC에서는 이 컴퓨터의 IP로 접속: http://<이 PC의 IP>:${port}`);
  console.log(`   (종료: Ctrl+C)\n`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n⚠️  이미 로스팅 ERP가 실행 중입니다. 열려 있는 창을 사용하세요: http://localhost:${port}`);
    console.log(`   (다시 실행하려면 기존 창을 먼저 닫으세요)\n`);
    process.exit(0);
  }
  throw e;
});

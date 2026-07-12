// 이카운트 Open API 연동 (조회 전용)
// - 설정: data/ecount.config.json { COM_CODE, USER_ID, API_CERT_KEY, MODE: 'TEST'|'PROD', ZONE? }
//   (이 파일은 .gitignore 대상. 인증키를 코드/커밋/로그에 절대 넣지 않는다)
// - 주의: 이카운트 API는 이카운트에 등록된 공인 IP에서만 호출 가능하다.
//   즉 이 기능은 IP를 등록한 사용자 PC에서 서버를 실행했을 때만 동작한다.
// - 쓰기(입력) API는 회사 데이터가 바뀌므로 여기 구현하지 않는다 (조회만).
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'data', 'ecount.config.json');

function loadConfig() {
  if (!fs.existsSync(configPath)) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!cfg.COM_CODE || !cfg.USER_ID || !cfg.API_CERT_KEY) return null;
    return { MODE: 'TEST', ZONE: '', ...cfg };
  } catch {
    return null;
  }
}

const apiHost = (cfg, zone) =>
  cfg.MODE === 'PROD' ? `https://oapi${zone}.ecount.com` : `https://sboapi${zone}.ecount.com`;

async function callEcount(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 302 || res.status === 412) {
    throw new Error('이카운트 API 호출량 제한에 걸렸습니다. 잠시 후 다시 시도하세요. (1일 5,000건)');
  }
  if (!res.ok) throw new Error(`이카운트 응답 오류 (HTTP ${res.status})`);
  const json = await res.json();
  return json;
}

async function login(cfg) {
  let zone = (cfg.ZONE || '').trim();
  if (!zone) {
    const zres = await callEcount(`${apiHost(cfg, '')}/OAPI/V2/Zone`, { COM_CODE: cfg.COM_CODE });
    zone = zres?.Data?.ZONE;
    if (!zone) throw new Error('Zone 조회에 실패했습니다. 회사코드를 확인하세요.');
  }
  const lres = await callEcount(`${apiHost(cfg, zone)}/OAPI/V2/OAPILogin`, {
    COM_CODE: cfg.COM_CODE,
    USER_ID: cfg.USER_ID,
    API_CERT_KEY: cfg.API_CERT_KEY,
    LAN_TYPE: 'ko-KR',
    ZONE: zone,
  });
  const sessionId = lres?.Data?.Datas?.SESSION_ID;
  if (!sessionId) {
    const code = lres?.Data?.Code ?? lres?.Status;
    throw new Error(
      `이카운트 로그인 실패 (Code ${code ?? '?'}). 점검: ① 이 PC의 공인 IP가 이카운트에 등록되어 있는지 ` +
      `② 테스트키인데 MODE가 PROD로 되어 있지 않은지 ③ 인증키 유효기간(1년) 만료 여부.`
    );
  }
  return { zone, sessionId };
}

export const ecount = new Hono();

// 연동 상태 (인증키는 노출하지 않음)
ecount.get('/status', (c) => {
  const cfg = loadConfig();
  if (!cfg) return c.json({ configured: false, hint: 'data/ecount.config.json 파일을 만들어 접속정보를 넣으세요.' });
  return c.json({ configured: true, mode: cfg.MODE, zone: cfg.ZONE || '(자동조회)', com_code: cfg.COM_CODE });
});

// 품목 동기화: 이카운트 품목 마스터 → item 테이블 upsert (조회 전용, 우리 DB만 변경)
ecount.post('/sync-items', async (c) => {
  const cfg = loadConfig();
  if (!cfg) return c.json({ error: '이카운트 접속정보(data/ecount.config.json)가 없습니다.' }, 400);
  try {
    const { zone, sessionId } = await login(cfg);
    const pres = await callEcount(
      `${apiHost(cfg, zone)}/OAPI/V2/InventoryBasic/GetBasicProductsList?SESSION_ID=${encodeURIComponent(sessionId)}`,
      {},
    );
    const rows = pres?.Data?.Result ?? [];
    if (!Array.isArray(rows) || !rows.length) return c.json({ error: '이카운트에서 품목을 받지 못했습니다.' }, 502);

    // PROD_TYPE: 0=원재료(생두), 1=제품(원두), 3=상품
    const typeMap = { '0': '원재료', '1': '제품', '3': '상품' };
    const upsert = db.prepare(`
      INSERT INTO item (code, name, spec, unit, item_type, price_in, price_out, active)
      VALUES (@code, @name, @spec, 'kg', @item_type, @price_in, @price_out, 1)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name, spec = excluded.spec, item_type = excluded.item_type,
        price_in = excluded.price_in, price_out = excluded.price_out
    `);
    let n = 0;
    db.transaction(() => {
      for (const r of rows) {
        const code = String(r.PROD_CD ?? '').trim();
        const name = String(r.PROD_DES ?? '').trim();
        if (!code || !name) continue;
        upsert.run({
          code, name,
          spec: String(r.SIZE_DES ?? '').trim(),
          item_type: typeMap[String(r.PROD_TYPE ?? '')] ?? '상품',
          price_in: Math.trunc(Number(r.IN_PRICE) || 0),
          price_out: Math.trunc(Number(r.OUT_PRICE) || 0),
        });
        n++;
      }
      // 생두↔원두 자동 짝 연결 (00NNN ↔ a00NNN)
      db.prepare(`
        UPDATE item SET paired_item_id = (
          SELECT g.id FROM item g WHERE g.code = 'a' || item.code AND g.item_type = '원재료'
        )
        WHERE item.item_type IN ('제품','상품')
          AND EXISTS (SELECT 1 FROM item g WHERE g.code = 'a' || item.code AND g.item_type = '원재료')
      `).run();
    })();
    return c.json({ ok: true, synced: n });
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});

// 재고현황 조회 (기초재고 이관/대사용 — DB는 변경하지 않고 결과만 반환)
ecount.post('/inventory', async (c) => {
  const cfg = loadConfig();
  if (!cfg) return c.json({ error: '이카운트 접속정보(data/ecount.config.json)가 없습니다.' }, 400);
  let baseDate = '';
  try {
    const body = await c.req.json();
    baseDate = String(body?.base_date ?? '').replace(/-/g, '');
  } catch { /* body 없으면 오늘 */ }
  if (!/^\d{8}$/.test(baseDate)) {
    const d = new Date();
    baseDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  try {
    const { zone, sessionId } = await login(cfg);
    const ires = await callEcount(
      `${apiHost(cfg, zone)}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatus?SESSION_ID=${encodeURIComponent(sessionId)}`,
      { BASE_DATE: baseDate },
    );
    const rows = ires?.Data?.Result ?? [];
    return c.json({ ok: true, base_date: baseDate, count: rows.length, rows });
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});

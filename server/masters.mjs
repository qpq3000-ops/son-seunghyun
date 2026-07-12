// 마스터 CRUD 라우트 (품목/거래처/창고/프로젝트/특별단가/환경설정)
import { Hono } from 'hono';
import { db } from './db.mjs';

// 테이블별 허용 컬럼 (id/created_at 제외) — 화이트리스트 방식으로만 저장
const TABLES = {
  items: {
    table: 'item',
    cols: ['code', 'name', 'spec', 'unit', 'item_type', 'price_in', 'price_out',
      'safety_qty', 'use_lot', 'is_set', 'barcode', 'memo', 'active'],
    required: ['code', 'name'],
    label: '품목',
  },
  partners: {
    table: 'partner',
    cols: ['code', 'name', 'biz_no', 'ceo', 'phone', 'email', 'address',
      'partner_type', 'pay_cycle', 'memo', 'active'],
    required: ['code', 'name'],
    label: '거래처',
  },
  warehouses: {
    table: 'warehouse',
    cols: ['code', 'name', 'wh_type', 'memo', 'active'],
    required: ['code', 'name'],
    label: '창고',
  },
  projects: {
    table: 'project',
    cols: ['code', 'name', 'memo', 'active'],
    required: ['code', 'name'],
    label: '프로젝트',
  },
  employees: {
    table: 'employee',
    cols: ['code', 'name', 'phone', 'memo', 'active'],
    required: ['code', 'name'],
    label: '사원',
  },
};

export const masters = new Hono();

function err(c, status, message) {
  return c.json({ error: message }, status);
}

// JSON body 안전 파싱: 잘못된 JSON / 객체가 아닌 body 는 null 반환 → 400 처리
async function readBody(c) {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
    return null;
  } catch {
    return null;
  }
}

function friendlySqlError(e, label) {
  if (String(e.message).includes('UNIQUE')) return `${label} 코드가 이미 존재합니다.`;
  if (String(e.message).includes('CHECK')) return `허용되지 않는 값이 있습니다.`;
  if (String(e.message).includes('FOREIGN KEY')) return `연결된 자료가 있어 처리할 수 없습니다.`;
  return e.message;
}

for (const [route, cfg] of Object.entries(TABLES)) {
  const { table, cols, required, label } = cfg;

  masters.get(`/${route}`, (c) => {
    const q = (c.req.query('q') || '').trim();
    const activeOnly = c.req.query('active') === '1';
    let sql = `SELECT * FROM ${table}`;
    const conds = [];
    const params = [];
    if (q) {
      conds.push(`(code LIKE ? OR name LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }
    if (activeOnly) conds.push(`active = 1`);
    if (conds.length) sql += ` WHERE ` + conds.join(' AND ');
    sql += ` ORDER BY code`;
    return c.json(db.prepare(sql).all(...params));
  });

  masters.post(`/${route}`, async (c) => {
    const body = await readBody(c);
    if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
    for (const r of required) {
      if (!String(body[r] ?? '').trim()) return err(c, 400, `${label}의 ${r === 'code' ? '코드' : '이름'}은(는) 필수입니다.`);
    }
    const keys = cols.filter(k => body[k] !== undefined);
    try {
      const info = db.prepare(
        `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
      ).run(...keys.map(k => body[k]));
      return c.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(info.lastInsertRowid), 201);
    } catch (e) {
      return err(c, 400, friendlySqlError(e, label));
    }
  });

  masters.put(`/${route}/:id`, async (c) => {
    const id = Number(c.req.param('id'));
    const body = await readBody(c);
    if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
    // 수정 시에도 필수값(코드/이름)을 빈 값으로 덮어쓰지 못하게 검증
    for (const r of required) {
      if (body[r] !== undefined && !String(body[r] ?? '').trim()) {
        return err(c, 400, `${label}의 ${r === 'code' ? '코드' : '이름'}은(는) 비울 수 없습니다.`);
      }
    }
    const keys = cols.filter(k => body[k] !== undefined);
    if (!keys.length) return err(c, 400, '변경할 내용이 없습니다.');
    try {
      const info = db.prepare(
        `UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`
      ).run(...keys.map(k => body[k]), id);
      if (!info.changes) return err(c, 404, `${label}을(를) 찾을 수 없습니다.`);
      return c.json(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    } catch (e) {
      return err(c, 400, friendlySqlError(e, label));
    }
  });

  masters.delete(`/${route}/:id`, (c) => {
    const id = Number(c.req.param('id'));
    try {
      const info = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      if (!info.changes) return err(c, 404, `${label}을(를) 찾을 수 없습니다.`);
      return c.json({ ok: true });
    } catch (e) {
      return err(c, 400, friendlySqlError(e, label));
    }
  });
}

// ---- 특별단가 (거래처×품목 조인 목록) ----
masters.get('/price-special', (c) => {
  const partnerId = c.req.query('partner_id');
  let sql = `SELECT ps.id, ps.partner_id, ps.item_id, ps.price, ps.memo,
      p.code AS partner_code, p.name AS partner_name,
      i.code AS item_code, i.name AS item_name, i.unit AS item_unit, i.price_out AS item_price_out
    FROM price_special ps
    JOIN partner p ON p.id = ps.partner_id
    JOIN item i ON i.id = ps.item_id`;
  const params = [];
  if (partnerId) { sql += ` WHERE ps.partner_id = ?`; params.push(Number(partnerId)); }
  sql += ` ORDER BY p.code, i.code`;
  return c.json(db.prepare(sql).all(...params));
});

masters.post('/price-special', async (c) => {
  const b = await readBody(c);
  if (!b) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  if (!b.partner_id || !b.item_id) return err(c, 400, '거래처와 품목을 선택하세요.');
  if (!Number.isInteger(b.price) || b.price < 0) return err(c, 400, '단가는 0 이상의 정수(원)여야 합니다.');
  try {
    // upsert가 UPDATE로 처리되면 lastInsertRowid가 엉뚱한 값이므로 id는 재조회로 반환
    const row = db.prepare(
      `INSERT INTO price_special (partner_id, item_id, price, memo) VALUES (?,?,?,?)
       ON CONFLICT(partner_id, item_id) DO UPDATE SET price = excluded.price, memo = excluded.memo
       RETURNING id`
    ).get(b.partner_id, b.item_id, b.price, b.memo ?? '');
    return c.json({ ok: true, id: row.id }, 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '특별단가'));
  }
});

masters.delete('/price-special/:id', (c) => {
  const info = db.prepare(`DELETE FROM price_special WHERE id = ?`).run(Number(c.req.param('id')));
  if (!info.changes) return err(c, 404, '특별단가를 찾을 수 없습니다.');
  return c.json({ ok: true });
});

// ---- 환경설정 ----
masters.get('/settings', (c) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return c.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

masters.put('/settings', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  db.transaction(() => {
    for (const [k, v] of Object.entries(body)) upsert.run(k, String(v ?? ''));
  })();
  return c.json({ ok: true });
});

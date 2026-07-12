// 그룹웨어 — 게시판(board_post) + To Do(todo) CRUD.
// masters.mjs·ledger.mjs 무수정 — 공용 헬퍼만 ledger.mjs에서 import 재사용한다.
import { Hono } from 'hono';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, validId } from './ledger.mjs';

export const groupware = new Hono();

// ══════════════════════════════════════════════════════════════
// 3.6 게시판 — /api/board*
// ══════════════════════════════════════════════════════════════
groupware.get('/board', (c) => {
  const q = (c.req.query('q') || '').trim();
  const like = q ? `%${q}%` : '';
  const rows = db.prepare(`
    SELECT id, title, content, pinned, author, created_at, updated_at
    FROM board_post
    WHERE (? = '' OR title LIKE ? OR content LIKE ?)
    ORDER BY pinned DESC, id DESC
  `).all(q, like, like);
  return c.json(rows);
});

groupware.get('/board/:id', (c) => {
  const id = validId(c);
  const row = id ? db.prepare(`SELECT id, title, content, pinned, author, created_at, updated_at FROM board_post WHERE id = ?`).get(id) : null;
  if (!row) return err(c, 404, '게시글을 찾을 수 없습니다.');
  return c.json(row);
});

groupware.post('/board', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const title = String(body.title ?? '').trim();
  if (!title) return err(c, 400, '제목은 필수입니다.');
  const content = String(body.content ?? '');
  const pinned = Number(body.pinned) ? 1 : 0;
  const author = String(body.author ?? '');

  try {
    const info = db.prepare(`INSERT INTO board_post (title, content, pinned, author) VALUES (?,?,?,?)`)
      .run(title, content, pinned, author);
    return c.json(db.prepare(`SELECT id, title, content, pinned, author, created_at, updated_at FROM board_post WHERE id = ?`).get(info.lastInsertRowid), 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '게시글'));
  }
});

groupware.put('/board/:id', async (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT * FROM board_post WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '게시글을 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  if (body.title !== undefined && !String(body.title ?? '').trim()) return err(c, 400, '제목은 비울 수 없습니다.');

  const title = body.title !== undefined ? String(body.title).trim() : existing.title;
  const content = body.content !== undefined ? String(body.content ?? '') : existing.content;
  const pinned = body.pinned !== undefined ? (Number(body.pinned) ? 1 : 0) : existing.pinned;
  const author = body.author !== undefined ? String(body.author ?? '') : existing.author;

  try {
    db.prepare(`UPDATE board_post SET title=?, content=?, pinned=?, author=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(title, content, pinned, author, id);
    return c.json(db.prepare(`SELECT id, title, content, pinned, author, created_at, updated_at FROM board_post WHERE id = ?`).get(id));
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '게시글'));
  }
});

groupware.delete('/board/:id', (c) => {
  const id = validId(c);
  const info = id ? db.prepare(`DELETE FROM board_post WHERE id = ?`).run(id) : { changes: 0 };
  if (!info.changes) return err(c, 404, '게시글을 찾을 수 없습니다.');
  return c.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
// 3.7 To Do — /api/todos* (MyPage 위젯 연동은 mypage.mjs에 동일 SQL 로컬 복제 — §3.7)
// ══════════════════════════════════════════════════════════════
groupware.get('/todos', (c) => {
  const doneQ = c.req.query('done');
  const done = doneQ === '0' || doneQ === '1' ? Number(doneQ) : null;
  const rows = db.prepare(`
    SELECT id, content, due_date, done, done_at, created_at FROM todo
    WHERE (? IS NULL OR done = ?)
    ORDER BY done ASC, (due_date='') ASC, due_date ASC, id DESC
  `).all(done, done);
  return c.json(rows);
});

groupware.post('/todos', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const content = String(body.content ?? '').trim();
  if (!content) return err(c, 400, '할일 내용은 필수입니다.');
  const dueDate = String(body.due_date ?? '');

  try {
    const info = db.prepare(`INSERT INTO todo (content, due_date, done) VALUES (?, ?, 0)`).run(content, dueDate);
    return c.json(db.prepare(`SELECT id, content, due_date, done, done_at, created_at FROM todo WHERE id = ?`).get(info.lastInsertRowid), 201);
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '할일'));
  }
});

groupware.put('/todos/:id', async (c) => {
  const id = validId(c);
  const existing = id ? db.prepare(`SELECT * FROM todo WHERE id = ?`).get(id) : null;
  if (!existing) return err(c, 404, '할일을 찾을 수 없습니다.');

  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  if (body.content !== undefined && !String(body.content ?? '').trim()) return err(c, 400, '할일 내용은 비울 수 없습니다.');

  const content = body.content !== undefined ? String(body.content).trim() : existing.content;
  const dueDate = body.due_date !== undefined ? String(body.due_date ?? '') : existing.due_date;
  const done = body.done !== undefined ? (Number(body.done) ? 1 : 0) : existing.done;

  try {
    db.prepare(`
      UPDATE todo SET content=?, due_date=?, done=?,
        done_at=CASE WHEN ?=1 THEN datetime('now','localtime') ELSE NULL END
      WHERE id=?
    `).run(content, dueDate, done, done, id);
    return c.json(db.prepare(`SELECT id, content, due_date, done, done_at, created_at FROM todo WHERE id = ?`).get(id));
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '할일'));
  }
});

groupware.delete('/todos/:id', (c) => {
  const id = validId(c);
  const info = id ? db.prepare(`DELETE FROM todo WHERE id = ?`).run(id) : { changes: 0 };
  if (!info.changes) return err(c, 404, '할일을 찾을 수 없습니다.');
  return c.json({ ok: true });
});

// Self-Customizing — 엑셀 업로드/다운로드(io) + 백업/복원(backup) + 기존앱 데이터 이관(migrate).
// masters.mjs·db.mjs·ledger.mjs 무수정.
// - 엑셀 이관(io)은 scripts/import-ecount-excel.mjs, 판매현황 이관(migrate)은 scripts/import-sales-excel.mjs의
//   파싱·매핑·doc_seq 처리 로직을 "승격 복제"한 것이다(스크립트 원본은 그대로 남겨 CLI로도 동작 — §3.9·3.10).
// - 백업 로직은 db.mjs:20-37의 WAL-aware 백업을 doBackup()으로 격리 복제한다(db.mjs 무수정 — §3.12).
import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { db } from './db.mjs';
import { err, readBody, friendlySqlError, calcAmounts, getVatRound, round1 } from './ledger.mjs';

export const admin = new Hono();

const asStr = (v) => String(v ?? '').trim();

// base64(또는 data URL "data:...;base64,xxx") → Buffer. 디코드 실패/빈 값은 null.
function decodeBase64(input) {
  if (typeof input !== 'string' || !input) return null;
  const idx = input.indexOf('base64,');
  const raw = idx >= 0 ? input.slice(idx + 7) : input;
  try {
    const buf = Buffer.from(raw, 'base64');
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

// 헤더 행에서 후보 이름들 중 처음 일치하는 컬럼 인덱스를 찾는다(컬럼 순서가 달라도 안전 — 자체 내보낸
// 엑셀을 그대로 되올려도(왕복) 동작하도록 위치가 아니라 이름으로 찾는다. import-sales-excel.mjs의
// col[] 방식과 동일한 사상).
function findCol(header, ...names) {
  for (const name of names) {
    const idx = header.findIndex((cell) => asStr(cell) === name);
    if (idx >= 0) return idx;
  }
  return -1;
}

// 이카운트 'YES'/'NO' 표기와 우리 자체 내보내기의 0/1(숫자) 표기를 모두 사용여부로 인식한다.
function toActive(v) {
  const s = asStr(v).toUpperCase();
  return s === 'YES' || s === '1' || s === 'TRUE' ? 1 : 0;
}

// ══════════════════════════════════════════════════════════════
// 3.8 엑셀 다운로드 — GET /api/io/export?type=items|partners|sales
// ══════════════════════════════════════════════════════════════
const EXPORT_SPECS = {
  items: {
    sheetName: '품목',
    fname: '품목목록',
    header: ['품목코드', '품목명', '규격', '단위', '품목구분', '입고단가', '출고단가', '사용'],
    query: () => db.prepare(`SELECT code,name,spec,unit,item_type,price_in,price_out,active FROM item ORDER BY code`).all()
      .map((r) => ({
        품목코드: r.code, 품목명: r.name, 규격: r.spec, 단위: r.unit, 품목구분: r.item_type,
        입고단가: r.price_in, 출고단가: r.price_out, 사용: r.active,
      })),
  },
  partners: {
    sheetName: '거래처',
    fname: '거래처목록',
    header: ['거래처코드', '거래처명', '사업자번호', '대표자', '전화', '구분', '사용'],
    query: () => db.prepare(`SELECT code,name,biz_no,ceo,phone,partner_type,active FROM partner ORDER BY code`).all()
      .map((r) => ({
        거래처코드: r.code, 거래처명: r.name, 사업자번호: r.biz_no, 대표자: r.ceo,
        전화: r.phone, 구분: r.partner_type, 사용: r.active,
      })),
  },
  sales: {
    sheetName: '판매전표',
    fname: '판매전표목록',
    header: ['전표번호', '일자', '거래처', '수량', '공급가액', '부가세', '합계'],
    query: () => db.prepare(`
      SELECT d.doc_no, d.io_date, p.name AS partner_name, d.total_qty, d.total_supply, d.total_vat, d.total_amount
      FROM doc d LEFT JOIN partner p ON p.id = d.partner_id
      WHERE d.doc_type = 'sale' ORDER BY d.io_date, d.id
    `).all().map((r) => ({
      전표번호: r.doc_no, 일자: r.io_date, 거래처: r.partner_name ?? '',
      수량: r.total_qty, 공급가액: r.total_supply, 부가세: r.total_vat, 합계: r.total_amount,
    })),
  },
};

admin.get('/io/export', (c) => {
  const type = c.req.query('type');
  const spec = EXPORT_SPECS[type];
  if (!spec) return err(c, 400, '지원하지 않는 다운로드 유형입니다.');

  const records = spec.query();
  // 데이터 0건이어도 헤더 행은 항상 나오도록 aoa(배열의 배열)로 시트를 만든다(json_to_sheet는 빈 배열이면
  // 헤더조차 안 써서 '헤더만 있는 빈 시트'(§3.8 엣지) 요구를 못 채운다).
  const aoa = [spec.header, ...records.map((r) => spec.header.map((h) => r[h]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, spec.sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return c.body(buf, 200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(spec.fname)}.xlsx"`,
  });
});

// ══════════════════════════════════════════════════════════════
// 3.9 엑셀 업로드(dry-run/apply) — POST /api/io/import/preview·/apply
// import-ecount-excel.mjs의 헤더행 탐지·타임스탬프 행 제외·typeMap·코드기준 upsert 판정을 복제.
// ══════════════════════════════════════════════════════════════
function parseItemsRows(rows) {
  const headerIdx = rows.findIndex((r) => asStr(r[0]) === '품목코드');
  if (headerIdx < 0) return { error: '헤더(품목코드)를 찾지 못했습니다.' };
  const header = rows[headerIdx];
  const idx = {
    name: findCol(header, '품목명'),
    spec: findCol(header, '규격', '규격정보'),
    unit: findCol(header, '단위'),
    item_type: findCol(header, '품목구분'),
    active: findCol(header, '사용'),
  };
  // import-ecount-excel.mjs와 동일 typeMap. 자체 내보내기는 대괄호 없는 원본 enum 값을 그대로 쓰므로 함께 인식한다.
  const typeMap = { '[원재료]': '원재료', '[부재료]': '부자재', '[제품]': '제품', '[상품]': '상품', '[반제품]': '제품' };
  const validTypes = new Set(['원재료', '부자재', '제품', '상품']);
  const existingCodes = new Set(db.prepare('SELECT code FROM item').all().map((r) => r.code));

  const records = [];
  const errors = [];
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const rowNo = headerIdx + 2 + i; // 1-based 엑셀 행 번호(대략)
    const code = asStr(r[0]);
    if (!code) return;
    if (/^\d{4}\/\d{2}\/\d{2}/.test(code)) return; // 이카운트 다운로드 마지막 타임스탬프 행 제외
    const name = idx.name >= 0 ? asStr(r[idx.name]) : '';
    if (!name) { errors.push({ row: rowNo, reason: '품목명 없음' }); return; }
    const rawType = idx.item_type >= 0 ? asStr(r[idx.item_type]) : '';
    const item_type = typeMap[rawType] ?? (validTypes.has(rawType) ? rawType : '상품');
    const spec = idx.spec >= 0 ? asStr(r[idx.spec]) : '';
    const unit = (idx.unit >= 0 ? asStr(r[idx.unit]) : '') || 'kg';
    const active = idx.active >= 0 ? toActive(r[idx.active]) : 1;
    const action = existingCodes.has(code) ? '수정' : '신규';
    records.push({
      raw: { code, name, spec, unit, item_type, active },
      display: { 품목코드: code, 품목명: name, 규격: spec, 단위: unit, 품목구분: item_type, 사용: active ? 'Y' : 'N' },
      action,
    });
  });
  return { records, errors, columns: ['품목코드', '품목명', '규격', '단위', '품목구분', '사용'] };
}

function parsePartnersRows(rows) {
  const headerIdx = rows.findIndex((r) => asStr(r[0]) === '거래처코드');
  if (headerIdx < 0) return { error: '헤더(거래처코드)를 찾지 못했습니다.' };
  const header = rows[headerIdx];
  const idx = {
    name: findCol(header, '거래처명'),
    ceo: findCol(header, '대표자', '대표자명'),
    phone: findCol(header, '전화'),
    mobile: findCol(header, '모바일'),
    bizNo: findCol(header, '사업자번호'),
    partnerType: findCol(header, '구분'),
    active: findCol(header, '사용'),
  };
  const PARTNER_TYPES = new Set(['매출', '매입', '매출+매입']);
  const existingCodes = new Set(db.prepare('SELECT code FROM partner').all().map((r) => r.code));

  const records = [];
  const errors = [];
  rows.slice(headerIdx + 1).forEach((r, i) => {
    const rowNo = headerIdx + 2 + i;
    const code = asStr(r[0]);
    if (!code) return;
    if (/^\d{4}\/\d{2}\/\d{2}/.test(code)) return;
    const name = idx.name >= 0 ? asStr(r[idx.name]) : '';
    if (!name) { errors.push({ row: rowNo, reason: '거래처명 없음' }); return; }
    const ceo = idx.ceo >= 0 ? asStr(r[idx.ceo]) : '';
    const phone = (idx.phone >= 0 ? asStr(r[idx.phone]) : '') || (idx.mobile >= 0 ? asStr(r[idx.mobile]) : '');
    const bizNoCol = idx.bizNo >= 0 ? asStr(r[idx.bizNo]) : '';
    const biz_no = bizNoCol || (/^\d{10}$/.test(code) ? code : '');
    const rawPartnerType = idx.partnerType >= 0 ? asStr(r[idx.partnerType]) : '';
    const partner_type = PARTNER_TYPES.has(rawPartnerType) ? rawPartnerType : '매출';
    const active = idx.active >= 0 ? toActive(r[idx.active]) : 1;
    const action = existingCodes.has(code) ? '수정' : '신규';
    records.push({
      raw: { code, name, ceo, phone, biz_no, partner_type, active },
      display: { 거래처코드: code, 거래처명: name, 사업자번호: biz_no, 대표자: ceo, 전화: phone, 구분: partner_type, 사용: active ? 'Y' : 'N' },
      action,
    });
  });
  return { records, errors, columns: ['거래처코드', '거래처명', '사업자번호', '대표자', '전화', '구분', '사용'] };
}

function readUploadedWorkbook(base64) {
  const buf = decodeBase64(base64);
  if (!buf) return { error: '파일 데이터를 읽을 수 없습니다.' };
  let wb;
  try { wb = XLSX.read(buf); } catch { return { error: '엑셀 파일을 읽을 수 없습니다.' }; }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { error: '시트를 찾을 수 없습니다.' };
  return { rows: XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) };
}

admin.post('/io/import/preview', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  if (!['items', 'partners'].includes(body.type)) return err(c, 400, '지원하지 않는 업로드 유형입니다.');

  const sheet = readUploadedWorkbook(body.base64);
  if (sheet.error) return err(c, 400, sheet.error);
  const parsed = body.type === 'items' ? parseItemsRows(sheet.rows) : parsePartnersRows(sheet.rows);
  if (parsed.error) return err(c, 400, parsed.error);

  const { records, errors, columns } = parsed;
  const preview = records.map((r) => ({ ...r.display, _action: r.action }));
  const stats = {
    total: records.length + errors.length,
    new: records.filter((r) => r.action === '신규').length,
    update: records.filter((r) => r.action === '수정').length,
    error: errors.length,
  };
  return c.json({ type: body.type, columns, preview, stats, errors });
});

// apply는 preview와 동일 파싱을 재수행한다(stateless 재전송 — 세션 없이 base64를 다시 받는다, §3.9).
admin.post('/io/import/apply', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  if (!['items', 'partners'].includes(body.type)) return err(c, 400, '지원하지 않는 업로드 유형입니다.');

  const sheet = readUploadedWorkbook(body.base64);
  if (sheet.error) return err(c, 400, sheet.error);
  const parsed = body.type === 'items' ? parseItemsRows(sheet.rows) : parsePartnersRows(sheet.rows);
  if (parsed.error) return err(c, 400, parsed.error);

  let created = 0;
  let updated = 0;
  try {
    const upsert = body.type === 'items'
      ? db.prepare(`
          INSERT INTO item (code, name, spec, unit, item_type, active)
          VALUES (@code, @name, @spec, @unit, @item_type, @active)
          ON CONFLICT(code) DO UPDATE SET
            name = excluded.name, spec = excluded.spec, item_type = excluded.item_type, active = excluded.active
        `)
      : db.prepare(`
          INSERT INTO partner (code, name, ceo, phone, biz_no, partner_type, active)
          VALUES (@code, @name, @ceo, @phone, @biz_no, @partner_type, @active)
          ON CONFLICT(code) DO UPDATE SET
            name = excluded.name, ceo = excluded.ceo, phone = excluded.phone, active = excluded.active
        `);
    db.transaction(() => {
      for (const r of parsed.records) {
        upsert.run(r.raw);
        if (r.action === '신규') created++; else updated++;
      }
    })();
  } catch (e) {
    return err(c, 400, friendlySqlError(e, body.type === 'items' ? '품목' : '거래처'));
  }
  return c.json({ created, updated });
});

// ══════════════════════════════════════════════════════════════
// 3.10 판매 데이터 이관(dry-run/apply) — POST /api/migrate/sales/preview·/apply
// scripts/import-sales-excel.mjs의 파싱·매핑·doc_seq 처리 로직을 승격 복제(스크립트 원본 무수정, CLI 병존).
// ══════════════════════════════════════════════════════════════
const PARTNER_MERGE = {
  '카페엘리스': '카페앨리스',
  '전미용': '전미옥님 빨래방',
  '어울림센터': '어울림센터(둔포)',
};
const PARTNER_NEW = {
  '카페 권곡': { code: 'IMP-0001', name: '카페 권곡' },
  '아산시 먹거리재단': { code: 'IMP-0002', name: '아산시 먹거리재단' },
  '청담 르엘 스카이 라운지': { code: 'IMP-0003', name: '청담 르엘 스카이 라운지' },
};

function normalizeItemText(s) {
  return asStr(s).replace(/\([^()]*\)\s*$/, '').trim().replace(/\s+/g, ' ');
}

// dry-run과 apply 공용 분석. base64 → 워크북 파싱 → 거래처매핑/품목매칭/전표그룹핑까지 계산한다(DB 미변경).
function analyzeSales(base64) {
  const buf = decodeBase64(base64);
  if (!buf) return { error: '파일 데이터를 읽을 수 없습니다.' };
  let wb;
  try { wb = XLSX.read(buf); } catch { return { error: '엑셀 파일을 읽을 수 없습니다.' }; }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { error: '시트를 찾을 수 없습니다.' };
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const HEADERS = ['일자-No.', '품목명(규격)', '수량', '단가', '공급가액', '부가세', '합계', '거래처명'];
  const headerRowIdx = rows.findIndex((r) => HEADERS.every((h) => r.some((cell) => asStr(cell) === h)));
  if (headerRowIdx < 0) {
    return { error: '헤더 행(일자-No./품목명(규격)/수량/단가/공급가액/부가세/합계/거래처명)을 찾지 못했습니다.' };
  }
  const headerRow = rows[headerRowIdx];
  const col = {};
  for (const h of HEADERS) col[h] = headerRow.findIndex((cell) => asStr(cell) === h);

  const DOC_NO_RE = /^(\d{4})\/(\d{2})\/(\d{2})-(\d+)$/;

  const items = db.prepare('SELECT id, code, name FROM item').all();
  const itemByExact = new Map(items.map((i) => [i.name, i]));
  const itemByNoSpace = new Map(items.map((i) => [i.name.replace(/\s+/g, ''), i]));
  function matchItem(text) {
    const norm = normalizeItemText(text);
    return itemByExact.get(norm) || itemByNoSpace.get(norm.replace(/\s+/g, '')) || null;
  }

  // create=false(dry-run)면 신규 거래처를 실제로 만들지 않고 예정 결과만 리포트한다.
  function resolvePartner(excelName, create) {
    const targetName = PARTNER_MERGE[excelName] ?? excelName;
    const found = db.prepare('SELECT id, code, name FROM partner WHERE name = ?').get(targetName);
    if (found) {
      return { id: found.id, targetCode: found.code, targetName: found.name, matched: true, action: PARTNER_MERGE[excelName] ? '병합' : '기존' };
    }
    const spec = PARTNER_NEW[excelName];
    if (spec) {
      if (create) {
        const row = db.prepare(`
          INSERT INTO partner (code, name, partner_type, pay_cycle, active) VALUES (?, ?, '매출', '당일', 1)
          ON CONFLICT(code) DO UPDATE SET name = excluded.name
          RETURNING id, code, name
        `).get(spec.code, spec.name);
        return { id: row.id, targetCode: row.code, targetName: row.name, matched: true, action: '신규생성' };
      }
      return { id: null, targetCode: spec.code, targetName: spec.name, matched: true, action: '신규생성' };
    }
    return { id: null, targetCode: null, targetName: excelName, matched: false, action: '매칭실패' };
  }

  const dataRows = rows.slice(headerRowIdx + 1).filter((r) => DOC_NO_RE.test(asStr(r[col['일자-No.']])));
  const groups = new Map(); // doc_no -> { ymd, seqNo, ioDate, partnerName, lines:[...] }
  for (const r of dataRows) {
    const m = DOC_NO_RE.exec(asStr(r[col['일자-No.']]));
    const ymd = `${m[1]}${m[2]}${m[3]}`;
    const seqNo = Number(m[4]);
    const ioDate = `${m[1]}-${m[2]}-${m[3]}`;
    const docNo = `${ymd}-${seqNo}`;
    const partnerName = asStr(r[col['거래처명']]);
    const line = {
      itemText: asStr(r[col['품목명(규격)']]),
      qty: round1(Number(r[col['수량']]) || 0),
      price: Math.trunc(Number(r[col['단가']]) || 0),
      vatRaw: Number(r[col['부가세']]) || 0,
    };
    if (!groups.has(docNo)) groups.set(docNo, { ymd, seqNo, ioDate, partnerName, lines: [] });
    groups.get(docNo).lines.push(line);
  }

  const partnerNamesInSheet = [...new Set([...groups.values()].map((g) => g.partnerName))];
  const partnerMapPreview = partnerNamesInSheet.map((name) => ({ name, ...resolvePartner(name, false) }));

  const vatRound = getVatRound();
  const itemMatchFail = [];
  let itemMatchOk = 0;
  let totalSupplyAll = 0;

  const existingDocNos = new Set(db.prepare(`SELECT doc_no FROM doc WHERE doc_type = 'sale'`).all().map((r) => r.doc_no));

  const plannedDocs = [];
  let skippedExisting = 0;
  let skippedNoPartner = 0;

  for (const [docNo, g] of groups) {
    if (existingDocNos.has(docNo)) { skippedExisting++; continue; }
    const partnerResolved = resolvePartner(g.partnerName, false);
    if (!partnerResolved.matched) { skippedNoPartner++; continue; }

    const matchedLines = [];
    for (const l of g.lines) {
      const item = matchItem(l.itemText);
      if (!item) { itemMatchFail.push({ doc_no: docNo, partner_name: g.partnerName, item_text: l.itemText }); continue; }
      itemMatchOk++;
      matchedLines.push({ ...l, item });
    }
    if (!matchedLines.length) continue;

    const taxMode = matchedLines[0].vatRaw > 0 ? '과세' : '면세';
    let supply = 0;
    for (const l of matchedLines) supply += calcAmounts(l.qty, l.price, taxMode, vatRound).supply;
    totalSupplyAll += supply;

    plannedDocs.push({ docNo, ymd: g.ymd, seqNo: g.seqNo, ioDate: g.ioDate, partnerName: g.partnerName, taxMode, lines: matchedLines });
  }

  const allDates = [...groups.values()].map((g) => g.ioDate).sort();

  return {
    groups, partnerMapPreview, itemMatchFail, itemMatchOk, totalSupplyAll,
    plannedDocs, skippedExisting, skippedNoPartner, allDates, vatRound, resolvePartner,
  };
}

admin.post('/migrate/sales/preview', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const a = analyzeSales(body.base64);
  if (a.error) return err(c, 400, a.error);

  return c.json({
    partner_map: a.partnerMapPreview.map((p) => ({ name: p.name, action: p.action, target_name: p.targetName, target_code: p.targetCode, matched: p.matched })),
    stats: {
      sheet_docs: a.groups.size, planned: a.plannedDocs.length,
      skipped_existing: a.skippedExisting, skipped_no_partner: a.skippedNoPartner,
      item_ok: a.itemMatchOk, item_fail: a.itemMatchFail.length,
    },
    item_fail: a.itemMatchFail,
    period: { from: a.allDates[0] ?? '', to: a.allDates[a.allDates.length - 1] ?? '' },
    total_supply: a.totalSupplyAll,
  });
});

// apply도 stateless 재전송(base64 재파싱) — doc_no 기준 재실행 안전(이미 존재하면 skip, §3.10).
admin.post('/migrate/sales/apply', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  const a = analyzeSales(body.base64);
  if (a.error) return err(c, 400, a.error);

  const warehouse = db.prepare(`SELECT id FROM warehouse WHERE wh_type = '창고' ORDER BY id LIMIT 1`).get();
  if (!warehouse) return err(c, 400, '기본 판매 창고(창고구분=창고)가 없습니다.');
  const warehouseId = warehouse.id;

  let created = 0;
  const maxSeqByYmd = new Map();
  for (const g of a.groups.values()) maxSeqByYmd.set(g.ymd, Math.max(maxSeqByYmd.get(g.ymd) ?? 0, g.seqNo));

  try {
    db.transaction(() => {
      const insDoc = db.prepare(`
        INSERT INTO doc (doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode, project_id, memo,
                          total_qty, total_supply, total_vat, total_amount, status)
        VALUES (?, 'sale', ?, ?, ?, ?, NULL, '', ?, ?, ?, ?, '완료')
      `);
      const insLine = db.prepare(`
        INSERT INTO doc_line (doc_id, line_no, item_id, line_role, qty, price, supply_amt, vat_amt, remarks)
        VALUES (?,?,?,'normal',?,?,?,?,'')
      `);
      const insLedger = db.prepare(`
        INSERT INTO stock_ledger (doc_id, doc_line_id, io_date, item_id, warehouse_id, io_type, qty)
        VALUES (?,?,?,?,?,'판매',?)
      `);

      for (const d of a.plannedDocs) {
        const partner = a.resolvePartner(d.partnerName, true);
        if (!partner.id) continue; // 이론상 도달하지 않음(매칭 실패는 plannedDocs에서 이미 제외)

        let totalQty = 0, totalSupply = 0, totalVat = 0;
        const calced = d.lines.map((l) => {
          const { supply, vat } = calcAmounts(l.qty, l.price, d.taxMode, a.vatRound);
          totalQty += l.qty; totalSupply += supply; totalVat += vat;
          return { ...l, supply, vat };
        });

        const info = insDoc.run(
          d.docNo, d.ioDate, partner.id, warehouseId, d.taxMode,
          round1(totalQty), totalSupply, totalVat, totalSupply + totalVat,
        );
        const docId = info.lastInsertRowid;

        calced.forEach((l, idx) => {
          const lineInfo = insLine.run(docId, idx + 1, l.item.id, l.qty, l.price, l.supply, l.vat);
          insLedger.run(docId, lineInfo.lastInsertRowid, d.ioDate, l.item.id, warehouseId, -l.qty);
        });
        created++;
      }

      // 이후 수기 판매입력이 이관 번호 다음부터 채번되도록 doc_seq 카운터를 일자별 최대 N으로 정렬
      const upsertSeq = db.prepare(`
        INSERT INTO doc_seq (io_date, seq_key, last_no) VALUES (?, 'sale', ?)
        ON CONFLICT(io_date, seq_key) DO UPDATE SET last_no = MAX(last_no, excluded.last_no)
      `);
      for (const [ymd, n] of maxSeqByYmd) upsertSeq.run(ymd, n);
    })();
  } catch (e) {
    return err(c, 400, friendlySqlError(e, '판매 이관'));
  }

  return c.json({ created });
});

// ══════════════════════════════════════════════════════════════
// 3.11~3.13 백업/복원 — GET /api/backup/list, POST /api/backup/now, POST /api/backup/restore
// db.mjs:13 export const db = new Database(dbPath)는 모듈 싱글턴으로 WAL 파일을 열어둔 채 유지한다.
// 열려 있는 DB 파일을 런타임에 인-플레이스로 덮어쓰는 것은 손상 위험이 있어 안전하지 않다(§3.13).
// → 복원은 "복원 전 자동백업 → 파일 교체 → process.exit(0)"로 설계(재시작 필요, start.mjs는 워처 없음).
// ══════════════════════════════════════════════════════════════
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'erp.sqlite');
const backupDir = path.join(dataDir, 'backup');

// db.mjs:20-37의 기동 백업 로직을 격리 복제한 것(db.mjs 무수정 유지) — WAL 체크포인트 후 복사, 30개 초과분 정리.
function doBackup() {
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.mkdirSync(backupDir, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const dest = path.join(backupDir, `erp-${stamp}.sqlite`);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(dbPath, dest);
    const backups = fs.readdirSync(backupDir).filter((f) => f.endsWith('.sqlite')).sort();
    while (backups.length > 30) fs.unlinkSync(path.join(backupDir, backups.shift()));
  }
  const st = fs.statSync(dest);
  return { name: path.basename(dest), size: st.size };
}

admin.get('/backup/list', (c) => {
  fs.mkdirSync(backupDir, { recursive: true });
  const files = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const st = fs.statSync(path.join(backupDir, f));
      return { name: f, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name)); // 최신 먼저
  return c.json({ dir: 'data/backup', files });
});

admin.post('/backup/now', (c) => {
  try {
    const file = doBackup();
    return c.json({ ok: true, file });
  } catch (e) {
    return err(c, 500, `백업 중 오류가 발생했습니다: ${e.message}`);
  }
});

// 복원은 better-sqlite3 단일 오픈 핸들 제약상 프로세스 재시작이 필요하다(런타임 인-플레이스 스왑 불가).
// db.mjs 무수정 유지를 위해 백업 로직은 doBackup()으로 격리 복제.
admin.post('/backup/restore', async (c) => {
  const body = await readBody(c);
  if (!body) return err(c, 400, '요청 본문이 올바르지 않습니다.');
  if (body.confirm !== true) return err(c, 400, '복원은 2단계 확인이 필요합니다.');

  const file = path.basename(String(body.file ?? '')); // 경로 탈출 차단('..' 거부 — basename만 사용)
  const src = path.join(backupDir, file);
  if (!file || !file.endsWith('.sqlite') || !fs.existsSync(src)) return err(c, 404, '백업 파일을 찾을 수 없습니다.');

  const preBackup = doBackup(); // 복원 전 자동백업(현재 상태 안전망 — 잘못 복원 시 되돌리기용)

  // 응답 먼저 전송(브라우저가 안내를 받도록 flush) → 이후 스왑·종료(§3.13)
  setTimeout(() => {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close(); // 싱글턴을 닫아 추가 쓰기 차단(이후 요청은 서버 종료로 무의미)
      fs.copyFileSync(src, dbPath);
      for (const sfx of ['-wal', '-shm']) {
        const p = dbPath + sfx;
        if (fs.existsSync(p)) fs.unlinkSync(p); // stale 사이드카 제거
      }
    } finally {
      process.exit(0); // 재시작 시 db.mjs가 복원된 파일을 깨끗이 연다(+기동 자동백업 1개 더 생성)
    }
  }, 200);

  return c.json({
    ok: true, needs_restart: true, pre_backup: preBackup.name,
    message: '복원이 준비되었습니다. 서버가 종료되면 다시 실행하세요.',
  });
});

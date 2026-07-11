// 이카운트 [판매현황] 엑셀 다운로드 → 판매 전표(doc sale + doc_line + stock_ledger) 대량 이관
// 사용법:
//   node scripts/import-sales-excel.mjs --dry-run   매핑표·통계·매칭 실패 목록만 출력(DB 미변경)
//   node scripts/import-sales-excel.mjs             실제 실행(트랜잭션으로 생성)
// 입력 파일: data/import/38OH8XNWOY2SI14.xlsx
// 재실행해도 안전: doc_no(=엑셀 원본 '일자-No.') 기준으로 이미 있으면 그 전표 통째로 건너뜀.
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { db, migrate } from '../server/db.mjs';
import { calcAmounts, getVatRound, round1 } from '../server/ledger.mjs';

migrate();

const DRY_RUN = process.argv.includes('--dry-run');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filePath = path.join(root, 'data', 'import', '38OH8XNWOY2SI14.xlsx');

const asStr = (v) => String(v ?? '').trim();

if (!fs.existsSync(filePath)) {
  console.log(`[건너뜀] ${path.relative(root, filePath)} 없음 — 이카운트 [판매현황] 화면에서 엑셀 다운로드 후 data/import/ 에 넣으세요.`);
  process.exit(0);
}

const wb = XLSX.read(fs.readFileSync(filePath));
const ws = wb.Sheets[wb.SheetNames[0]];
// header:1 → 2차원 배열. 1행 제목("판매현황"), 헤더행은 그 아래 어딘가(정확한 행 번호를 가정하지 않고 텍스트로 탐지)
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const HEADERS = ['일자-No.', '품목명(규격)', '수량', '단가', '공급가액', '부가세', '합계', '거래처명'];
const headerRowIdx = rows.findIndex(r => HEADERS.every(h => r.some(cell => asStr(cell) === h)));
if (headerRowIdx < 0) {
  console.error('[오류] 헤더 행(일자-No./품목명(규격)/수량/단가/공급가액/부가세/합계/거래처명)을 찾지 못했습니다.');
  process.exit(1);
}
const headerRow = rows[headerRowIdx];
const col = {};
for (const h of HEADERS) col[h] = headerRow.findIndex(cell => asStr(cell) === h);

// '일자-No.' 예: "2024/01/02-1" → io_date "2024-01-02", doc_no "20240102-1"
const DOC_NO_RE = /^(\d{4})\/(\d{2})\/(\d{2})-(\d+)$/;

// ── 품목명(규격) 정규화: 끝의 괄호(규격) 제거 + 공백 정리 ─────────
function normalizeItemText(s) {
  return asStr(s).replace(/\([^()]*\)\s*$/, '').trim().replace(/\s+/g, ' ');
}

const items = db.prepare('SELECT id, code, name FROM item').all();
const itemByExact = new Map(items.map(i => [i.name, i]));
const itemByNoSpace = new Map(items.map(i => [i.name.replace(/\s+/g, ''), i]));
function matchItem(text) {
  const norm = normalizeItemText(text);
  return itemByExact.get(norm) || itemByNoSpace.get(norm.replace(/\s+/g, '')) || null;
}

// ── 거래처 병합 매핑(내장, 설계 문서 3.6) ──────────────────────
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

// create=false(dry-run)면 신규 거래처를 실제로 만들지 않고 예정 결과만 리포트한다.
// 반환 필드는 targetName/targetCode로 둔다(호출부의 엑셀 원본 거래처명과 이름 충돌 방지).
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

// ── 데이터 행 → 전표(doc_no) 그룹핑 ────────────────────────────
const dataRows = rows.slice(headerRowIdx + 1).filter(r => DOC_NO_RE.test(asStr(r[col['일자-No.']])));

const groups = new Map(); // doc_no -> { ymd, seqNo, ioDate, partnerName, lines: [{itemText, qty, price, vatRaw}] }
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

// ── 매핑표/통계 준비(dry-run·실행 공용) ────────────────────────
const partnerNamesInSheet = [...new Set([...groups.values()].map(g => g.partnerName))];
const partnerMapPreview = partnerNamesInSheet.map(name => ({ name, ...resolvePartner(name, false) }));

const vatRound = getVatRound();
const itemMatchFail = [];   // { doc_no, partner_name, item_text }
let itemMatchOk = 0;
let totalSupplyAll = 0;

const existingDocNos = new Set(
  db.prepare(`SELECT doc_no FROM doc WHERE doc_type = 'sale'`).all().map(r => r.doc_no)
);

const plannedDocs = [];     // 실제 생성 대상(이미 존재하지 않고, 매칭 파트너/라인이 1개 이상인 그룹)
let skippedExisting = 0;
let skippedNoPartner = 0;

for (const [docNo, g] of groups) {
  if (existingDocNos.has(docNo)) { skippedExisting++; continue; }

  const partnerResolved = resolvePartner(g.partnerName, false);
  if (!partnerResolved.matched) { skippedNoPartner++; continue; }

  const matchedLines = [];
  for (const l of g.lines) {
    const item = matchItem(l.itemText);
    if (!item) {
      itemMatchFail.push({ doc_no: docNo, partner_name: g.partnerName, item_text: l.itemText });
      continue;
    }
    itemMatchOk++;
    matchedLines.push({ ...l, item });
  }
  if (!matchedLines.length) continue;

  const taxMode = matchedLines[0].vatRaw > 0 ? '과세' : '면세';
  let supply = 0;
  for (const l of matchedLines) {
    supply += calcAmounts(l.qty, l.price, taxMode, vatRound).supply;
  }
  totalSupplyAll += supply;

  plannedDocs.push({ docNo, ymd: g.ymd, seqNo: g.seqNo, ioDate: g.ioDate, partnerName: g.partnerName, taxMode, lines: matchedLines });
}

const allDates = [...groups.values()].map(g => g.ioDate).sort();

// ── 리포트 출력 ────────────────────────────────────────────
console.log('=== 거래처 매핑표 ===');
for (const p of partnerMapPreview) {
  const target = p.matched ? `${p.targetName}${p.targetCode ? ` (${p.targetCode})` : ''}` : '(매칭 실패 — 생성 안 함)';
  console.log(`  ${p.action.padEnd(6)} ${p.name.padEnd(20)} → ${target}`);
}

console.log('\n=== 통계 ===');
console.log(`전표(엑셀 기준) : ${groups.size}건`);
console.log(`  - 생성 대상    : ${plannedDocs.length}건`);
console.log(`  - 이미 존재(건너뜀) : ${skippedExisting}건`);
console.log(`  - 거래처 매칭 실패(건너뜀) : ${skippedNoPartner}건`);
console.log(`라인 매칭 성공/실패 : ${itemMatchOk}건 / ${itemMatchFail.length}건`);
if (itemMatchFail.length) {
  console.log('  [품목 매칭 실패 목록]');
  for (const f of itemMatchFail) {
    console.log(`    전표 ${f.doc_no} / 거래처 ${f.partner_name} / 품목명(규격) "${f.item_text}"`);
  }
}
console.log(`기간 : ${allDates[0] ?? '-'} ~ ${allDates[allDates.length - 1] ?? '-'}`);
console.log(`공급가액 합계(생성 대상 기준) : ${totalSupplyAll.toLocaleString()}원`);

if (DRY_RUN) {
  console.log('\n[dry-run] DB에 아무것도 쓰지 않았습니다.');
  process.exit(0);
}

// ── 실제 실행 ─────────────────────────────────────────────
const warehouse = db.prepare(`SELECT id FROM warehouse WHERE wh_type = '창고' ORDER BY id LIMIT 1`).get();
if (!warehouse) {
  console.error('[오류] 기본 판매 창고(wh_type=창고)가 없습니다.');
  process.exit(1);
}
const warehouseId = warehouse.id;

let created = 0;
const maxSeqByYmd = new Map(); // ymd -> 이 실행에서 확인된 최대 N (스킵된 것 포함, 전체 groups 기준)
for (const g of groups.values()) {
  maxSeqByYmd.set(g.ymd, Math.max(maxSeqByYmd.get(g.ymd) ?? 0, g.seqNo));
}

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

  for (const d of plannedDocs) {
    const partner = resolvePartner(d.partnerName, true);
    if (!partner.id) continue; // 이론상 도달하지 않음(매칭 실패는 plannedDocs에서 이미 제외)

    let totalQty = 0, totalSupply = 0, totalVat = 0;
    const calced = d.lines.map(l => {
      const { supply, vat } = calcAmounts(l.qty, l.price, d.taxMode, vatRound);
      totalQty += l.qty; totalSupply += supply; totalVat += vat;
      return { ...l, supply, vat };
    });

    const info = insDoc.run(
      d.docNo, d.ioDate, partner.id, warehouseId, d.taxMode,
      round1(totalQty), totalSupply, totalVat, totalSupply + totalVat
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

console.log(`\n=== 실행 완료 ===`);
console.log(`생성된 전표 : ${created}건`);

// 이카운트 엑셀 다운로드 파일 → 마스터 이관 스크립트
// 사용법: node scripts/import-ecount-excel.mjs
// 입력 파일 (data/import/ 에 넣기):
//   ESA009M.xlsx — 이카운트 [품목등록] 화면의 엑셀 다운로드
//   ESA001M.xlsx — 이카운트 [거래처등록] 화면의 엑셀 다운로드
// 재실행해도 안전: 코드 기준 upsert (기존 행은 이름/단가 등만 갱신)
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { db, migrate } from '../server/db.mjs';

migrate();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importDir = path.join(root, 'data', 'import');

function readSheet(file) {
  const p = path.join(importDir, file);
  if (!fs.existsSync(p)) {
    console.log(`[건너뜀] ${file} 없음 — 이카운트에서 엑셀 다운로드 후 data/import/ 에 넣으세요.`);
    return null;
  }
  const wb = XLSX.read(fs.readFileSync(p));
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 → 2차원 배열. 이카운트 다운로드는 1행 제목, 2행 컬럼헤더, 이후 데이터, 마지막 행 타임스탬프
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

const asStr = (v) => String(v ?? '').trim();

// ── 품목 (ESA009M: 품목코드, 품목명, 품목구분, 규격정보, 품목그룹1명, 검색창내용, 사용) ──
function importItems() {
  const rows = readSheet('ESA009M.xlsx');
  if (!rows) return;
  const header = rows.findIndex(r => asStr(r[0]) === '품목코드');
  if (header < 0) { console.log('[품목] 헤더(품목코드)를 찾지 못했습니다.'); return; }

  const typeMap = { '[원재료]': '원재료', '[부재료]': '부자재', '[제품]': '제품', '[상품]': '상품', '[반제품]': '제품' };
  const upsert = db.prepare(`
    INSERT INTO item (code, name, spec, unit, item_type, active)
    VALUES (@code, @name, @spec, @unit, @item_type, @active)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name, spec = excluded.spec, item_type = excluded.item_type, active = excluded.active
  `);

  let n = 0;
  db.transaction(() => {
    for (const r of rows.slice(header + 1)) {
      const code = asStr(r[0]);
      const name = asStr(r[1]);
      if (!code || !name) continue;                       // 빈 행/타임스탬프 행 제외
      if (/^\d{4}\/\d{2}\/\d{2}/.test(code)) continue;    // 마지막 타임스탬프 행
      const rawType = asStr(r[2]);
      upsert.run({
        code, name,
        spec: asStr(r[3]),
        unit: 'kg',
        item_type: typeMap[rawType] ?? '상품',
        active: asStr(r[6]).toUpperCase() === 'YES' ? 1 : 0,
      });
      n++;
    }
  })();
  console.log(`[품목] ${n}건 이관 완료`);

  // 생두(a코드) ↔ 원두(같은 번호 00코드) 자동 짝 연결: a00019 → 00019
  const pair = db.prepare(`
    UPDATE item SET paired_item_id = (
      SELECT g.id FROM item g WHERE g.code = 'a' || item.code AND g.item_type = '원재료'
    )
    WHERE item.item_type IN ('제품','상품')
      AND EXISTS (SELECT 1 FROM item g WHERE g.code = 'a' || item.code AND g.item_type = '원재료')
  `).run();
  console.log(`[품목] 생두↔원두 자동 짝 연결: ${pair.changes}건 (코드 규칙 00NNN ↔ a00NNN)`);
}

// ── 거래처 (ESA001M: 거래처코드, 거래처명, 대표자명, 전화, 모바일, 검색창내용, 사용구분, 이체정보) ──
function importPartners() {
  const rows = readSheet('ESA001M.xlsx');
  if (!rows) return;
  const header = rows.findIndex(r => asStr(r[0]) === '거래처코드');
  if (header < 0) { console.log('[거래처] 헤더(거래처코드)를 찾지 못했습니다.'); return; }

  const upsert = db.prepare(`
    INSERT INTO partner (code, name, ceo, phone, biz_no, partner_type, active)
    VALUES (@code, @name, @ceo, @phone, @biz_no, @partner_type, @active)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name, ceo = excluded.ceo, phone = excluded.phone, active = excluded.active
  `);

  let n = 0;
  db.transaction(() => {
    for (const r of rows.slice(header + 1)) {
      const code = asStr(r[0]);
      const name = asStr(r[1]);
      if (!code || !name) continue;
      if (/^\d{4}\/\d{2}\/\d{2}/.test(code)) continue;
      const phone = asStr(r[3]) || asStr(r[4]);
      upsert.run({
        code, name,
        ceo: asStr(r[2]),
        phone,
        biz_no: /^\d{10}$/.test(code) ? code : '',        // 이카운트는 사업자번호를 코드로 쓰는 관행
        partner_type: '매출',
        active: asStr(r[6]).toUpperCase() === 'YES' ? 1 : 0,
      });
      n++;
    }
  })();
  console.log(`[거래처] ${n}건 이관 완료`);
}

importItems();
importPartners();

const items = db.prepare('SELECT item_type, COUNT(*) n FROM item GROUP BY item_type').all();
const partners = db.prepare('SELECT COUNT(*) n FROM partner').get();
console.log('\n=== 이관 후 현황 ===');
console.log('품목:', items.map(r => `${r.item_type} ${r.n}건`).join(', '));
console.log('거래처:', partners.n, '건');

# 설계 — Phase 2 잔여 + Phase 3 회계 코어 (BOM·생산현황·창고별재고·달력 + 계정과목·자동분개·거래처원장·월별손익)

> 이 문서는 **구현 계약**이며 `설계-Phase1-전표엔진.md` · `설계-Phase15-전표체인.md`의 **증보판**이다.
> 서버 소넷과 클라이언트 소넷은 이 문서의 DDL·API JSON·화면 스펙을 그대로 구현한다. 임의 변경 금지. 애매하면 이 문서의 예시 JSON을 정답으로 삼는다.
>
> 전제(Phase 1/1.5와 동일): 전표 = 헤더(`doc`) + 품목 라인(`doc_line`). 재고의 유일한 진실 = `stock_ledger`(append-only).
> 금액은 원 단위 정수, 수량은 kg REAL(소수 1자리). **금액 계산·검증·채번은 전적으로 서버 책임**.
>
> **Phase 3의 새 불변식**: 회계장부의 유일한 진실 = `journal`/`journal_line`(복식부기 분개). 분개는 `stock_ledger`와
> **똑같은 파생 원장**이다 — 원천 전표(`doc`의 sale/purchase, `receipt`의 수금/지불)를 저장/수정하면 트랜잭션 안에서
> 재작성되고, 원천을 삭제하면 **FK `ON DELETE CASCADE`로 자동 정리**된다. 로스팅·기타이동·견적·주문·발주는 분개를 만들지 않는다.
> 차변합계 = 대변합계는 **서버가 커밋 전에 강제**한다(불일치 시 트랜잭션 롤백).
>
> **이번 범위 = 8개 메뉴**: BOM등록(`bom`) · 생산현황/수율분석(`prod-status`) · 창고별재고현황(`stock-wh`) · 달력(`calendar`)
> · 계정과목(`account`) · 분개장(`journal`) · 거래처원장(`partner-ledger`) · 월별손익(`monthly-pl`).
> **보너스(+1)**: 매입매출장(`vat-book`) — 월별손익과 같은 파일·같은 도메인이라 저비용이라 포함한다.
> → 구현 후 Phase 0–3 대상 메뉴 기준 **33/41 ≈ 80%** 도달(+매입매출장 시 34/41 ≈ 83%). Phase 4(문자/메모/엑셀IO/백업 등)는 분모에서 제외.

---

## 0. 코드 컨벤션 (Phase 1/1.5와 동일 — 재확인)

- **주석·에러 메시지·토스트**: 전부 한국어. 서버 `c.json({ error: '…' }, status)`, 클라는 서버 메시지 그대로 토스트.
- **JSON body 파싱**: `ledger.mjs`의 `readBody(c)` 재사용(잘못된/배열 body → `null` → 400).
- **화이트리스트 컬럼**: 클라가 보낸 계산·식별 필드(금액·전표번호·`is_system` 등)는 신뢰하지 않고 서버가 재계산/재판정.
- **트랜잭션**: 모든 다중 write는 `db.transaction(() => {…})()`. 분개 재작성은 원천 전표 저장 트랜잭션 **안**에서 수행.
- **DB pragma**: `foreign_keys = ON`(db.mjs 기설정). FK 위반은 `friendlySqlError`로 한국어 변환.
- **라우트 등록 순서**: 정적 경로를 파라미터 경로(`/:id`)보다 **먼저** 등록.
- **조회 화면 기간 기본값**: 이번달 1일~오늘(`format.ts`의 `monthStartISO()`/`todayISO()`).
- **읽기 전용 리포트는 페이지 없이 전체 반환**(1인/소량 데이터 전제).

---

## 1. 마이그레이션 005 — DDL 전문 (실 DB 사본 검증 완료)

파일: `server/migrations/005_accounting.sql`(신규). 기존 러너(`db.mjs > migrate()`)가 파일명 순으로 1회 적용한다.
러너는 파일 전체를 한 트랜잭션으로 감싸고 `foreign_keys=ON` 상태로 실행한다. 005는 **신규 테이블 생성 + 계정 시딩**만 하므로
004처럼 테이블 재빌드가 필요 없다(기존 `doc`/`receipt`/`stock_ledger`는 건드리지 않음).

> **사본 검증 요약**(원본 `data/erp.sqlite` 변경 없이 사본으로 실측): ① 러너 방식(트랜잭션+FK ON)으로 005 적용 성공, `foreign_key_check` = 빈 배열(무결성 OK).
> ② 판매(과세/면세)·구매·수금·지불 시드에 백필 → 분개 5건 전부 차대변 일치. ③ 백필 재실행 시 추가 0건(멱등). ④ 판매 전표 삭제 시 분개 헤더·라인 `CASCADE`로 동반 제거, 나머지 분개 유지. ⑤ 계정 27개·시스템 계정 8개 시딩 확인.

```sql
-- Phase 3: 회계 코어 — 계정과목(account) + 자동분개(journal/journal_line)  [마이그레이션 005]
-- 규칙(003/004과 동일): 금액 INTEGER(원). 분개는 stock_ledger처럼 '파생 원장'이다 — 원천 전표(doc/receipt)
-- 저장/수정/삭제 시 트랜잭션 안에서 재작성된다. 원천 삭제 시 FK ON DELETE CASCADE로 자동 정리된다.
-- 차대변 합계 일치는 서버(accounting.mjs)가 강제한다(DB는 dr/cr 비음·상호배타만 검증).

-- ── 계정과목 마스터 ───────────────────────────────────────────
CREATE TABLE account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 계정코드(전산회계 표준 관례). 자동분개 규칙이 이 코드를 참조한다
  name TEXT NOT NULL,                        -- 계정명
  category TEXT NOT NULL
    CHECK (category IN ('자산','부채','자본','수익','비용')),   -- 계정구분
  is_system INTEGER NOT NULL DEFAULT 0,      -- 1=자동분개가 참조하는 계정(코드/구분 변경·삭제 보호)
  active INTEGER NOT NULL DEFAULT 1,         -- 사용여부
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_account_cat ON account (category, code);

-- ── 분개 헤더(원천 전표 1건 = 분개 1건) ───────────────────────
-- doc_id / receipt_id 중 정확히 하나만 채운다(다형 원천). 둘 다 ON DELETE CASCADE →
-- 판매/구매 전표 또는 수금/지불 삭제 시 분개(및 라인)가 자동 삭제된다(stock_ledger와 동일한 파생 성격).
CREATE TABLE journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER REFERENCES doc(id) ON DELETE CASCADE,           -- 원천이 판매/구매 전표일 때
  receipt_id INTEGER REFERENCES receipt(id) ON DELETE CASCADE,   -- 원천이 수금/지불일 때
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('매출','매입','수금','지불')),          -- 분개 유형(표시·필터용)
  io_date TEXT NOT NULL,                     -- 원천 일자 'YYYY-MM-DD'(분개장 기간 조회 인덱스)
  doc_no TEXT NOT NULL,                       -- 원천 전표번호(doc.doc_no 또는 receipt.receipt_no) 표시용
  partner_id INTEGER REFERENCES partner(id), -- 원천 거래처(헤더 필터 편의). 라인에도 별도 보관
  summary TEXT NOT NULL DEFAULT '',           -- 적요
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK ((doc_id IS NOT NULL) + (receipt_id IS NOT NULL) = 1)     -- 정확히 하나의 원천
);
-- 원천당 분개 1건 강제(백필 멱등성의 DB 백스톱). SQLite UNIQUE는 NULL 다중 허용 → 반대편 원천엔 영향 없음
CREATE UNIQUE INDEX uq_journal_doc     ON journal (doc_id)     WHERE doc_id IS NOT NULL;
CREATE UNIQUE INDEX uq_journal_receipt ON journal (receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX idx_journal_date    ON journal (io_date);
CREATE INDEX idx_journal_partner ON journal (partner_id);

-- ── 분개 라인(차변/대변) ──────────────────────────────────────
-- 한 라인은 차변(dr) 또는 대변(cr) 한쪽만 값을 가진다. account_code/name은 표시·집계용 비정규화 사본.
CREATE TABLE journal_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL REFERENCES journal(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  account_id INTEGER NOT NULL REFERENCES account(id),
  account_code TEXT NOT NULL,                -- 계정코드 사본(월별손익/원장 집계 시 join 회피)
  account_name TEXT NOT NULL,                -- 계정명 사본(분개장 표시)
  dr INTEGER NOT NULL DEFAULT 0,             -- 차변 금액(원)
  cr INTEGER NOT NULL DEFAULT 0,             -- 대변 금액(원)
  partner_id INTEGER REFERENCES partner(id), -- 거래처원장용 — 외상매출금/외상매입금 라인에만 세팅
  remarks TEXT NOT NULL DEFAULT '',
  CHECK (dr >= 0 AND cr >= 0 AND (dr = 0 OR cr = 0))    -- 비음 + 차·대 상호배타
);
CREATE INDEX idx_jline_journal ON journal_line (journal_id);
CREATE INDEX idx_jline_account ON journal_line (account_code, journal_id);
CREATE INDEX idx_jline_partner ON journal_line (partner_id, account_code);

-- ── 기본 계정과목 시딩(전산회계 표준코드 관례) ───────────────────
-- is_system=1 : 자동분개 규칙이 코드로 참조하는 계정(101/103/108/135/153/251/255/404). 코드/구분 변경·삭제 보호.
INSERT INTO account (code, name, category, is_system) VALUES
  ('101','현금',        '자산',1),
  ('103','보통예금',    '자산',1),
  ('108','외상매출금',  '자산',1),
  ('110','받을어음',    '자산',0),
  ('135','부가세대급금','자산',1),
  ('146','상품',        '자산',0),
  ('150','제품',        '자산',0),
  ('153','원재료',      '자산',1),
  ('251','외상매입금',  '부채',1),
  ('252','지급어음',    '부채',0),
  ('255','부가세예수금','부채',1),
  ('331','자본금',      '자본',0),
  ('401','상품매출',    '수익',0),
  ('404','제품매출',    '수익',1),
  ('501','원재료매입',  '비용',0),
  ('811','복리후생비',  '비용',0),
  ('812','여비교통비',  '비용',0),
  ('813','기업업무추진비','비용',0),
  ('814','통신비',      '비용',0),
  ('815','수도광열비',  '비용',0),
  ('817','세금과공과금','비용',0),
  ('819','임차료',      '비용',0),
  ('822','차량유지비',  '비용',0),
  ('824','운반비',      '비용',0),
  ('830','소모품비',    '비용',0),
  ('831','지급수수료',  '비용',0),
  ('833','광고선전비',  '비용',0);
```

### 1.1 설계 결정 (왜 이렇게 했나)

1. **분개는 `stock_ledger`와 동형(同型)의 파생 원장**. 원천 전표가 진실, 분개는 파생. 저장/수정 시 트랜잭션 안에서 재작성,
   삭제 시 FK CASCADE로 자동 정리 → 원장/재고와 회계가 **항상 동기**. 별도 "회계반영" 버튼(이카운트의 2단계 반영) 없이 즉시 반영(1인 기업 단순화).
2. **다형 원천(`doc_id` XOR `receipt_id`)에 각각 FK CASCADE**. 수금/지불(`receipt`)과 판매/구매(`doc`)가 한 테이블로 분개되면서도
   양쪽 삭제가 자동 정리된다. `CHECK(...=1)`로 정확히 하나만 채워지도록 강제. 부분 UNIQUE 인덱스로 **원천당 분개 1건**(백필 멱등의 DB 백스톱).
3. **계정 매핑은 "코드 관례"** — 자동분개 엔진은 계정을 **고정 코드**(예: 외상매출금=`108`)로 참조하고, 그 코드는 005가 결정적으로 시딩한다.
   이름 하드코딩이 아니라 안정적 식별자(코드) 참조이므로 사용자가 계정명을 바꿔도 분개는 깨지지 않는다. `is_system=1` 계정은 코드/구분 변경·삭제를 서버가 차단.
   (계정 변경을 런타임 설정으로 빼는 것은 과설계 — 1인 기업엔 불필요. 향후 `settings`에 `acct_ar` 등 오버라이드 키를 두는 확장 여지만 남겨둔다.)
4. **`journal_line.partner_id`는 외상매출금/외상매입금 라인에만 세팅** → 거래처원장은 이 두 계정의 partner 라인만 모으면 완성. 매출/수익 라인엔 거래처 불필요.
5. **비정규화 사본(`account_code`/`account_name`)** 을 라인에 저장 → 분개장·월별손익 집계에서 `account` join 없이 조회. 계정명 변경 시 과거 분개 표시는 저장 시점 이름을 유지(감사 관점 자연스러움).
6. **로스팅/기타이동/견적/주문/발주는 분개 없음**. 재고 이동·내부 계획일 뿐 손익·채권을 만들지 않는다(2장 규칙표). 매출원가는 월별손익에서 구매액 기준으로 간이 산출(3.4).

---

## 2. 자동분개 규칙 표 (Phase 3 최상위 계약)

모든 분개 생성은 이 표를 따른다. 금액 기호: `S`=공급가액(`total_supply`), `V`=부가세(`total_vat`), `T`=합계(`total_amount`=S+V), `A`=수금/지불액.
`[거래처]` = 해당 라인의 `journal_line.partner_id`에 원천 거래처를 기록(거래처원장 원천). **차변합계=대변합계는 항상 성립**(서버가 커밋 전 검증).

| 원천 | 과세/면세 | 차변 (dr) | 대변 (cr) | entry_type |
|---|---|---|---|---|
| **판매**(doc sale) | 과세 | `108` 외상매출금 = **T** `[거래처]` | `404` 제품매출 = S · `255` 부가세예수금 = V | 매출 |
| **판매**(doc sale) | 면세 | `108` 외상매출금 = **T(=S)** `[거래처]` | `404` 제품매출 = S | 매출 |
| **구매**(doc purchase) | 과세 | `153` 원재료 = S · `135` 부가세대급금 = V | `251` 외상매입금 = **T** `[거래처]` | 매입 |
| **구매**(doc purchase) | 면세 | `153` 원재료 = S | `251` 외상매입금 = **T(=S)** `[거래처]` | 매입 |
| **수금**(receipt 수금) | — | `101` 현금 **또는** `103` 보통예금 = A | `108` 외상매출금 = A `[거래처]` | 수금 |
| **지불**(receipt 지불) | — | `251` 외상매입금 = A `[거래처]` | `101` 현금 **또는** `103` 보통예금 = A | 지불 |
| **로스팅**(roast) · **기타이동**(move/self_use/defect/adjust) · **견적/주문/발주**(quote/order/purchase_order) | — | **분개 없음** | **분개 없음** | — |

- **결제수단 → 현금계정 매핑**(수금 차변 / 지불 대변): `현금 → 101 현금`, 그 외(`보통예금`·`받을어음`·`카드`·`기타`) → `103 보통예금`.
  (받을어음/지급어음 계정은 시딩돼 있으나 자동분개는 단순화를 위해 현금/보통예금 2계정만 사용 — 어음 상세는 향후 일반전표로.)
- **판매는 전 라인 `404 제품매출`로 단일 귀속**(doc 단위 분개, 라인별 품목구분 분개 안 함). `401 상품매출`·`501 원재료매입`은 시딩만 하고 수동 분개/향후용.
- 면세 판매/구매는 부가세 라인(`255`/`135`)을 **아예 만들지 않는다**(V=0). → 2라인 분개.

### 2.1 자동분개 엔진 (server/accounting.mjs — 핵심 로직, 사본 검증 완료)

```js
// 계정코드 상수 — 규칙이 참조하는 유일한 매핑 지점(005 시딩 코드와 일치)
const A = { 현금:'101', 보통예금:'103', 외상매출금:'108', 부가세대급금:'135',
            원재료:'153', 외상매입금:'251', 부가세예수금:'255', 제품매출:'404' };
const cashCode = (method) => (method === '현금' ? A.현금 : A.보통예금);

// doc(sale/purchase) → 분개 라인들. 그 외 doc_type은 null(분개 없음).
function buildDocJournal(doc) {           // doc = doc 행(전 컬럼)
  if (doc.doc_type === 'sale') {
    const lines = [ L(A.외상매출금, doc.total_amount, 0, doc.partner_id), L(A.제품매출, 0, doc.total_supply) ];
    if (doc.total_vat > 0) lines.push(L(A.부가세예수금, 0, doc.total_vat));
    return { entry_type: '매출', lines };
  }
  if (doc.doc_type === 'purchase') {
    const lines = [ L(A.원재료, doc.total_supply, 0) ];
    if (doc.total_vat > 0) lines.push(L(A.부가세대급금, doc.total_vat, 0));
    lines.push(L(A.외상매입금, 0, doc.total_amount, doc.partner_id));
    return { entry_type: '매입', lines };
  }
  return null;   // roast/move/self_use/defect/adjust/quote/order/purchase_order
}
// receipt(수금/지불) → 분개 라인들
function buildReceiptJournal(r) {
  const cash = cashCode(r.method);
  if (r.kind === '수금') return { entry_type:'수금', lines:[ L(cash, r.amount, 0), L(A.외상매출금, 0, r.amount, r.partner_id) ] };
  return                       { entry_type:'지불', lines:[ L(A.외상매입금, r.amount, 0, r.partner_id), L(cash, 0, r.amount) ] };
}
const L = (code, dr, cr, partnerId = null) => ({ code, dr, cr, partnerId });
```

- `writeJournalForDoc(docId)` / `writeJournalForReceipt(receiptId)`:
  ① 원천 행 조회 → `buildDocJournal`/`buildReceiptJournal`. ② **차변합계≠대변합계면 throw**(트랜잭션 롤백 → 원천 저장도 실패, 절대 불균형 분개 안 남김).
  ③ 기존 분개 삭제(`DELETE FROM journal WHERE doc_id=?` / `receipt_id=?` — 라인은 CASCADE) → ④ `journal` + `journal_line` 재삽입(`account`는 코드로 조회, id/코드/이름 비정규화 저장).
  - doc가 sale/purchase가 **아니면** 분개를 만들지 않고, 혹시 남은 분개가 있으면 삭제만(로스팅/이동 유형 전환 대비). 이 함수는 **원천 저장 트랜잭션 안에서** 호출한다(자체 트랜잭션 없음).
- **계정 캐시**: 코드→`account` 행을 모듈 레벨 `Map`에 캐시. 필요 계정이 없으면 `계정과목(XXX)이 없습니다. 마이그레이션 005 시딩을 확인하세요.` throw(정상 시딩이면 발생하지 않음).

### 2.2 기존 전표의 소급 분개 — 백필 (멱등)

```js
// 기동 시 1회. 분개 없는 sale/purchase doc + 모든 receipt를 찾아 생성. 이미 있으면 건너뜀(멱등).
export function backfillJournals() {
  const docs = db.prepare(`SELECT id FROM doc WHERE doc_type IN ('sale','purchase')
      AND id NOT IN (SELECT doc_id FROM journal WHERE doc_id IS NOT NULL)`).all();
  const rcs  = db.prepare(`SELECT id FROM receipt
      WHERE id NOT IN (SELECT receipt_id FROM journal WHERE receipt_id IS NOT NULL)`).all();
  db.transaction(() => {
    for (const d of docs) writeJournalForDoc(d.id);
    for (const r of rcs)  writeJournalForReceipt(r.id);
  })();
  return docs.length + rcs.length;
}
```

- 호출 위치: `server/index.mjs`에서 `migrate()` **직후** `try { backfillJournals(); } catch (e) { console.warn('[분개 백필] 실패:', e.message); }`.
- 매 기동 실행되지만 첫 실행 후에는 대상이 0건 → 비용 무시 가능(인덱스 조회). 판매내역 이관(`import-sales-excel.mjs`)으로 들어온 과거 판매도 첫 기동 시 일괄 분개된다.
- (선택) 동일 로직을 `scripts/backfill-journals.mjs`(얇은 래퍼: `import { backfillJournals }` 후 호출·건수 출력)로도 제공해 수동 재생성 가능. **필수는 기동 백필**.

---

## 3. API 계약

모든 경로 `/api` 프리픽스. 실패 시 `{ "error": "한국어" }` + status. 기간 파라미터 `YYYY-MM-DD`. 리포트는 페이지 없이 전체 반환.

### 3.1 계정과목 — `/api/accounts` (server/accounting.mjs 신규)

#### `GET /api/accounts?q=&category=&active=` — 목록
`q`(코드/이름 부분일치, 옵션) · `category`(자산/부채/자본/수익/비용, 옵션) · `active`(`1`이면 사용중만). 정렬 `code`.
```jsonc
[ { "id": 3, "code": "108", "name": "외상매출금", "category": "자산", "is_system": 1, "active": 1, "memo": "" } ]
```

#### `POST /api/accounts` — 생성
```jsonc
// 요청 (is_system은 클라가 보내도 무시 → 항상 0)
{ "code": "840", "name": "잡비", "category": "비용", "memo": "", "active": 1 }
// 응답 201 = 목록 행 형태
```
검증(한국어 400): body 파싱 실패 `요청 본문이 올바르지 않습니다.` / `code` 빈값 `계정코드는 필수입니다.` / `name` 빈값 `계정명은 필수입니다.` /
`category` 미허용 `계정구분이 올바르지 않습니다.` / 코드 중복(UNIQUE) → `계정 코드가 이미 존재합니다.`

#### `PUT /api/accounts/:id` — 수정
`name`/`memo`/`active` 갱신. **`is_system=1` 계정은 `code`·`category` 변경 무시**(기존값 유지) — 자동분개 보호. 비시스템 계정은 `code`/`category`도 변경 가능.
```jsonc
// 요청 { "name": "외상매출금", "category": "자산", "active": 1, "memo": "주요채권" }
// 응답 200 = 목록 행 형태
```

#### `DELETE /api/accounts/:id`
```jsonc
{ "ok": true }
```
`is_system=1`이면 400 `기본 계정과목은 삭제할 수 없습니다.` / 분개에서 사용 중이면 FK 위반 → `연결된 자료가 있어 처리할 수 없습니다.` / 없으면 404 `계정과목을 찾을 수 없습니다.`

### 3.2 분개장 — `GET /api/journal` (server/accounting.mjs 신규)

**한 행 = 분개 라인 1건**(전통적 분개장 레이아웃). 같은 `journal_id`의 라인들은 같은 일자·전표번호로 연속 표시된다.
쿼리: `from` · `to`(기본 이번달) · `account_code`(옵션) · `partner_id`(옵션) · `entry_type`(옵션 매출/매입/수금/지불). 정렬 `io_date, journal_id, line_no`.
```jsonc
[
  { "journal_id": 10, "line_no": 1, "io_date": "2026-07-05", "doc_no": "20260705-1", "entry_type": "매출",
    "account_code": "108", "account_name": "외상매출금", "dr": 132000, "cr": 0,
    "partner_id": 12, "partner_name": "카페그래비티", "summary": "정기납품" },
  { "journal_id": 10, "line_no": 2, "io_date": "2026-07-05", "doc_no": "20260705-1", "entry_type": "매출",
    "account_code": "404", "account_name": "제품매출", "dr": 0, "cr": 120000,
    "partner_id": 12, "partner_name": "카페그래비티", "summary": "정기납품" },
  { "journal_id": 10, "line_no": 3, "io_date": "2026-07-05", "doc_no": "20260705-1", "entry_type": "매출",
    "account_code": "255", "account_name": "부가세예수금", "dr": 0, "cr": 12000,
    "partner_id": 12, "partner_name": "카페그래비티", "summary": "정기납품" }
]
```
- `partner_name`은 **분개 헤더의 `journal.partner_id`** 로 조인(한 분개의 전 라인이 같은 거래처명 표시). `account_code` 필터 지정 시 그 계정 라인만.
- 클라 그리드 하단 `bottomCalc: 'sum'`으로 차변합계·대변합계 표시 → 항상 일치해야 한다(엔진 불변식).

### 3.3 거래처원장 — `GET /api/partner-ledger` (server/accounting.mjs 신규)

거래처 1곳의 채권(외상매출금 108) **또는** 채무(외상매입금 251) 원장을 시간순 + 잔액 러닝으로 반환(이카운트 거래처원장 카피).
쿼리: `partner_id`(필수) · `from` · `to`(기본 이번달) · `side`(옵션 `매출`|`매입`, 미지정 시 `auto`).
- `side=auto`: 해당 거래처에 `108`(외상매출금) 라인이 하나라도 있으면 `매출`, 없으면 `매입`.
- **매출측(108)**: `increase = dr`(판매), `decrease = cr`(수금), `잔액 = opening + Σ(dr−cr)` = 미수금. `opening` = `Σ(dr−cr) WHERE io_date < from`.
- **매입측(251)**: `increase = cr`(구매), `decrease = dr`(지불), `잔액 = opening + Σ(cr−dr)` = 미지급금. `opening` = `Σ(cr−dr) WHERE io_date < from`.
```jsonc
{
  "partner": { "id": 12, "code": "1010", "name": "카페그래비티" },
  "side": "매출",
  "account": { "code": "108", "name": "외상매출금" },
  "opening": 50000,
  "rows": [
    { "io_date": "2026-07-05", "doc_no": "20260705-1", "entry_type": "매출", "summary": "정기납품",
      "increase": 132000, "decrease": 0, "balance": 182000 },
    { "io_date": "2026-07-08", "doc_no": "20260708-1", "entry_type": "수금", "summary": "7월 수금",
      "increase": 0, "decrease": 100000, "balance": 82000 }
  ],
  "sum_increase": 132000, "sum_decrease": 100000, "closing": 82000
}
```
검증: `partner_id` 없음 400 `거래처를 선택하세요.` / 거래처 없음 404 `거래처를 찾을 수 없습니다.` 활동 없으면 `rows: []`, opening/closing 0.

### 3.4 월별손익 — `GET /api/monthly-pl` (server/accounting.mjs 신규)

12개월 가로 표. 쿼리: `year`(옵션, 기본 올해). 매출원가는 **구매액(공급가액) 기준 간이**(정식 재고평가 COGS 아님 — 1인 기업 근사).
```jsonc
{
  "year": 2026,
  "months": ["2026-01","2026-02","2026-03","2026-04","2026-05","2026-06",
             "2026-07","2026-08","2026-09","2026-10","2026-11","2026-12"],
  "rows": [
    { "key": "sales",        "label": "매출액",          "values": [0,0,0,0,0,120000, 100000,0,0,0,0,0], "total": 220000 },
    { "key": "cogs",         "label": "매출원가(구매액)", "values": [0,0,0,0,0,0,      160000,0,0,0,0,0], "total": 160000 },
    { "key": "gross_profit", "label": "매출총이익",       "values": [0,0,0,0,0,120000, -60000,0,0,0,0,0], "total": 60000 },
    { "key": "sga",          "label": "판매관리비",       "values": [0,0,0,0,0,0,      0,0,0,0,0,0],      "total": 0 },
    { "key": "op_profit",    "label": "영업이익",         "values": [0,0,0,0,0,120000, -60000,0,0,0,0,0], "total": 60000 }
  ]
}
```
- `매출액[m]` = `Σ doc.total_supply WHERE doc_type='sale' AND substr(io_date,1,7)=월`.
- `매출원가[m]` = `Σ doc.total_supply WHERE doc_type='purchase' AND …월`.
- `매출총이익` = 매출액 − 매출원가.
- `판매관리비[m]` = `Σ (jl.dr − jl.cr) WHERE account.category='비용' AND jl.account_code LIKE '8%' AND 월` — **자동분개는 판관비를 만들지 않아 현재 항상 0**. 향후 일반전표(경비, `gl-entry`)가 이 축에 자동 반영되도록 구조만 마련.
- `영업이익` = 매출총이익 − 판매관리비.
- 클라는 `values` 배열을 12개월 컬럼 + 합계 컬럼으로 펼친다.

### 3.5 매입매출장 — `GET /api/vat-book` (server/accounting.mjs 신규, 보너스)

부가세 관점의 매입·매출 내역 + 과세/면세 집계. 쿼리: `from`·`to`(기본 이번달) · `kind`(옵션 `매출`|`매입`).
```jsonc
{
  "rows": [
    { "io_date": "2026-07-05", "doc_no": "20260705-1", "kind": "매출", "tax_mode": "면세",
      "partner_name": "카페그래비티", "item_summary": "에티오피아 외 1건",
      "supply": 100000, "vat": 0, "total": 100000 },
    { "io_date": "2026-07-05", "doc_no": "20260705-1", "kind": "매입", "tax_mode": "과세",
      "partner_name": "생두수입상사", "item_summary": "브라질 생두",
      "supply": 160000, "vat": 16000, "total": 176000 }
  ],
  "summary": {
    "매출": { "과세공급": 0, "부가세": 0, "면세공급": 100000, "합계": 100000 },
    "매입": { "과세공급": 160000, "부가세": 16000, "면세공급": 0, "합계": 176000 }
  }
}
```
- `rows`: sale/purchase doc를 `io_date, doc_no` 순으로. `kind` = 매출(sale)/매입(purchase). `item_summary`는 판매조회와 동일 로직(첫 품목 + 외 N건).
- `summary`: 매출/매입별 과세공급가액·부가세·면세공급가액·합계 집계(부가세 신고 근거 요약).

### 3.6 BOM등록 — `/api/bom` (server/production.mjs 신규)

제품(원두)↔생두 짝(`item.paired_item_id`) + 기본수율(`item.default_yield`) 관리. masters.mjs를 건드리지 않고 전용 엔드포인트로 두 컬럼만 갱신.

#### `GET /api/bom?q=` — 목록 (산출품목 = 제품/상품)
`q`(코드/이름 부분일치, 옵션). `item_type IN ('제품','상품')`인 품목을 코드순으로. 연결 생두 정보 조인.
```jsonc
[
  { "item_id": 10, "item_code": "00010", "item_name": "bco 블랜드", "item_type": "제품",
    "paired_item_id": 50, "paired_item_code": "a00050", "paired_item_name": "[에티오피아] 생두",
    "default_yield": 85.0 },
  { "item_id": 11, "item_code": "00011", "item_name": "케냐 AA", "item_type": "제품",
    "paired_item_id": null, "paired_item_code": null, "paired_item_name": null, "default_yield": 85.0 }
]
```

#### `PUT /api/bom/:itemId` — 짝/수율 수정
```jsonc
// 요청 (paired_item_id null이면 연결 해제)
{ "paired_item_id": 50, "default_yield": 85 }
// 응답 200 = 목록 행 형태
```
검증: `:itemId` 없음/미존재 404 `품목을 찾을 수 없습니다.` / `paired_item_id`가 자기 자신 400 `생두는 자기 자신을 지정할 수 없습니다.` /
`paired_item_id`가 미존재 품목 400 `연결할 생두를 찾을 수 없습니다.` / `default_yield`가 0 이하 또는 200 초과 400 `수율은 0 초과 200 이하로 입력하세요.`
UPDATE는 `paired_item_id`·`default_yield` 두 컬럼만(화이트리스트).

### 3.7 생산현황/수율분석 — `GET /api/production/summary` (server/production.mjs 신규)

로스팅(doc roast) 이력을 산출품목별·월별로 집계. 쿼리: `from`·`to`(기본 이번달).
로스팅 1건: `input_total = Σ doc_line.qty(line_role='input')`, `output_total = Σ doc_line.qty(line_role='output')`(=doc.total_qty). 그룹 수율 = `round(Σoutput / Σinput × 100, 1)`.
```jsonc
{
  "totals":  { "batch_count": 12, "input_total": 240.0, "output_total": 204.0, "avg_yield": 85.0 },
  "by_item": [
    { "output_item_id": 10, "output_item_name": "bco 블랜드", "batch_count": 8,
      "input_total": 160.0, "output_total": 136.0, "avg_yield": 85.0 }
  ],
  "by_month": [
    { "ym": "2026-06", "batch_count": 4, "input_total": 80.0,  "output_total": 68.0,  "avg_yield": 85.0 },
    { "ym": "2026-07", "batch_count": 8, "input_total": 160.0, "output_total": 136.0, "avg_yield": 85.0 }
  ]
}
```
- `by_item`: 산출 output 품목 기준 group(정렬 `output_total DESC`). `by_month`: `substr(io_date,1,7)` group(정렬 `ym ASC`).
- `avg_yield`는 비율 평균이 아니라 **집계 수율**(Σoutput/Σinput). input 합계 0이면 `null`.

### 3.8 창고별재고현황 — `GET /api/stock/by-warehouse` (server/reports.mjs **수정**)

창고×품목 매트릭스(이카운트 창고별재고현황 카피). `stock_ledger`를 (품목,창고)로 집계. 쿼리: `as_of`(기본 오늘).
```jsonc
{
  "warehouses": [ { "id": 1, "name": "본사창고" }, { "id": 2, "name": "로스팅공장" } ],
  "rows": [
    { "item_id": 10, "item_code": "00010", "item_name": "bco 블랜드", "unit": "kg",
      "by_wh": { "1": 7.2, "2": 0 }, "total": 7.2 },
    { "item_id": 50, "item_code": "a00050", "item_name": "[에티오피아] 생두", "unit": "kg",
      "by_wh": { "1": 3.0, "2": 12.0 }, "total": 15.0 }
  ]
}
```
- `warehouses` = 활성 창고(열 순서). `by_wh`는 창고 id(문자열 키)→as_of 잔량(`Σqty WHERE io_date<=as_of`, `round1`).
- **총재고 0인 품목(모든 창고 0)은 제외**(매트릭스 압축). 각 행 `total` = 창고 잔량 합. 정렬 `item.code`.
- 클라가 `warehouses`로 동적 컬럼(창고별) + `합계`를 만든다.

### 3.9 달력 — `/api/calendar` (server/reports.mjs **수정**)

#### `GET /api/calendar?year=2026&month=7` — 월 일자별 집계
```jsonc
{
  "year": 2026, "month": 7,
  "days": {
    "2026-07-05": { "roast_count": 1, "roast_kg": 17.2, "sale_count": 2, "sale_kg": 15.0, "sale_amount": 214500, "order_due_count": 0 },
    "2026-07-20": { "roast_count": 0, "roast_kg": 0,    "sale_count": 0, "sale_kg": 0,    "sale_amount": 0,      "order_due_count": 1 }
  }
}
```
- `roast_*`: doc_type='roast', io_date=그날 → 건수·산출kg(Σtotal_qty). `sale_*`: doc_type='sale' → 건수·수량kg·금액(Σtotal_amount).
- `order_due_count`: doc_type='order' 이고 **`time_date`(납기)=그날**인 주문 건수(예정 표시용). `days`는 활동 있는 날짜만 포함(빈 날 생략).

#### `GET /api/calendar/day?date=2026-07-05` — 그날 전표 목록(팝업용)
```jsonc
{
  "date": "2026-07-05",
  "events": [
    { "kind": "로스팅",  "doc_type": "roast", "id": 140, "doc_no": "20260705-1", "partner_name": null,
      "title": "bco 블랜드", "qty": 17.2, "amount": 0 },
    { "kind": "판매",    "doc_type": "sale",  "id": 101, "doc_no": "20260705-1", "partner_name": "카페그래비티",
      "title": "에티오피아 외 1건", "qty": 15.0, "amount": 214500 },
    { "kind": "주문납기", "doc_type": "order", "id": 201, "doc_no": "20260701-1", "partner_name": "카페그래비티",
      "title": "케냐 AA 외 1건", "qty": 15.0, "amount": 214500, "time_date": "2026-07-05" }
  ]
}
```
- `events`: 그날의 로스팅(io_date) + 판매(io_date) + 주문납기(time_date=date). `title` = 로스팅은 산출품목명, 판매/주문은 품목요약. 정렬: 로스팅→판매→주문납기.

### 3.10 원천 전표에 분개 훅 추가 (server/vouchers.mjs · receipts.mjs **수정**)

분개는 `stock_ledger` 재작성과 **같은 트랜잭션 안**에서 생성한다. 삭제는 FK CASCADE가 처리하므로 DELETE 핸들러는 **수정 불필요**.

| 파일 | 위치 | 추가 |
|---|---|---|
| `vouchers.mjs` | 상단 import | `import { writeJournalForDoc } from './accounting.mjs';` |
| `vouchers.mjs` | `POST /docs` 트랜잭션 안, `return docId;` 직전(끌어오기 status 갱신 다음) | `writeJournalForDoc(docId);` |
| `vouchers.mjs` | `PUT /docs/:id` 트랜잭션 안, 라인·원장 재삽입 `forEach` 다음(트랜잭션 끝) | `writeJournalForDoc(id);` |
| `receipts.mjs` | 상단 import | `import { writeJournalForReceipt } from './accounting.mjs';` |
| `receipts.mjs` | `POST /receipts` 트랜잭션 안, `return info.lastInsertRowid;` 직전 | `writeJournalForReceipt(info.lastInsertRowid);` |
| `receipts.mjs` | `PUT /receipts/:id` 트랜잭션 안, UPDATE 다음 | `writeJournalForReceipt(id);` |

- `writeJournalForDoc`는 sale/purchase가 아니면(로스팅은 `/api/roast`라 애초에 여기 안 옴; quote/order/purchase_order는 여기 오지만) **분개를 만들지 않는다**(내부 guard). 즉 quote/order/purchase_order 저장 시 호출돼도 no-op(안전).
- 분개 생성이 throw하면(차대변 불일치·계정 누락) 원천 저장 트랜잭션 전체가 롤백된다 → 재고와 회계가 어긋난 채 커밋되는 일이 없다.
- **응답 형태 불변**: 분개는 부수효과일 뿐, `POST/PUT` 응답 JSON은 Phase 1과 동일(기존 e2e 계약 유지).

### 3.11 라우트 등록 (server/index.mjs **수정**)

```js
import { accounting, backfillJournals } from './accounting.mjs';
import { production } from './production.mjs';
// migrate() 다음 줄에:
try { backfillJournals(); } catch (e) { console.warn('[분개 백필] 실패:', e.message); }
// app.route(...) 블록에 2줄 추가(masters/vouchers/moves/receipts/reports 다음, ecount·404 앞):
app.route('/api', accounting);   // /api/accounts*, /api/journal, /api/partner-ledger, /api/monthly-pl, /api/vat-book
app.route('/api', production);   // /api/bom(/:itemId), /api/production/summary
// /api/stock/by-warehouse, /api/calendar, /api/calendar/day 는 기존 reports 라우트에 추가되므로 별도 등록 불필요
```

---

## 4. 화면별 스펙 (클라이언트)

공통: 기존 `screen`/`screen-bar`/`screen-grid` 레이아웃, `DataGrid`(Tabulator), `CodeHelp`, `Modal`/`Confirm`, `MasterScreen`, `useToast`,
`api`, `fmtWon`/`fmtQty`/`todayISO`/`monthStartISO` 재사용. 신규 CSS는 **달력만** 필요(4.4).

### 4.1 계정과목 — `client/src/screens/AccountingScreens.tsx` (export `AccountMaster`)

- **메뉴**: `account`.
- **구현**: 기존 `MasterScreen<Account>` 재사용(품목/거래처 등록과 동일 UX). `endpoint="/api/accounts"`.
- **그리드 컬럼**: 계정코드(code) / 계정명(name) / 구분(category) / 시스템(is_system, `1→'기본'` 뱃지) / 사용(active, `yn`).
- **입력 폼 fields**: `code`(text, required) / `name`(text, required) / `category`(select 자산·부채·자본·수익·비용) / `active`(checkbox) / `memo`(textarea).
- `defaults = { code:'', name:'', category:'비용', active:1, memo:'' }`. `helpText`: "기본 계정(외상매출금·부가세예수금 등)은 자동분개가 사용하므로 코드·구분 변경·삭제가 제한됩니다."
- 시스템 계정 수정/삭제 시 서버가 반환하는 한국어 메시지를 그대로 토스트(MasterScreen 기본 동작). `is_system` 컬럼 표시로 사용자에게 사전 안내.

### 4.2 분개장 — `client/src/screens/AccountingScreens.tsx` (export `JournalScreen`)

- **메뉴**: `journal`.
- **배치**: `screen-bar` 검색조건 = 기간 `from~to`(기본 이번달) + 유형 select(전체/매출/매입/수금/지불) + 계정(코드도움 `/api/accounts`, 옵션) + 거래처(코드도움 `/api/partners`, 옵션) + `[조회]` + `[엑셀]`. 본문 `DataGrid`.
- **그리드 컬럼**(호출 `GET /api/journal?from&to&entry_type&account_code&partner_id`):

| 컬럼 | field | 정렬/포맷 |
|---|---|---|
| 일자 | io_date | 좌 |
| 전표번호 | doc_no | 좌 |
| 유형 | entry_type | 중앙 |
| 계정과목 | account_name | 좌 (`account_code` 툴팁/접두 가능) |
| 차변 | dr | 우, `fmtWon`(0이면 공백), bottomCalc sum |
| 대변 | cr | 우, `fmtWon`(0이면 공백), bottomCalc sum |
| 거래처 | partner_name | 좌 |
| 적요 | summary | 좌 |

- 같은 `journal_id` 라인은 일자·전표번호가 연속으로 반복 표시(전통 분개장). 하단 합계행의 차변합계=대변합계 확인.

### 4.3 거래처원장 — `client/src/screens/AccountingScreens.tsx` (export `PartnerLedger`)

- **메뉴**: `partner-ledger`.
- **배치**: `screen-bar` = 거래처(코드도움 `/api/partners`, **필수**) + 기간 `from~to`(기본 이번달) + 구분 select(자동/매출(채권)/매입(채무)) + `[조회]` + `[엑셀]`. 상단 요약 바 + 본문 `DataGrid`.
- **요약 바**(`hint ledger-summary`): `[거래처명] · [매출|매입] · 이월 {opening} / {증가 라벨} {sum_increase} / {감소 라벨} {sum_decrease} / 잔액 {closing}`. 라벨: 매출측이면 "매출/수금", 매입측이면 "구매/지불". 금액 `fmtWon`.
- **그리드 컬럼**(호출 `GET /api/partner-ledger?partner_id&from&to&side`):

| 컬럼 | field | 포맷 |
|---|---|---|
| 일자 | io_date | 좌 |
| 전표번호 | doc_no | 좌 |
| 구분 | entry_type | 중앙 |
| 증가(매출/구매) | increase | 우, `fmtWon`(0 공백), bottomCalc sum |
| 감소(수금/지불) | decrease | 우, `fmtWon`(0 공백), bottomCalc sum |
| 잔액 | balance | 우, `fmtWon`, 굵게 |
| 적요 | summary | 좌 |

- 거래처 미선택 시 조회 막고 토스트 `거래처를 선택하세요.`. 컬럼 헤더의 "증가/감소" 라벨은 side에 따라 동적("매출"/"구매", "수금"/"지불")으로 바꿔도 좋음(단순히 증가/감소 고정도 허용).

### 4.4 월별손익 — `client/src/screens/AccountingScreens.tsx` (export `MonthlyPL`)

- **메뉴**: `monthly-pl`.
- **배치**: `screen-bar` = 연도 select(예: 최근 3년) + `[조회]` + `[엑셀]`. 본문 `DataGrid`(가로 스크롤).
- **그리드**: 호출 `GET /api/monthly-pl?year=`. **행 고정 5개**(매출액/매출원가/매출총이익/판매관리비/영업이익). 컬럼 = `항목`(첫 열, frozen) + `1월`~`12월`(각 `values[i]`, 우측 `fmtWon`) + `합계`(`total`, 우측 굵게).
  - 응답 `rows`를 그리드 데이터로: 각 행 객체 = `{ label, m1..m12, total }`(클라에서 `values` 배열을 m1..m12로 매핑). 매출총이익/영업이익 행은 음수 강조색(`danger-text`) 옵션.
  - Tabulator `columns`는 `months`로 동적 생성. 첫 컬럼 `frozen: true`.

### 4.5 매입매출장 — `client/src/screens/AccountingScreens.tsx` (export `VatBook`, 보너스)

- **메뉴**: `vat-book`.
- **배치**: `screen-bar` = 기간 `from~to`(기본 이번달) + 구분 select(전체/매출/매입) + `[조회]` + `[엑셀]`. 상단 요약 바 + 본문 `DataGrid`.
- **요약 바**: `매출 과세 {과세공급}(부가세 {부가세}) · 면세 {면세공급} · 합계 {합계}` / `매입 …` 2줄(`summary.매출`/`summary.매입`).
- **그리드 컬럼**(호출 `GET /api/vat-book?from&to&kind`): 일자 / 전표번호 / 구분(kind) / 과세유형(tax_mode) / 거래처(partner_name) / 품목요약(item_summary) / 공급가액(supply,우 bottomCalc) / 부가세(vat,우 bottomCalc) / 합계(total,우 bottomCalc).

### 4.6 BOM등록 — `client/src/screens/ProductionScreens.tsx` (export `BomScreen`)

- **메뉴**: `bom`.
- **배치**: `screen-bar` = 검색 input(`q`) + `[검색]`. 본문 `DataGrid`(제품 목록). 행 **더블클릭 → 편집 Modal**.
- **그리드 컬럼**(호출 `GET /api/bom?q=`): 제품코드(item_code) / 제품명(item_name) / 구분(item_type) / 연결생두코드(paired_item_code) / 연결생두명(paired_item_name) / 기본수율(default_yield, 우 `{n}%`) / 편집(`<span class="link">편집</span>`).
- **편집 Modal**: 제품명(고정 표시) + 연결 생두(코드도움 `/api/items`, `[연결 해제]` 버튼으로 null) + 기본수율(number, %) + `[저장]`.
  - 저장 `PUT /api/bom/:itemId { paired_item_id, default_yield }` → 성공 토스트 `저장되었습니다.` → 재조회.
  - `helpText`(`hint`): "코드 규칙(생두 a00xxx ↔ 원두 00xxx)이 안 맞아 자동 연결되지 않은 제품을 수동으로 짝지어 두면, 로스팅입력에서 산출 원두 선택 시 이 생두가 투입 라인으로 자동 제안됩니다."
- (블렌딩=생두 여러 종은 로스팅입력에서 투입 라인 추가로 처리 — BOM은 1:1 기본 제안용임을 hint로 명시.)

### 4.7 생산현황/수율분석 — `client/src/screens/ProductionScreens.tsx` (export `ProductionStatus`)

- **메뉴**: `prod-status`.
- **배치**: `screen-bar` = 기간 `from~to`(기본 이번달) + `[조회]` + `[엑셀]`. 상단 요약 바 → **품목별 그리드** → **월별 그리드**.
- **요약 바**(`roast-yield` 스타일 재사용): `배치 {batch_count}회 · 투입 {input_total}kg · 산출 {output_total}kg · 평균수율 {avg_yield}%`.
- **품목별 그리드**(`by_item`): 산출원두(output_item_name) / 배치수(batch_count) / 투입합계(input_total,우 `fmtQty`) / 산출합계(output_total,우 `fmtQty`) / 평균수율(avg_yield,우 `{n}%`).
- **월별 추이 그리드**(`by_month`): 월(ym) / 배치수 / 투입합계 / 산출합계 / 평균수율. (선택) 수율 셀에 `background`로 간이 막대(CSS width %)를 그려 추이 시각화 — 신규 CSS 없이 인라인 style로 처리.
- 호출 `GET /api/production/summary?from&to`. 두 그리드는 별도 `DataGrid`(height 고정).

### 4.8 창고별재고현황 — `client/src/screens/StockByWarehouse.tsx` (export `StockByWarehouse`)

- **메뉴**: `stock-wh`. (기존 `StockScreens.tsx`는 건드리지 않고 신규 파일로 둔다 — 검증된 파일 보호.)
- **배치**: `screen-bar` = 기준일자(기본 오늘) + `[조회]` + `[엑셀]`. 본문 `DataGrid`.
- **그리드**(호출 `GET /api/stock/by-warehouse?as_of=`): 응답 `warehouses`로 **동적 컬럼** 생성.
  - 고정 컬럼: 품목코드(item_code) / 품목명(item_name) / 단위(unit).
  - 창고별 컬럼: 각 창고 `w`마다 `{ title: w.name, field: 'wh_'+w.id, 우측 fmtQty, bottomCalc sum }`. 데이터 행에서 `wh_{id} = by_wh[String(id)]`로 펼침.
  - 합계 컬럼: `total`(우측 `fmtQty`, 굵게, bottomCalc sum).
  - 데이터 매핑: 서버 `rows`를 `{ item_code, item_name, unit, wh_1, wh_2, …, total }`로 변환 후 그리드에 주입. `DataGrid`는 컬럼 변경 시 재생성되므로 `key={warehouses.map(w=>w.id).join(',')}`로 감싸 컬럼 갱신.

### 4.9 달력 — `client/src/screens/CalendarScreen.tsx` (export `CalendarScreen`) + `styles.css`(달력 CSS 추가)

기존 앱(index.html)의 달력 UX 계승: 로스팅함(오늘·지난)=빨강, 예정(앞으로 납기)=주황. Tabulator 아닌 **자체 월 그리드**(신규 CSS).
- **메뉴**: `calendar`.
- **배치**(`cal-wrap`):
  1. `cal-nav`: `[◀]` `2026년 7월`(현재 연·월) `[▶]` + `[오늘]`.
  2. **월 그리드**(`cal-table`): 7열(일~토). 각 날짜 셀:
     - 셀 클래스: 활동 있는 날 → `roast_count>0`이면 `has-done`(빨강), (roast 없고) `order_due_count>0`이면 `has-future`(주황). 오늘 `today`, 선택일 `sel`.
     - 셀 내용: `cal-dnum`(일). `roast_kg>0` → `cal-badge kg` `{roast_kg}kg`. `sale_count>0` → `cal-badge` `판매 {sale_count}건`. `order_due_count>0` → `cal-badge due` `납기 {order_due_count}`.
  3. `cal-legend`: 빨강=로스팅함 / 주황=주문납기 예정.
  4. `cal-detail`: 선택일 상세 — `[YYYY-MM-DD] 전표` 목록(로스팅/판매/주문납기). 각 행: 구분·전표번호·거래처·title·수량/금액. 빈 날 `이 날짜에는 전표가 없습니다.`
- **동선**:
  - 월 이동(◀▶) → `GET /api/calendar?year&month`로 `days` 재조회 → 그리드 갱신.
  - 날짜 클릭 → 선택일 표시 + `GET /api/calendar/day?date=`로 `cal-detail` 채움(또는 `Modal` 팝업 — 상세를 하단 패널로 두는 index.html 방식을 계승, 팝업 대신 인라인 패널 권장).
- **월 계산**: `year/month` state. 이전달에서 `month<1 → 전년 12월`, 다음달 반대. `format.ts`에 월 이동 헬퍼가 필요하면 `addMonths(year,month,delta)` 추가(작은 순수 함수).

### 4.10 타입 추가 — `client/src/types.ts` (클라 수정)

신규 인터페이스(위 JSON에 맞춤):
`Account`, `JournalRow`, `PartnerLedger`(+`PartnerLedgerRow`), `MonthlyPL`(+`MonthlyPLRow`), `VatBook`(+`VatBookRow`),
`BomRow`, `ProductionSummary`(+`ProdItemRow`/`ProdMonthRow`), `StockWhMatrix`(+`StockWhRow`, `warehouses`), `CalendarMonth`(days: `Record<string, CalendarDay>`), `CalendarDayDetail`(+`CalendarEvent`).

### 4.11 menus.tsx 연결 (`client/src/menus.tsx` 수정 — 클라 전용)

상단 import 추가:
```tsx
import { AccountMaster, JournalScreen, PartnerLedger, MonthlyPL, VatBook } from './screens/AccountingScreens';
import { BomScreen, ProductionStatus } from './screens/ProductionScreens';
import { StockByWarehouse } from './screens/StockByWarehouse';
import { CalendarScreen } from './screens/CalendarScreen';
```
| id | 현재 name | 변경 후 component |
|---|---|---|
| `bom` | BOM등록 | `BomScreen` |
| `prod-status` | 생산현황/수율분석 | `ProductionStatus` |
| `stock-wh` | 창고별재고현황 | `StockByWarehouse` |
| `calendar` | 달력(로스팅/납기) | `CalendarScreen` |
| `account` | 계정과목 | `AccountMaster` |
| `journal` | 분개장 | `JournalScreen` |
| `partner-ledger` | 거래처원장 | `PartnerLedger` |
| `monthly-pl` | 월별손익 | `MonthlyPL` |
| `vat-book` | 매입매출장(부가세) | `VatBook` (보너스) |

`implemented`는 component 유무로 자동 true. 나머지 placeholder(prod-in/mrp/lot/acct-ledger/gl-entry/cash/migrate 등)는 그대로 유지.

---

## 5. styles.css 추가 (클라 소넷 — **파일 끝에 추가만. 기존 규칙 수정 금지**)

> ⚠️ `styles.css`는 총괄(페이블)이 **밀도 조정 작업을 병행**한다. 클라 소넷은 **파일 맨 끝에 아래 블록만 append**하고 기존 셀렉터·값은 절대 수정하지 말 것.
> 달력만 신규 CSS가 필요하다(계정/분개/원장/손익/창고별/BOM/생산현황은 기존 `screen`/`DataGrid`/`Modal`/`hint` 클래스로 충분).

```css
/* ── 달력(CalendarScreen, 설계 4.9) — index.html 달력 UX 계승(로스팅함=빨강, 예정=주황) ── */
.cal-wrap { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.cal-nav { display: flex; align-items: center; gap: 12px; }
.cal-nav b { font-size: 15px; min-width: 120px; text-align: center; }
.cal-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.cal-table th { background: #f3f5f9; color: var(--sub); font-weight: 700; font-size: 12px; padding: 5px; border: 1px solid var(--line); }
.cal-table td { height: 76px; vertical-align: top; border: 1px solid var(--line); padding: 4px 5px; cursor: pointer; }
.cal-table td.empty { background: #fafbfc; cursor: default; }
.cal-table td.has-done { background: #fde8e8; }    /* 로스팅함(오늘·지난) */
.cal-table td.has-future { background: #fef3e2; }  /* 예정(앞으로 납기) */
.cal-table td.today { outline: 2px solid var(--accent); outline-offset: -2px; }
.cal-table td.sel { box-shadow: inset 0 0 0 2px var(--accent); }
.cal-dnum { font-weight: 700; font-size: 12.5px; }
.cal-badge { display: block; margin-top: 3px; font-size: 11px; color: var(--txt); line-height: 1.4; }
.cal-badge.kg { color: #b3261e; font-weight: 600; }
.cal-badge.due { color: #c67c00; }
.cal-legend { display: flex; gap: 16px; font-size: 12px; color: var(--sub); }
.cal-legdot { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
.cal-detail { border: 1px solid var(--line); border-radius: 3px; padding: 10px 12px; }
.cal-detail .row-ev { display: flex; gap: 10px; padding: 4px 0; border-bottom: 1px dashed var(--line); font-size: 12.5px; }
.cal-detail .row-ev .k { color: var(--sub); min-width: 60px; }
```

---

## 6. 구현 분담 명세 (파일 겹침 0)

경계 규칙: **`server/**`·`scripts/**` = 서버 소넷**, **`client/src/**`(menus.tsx·styles.css 포함) = 클라 소넷**.
서버·클라 공유 계약은 **3장 API JSON**뿐 — 필드명을 글자 그대로 맞춘다.

### [서버 소넷] — `server/`·`scripts/` 만
| 파일 | 작업 | 내용 |
|---|---|---|
| `server/migrations/005_accounting.sql` | 신규 | 1장 DDL 그대로(account/journal/journal_line + 계정 27종 시딩) |
| `server/accounting.mjs` | 신규 | 자동분개 엔진(`writeJournalForDoc`/`writeJournalForReceipt`/`backfillJournals` export) + 계정 캐시 + 계정과목 CRUD(`/api/accounts`) + `/api/journal` + `/api/partner-ledger` + `/api/monthly-pl` + `/api/vat-book`. Hono `accounting` export. `ledger.mjs`의 `err`/`readBody`/`friendlySqlError`/`isValidDate`/`round1`/`todayISO`/`validId` 재사용 |
| `server/production.mjs` | 신규 | `/api/bom`(GET) · `/api/bom/:itemId`(PUT) · `/api/production/summary`(GET). Hono `production` export |
| `server/reports.mjs` | **수정** | `/api/stock/by-warehouse` · `/api/calendar` · `/api/calendar/day` 3개 라우트 추가(기존 `stock/status`·`stock/ledger`는 유지) |
| `server/vouchers.mjs` | **수정** | 3.10 표대로 `writeJournalForDoc` import + POST/PUT 트랜잭션 안 호출 2곳(로직·응답 형태 불변) |
| `server/receipts.mjs` | **수정** | 3.10 표대로 `writeJournalForReceipt` import + POST/PUT 트랜잭션 안 호출 2곳 |
| `server/index.mjs` | **수정** | `backfillJournals()` 기동 호출 + `app.route('/api', accounting)` · `app.route('/api', production)` 2줄 |
| `scripts/backfill-journals.mjs` | 신규(선택) | `backfillJournals()` 수동 실행 래퍼(건수 출력). 필수 아님(기동 백필로 충분) |

> `masters.mjs`·`moves.mjs`·`ledger.mjs`·`db.mjs`·`ecount.mjs`는 **수정하지 않는다**. (BOM은 masters를 안 건드리려 production.mjs 전용 엔드포인트로 처리.)

### [클라 소넷] — `client/src/` 만
| 파일 | 작업 | 내용 |
|---|---|---|
| `client/src/screens/AccountingScreens.tsx` | 신규 | `AccountMaster`(MasterScreen 재사용) · `JournalScreen` · `PartnerLedger` · `MonthlyPL` · `VatBook` |
| `client/src/screens/ProductionScreens.tsx` | 신규 | `BomScreen` · `ProductionStatus` |
| `client/src/screens/StockByWarehouse.tsx` | 신규 | `StockByWarehouse`(동적 창고 컬럼 매트릭스) |
| `client/src/screens/CalendarScreen.tsx` | 신규 | `CalendarScreen`(자체 월 그리드 + 일자 상세 패널) |
| `client/src/types.ts` | **수정** | 4.10 인터페이스 추가 |
| `client/src/menus.tsx` | **수정** | 4.11 연결(8개 + vat-book) |
| `client/src/format.ts` | **수정**(소폭) | 필요 시 `addMonths(y,m,delta)` 등 순수 헬퍼만 추가(기존 함수 유지) |
| `client/src/styles.css` | **수정** | 5장 달력 CSS **파일 끝에 append만**(기존 규칙 수정 금지) |

> `App.tsx`·`api.ts`·`DataGrid`/`CodeHelp`/`Modal`/`MasterScreen`/`Toast`·기존 화면 파일(StockScreens/VoucherScreen 등)은 **수정 불필요**.

---

## 7. 자가검증 시나리오 (Phase 2/3 DoD — 구현 후 자가검증)

**회계(Phase 3)**
1. **자동분개**: 판매 `카페그래비티 / 원두 10kg @12,000 과세` 저장 → 분개장에 `차)외상매출금 132,000 / 대)제품매출 120,000 · 부가세예수금 12,000`(차변합계=대변합계=132,000).
2. **면세 분개**: 면세 판매 저장 → 부가세예수금 라인 없이 `차)외상매출금=대)제품매출`(2라인).
3. **수금 분개**: 그 거래처 `100,000 보통예금` 수금 → `차)보통예금 100,000 / 대)외상매출금 100,000`.
4. **거래처원장**: 그 거래처 조회 → 판매 132,000(증가) → 수금 100,000(감소) → 잔액 32,000(미수금현황과 일치).
5. **월별손익**: 해당 월 매출액=판매 공급가액 합, 매출원가=구매 공급가액 합, 영업이익=매출총이익(판관비 0). 손계산 일치.
6. **매입매출장**: 같은 기간 과세/면세 공급가액·부가세 요약이 부가세 신고식과 일치.
7. **삭제 동기**: 1의 판매 전표 삭제 → 분개(및 라인) 자동 소멸(FK CASCADE), 거래처원장·월별손익 원복.
8. **백필/멱등**: 서버 재기동 → 과거(이관분 포함) 판매/구매/수금/지불에 분개 생성. **재기동 반복해도 중복 분개 안 생김**.
9. **계정 보호**: 계정과목에서 `외상매출금`(시스템) 삭제 시도 → `기본 계정과목은 삭제할 수 없습니다.`

**생산·재고·일정(Phase 2)**
10. **BOM**: `bco 블랜드`에 생두 짝 연결 + 수율 87% 저장 → 로스팅입력에서 그 원두 선택 시 해당 생두가 투입 라인으로 자동 제안.
11. **생산현황**: 기간 조회 → 산출원두별 투입/산출/평균수율, 월별 추이가 로스팅 이력과 일치.
12. **창고별재고**: 창고이동(본사→공장) 후 조회 → 본사/공장 열 잔량이 이동만큼 이동, 합계 열은 불변.
13. **달력**: 로스팅 있는 날=빨강+kg 뱃지, 주문 납기일=주황+납기 뱃지. 날짜 클릭 → 그날 전표(로스팅/판매/주문납기) 목록.

→ 위 숫자·색·목록이 손계산·원천 전표와 일치하면 Phase 2 잔여 + Phase 3 회계 코어 정상.

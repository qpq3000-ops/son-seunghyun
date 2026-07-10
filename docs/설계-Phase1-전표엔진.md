# 설계 — Phase 1 전표 엔진 (판매·구매·수금·로스팅·재고)

> 이 문서는 **구현 계약**이다. 서버 소넷과 클라이언트 소넷은 이 문서의 DDL·API JSON·화면 스펙을
> 그대로 구현한다. 임의 변경 금지. 애매하면 이 문서의 예시 JSON을 정답으로 삼는다.
>
> 전제(확정): 전표 = 헤더(doc) + 품목 라인(doc_line) 묶음. 재고의 유일한 진실 = `stock_ledger`
> (append-only 수불원장). 재고현황·수불부는 전부 이 원장의 집계. 전표 저장/수정/삭제 시 원장을
> **트랜잭션 안에서 재작성**한다. 금액은 원 단위 정수, 수량은 kg REAL(소수 1자리). **금액 계산·검증은
> 전적으로 서버 책임**(클라 값은 미리보기일 뿐, 서버가 재계산해 덮어씀).

---

## 0. 코드 컨벤션 (양쪽 소넷 필독 — 기존 코드 그대로 따를 것)

- **주석**: 한국어. `// ── 구획 ──` / 규칙 설명형 주석 (기존 `masters.mjs`, `001_init.sql` 스타일).
- **에러 메시지**: 전부 한국어. 서버는 `c.json({ error: '…' }, status)`. 클라는 서버 메시지를 그대로 토스트.
- **JSON body 파싱**: `masters.mjs`의 `readBody(c)` 패턴 사용 — 잘못된/배열 body는 `null` → 400.
- **화이트리스트 컬럼**: INSERT/UPDATE는 정해진 컬럼만. 클라가 보낸 `supply_amt`·`vat_amt`·`total_*`·`doc_no`
  같은 계산·식별 필드는 **절대 신뢰하지 않고 서버가 재계산/재채번**한다.
- **금액/수량 규칙**: 금액 `INTEGER`(원), 수량 `REAL`(kg). 공급가액 = `Math.round(qty*price)`,
  부가세 = 과세면 `settings.vat_round`에 따라 `floor`(기본) 또는 `round`, 면세면 0.
  → 서버 계산식은 클라 `VoucherForm.calcLine`과 **비트 단위로 동일**해야 한다(미리보기·저장값 불일치 방지).
- **better-sqlite3 동기 API**: 모든 다중 write는 `db.transaction(() => {…})()`로 감싼다.
- **DB pragma**: `foreign_keys = ON` (db.mjs에서 이미 설정). FK 위반은 `friendlySqlError`로 한국어 변환.

---

## 1. 마이그레이션 003 — 전체 DDL

파일: `server/migrations/003_voucher_engine.sql` (신규). 기존 마이그레이션 러너가 파일명 순으로 1회 적용한다.

```sql
-- Phase 1: 전표 엔진 (doc / doc_line / stock_ledger / doc_seq / receipt)
-- 규칙(001과 동일): 금액은 원 단위 정수(INTEGER), 수량은 REAL(kg 소수 1자리).
-- 재고의 유일한 진실 = stock_ledger (append-only). 재고현황/수불부는 전부 이 원장의 집계다.
-- 전표 저장/수정/삭제 시 원장을 트랜잭션 안에서 재작성한다.

-- ── 전표 헤더 ───────────────────────────────────────────────
CREATE TABLE doc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,                        -- 전표번호 'YYYYMMDD-N' (일자+유형별 순번). 최초 채번값 불변, 삭제해도 재사용 안 함
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('sale','purchase','roast')),   -- 판매 / 구매 / 로스팅
  io_date TEXT NOT NULL,                       -- 일자 'YYYY-MM-DD'
  partner_id INTEGER REFERENCES partner(id),   -- 거래처. 로스팅(roast)은 NULL
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(id),  -- 판매=출하창고 / 구매=입고창고 / 로스팅=공장
  tax_mode TEXT NOT NULL DEFAULT '과세'
    CHECK (tax_mode IN ('과세','면세')),          -- 로스팅은 '면세'로 저장(금액 0)
  project_id INTEGER REFERENCES project(id),
  memo TEXT NOT NULL DEFAULT '',               -- 적요
  total_qty REAL NOT NULL DEFAULT 0,           -- 라인 수량 합(캐시). roast는 산출 수량
  total_supply INTEGER NOT NULL DEFAULT 0,     -- 공급가액 합(캐시)
  total_vat INTEGER NOT NULL DEFAULT 0,        -- 부가세 합(캐시)
  total_amount INTEGER NOT NULL DEFAULT 0,     -- 합계(공급가액 + 부가세)
  yield_pct REAL,                              -- 로스팅 수율(%) — 판매/구매는 NULL
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (doc_type, doc_no)                    -- 번호는 유형별로 유일 (판매·구매가 같은 날 같은 번호일 수 있음)
);
CREATE INDEX idx_doc_type_date ON doc (doc_type, io_date);
CREATE INDEX idx_doc_partner   ON doc (partner_id);

-- ── 전표 품목 라인 ─────────────────────────────────────────
CREATE TABLE doc_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES doc(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,                    -- 1부터의 라인 순번
  item_id INTEGER NOT NULL REFERENCES item(id),
  line_role TEXT NOT NULL DEFAULT 'normal'
    CHECK (line_role IN ('normal','input','output')),
    -- normal = 판매/구매 라인, input = 로스팅 투입(생두), output = 로스팅 산출(원두)
  qty REAL NOT NULL DEFAULT 0,                 -- kg. 항상 양수로 저장(입출고 방향은 stock_ledger가 결정)
  price INTEGER NOT NULL DEFAULT 0,            -- 단가(원). 로스팅 라인은 0
  supply_amt INTEGER NOT NULL DEFAULT 0,       -- 공급가액(서버 계산)
  vat_amt INTEGER NOT NULL DEFAULT 0,          -- 부가세(서버 계산)
  remarks TEXT NOT NULL DEFAULT ''             -- 라인 적요
);
CREATE INDEX idx_line_doc  ON doc_line (doc_id);
CREATE INDEX idx_line_item ON doc_line (item_id);

-- ── 재고수불원장 (append-only. 전표 저장/수정/삭제 시 트랜잭션 안에서 재작성) ──
CREATE TABLE stock_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES doc(id) ON DELETE CASCADE,        -- 원천 전표
  doc_line_id INTEGER REFERENCES doc_line(id) ON DELETE CASCADE,
  io_date TEXT NOT NULL,                       -- doc.io_date 사본(기간 필터·인덱스용)
  item_id INTEGER NOT NULL REFERENCES item(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(id),
  io_type TEXT NOT NULL
    CHECK (io_type IN ('구매','판매','생산입고','생산소모','기타입고','기타출고')),
    -- 입고: 구매/생산입고/기타입고,  출고: 판매/생산소모/기타출고
  qty REAL NOT NULL,                           -- 부호 있는 수량: +입고 / -출고 (SUM(qty) = 현재고)
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_ledger_item_date ON stock_ledger (item_id, io_date);
CREATE INDEX idx_ledger_wh_item   ON stock_ledger (warehouse_id, item_id, io_date);
CREATE INDEX idx_ledger_doc       ON stock_ledger (doc_id);

-- ── 채번 카운터 (일자 + 유형별. 재사용 금지: 삭제해도 last_no를 감소시키지 않는다) ──
CREATE TABLE doc_seq (
  io_date TEXT NOT NULL,                       -- 'YYYYMMDD' (하이픈 제거형)
  seq_key TEXT NOT NULL,                       -- 'sale' | 'purchase' | 'roast' | '수금' | '지불'
  last_no INTEGER NOT NULL DEFAULT 0,          -- 마지막으로 발급한 순번 (단조 증가)
  PRIMARY KEY (io_date, seq_key)
);

-- ── 수금/지불 (품목 라인이 없고 금액+결제수단만 → doc과 분리한 별도 테이블) ──
--   미수금 = 판매 합계 − 수금 합계,  미지급 = 구매 합계 − 지불 합계 (거래처별 집계)
CREATE TABLE receipt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL,                    -- 'YYYYMMDD-N' (doc_seq로 채번)
  kind TEXT NOT NULL CHECK (kind IN ('수금','지불')),
  io_date TEXT NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partner(id),
  method TEXT NOT NULL DEFAULT '보통예금'
    CHECK (method IN ('현금','보통예금','받을어음','카드','기타')),   -- 결제수단
  amount INTEGER NOT NULL DEFAULT 0,           -- 금액(원)
  project_id INTEGER REFERENCES project(id),
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (kind, receipt_no)
);
CREATE INDEX idx_receipt_kind_date ON receipt (kind, io_date);
CREATE INDEX idx_receipt_partner   ON receipt (partner_id);
```

### 설계 결정 (왜 이렇게 했나)
1. **수금/지불은 `doc`가 아니라 별도 `receipt` 테이블**. 근거: 품목 라인이 없고(=`doc_line` 강제 시 빈 라인),
   재고원장(`stock_ledger`)을 건드리지 않으며, 결제수단(`method`)이라는 doc에 없는 필드가 있다.
   `doc`를 "품목 전표"로 순수하게 유지해야 원장 재작성 로직이 단순해진다(모든 doc은 항상 라인+원장을 가진다).
2. **로스팅도 `doc`의 한 유형(`roast`)**. 투입 생두는 `line_role='input'`(원장 −, 생산소모),
   산출 원두는 `line_role='output'`(원장 +, 생산입고). BOM 3전표를 화면 하나·전표 하나로 통합.
3. **채번은 `doc_seq` 하나로 통합**(doc·receipt 공용). `seq_key`로 유형 구분, `last_no`는 단조 증가만 →
   삭제해도 번호 재사용 없음. 전표번호는 최초 채번값 **불변**(수정 시에도 안 바뀜).
4. **원장 qty는 부호 있는 수량**(+입고/−출고) → `SUM(qty)` = 현재고. 수불부의 입고/출고 컬럼은 부호로 분리.
5. **io_type로 수불 유형 구분**(구매/판매/생산입고/생산소모/기타입고/기타출고) → 수불부에서 이월/입고/출고 세분.

---

## 2. API 계약 (구현자 복붙용)

모든 경로는 `/api` 프리픽스. 응답은 JSON. 실패 시 `{ "error": "한국어 메시지" }` + 적절한 status.
목록 조회는 **페이지 없이 전체** 반환(1인/소량 데이터 전제). 기간 파라미터는 `YYYY-MM-DD`.

### 2.1 전표 CRUD — 판매/구매 (`server/vouchers.mjs`)

#### `GET /api/docs` — 전표 목록(조회 화면용)
쿼리: `type`(필수, sale|purchase|roast) · `from` · `to` · `partner_id`(옵션) · `item_id`(옵션, 라인에 해당 품목 포함 전표).
```jsonc
// 응답 200 (배열, io_date DESC, id DESC)
[
  {
    "id": 101, "doc_no": "20260710-1", "doc_type": "sale",
    "io_date": "2026-07-10",
    "partner_id": 12, "partner_name": "카페그래비티",
    "warehouse_id": 1, "warehouse_name": "본사창고",
    "item_summary": "에티오피아 예가체프 외 1건",   // 첫 라인 품목명 + (라인>1 ? ' 외 N건' : '')
    "line_count": 2,
    "total_qty": 15, "total_supply": 195000, "total_vat": 19500, "total_amount": 214500,
    "memo": "정기납품"
  }
]
```

#### `GET /api/docs/:id` — 전표 1건(수정 모드 로딩용)
```jsonc
// 응답 200
{
  "id": 101, "doc_no": "20260710-1", "doc_type": "sale", "io_date": "2026-07-10",
  "partner_id": 12, "partner_name": "카페그래비티",
  "warehouse_id": 1, "warehouse_name": "본사창고",
  "tax_mode": "과세", "project_id": null, "memo": "정기납품",
  "total_qty": 15, "total_supply": 195000, "total_vat": 19500, "total_amount": 214500,
  "lines": [
    { "id": 201, "line_no": 1, "item_id": 34, "item_code": "00123", "item_name": "에티오피아 예가체프",
      "unit": "kg", "line_role": "normal", "qty": 10, "price": 12000,
      "supply_amt": 120000, "vat_amt": 12000, "remarks": "" },
    { "id": 202, "line_no": 2, "item_id": 35, "item_code": "00124", "item_name": "콜롬비아",
      "unit": "kg", "line_role": "normal", "qty": 5, "price": 15000,
      "supply_amt": 75000, "vat_amt": 7500, "remarks": "" }
  ]
}
```

#### `POST /api/docs` — 전표 생성
```jsonc
// 요청 (supply_amt/vat_amt/doc_no를 보내도 서버가 무시하고 재계산·재채번)
{
  "type": "sale",                 // sale | purchase
  "io_date": "2026-07-10",
  "partner_id": 12,
  "warehouse_id": 1,
  "tax_mode": "과세",
  "project_id": null,
  "memo": "정기납품",
  "lines": [
    { "item_id": 34, "qty": 10, "price": 12000, "remarks": "" },
    { "item_id": 35, "qty": 5,  "price": 15000, "remarks": "" }
  ]
}
// 응답 201 = GET /api/docs/:id 형태 + "warnings" 배열
{
  "id": 101, "doc_no": "20260710-1", ... ,
  "lines": [ ... ],
  "warnings": ["'에티오피아 예가체프' 재고가 -3.0kg 입니다."]   // 음수재고 경고(저장은 성공)
}
```

#### `PUT /api/docs/:id` — 전표 수정
요청 body는 POST와 동일(`type` 생략 가능, 기존 유형 유지). **전표번호(doc_no)는 불변**. 라인+원장 전량 재작성.
응답 = GET/POST 형태 + `warnings`.

#### `DELETE /api/docs/:id` — 전표 삭제
```jsonc
// 응답 200
{ "ok": true }
```
삭제 시 `doc_line`·`stock_ledger`는 FK CASCADE로 함께 삭제. `doc_seq.last_no`는 **건드리지 않음**(번호 재사용 금지).

#### `GET /api/docs/recent-sale?partner_id=12` — 지난 주문 복사용(거래처 최근 판매 1건)
> 라우트 등록 순서 주의: `/api/docs/recent-sale`를 **`/api/docs/:id`보다 먼저** 등록할 것(정적 경로 우선 매칭).
```jsonc
// 응답 200 — 있으면
{ "found": true, "doc_no": "20260703-2", "io_date": "2026-07-03",
  "lines": [
    { "item_id": 34, "item_code": "00123", "item_name": "에티오피아 예가체프", "unit": "kg",
      "qty": 10, "price": 12000, "remarks": "" }
  ] }
// 없으면
{ "found": false }
```

### 2.2 로스팅 (`server/vouchers.mjs`) — 내부적으로 `doc(type=roast)` 조작

#### `POST /api/roast` — 로스팅 저장(투입 여러 라인 + 산출 1건 원자적)
```jsonc
// 요청
{
  "io_date": "2026-07-10",
  "warehouse_id": 2,             // 공장(창고). 미지정 시 서버가 wh_type='공장' 첫 창고 사용
  "memo": "오전 배치 bco",
  "inputs": [                    // 투입 생두 (여러 종 = 블랜딩)
    { "item_id": 50, "qty": 12 },
    { "item_id": 51, "qty": 8 }
  ],
  "output": { "item_id": 10, "qty": 17.2 }   // 산출 원두 1품목
}
// 응답 201
{
  "id": 140, "doc_no": "20260710-1", "io_date": "2026-07-10",
  "warehouse_id": 2, "warehouse_name": "로스팅공장", "memo": "오전 배치 bco",
  "input_total": 20, "output_total": 17.2, "yield_pct": 86.0,   // = round(17.2/20*100, 1)
  "inputs": [
    { "item_id": 50, "item_code": "a00050", "item_name": "에티오피아 생두", "qty": 12 },
    { "item_id": 51, "item_code": "a00051", "item_name": "브라질 생두",   "qty": 8 }
  ],
  "output": { "item_id": 10, "item_code": "00010", "item_name": "bco 블랜드", "qty": 17.2 },
  "warnings": []
}
```
서버 처리: `doc(type=roast, tax_mode='면세', partner_id=NULL, yield_pct=계산)` 생성 →
투입 라인 `line_role='input'`, 원장 `io_type='생산소모', qty = -투입kg` /
산출 라인 `line_role='output'`, 원장 `io_type='생산입고', qty = +산출kg`. 전부 한 트랜잭션.

#### `GET /api/roast?from=&to=` — 최근 로스팅 이력 목록
```jsonc
[ { "id": 140, "doc_no": "20260710-1", "io_date": "2026-07-10",
    "output_item_name": "bco 블랜드", "input_total": 20, "output_total": 17.2,
    "yield_pct": 86.0, "memo": "오전 배치 bco" } ]
```

#### `GET /api/roast/:id` — 로스팅 1건(수정 로딩) → POST 응답과 동일 형태
#### `PUT /api/roast/:id` — 수정(원장 재작성, 번호 불변) → POST 응답 형태
#### `DELETE /api/roast/:id` — 삭제 → `{ "ok": true }` (CASCADE, 번호 재사용 금지)

### 2.3 수금/지불 (`server/receipts.mjs`)

#### `GET /api/receipts?kind=수금&from=&to=&partner_id=` — 목록
```jsonc
[ { "id": 5, "receipt_no": "20260710-1", "kind": "수금", "io_date": "2026-07-10",
    "partner_id": 12, "partner_name": "카페그래비티", "method": "보통예금",
    "amount": 214500, "project_id": null, "memo": "7월 정산" } ]
```

#### `POST /api/receipts` — 생성
```jsonc
// 요청
{ "kind": "수금", "io_date": "2026-07-10", "partner_id": 12,
  "method": "보통예금", "amount": 214500, "project_id": null, "memo": "7월 정산" }
// 응답 201
{ "id": 5, "receipt_no": "20260710-1", "kind": "수금", ... }
```

#### `PUT /api/receipts/:id` — 수정(번호 불변) → 생성 응답 형태
#### `DELETE /api/receipts/:id` → `{ "ok": true }`

#### `GET /api/receivables?as_of=2026-07-10` — 미수금현황(거래처별)
`as_of` 옵션(기본 오늘). 판매 합계 − 수금 합계. 활동 없는 거래처는 제외, `balance` DESC 정렬.
```jsonc
[ { "partner_id": 12, "partner_code": "1010", "partner_name": "카페그래비티",
    "pay_cycle": "월별", "sales_total": 5000000, "receipt_total": 4000000, "balance": 1000000 } ]
```

#### `GET /api/payables?as_of=` — 미지급현황(동일 로직, 구매−지불)
```jsonc
[ { "partner_id": 30, "partner_code": "2020", "partner_name": "생두수입상사",
    "pay_cycle": "월별", "purchase_total": 3000000, "payment_total": 2000000, "balance": 1000000 } ]
```

### 2.4 재고 리포트 (`server/reports.mjs`)

#### `GET /api/stock/status?as_of=2026-07-10&warehouse_id=` — 재고현황(기준일자·창고 옵션)
`warehouse_id` 없으면 전 창고 합산. `qty = SUM(ledger.qty WHERE io_date <= as_of [AND wh])`.
```jsonc
[ { "item_id": 10, "item_code": "00010", "item_name": "bco 블랜드", "spec": "", "unit": "kg",
    "item_type": "제품", "qty": 123.4, "safety_qty": 50, "below_safety": false } ]
```
`below_safety` = `safety_qty > 0 AND qty < safety_qty` (클라에서 빨간 표시).

#### `GET /api/stock/ledger?item_id=10&from=&to=&warehouse_id=` — 재고수불부(품목 필수)
```jsonc
{
  "item": { "id": 10, "code": "00010", "name": "bco 블랜드", "unit": "kg" },
  "opening": 30.0,                              // 이월 = SUM(qty) WHERE io_date < from
  "rows": [
    { "io_date": "2026-07-02", "doc_no": "20260702-1", "io_type": "생산입고",
      "partner_name": null, "in_qty": 17.2, "out_qty": 0, "balance": 47.2, "memo": "오전 배치" },
    { "io_date": "2026-07-03", "doc_no": "20260703-2", "io_type": "판매",
      "partner_name": "카페그래비티", "in_qty": 0, "out_qty": 10, "balance": 37.2, "memo": "" }
  ],
  "sum_in": 17.2, "sum_out": 10, "closing": 37.2   // closing = opening + sum_in − sum_out
}
```
`balance`는 서버가 이월값에서 행 순서대로 누적 계산(정렬: `io_date`, `id`).

---

## 3. 서버 동작 규칙 (엔진 불변식)

공유 엔진 헬퍼 파일 `server/ledger.mjs`에 아래를 두고, `vouchers.mjs`·`receipts.mjs`·`reports.mjs`가 import.
(masters.mjs의 `err`/`readBody`/`friendlySqlError`와 동일 시그니처를 `ledger.mjs`에도 두고 재사용 —
masters.mjs는 수정하지 않는다.)

### 3.1 채번 (`nextSeqNo`)
```js
// 트랜잭션 내부에서 호출. io_date는 'YYYY-MM-DD', seqKey는 'sale'|'purchase'|'roast'|'수금'|'지불'
function nextSeqNo(ioDate, seqKey) {
  const ymd = ioDate.replace(/-/g, '');                 // '20260710'
  const row = db.prepare(`
    INSERT INTO doc_seq (io_date, seq_key, last_no) VALUES (?, ?, 1)
    ON CONFLICT(io_date, seq_key) DO UPDATE SET last_no = last_no + 1
    RETURNING last_no
  `).get(ymd, seqKey);
  return `${ymd}-${row.last_no}`;                        // '20260710-1'
}
```
- 삭제 시 `doc_seq`는 **손대지 않는다** → 빈 번호가 생겨도 재사용하지 않음.
- 수정(PUT) 시 채번하지 않음 → **전표번호 불변**.

### 3.2 금액 재계산 (`calcAmounts`) — 클라 미리보기와 반드시 동일
```js
function calcAmounts(qty, price, taxMode, vatRound /* 'floor'|'round' */) {
  const supply = Math.round(qty * price);
  const rawVat = taxMode === '과세' ? supply * 0.1 : 0;
  const vat = vatRound === 'round' ? Math.round(rawVat) : Math.floor(rawVat);
  return { supply, vat };
}
// vatRound 는 SELECT value FROM settings WHERE key='vat_round' (없으면 'floor')
```
- 헤더 `total_*` = 라인 합. 클라가 보낸 금액은 전부 폐기하고 이 결과로 저장.

### 3.3 원장 재작성 (트랜잭션 경계)
- **POST(생성)**: `db.transaction`으로 ①`doc` insert(채번) ②라인 insert(금액 계산) ③`stock_ledger` insert.
  판매 라인 → `io_type='판매', qty=-qty` / 구매 라인 → `io_type='구매', qty=+qty`.
- **PUT(수정)**: 한 트랜잭션에서 `DELETE FROM doc_line WHERE doc_id=?` + `DELETE FROM stock_ledger WHERE doc_id=?`
  후, 새 라인·원장 재삽입. `doc`는 헤더 필드만 UPDATE(+`updated_at=datetime('now','localtime')`), `doc_no`·`doc_type` 유지.
- **DELETE**: `db.transaction(() => db.prepare('DELETE FROM doc WHERE id=?').run(id))` — CASCADE로 라인·원장 정리.
- **로스팅**: POST/PUT 동일 원칙 + `yield_pct` 계산, 투입=`생산소모(-)`, 산출=`생산입고(+)`.
- **수금/지불**: 원장을 만들지 않음. `receipt`만 insert/update/delete(수정 시 번호 불변).

### 3.4 검증 규칙 (전부 한국어 400 에러)
| 조건 | 메시지 |
|---|---|
| body 파싱 실패/배열 | `요청 본문이 올바르지 않습니다.` |
| `io_date` 없음/형식오류 | `일자를 입력하세요.` |
| 판매/구매 `partner_id` 없음 | `거래처를 선택하세요.` |
| `warehouse_id` 없음 | `창고를 선택하세요.` |
| 유효 라인(품목+수량>0) 0개 | `품목 라인을 1개 이상 입력하세요.` |
| 라인에 `item_id` 없음 | `품목을 선택하지 않은 라인이 있습니다.` |
| 로스팅 투입 0개 | `투입 생두를 1개 이상 입력하세요.` |
| 로스팅 산출 품목/수량 없음 | `산출 원두와 수량을 입력하세요.` |
| 수금/지불 `amount<=0` | `금액은 0보다 커야 합니다.` |
| `:id` 없음(수정/삭제) | 404 `전표를 찾을 수 없습니다.` / `수금 자료를 찾을 수 없습니다.` |

- **음수재고는 허용**(이카운트와 동일, 차단하지 않음). 저장 후 영향받은 (품목,창고) 잔량을 계산해
  0 미만이면 `warnings`에 `'{품목명}' 재고가 {잔량}kg 입니다.` 문자열을 담아 반환(저장은 커밋).
- 로스팅 저장 시 `output.qty > input_total`이면 수율>100 → 차단하지 않고 `warnings`에
  `수율이 100%를 넘습니다(투입보다 산출이 많음). 수량을 확인하세요.` 추가.

### 3.5 라우트 등록 (`server/index.mjs` 수정 — 서버 담당)
```js
import { vouchers } from './vouchers.mjs';
import { receipts } from './receipts.mjs';
import { reports }  from './reports.mjs';
app.route('/api', vouchers);   // /api/docs*, /api/roast*
app.route('/api', receipts);   // /api/receipts*, /api/receivables, /api/payables
app.route('/api', reports);    // /api/stock/status, /api/stock/ledger
// 주의: 이 3줄은 기존 `app.route('/api', masters)` 다음, `app.all('/api/*', 404)` 앞에 추가.
```

---

## 4. 화면별 스펙 (클라이언트)

공통: 기존 `screen`/`screen-bar`/`screen-grid` 레이아웃, `DataGrid`(Tabulator), `CodeHelp`(코드도움),
`Modal`/`Confirm`, `useToast`, `api`(get/post/put/del), `fmtWon`/`fmtQty`/`todayISO` 재사용.
기간 기본값 = **이번달 1일 ~ 오늘**(`format.ts`에 `monthStartISO()` 헬퍼 추가).

### 4.0 VoucherForm 확장 (`client/src/components/VoucherForm.tsx` 수정)
현재 미사용 스캐폴드이므로 자유 확장. **추가 props**(기존 props 유지):
```ts
headerActions?: ReactNode;          // vh-title 우측 슬롯 (지난주문복사 버튼 등)
priceResolver?: (itemId: number, priceOut: number) => number;  // 품목 선택 시 단가 결정
warehouseLabel?: string;            // 기본 '창고' (구매는 '입고창고')
saveLabel?: string;                 // 기본 '저장 (연속입력)'
```
- 품목 코드도움 `onSelect`에서 단가: `price = priceResolver ? priceResolver(r.id, Number(r.price_out ?? 0)) : Number(r.price_out ?? 0)`.
  → **단가 자동적용 순서**: 특별단가 → 품목 출고단가 → 0(싯가). 특별단가는 화면이 `priceResolver`로 주입.
- `headerActions`는 `<div className="vh-title">` 줄 오른쪽에 렌더. 헤더 필드 줄(vh-fields)에 프로젝트/저장버튼 라벨은 기존대로.

### 4.1 판매입력 / 구매입력 — `client/src/screens/VoucherScreen.tsx`
exports: `SaleInput = () => <VoucherScreen kind="sale" />`, `PurchaseInput = () => <VoucherScreen kind="purchase" />`.
내부 `VoucherScreen({ kind, mode='create', docId?, onSaved?, onDeleted? })` 하나로 신규·수정 겸용.

- **메뉴**: `sale`(판매입력) / `purchase`(구매입력).
- **배치**: 화면 전체가 `VoucherForm`. 상단 헤더(일자/거래처/창고/거래유형/적요) + 하단 품목 라인 그리드 + 우하단 [저장(연속입력)].
- **헤더 슬롯(headerActions)**: 판매만 `[지난 주문 복사]` 버튼(구매는 없음).
- **단가 자동적용**: 거래처 선택 시 `GET /api/price-special?partner_id=`로 `Map<item_id, price>` 구성 →
  `priceResolver = (id, priceOut) => map.get(id) ?? priceOut ?? 0` 를 VoucherForm에 전달.
- **지난 주문 복사**: 거래처 지정 상태에서 클릭 → `GET /api/docs/recent-sale?partner_id=` →
  `found` 시 lines를 폼 라인으로 채움(각 라인 서버가 준 qty/price 사용, 없으면 토스트 '최근 판매 내역이 없습니다.').
- **저장(연속입력)**: `POST /api/docs` → 성공 시 `warnings` 있으면 error 토스트로 표시,
  성공 토스트 `저장되었습니다. (전표 {doc_no})`, **라인만 초기화(`[emptyLine()]`)하고 헤더(일자/거래처/창고/거래유형)는 유지** → 반복 입력.
- **수정 모드(mode='edit')**: `GET /api/docs/:id`로 로딩 → 같은 VoucherForm + 하단 버튼 `[저장]` `[삭제]` `[목록으로]`.
  저장 `PUT /api/docs/:id`, 삭제 `Confirm` → `DELETE /api/docs/:id` → `onDeleted()`.
- **라인 그리드 컬럼**(VoucherForm 기존): No/품목코드/품목명/단위/수량/단가/공급가액/부가세/적요/삭제. 하단 합계행 존재.

### 4.2 판매조회 / 구매조회 — `client/src/screens/VoucherList.tsx`
exports: `SaleList = () => <VoucherListScreen kind="sale" />`, `PurchaseList = () => <VoucherListScreen kind="purchase" />`.

- **메뉴**: `sale-status`(판매조회) / `purchase-status`(구매조회).
- **배치**:
  - 상단 검색조건(`screen-bar`): 기간 `from`~`to`(기본 이번달 1일~오늘) + 거래처(코드도움, 선택) + `[검색]` + `[엑셀]`.
  - 본문 그리드(`DataGrid`).
  - 행 **더블클릭** → 같은 화면을 `VoucherScreen kind mode='edit' docId`로 교체(그리드 숨김) → 저장/삭제 후 목록 복귀+재조회.
- **그리드 컬럼**:

| 컬럼 | field | 정렬/포맷 | 비고 |
|---|---|---|---|
| 일자 | io_date | 좌 | |
| 전표번호 | doc_no | 좌 | |
| 거래처 | partner_name | 좌 | |
| 품목요약 | item_summary | 좌 | 서버 제공 |
| 수량 | total_qty | 우, `fmtQty` | bottomCalc sum |
| 공급가액 | total_supply | 우, `fmtWon` | bottomCalc sum |
| 부가세 | total_vat | 우, `fmtWon` | bottomCalc sum |
| 합계 | total_amount | 우, `fmtWon` | bottomCalc sum |
| 적요 | memo | 좌 | |

- 호출: `GET /api/docs?type={kind}&from&to&partner_id`. 하단 합계는 Tabulator `bottomCalc: 'sum'` +
  `bottomCalcFormatter`로 `fmtWon`/`fmtQty` 적용. 엑셀은 기존 `grid.download('xlsx', …)` 패턴.

### 4.3 수금입력+미수금현황 — `client/src/screens/ReceiptScreen.tsx`
exports: `ReceiptScreen`(수금 처리 화면) / `ReceivableScreen`(미수금현황 조회 전용). 내부 공용 그리드 컴포넌트 사용.

- **메뉴**: `receipt`(수금입력) / `receivable`(미수금현황).
- **ReceiptScreen 배치**:
  - 상단: `[기준일자]`(기본 오늘) `[새로고침]`.
  - 본문: **미수금현황 그리드**(거래처별 잔액). 각 행 우측 `[수금]` 버튼.
  - `[수금]` 클릭 → `Modal`(수금 입력): 일자(기본 오늘)/거래처(고정 표시)/수금구분(select 현금·보통예금·받을어음·카드·기타)/금액(기본=미수잔액)/적요 → `POST /api/receipts (kind:'수금')` → 재조회.
- **그리드 컬럼**(미수금현황):

| 컬럼 | field | 포맷/강조 |
|---|---|---|
| 거래처코드 | partner_code | |
| 거래처명 | partner_name | |
| 입금주기 | pay_cycle | `'월별'`이면 굵게/강조색(예: `<b class="link">월별</b>`) |
| 매출합계 | sales_total | 우, `fmtWon` |
| 수금합계 | receipt_total | 우, `fmtWon` |
| 미수잔액 | balance | 우, `fmtWon`, 양수면 강조(빨강/굵게) |
| 수금 | (버튼) | `<span class="link">수금</span>` cellClick |

- 호출: `GET /api/receivables?as_of=`. **입금주기 '월별'** 행은 시각적으로 강조(월말 일괄 수금 대상).
- **ReceivableScreen**: 위 그리드와 동일하되 `[수금]` 버튼 컬럼 없음(조회 전용) + `[엑셀]`. 하단 합계행(매출/수금/잔액 sum).
  → 공용 컴포넌트 `<ReceivablesGrid asOf onReceipt?={fn} />`를 두고 ReceiptScreen은 `onReceipt` 전달, ReceivableScreen은 생략.

> (선택·저비용) `payment`/`payable` 메뉴도 동일 컴포넌트에 `kind='지불'`/`GET /api/payables`로 재사용 가능.
> 단, 이번 필수 산출물은 `receipt`/`receivable`만. 겹침 방지를 위해 payment/payable 연결은 하지 않는다(placeholder 유지).

### 4.4 로스팅 입력 — `client/src/screens/RoastInput.tsx`
export: `RoastInput`.

- **메뉴**: `roast-sheet` (이름 `로스팅 입력`으로 변경, 아래 5장).
- **배치**(위→아래):
  1. 헤더: 일자(기본 오늘) / 공장(창고 코드도움, 기본 wh_type='공장' 첫 창고) / 적요.
  2. **산출 원두 선택**: 품목 코드도움(제품/상품 위주) → 선택 시 `item.paired_item_id` 있으면
     해당 생두를 **투입 라인에 자동 제안 추가**(1줄, qty 빈칸). (`GET /api/items`에 paired_item_id 포함되어 있음.)
  3. **투입 생두 그리드**(여러 라인): 품목(코드도움)/수량(kg)/삭제 + `[+ 투입 추가]`. bco 블랜딩 = 생두 여러 종.
  4. **산출**: 산출 원두(2에서 선택)/산출 수량(kg).
  5. **수율 표시**: `수율 = round(산출 / 투입합계 × 100, 1)%` 실시간(투입합계 0이면 '-'). 투입합계·산출합계도 표시.
  6. 우하단 `[저장]` → `POST /api/roast` (연속입력: 저장 후 라인 초기화, 일자·공장 유지).
  7. 하단 **최근 로스팅 이력**(`DataGrid`): `GET /api/roast?from&to`(기본 최근 1개월). 컬럼: 일자/전표번호/산출원두/투입합계/산출/수율/적요. 더블클릭 → 수정 모드(Modal 또는 화면 교체) → `PUT /api/roast/:id`, `[삭제]` → `DELETE /api/roast/:id`.
- 사용 컴포넌트: `CodeHelp`, `Modal`/`Confirm`, `DataGrid`, `fmtQty`. 투입 그리드는 VoucherForm이 아닌 자체 간이 테이블(voucher-lines 클래스 재사용 가능).

### 4.5 재고현황 — `client/src/screens/StockScreens.tsx` (export `StockStatus`)
- **메뉴**: `stock-status`.
- **배치**: 상단 `[기준일자]`(기본 오늘) + 창고(코드도움, 선택=전체) + `[조회]` + `[엑셀]`. 본문 `DataGrid`.
- **컬럼**: 품목코드/품목명/규격/단위/재고수량(우,`fmtQty`)/안전재고(우,`fmtQty`). `below_safety=true` 행은
  **빨간색 표시**(row formatter 또는 재고수량 셀에 `class`로 danger 색). 호출: `GET /api/stock/status?as_of&warehouse_id`.

### 4.6 재고수불부 — `client/src/screens/StockScreens.tsx` (export `StockLedger`)
- **메뉴**: `stock-ledger`.
- **배치**:
  - 상단: 기간 `from`~`to`(기본 이번달) + 품목(코드도움, **필수**) + 창고(선택) + `[조회]` + `[엑셀]`.
  - 요약 바: `이월 {opening} / 입고 {sum_in} / 출고 {sum_out} / 잔량 {closing}` (모두 `fmtQty`).
  - 본문 `DataGrid`.
- **컬럼**: 일자(io_date)/전표번호(doc_no)/유형(io_type)/거래처(partner_name)/입고(in_qty,우)/출고(out_qty,우)/잔액(balance,우)/적요(memo).
  호출: `GET /api/stock/ledger?item_id&from&to&warehouse_id`. 품목 미선택 시 조회 막고 토스트 `품목을 선택하세요.`.

### 4.7 타입 추가 — `client/src/types.ts` (클라 담당)
`Doc`, `DocLine`, `DocListRow`, `RoastDetail`, `RoastListRow`, `Receipt`, `Receivable`, `StockRow`, `LedgerReport`
인터페이스를 위 JSON에 맞춰 추가(기존 `Item`/`Partner` 스타일).

---

## 5. menus.tsx 연결 (클라 담당 — 이 파일은 클라 전용, 서버와 겹치지 않음)

`client/src/menus.tsx`에서 아래 항목의 `m(...)` 4번째 인자에 컴포넌트를 넣고 일부 이름 변경.
상단에 screen import 추가.
```tsx
import { SaleInput, PurchaseInput } from './screens/VoucherScreen';
import { SaleList, PurchaseList } from './screens/VoucherList';
import { ReceiptScreen, ReceivableScreen } from './screens/ReceiptScreen';
import { RoastInput } from './screens/RoastInput';
import { StockStatus, StockLedger } from './screens/StockScreens';
```
| id | 변경 전 name | 변경 후 name | component |
|---|---|---|---|
| `sale` | 판매입력/조회 | **판매입력** | `SaleInput` |
| `sale-status` | 판매현황 | **판매조회** | `SaleList` |
| `purchase` | 구매입력/조회 | **구매입력** | `PurchaseInput` |
| `purchase-status` | 구매현황 | **구매조회** | `PurchaseList` |
| `receipt` | 수금입력 | 수금입력 | `ReceiptScreen` |
| `receivable` | 미수금현황 | 미수금현황 | `ReceivableScreen` |
| `roast-sheet` | 로스팅시트(작업지시) | **로스팅 입력** | `RoastInput` (phase는 1로) |
| `stock-status` | 재고현황 | 재고현황 | `StockStatus` |
| `stock-ledger` | 재고수불부 | 재고수불부 | `StockLedger` |

`implemented`는 `m()` 헬퍼가 component 유무로 자동 판정 → 위 항목은 자동 true(Phase 태그 사라짐).
나머지 메뉴(quote/order/po/payment/payable/move 등)는 그대로 placeholder 유지.

---

## 6. 구현 분담 명세 (파일 겹침 0)

### [서버 소넷] — `server/` 만 담당
| 파일 | 작업 | 내용 |
|---|---|---|
| `server/migrations/003_voucher_engine.sql` | 신규 | 1장 DDL 그대로 |
| `server/ledger.mjs` | 신규 | 공유 엔진: `nextSeqNo`, `calcAmounts`, 원장 재작성 헬퍼, `err`/`readBody`/`friendlySqlError`(masters와 동일 시그니처 복제), settings의 `vat_round`/기본창고 조회 |
| `server/vouchers.mjs` | 신규 | `GET/POST /api/docs`, `GET/PUT/DELETE /api/docs/:id`, `GET /api/docs/recent-sale`(:id보다 먼저 등록), `POST/GET/PUT/DELETE /api/roast(/:id)` |
| `server/receipts.mjs` | 신규 | `GET/POST /api/receipts`, `GET/PUT/DELETE /api/receipts/:id`, `GET /api/receivables`, `GET /api/payables` |
| `server/reports.mjs` | 신규 | `GET /api/stock/status`, `GET /api/stock/ledger` |
| `server/index.mjs` | **수정** | 3.5의 `app.route` 3줄 추가(masters 다음, 404 앞) |

> masters.mjs·ecount.mjs·db.mjs는 **수정하지 않는다**.

### [클라 소넷] — `client/src/` 만 담당
| 파일 | 작업 | 내용 |
|---|---|---|
| `client/src/components/VoucherForm.tsx` | **수정** | 4.0의 props 추가(headerActions/priceResolver/warehouseLabel/saveLabel), 품목 단가 resolver 반영 |
| `client/src/screens/VoucherScreen.tsx` | 신규 | `SaleInput`, `PurchaseInput` (신규·수정 겸용) |
| `client/src/screens/VoucherList.tsx` | 신규 | `SaleList`, `PurchaseList` |
| `client/src/screens/ReceiptScreen.tsx` | 신규 | `ReceiptScreen`, `ReceivableScreen` (+공용 `ReceivablesGrid`) |
| `client/src/screens/RoastInput.tsx` | 신규 | `RoastInput` |
| `client/src/screens/StockScreens.tsx` | 신규 | `StockStatus`, `StockLedger` |
| `client/src/types.ts` | **수정** | 4.7 인터페이스 추가 |
| `client/src/menus.tsx` | **수정** | 5장 연결 |
| `client/src/format.ts` | **수정** | `monthStartISO()` 추가 |

> App.tsx·api.ts·기존 컴포넌트(DataGrid/CodeHelp/Modal/Toast)는 수정 불필요(그대로 사용).
> 서버·클라가 공유하는 유일한 계약은 **2장 API JSON**. 양쪽은 이 필드명을 글자 그대로 맞춘다.

---

## 7. 수기 대사 시나리오 (Phase 1 DoD — 구현 후 자가검증)

1. 생두 입고: 구매입력에 `a00050 생두 20kg` 저장 → 재고현황 `a00050 = 20`, 수불부 입고 20.
2. 로스팅: 투입 `a00050 20`, 산출 `00010 17.2` 저장 → 수율 86.0%, 재고현황 `a00050 = 0`, `00010 = 17.2`.
3. 판매: `00010 10kg @12,000 과세` 저장 → 공급가 120,000 / 부가세 12,000 / 합계 132,000.
   재고현황 `00010 = 7.2`. 미수금현황 해당 거래처 잔액 +132,000.
4. 수금: 그 거래처 `132,000 보통예금` → 미수잔액 0.
5. 판매 전표 삭제 후 재입력 → 새 전표번호는 이전 번호를 **재사용하지 않음**. 재고·미수금 원복 확인.

→ 위 숫자가 손계산과 일치하면 전표 엔진 정상.

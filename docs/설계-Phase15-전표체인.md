# 설계 — Phase 1.5 전표 체인 (견적·주문·발주 끌어오기 + 기타이동 4종 + 거래명세서 인쇄 + 판매내역 이관)

> 이 문서는 **구현 계약**이며 `설계-Phase1-전표엔진.md`의 **증보판**이다. 서버 소넷과 클라이언트 소넷은
> 이 문서의 DDL·API JSON·화면 스펙을 그대로 구현한다. 임의 변경 금지. 애매하면 이 문서의 예시 JSON을 정답으로 삼는다.
>
> 전제(Phase 1과 동일): 전표 = 헤더(`doc`) + 품목 라인(`doc_line`) 묶음. 재고의 유일한 진실 = `stock_ledger`
> (append-only 수불원장). 금액은 원 단위 정수, 수량은 kg REAL(소수 1자리). **금액 계산·검증·채번은 전적으로 서버 책임**.
> 전표 저장/수정/삭제 시 원장을 **트랜잭션 안에서 재작성**한다. 전표번호(`doc_no`)는 최초 채번값 **불변**.
>
> Phase 1.5가 깨는 유일한 기존 전제: **"모든 doc는 원장을 보유한다"**. 견적/주문/발주는 원장을 발생시키지 않는다.
> 따라서 2장의 **doc_type별 규칙 표**가 이 문서의 핵심 계약이다 — 원장 발생 여부는 오직 이 표를 따른다.

---

## 0. 코드 컨벤션 (Phase 1과 동일 — 재확인)

- **주석·에러 메시지·토스트**: 전부 한국어. 서버 `c.json({ error: '…' }, status)`, 클라는 서버 메시지 그대로 토스트.
- **JSON body 파싱**: `ledger.mjs`의 `readBody(c)` 재사용(잘못된/배열 body → `null` → 400).
- **화이트리스트 컬럼**: 클라가 보낸 `supply_amt`·`vat_amt`·`total_*`·`doc_no`·`status`(sale/purchase의 완료여부) 등 계산·식별 필드는
  신뢰하지 않고 서버가 재계산/재채번/재판정한다.
- **금액/수량**: 금액 `INTEGER`(원), 수량 `REAL`(kg). `calcAmounts`(=클라 `calcLine`)로 비트 단위 동일 계산. 기타이동은 금액 0.
- **트랜잭션**: 모든 다중 write는 `db.transaction(() => {…})()`. 채번은 트랜잭션 내부에서 `nextSeqNo`.
- **DB pragma**: `foreign_keys = ON` (db.mjs 기설정). FK 위반은 `friendlySqlError`로 한국어 변환.
- **라우트 등록 순서**: 정적 경로(`/api/docs/pullable`)를 파라미터 경로(`/api/docs/:id`)보다 **먼저** 등록.

---

## 1. 마이그레이션 004 — DDL (실 DB 사본 검증 완료)

파일: `server/migrations/004_doc_chain_moves.sql` (신규). 기존 러너(`db.mjs > migrate()`)가 파일명 순으로 1회 적용한다.

### 1.1 배경 — 왜 doc 테이블을 재빌드하는가
`doc.doc_type`에는 `CHECK (doc_type IN ('sale','purchase','roast'))`가 걸려 있다. Phase 1.5는 여기에
`quote/order/purchase_order/move/self_use/defect/adjust` 7종을 추가해야 하는데, **SQLite는 CHECK 제약을 `ALTER`로 바꿀 수 없다.**
사본으로 두 가지 대안을 실측한 결과:
- `PRAGMA writable_schema`로 `sqlite_schema.sql`을 직접 치환 → **better-sqlite3가 `sqlite_master may not be modified`로 원천 차단**(사용 불가).
- 표준 12-step 재빌드(테이블 rename) → 러너가 트랜잭션 안에서 실행하는데, **트랜잭션 안에서는 `PRAGMA foreign_keys=OFF`가 무효(no-op)** 라
  `DROP TABLE doc` 시 자식(`doc_line`·`stock_ledger`)이 `ON DELETE CASCADE`로 **함께 삭제**됨(데이터 유실 실측 확인).

→ 채택: **자식을 FK 없는 임시표로 백업 → doc 재빌드 → 자식 복원**. 러너가 파일 전체를 한 트랜잭션으로 감싸므로 원자적이다.
아래 DDL을 실 데이터 사본(sale 전표 1건 + 라인 2 + 원장 2 시드)에 적용해 **행수·내용·원장합계·sqlite_sequence·인덱스·FK 무결성 완전 보존**과
**신규 doc_type 삽입 성공 / 잘못된 doc_type 거부 / autoincrement 연속**을 모두 확인했다.

> `stock_ledger.io_type` CHECK는 이미 `기타입고/기타출고`를 포함하므로 **원장 테이블은 변경하지 않는다**(기타이동 4종 모두 이 두 유형으로 처리).

### 1.2 DDL 전문

```sql
-- Phase 1.5: 전표 체인(견적/주문/발주) + 기타이동 4종 (마이그레이션 004)
-- 규칙(003과 동일): 금액 INTEGER(원), 수량 REAL(kg). 재고의 유일한 진실 = stock_ledger.
-- doc 헤더에 진행상태/전표체인/납기일자/받는창고 컬럼을 더하고 doc_type CHECK 목록을 확장한다.
-- SQLite는 CHECK 제약을 ALTER로 못 바꾸므로 doc 테이블을 재빌드한다. 재빌드 시 자식(doc_line/stock_ledger)이
-- ON DELETE CASCADE로 지워지지 않도록 FK 없는 임시표로 백업했다가 되돌린다(러너가 트랜잭션 안에서 실행 → 원자적).

-- ── ① doc에 신규 컬럼 추가 ──────────────────────────────────
ALTER TABLE doc ADD COLUMN status TEXT NOT NULL DEFAULT '완료';       -- 진행상태: 견적/주문/발주='대기'|'완료', 그 외='완료'
ALTER TABLE doc ADD COLUMN source_doc_id INTEGER;                     -- 끌어오기 원본 전표 id(견적→주문→판매, 발주→구매)
ALTER TABLE doc ADD COLUMN time_date TEXT;                            -- 납기일자(주문서/발주서) 'YYYY-MM-DD'. 없으면 NULL
ALTER TABLE doc ADD COLUMN wh_to_id INTEGER REFERENCES warehouse(id); -- 창고이동 받는창고(그 외 NULL)

-- ── ② 자식 테이블 백업(FK 없는 임시표) ─────────────────────
CREATE TABLE _mig_doc_line AS SELECT * FROM doc_line;
CREATE TABLE _mig_ledger   AS SELECT * FROM stock_ledger;

-- 자식을 비워 doc DROP 시 CASCADE가 지울 게 없도록 함(백업은 위 임시표에 보존됨)
DELETE FROM stock_ledger;
DELETE FROM doc_line;

-- ── ③ doc 재빌드(doc_type CHECK 확장 + 신규 컬럼 포함) ──────
CREATE TABLE doc_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  doc_type TEXT NOT NULL
    CHECK (doc_type IN ('sale','purchase','roast',
                        'quote','order','purchase_order',
                        'move','self_use','defect','adjust')),
  io_date TEXT NOT NULL,
  partner_id INTEGER REFERENCES partner(id),
  warehouse_id INTEGER NOT NULL REFERENCES warehouse(id),
  tax_mode TEXT NOT NULL DEFAULT '과세' CHECK (tax_mode IN ('과세','면세')),
  project_id INTEGER REFERENCES project(id),
  memo TEXT NOT NULL DEFAULT '',
  total_qty REAL NOT NULL DEFAULT 0,
  total_supply INTEGER NOT NULL DEFAULT 0,
  total_vat INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  yield_pct REAL,
  status TEXT NOT NULL DEFAULT '완료',
  source_doc_id INTEGER REFERENCES doc(id) ON DELETE SET NULL,  -- 원본 삭제 시 연결만 끊고 자식 전표는 유지
  time_date TEXT,
  wh_to_id INTEGER REFERENCES warehouse(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (doc_type, doc_no)
);

INSERT INTO doc_new
  (id, doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode, project_id, memo,
   total_qty, total_supply, total_vat, total_amount, yield_pct,
   status, source_doc_id, time_date, wh_to_id, created_at, updated_at)
SELECT
   id, doc_no, doc_type, io_date, partner_id, warehouse_id, tax_mode, project_id, memo,
   total_qty, total_supply, total_vat, total_amount, yield_pct,
   status, source_doc_id, time_date, wh_to_id, created_at, updated_at
FROM doc;

DROP TABLE doc;
ALTER TABLE doc_new RENAME TO doc;

-- ── ④ 자식 복원 후 임시표 제거 ─────────────────────────────
INSERT INTO doc_line     SELECT * FROM _mig_doc_line;
INSERT INTO stock_ledger SELECT * FROM _mig_ledger;
DROP TABLE _mig_doc_line;
DROP TABLE _mig_ledger;

-- ── ⑤ 인덱스 재생성(옛 doc과 함께 사라진 것 + 신규) ─────────
CREATE INDEX idx_doc_type_date ON doc (doc_type, io_date);
CREATE INDEX idx_doc_partner   ON doc (partner_id);
CREATE INDEX idx_doc_status    ON doc (doc_type, status);
CREATE INDEX idx_doc_source    ON doc (source_doc_id);
```

### 1.3 설계 결정
1. **doc 엔진 재사용**: 견적/주문/발주/기타이동 모두 `doc`+`doc_line` 구조를 그대로 쓴다. 새 테이블을 만들지 않는다.
   차이는 (a) 원장 발생 여부, (b) 거래처 필수 여부, (c) 금액 계산 여부뿐이며 전부 2장 규칙 표로 분기한다.
2. **컬럼 4개만 추가**: `status`(진행상태), `source_doc_id`(전표체인), `time_date`(납기), `wh_to_id`(창고이동 받는창고).
   기존 sale/purchase/roast 행은 `status='완료'`(기본값)로 채워져 재무·재고 집계에 영향 없음.
3. **원장 미발생 타입은 재무에도 영향 없음**: `/api/receivables`·`/api/payables`는 `doc_type IN ('sale')`/`('purchase')`만 집계하므로
   quote/order/purchase_order는 미수·미지급에 잡히지 않는다. `/api/stock/*`는 `stock_ledger`만 집계하므로 원장 없는 전표는 재고에 잡히지 않는다.
4. **`source_doc_id`는 `ON DELETE SET NULL`**: 견적을 주문으로 전환(완료) 후 원본 견적을 지워도 주문은 남고 연결만 끊긴다(삭제 차단 방지).
5. **채번은 doc_seq 공용**: `seq_key`에 doc_type 문자열을 그대로 사용(`quote`/`order`/`purchase_order`/`move`/`self_use`/`defect`/`adjust`). 삭제해도 번호 재사용 없음.

### 1.4 doc_type ↔ 메뉴 id 매핑 (혼동 방지)
API `doc_type`은 아래 값을 **글자 그대로** 쓴다. 클라 `menus.tsx`의 메뉴 id와 다를 수 있으니 주의.

| 화면 | menus.tsx id | API doc_type | seq_key |
|---|---|---|---|
| 견적서 | `quote` | `quote` | `quote` |
| 주문서 | `order` | `order` | `order` |
| 발주서 | `po` | `purchase_order` | `purchase_order` |
| 창고이동 | `move` | `move` | `move` |
| 자가사용 | `self-use` | `self_use` | `self_use` |
| 불량처리 | `defect` | `defect` | `defect` |
| 재고조정 | `adjust` | `adjust` | `adjust` |

---

## 2. doc_type별 규칙 표 (Phase 1.5 최상위 계약)

모든 전표 처리는 이 표를 따른다. "원장" = `stock_ledger` 행 생성 여부, "거래처" = `partner_id` 필수 여부,
"금액계산" = `calcAmounts`로 공급가액/부가세 산출 여부(N이면 `total_*`·`price`·`supply`·`vat` 전부 0), "채번 seq_key" = `nextSeqNo` 두 번째 인자.

| doc_type | 화면 | 원장 발생 (io_type / 부호) | 거래처 | 금액계산 | 채번 seq_key | tax_mode | 라인 role | 헤더 특이 컬럼 |
|---|---|---|---|---|---|---|---|---|
| `sale` | 판매입력 | ✅ 판매 `-` | 필수 | ✅ | `sale` | 과세/면세 | normal | — |
| `purchase` | 구매입력 | ✅ 구매 `+` | 필수 | ✅ | `purchase` | 과세/면세 | normal | — |
| `roast` | 로스팅입력 | ✅ 투입 생산소모 `-` / 산출 생산입고 `+` | ✖ NULL | ✖ (0) | `roast` | 면세 | input/output | yield_pct |
| `quote` | 견적서 | **❌ 없음** | 필수 | ✅ | `quote` | 과세/면세 | normal | status |
| `order` | 주문서 | **❌ 없음** | 필수 | ✅ | `order` | 과세/면세 | normal | status, time_date |
| `purchase_order` | 발주서 | **❌ 없음** | 필수 | ✅ | `purchase_order` | 과세/면세 | normal | status, time_date |
| `move` | 창고이동 | ✅ **2행/라인**: 보내는창고 기타출고 `-` + 받는창고 기타입고 `+` | ✖ NULL | ✖ (0) | `move` | 면세 | normal | wh_to_id |
| `self_use` | 자가사용 | ✅ 기타출고 `-` | ✖ NULL | ✖ (0) | `self_use` | 면세 | normal | memo=사유 |
| `defect` | 불량처리 | ✅ 기타출고 `-` (처리방법=폐기) | ✖ NULL | ✖ (0) | `defect` | 면세 | normal | memo=처리방법 |
| `adjust` | 재고조정 | ✅ 차이만큼: 차이>0 기타입고 `+` / 차이<0 기타출고 `-` (차이=0이면 미발생) | ✖ NULL | ✖ (0) | `adjust` | 면세 | normal | — |

**진행상태(`status`) 규칙**
- 신규 저장 시 기본값: `quote`/`order`/`purchase_order` = **`대기`**, 그 외 전부 = **`완료`**.
- **끌어오기 전환**: 하위 전표를 `source_doc_id`를 담아 저장하면, 같은 트랜잭션에서 원본(source) 전표 `status`를 **`완료`**로 갱신.
- **역전환(원복)**: `source_doc_id`를 가진 전표를 삭제하면, 같은 트랜잭션에서 원본 `status`를 **`대기`**로 되돌린다(원본이 아직 존재할 때).
- 수동 변경: `PUT /api/docs/:id/status`로 `대기`↔`완료` 직접 전환(현황 화면의 [완료처리] 버튼).

**끌어오기 대상 관계(target → source)**

| 저장하는 전표(target) | 끌어올 원본(source) | source 완료 처리 |
|---|---|---|
| `order` (주문) | `quote` (견적, status=대기) | 견적 → 완료 |
| `sale` (판매) | `order` (주문, status=대기) | 주문 → 완료 |
| `purchase` (구매) | `purchase_order` (발주, status=대기) | 발주 → 완료 |

> 부분 출고(잔량 추적)는 Phase 1.5 범위 밖 — 끌어오면 원본은 수량과 무관하게 `완료` 처리(이카운트의 진행상태 관리만 카피, 미판매 잔량 관리는 제외).

---

## 3. API 계약

모든 경로는 `/api` 프리픽스. 목록은 페이지 없이 전체 반환. 실패 시 `{ "error": "한국어" }` + status.

### 3.1 견적/주문/발주 — `/api/docs` 확장 (`server/vouchers.mjs` 수정)

Phase 1의 `/api/docs`가 `sale`/`purchase`만 받던 것을 **`quote`/`order`/`purchase_order`까지 확장**한다.
헤더에 `status`·`time_date`·`source_doc_id`를 추가로 다룬다. **원장은 2장 규칙 표에 따라 이 3종에는 만들지 않는다.**

#### `GET /api/docs?type=&from=&to=&partner_id=&status=` — 목록 (조회 화면)
- `type` 허용값 확장: `sale|purchase|roast|quote|order|purchase_order`.
- `status` 옵션 필터(`대기|완료`).
- 응답 행에 **`status`·`time_date` 추가**(나머지는 Phase 1과 동일).
```jsonc
[
  { "id": 201, "doc_no": "20260711-1", "doc_type": "order", "io_date": "2026-07-11",
    "partner_id": 12, "partner_name": "카페그래비티", "warehouse_id": 1, "warehouse_name": "본사창고",
    "item_summary": "[에티오피아] 예가체프 외 1건", "line_count": 2,
    "total_qty": 15, "total_supply": 195000, "total_vat": 19500, "total_amount": 214500,
    "status": "대기", "time_date": "2026-07-20", "memo": "정기납품" }
]
```

#### `GET /api/docs/pullable?target=&partner_id=` — 끌어오기 후보 목록 (**`/:id`보다 먼저 등록**)
`target`(필수) = `sale|order|purchase`. 서버가 target→source 매핑(3.1 표)으로 `status='대기'` 원본을 찾아 반환.
`partner_id`(옵션) 지정 시 해당 거래처만, 없으면 전체.
```jsonc
// GET /api/docs/pullable?target=sale&partner_id=12
[
  { "id": 201, "doc_no": "20260711-1", "doc_type": "order", "io_date": "2026-07-11",
    "partner_id": 12, "partner_name": "카페그래비티", "item_summary": "[에티오피아] 예가체프 외 1건",
    "line_count": 2, "total_amount": 214500, "time_date": "2026-07-20" }
]
```
> 선택 후 라인 로딩은 기존 `GET /api/docs/:id`(아래 3.5 확장형)를 재사용한다. 별도 전환 엔드포인트는 없다.

#### `POST /api/docs` — 생성 (확장)
```jsonc
// 요청 (quote/order/purchase_order/sale/purchase 공용)
{
  "type": "order",                 // sale|purchase|quote|order|purchase_order
  "io_date": "2026-07-11",
  "partner_id": 12,
  "warehouse_id": 1,
  "tax_mode": "과세",
  "project_id": null,
  "memo": "정기납품",
  "time_date": "2026-07-20",        // order/purchase_order 납기(옵션). 그 외 무시
  "source_doc_id": null,            // 끌어오기 원본(옵션). 있으면 원본 status='완료'
  "lines": [
    { "item_id": 34, "qty": 10, "price": 12000, "remarks": "" },
    { "item_id": 35, "qty": 5,  "price": 15000, "remarks": "" }
  ]
}
// 응답 201 = GET /api/docs/:id 형태 + "warnings"
// - quote/order/purchase_order: 원장 미발생 → warnings 항상 []  (음수재고 판정 안 함)
// - sale/purchase: Phase 1과 동일(원장 생성 + 음수재고 warnings)
```
서버 처리(공통): `validateLines` → `calcAmounts`로 금액 재계산 → `nextSeqNo(io_date, type)` 채번 → doc insert.
`status`는 규칙 표대로 서버가 결정(클라가 보낸 status 무시). **원장 생성은 `type∈{sale,purchase}`일 때만.**
`source_doc_id`가 유효하면 같은 트랜잭션에서 원본 doc의 `status='완료'` UPDATE.

검증 추가(전부 한국어 400):
| 조건 | 메시지 |
|---|---|
| `type`이 허용값 아님 | `전표 유형이 올바르지 않습니다.` |
| quote/order/po에서 `partner_id` 없음 | `거래처를 선택하세요.` |
| `source_doc_id`가 target에 맞는 대기 원본이 아님 | `끌어올 원본 전표를 찾을 수 없습니다.` |

#### `PUT /api/docs/:id` — 수정 (확장)
Phase 1과 동일(라인·원장 전량 재작성, 번호 불변). 추가로 `time_date`를 갱신하고 `status`·`source_doc_id`는 **유지**(체인은 수정으로 바꾸지 않음).
quote/order/po는 원장을 재작성하지 않는다(애초에 없음).

#### `DELETE /api/docs/:id` — 삭제 (확장)
Phase 1과 동일(CASCADE, 번호 재사용 금지). 추가로 **삭제 대상이 `source_doc_id`를 가지면 원본 status를 `대기`로 원복**(같은 트랜잭션).

#### `PUT /api/docs/:id/status` — 진행상태 수동 변경 (신규)
```jsonc
// 요청
{ "status": "완료" }        // 대기 | 완료
// 응답 200
{ "id": 201, "status": "완료" }
```
`doc_type∈{quote,order,purchase_order}`에서만 허용. 그 외 doc_type이면 400 `진행상태를 바꿀 수 없는 전표입니다.`

### 3.2 기타이동 4종 — `/api/moves` (`server/moves.mjs` 신규)

하나의 리소스로 4종을 처리한다. `type`(=doc_type) = `move|self_use|defect|adjust`. **거래처 없음, 금액 0, tax_mode='면세', status='완료'.**
채번 `nextSeqNo(io_date, type)`. 원장은 2장 규칙 표대로 생성. 라인 검증은 `validateLines` 재사용(품목+수량>0).

#### `GET /api/moves?type=&from=&to=&warehouse_id=` — 목록
```jsonc
// GET /api/moves?type=move&from=2026-07-01&to=2026-07-31
[
  { "id": 320, "doc_no": "20260711-1", "doc_type": "move", "io_date": "2026-07-11",
    "warehouse_id": 1, "warehouse_name": "본사창고",
    "wh_to_id": 2, "wh_to_name": "로스팅공장",
    "item_summary": "[에티오피아] 예가체프 외 1건", "line_count": 2,
    "total_qty": 15, "memo": "" }
]
```
`self_use`/`defect`/`adjust`는 `wh_to_id`/`wh_to_name`이 `null`.

#### `GET /api/moves/:id` — 1건 상세 (수정/삭제 로딩)
```jsonc
{
  "id": 320, "doc_no": "20260711-1", "doc_type": "move", "io_date": "2026-07-11",
  "warehouse_id": 1, "warehouse_name": "본사창고", "wh_to_id": 2, "wh_to_name": "로스팅공장",
  "memo": "", "method": null,
  "lines": [
    { "line_no": 1, "item_id": 34, "item_code": "00034", "item_name": "[에티오피아] 예가체프", "unit": "kg",
      "qty": 10, "book_qty": null, "remarks": "" }
  ]
}
```
- `adjust`의 라인은 `qty`=실사수량, `book_qty`=저장 시점 장부수량(참고 표시), `remarks`=`"장부 12.0 → 실사 10.0 (조정 -2.0)"`.
- `defect`의 `method`는 헤더에 `"폐기"`(현재 폐기만). `move`/`self_use`/`adjust`는 `method: null`.

#### `POST /api/moves` — 생성
```jsonc
// (A) 창고이동
{ "type": "move", "io_date": "2026-07-11", "warehouse_id": 1, "wh_to_id": 2, "memo": "",
  "lines": [ { "item_id": 34, "qty": 10, "remarks": "" } ] }

// (B) 자가사용
{ "type": "self_use", "io_date": "2026-07-11", "warehouse_id": 1, "memo": "매장 시음",
  "lines": [ { "item_id": 10, "qty": 0.5, "remarks": "" } ] }

// (C) 불량처리 (현재 처리방법=폐기만)
{ "type": "defect", "io_date": "2026-07-11", "warehouse_id": 1, "method": "폐기", "memo": "",
  "lines": [ { "item_id": 10, "qty": 0.3, "remarks": "곰팡이" } ] }

// (D) 재고조정 — 라인에 실사수량(real_qty)만 보냄. 장부수량·차이는 서버가 계산
{ "type": "adjust", "io_date": "2026-07-11", "warehouse_id": 1, "memo": "월말 실사",
  "lines": [ { "item_id": 10, "real_qty": 10 }, { "item_id": 34, "real_qty": 8.2 } ] }

// 응답 201 = GET /api/moves/:id 형태 + "warnings"(음수재고 경고, 이카운트처럼 저장은 커밋)
```
서버 처리(type별):
- **move**: 라인마다 원장 2행 — `(item, warehouse_id=보내는창고, '기타출고', -qty)` + `(item, wh_to_id=받는창고, '기타입고', +qty)`. 총재고 불변.
  - 검증: `wh_to_id` 없음 → 400 `받는 창고를 선택하세요.` / `warehouse_id == wh_to_id` → 400 `보내는 창고와 받는 창고가 같습니다.`
- **self_use**: 라인마다 원장 1행 `(item, warehouse_id, '기타출고', -qty)`.
- **defect**: 라인마다 원장 1행 `(item, warehouse_id, '기타출고', -qty)`. `method`는 `'폐기'`만 허용(그 외 → `'폐기'`로 저장).
- **adjust**: 라인마다 `book = round1(SUM(stock_ledger.qty) WHERE item_id AND warehouse_id AND io_date <= io_date)`,
  `diff = round1(real_qty - book)`. `diff≠0`이면 원장 1행 `(item, warehouse_id, diff>0?'기타입고':'기타출고', diff)`.
  `diff==0`이면 원장 미발생(그래도 doc_line은 실사 기록으로 저장). `doc_line.qty=real_qty`, `remarks="장부 {book} → 실사 {real} (조정 {diff})"`.
  → **장부수량은 서버가 저장 시점에 재계산**(클라가 보낸 값 신뢰 안 함) → 저장 후 해당 (품목,창고) 재고가 실사수량과 정확히 일치.

검증(공통, 한국어 400): body 파싱실패 `요청 본문이 올바르지 않습니다.` / `io_date` `일자를 입력하세요.` / `warehouse_id` `창고를 선택하세요.` /
유효 라인 0개 `품목 라인을 1개 이상 입력하세요.` / 품목 미선택 라인 `품목을 선택하지 않은 라인이 있습니다.` / `type` 오류 `이동 유형이 올바르지 않습니다.`

#### `PUT /api/moves/:id` — 수정 (원장 재작성, 번호 불변) → 생성 응답 형태
#### `DELETE /api/moves/:id` → `{ "ok": true }` (CASCADE, 번호 재사용 금지)

### 3.3 재고조정 — 재고불러오기 (신규 엔드포인트 없음 · 기존 재사용)
재고조정 화면의 **[재고불러오기]** 는 Phase 1의 `GET /api/stock/status?warehouse_id=&as_of=`를 그대로 호출한다.
응답의 `qty`(품목별 장부수량)를 그리드에 장부수량으로 채우고, 사용자가 실사수량을 입력한다. **서버 변경 없음.**

### 3.4 지불입력 / 미지급현황 (신규 엔드포인트 없음 · 기존 재사용)
Phase 1에서 이미 완성:
- 지불 저장/조회: `GET/POST /api/receipts` (+ `PUT/DELETE /api/receipts/:id`), **`kind='지불'`**, `method` 동일 5종.
- 미지급현황: `GET /api/payables?as_of=` → `{ partner_id, partner_code, partner_name, pay_cycle, purchase_total, payment_total, balance }[]`.

→ Phase 1.5는 **화면만 추가**(3.4의 서버 작업 없음). 아래 4.6 참조.

### 3.5 거래명세서/견적서 인쇄용 — `GET /api/docs/:id` 확장 (`server/vouchers.mjs` 수정)
인쇄 양식의 "공급받는자" 칸을 채우려면 거래처 상세가 필요하다. Phase 1의 `GET /api/docs/:id` 응답에 **공급받는자 필드**와
Phase 1.5 헤더 필드를 추가한다(기존 필드·`lines` 구조는 그대로 유지 — 하위호환).
```jsonc
// GET /api/docs/:id — 추가 필드(발췌)
{
  "id": 101, "doc_no": "20260711-1", "doc_type": "sale", "io_date": "2026-07-11",
  "partner_id": 12, "partner_name": "카페그래비티",
  "partner_biz_no": "7230800453", "partner_ceo": "홍길동",
  "partner_address": "충남 서산시 …", "partner_phone": "041-…",   // ← 신규(인쇄용)
  "warehouse_id": 1, "warehouse_name": "본사창고",
  "tax_mode": "과세", "project_id": null, "memo": "정기납품",
  "status": "완료", "time_date": null, "source_doc_id": 201,       // ← 신규
  "total_qty": 15, "total_supply": 195000, "total_vat": 19500, "total_amount": 214500,
  "lines": [ /* Phase 1과 동일: item_code, item_name, spec, unit, qty, price, supply_amt, vat_amt, remarks */ ]
}
```
회사(공급자) 정보는 클라가 `GET /api/settings`(company_name/ceo/biz_no/address/phone)로 별도 로딩한다(서버 변경 없음).
> `lines[]`에 규격 표시가 필요하므로 detail의 라인 SELECT에 `i.spec AS spec`을 추가한다(품목 표의 "규격" 칸).

### 3.6 판매내역 이관 스크립트 — `scripts/import-sales-excel.mjs` (신규, 서버 소넷)
이카운트 판매현황 엑셀을 `doc(sale)`+`doc_line`+`stock_ledger`로 대량 생성한다. 기존 `import-ecount-excel.mjs`의
`readSheet`/`asStr`/`migrate()` 패턴을 그대로 따른다.

**CLI 사양**
```
node scripts/import-sales-excel.mjs [--dry-run]
  입력: data/import/38OH8XNWOY2SI14.xlsx  (이카운트 [판매현황] 엑셀 다운로드)
  --dry-run : DB에 아무것도 쓰지 않고 매핑표·통계·품목매칭 실패 목록만 출력
  (옵션 없음)= 실제 실행. 실행 전 매핑표·건수를 먼저 출력한 뒤 트랜잭션으로 생성
```
- **엑셀 구조**: 1행 제목 `"판매현황"`. 컬럼 헤더(2행 부근)에서 `일자-No.`(예: `"2024/01/02-1"`) / `품목명(규격)` / `수량` / `단가` /
  `공급가액` / `부가세` / `합계` / `거래처명` 위치를 헤더 텍스트로 탐지(`import-ecount-excel.mjs`의 `findIndex` 방식). 마지막 타임스탬프 행은 제외.
- **전표 그룹핑**: `일자-No.` 문자열을 파싱 → `io_date`(`2024/01/02`→`2024-01-02`), `doc_no`(=`"20240102-1"`, 하이픈 제거형 + `-N`).
  **같은 `일자-No.`의 여러 품목 행 = 한 전표의 여러 라인**으로 묶는다(doc_no 기준 group).
- **전표번호 보존**: 원본 `일자-No.`를 그대로 `doc_no`로 저장(`YYYYMMDD-N`). 채번(`nextSeqNo`)은 이관에 쓰지 않는다.
- **doc_seq 카운터 정렬**: 이관 후 **각 일자별 최대 N**으로 `doc_seq(io_date, 'sale', last_no)`를 upsert(`MAX(last_no, N)`) → 이후 수기 판매입력이 이관 번호 다음부터 채번되게 함.
- **품목 매칭**: `품목명(규격)` 텍스트를 정규화(앞뒤 공백 제거, 끝의 `"(kg)"`/`"(규격)"` 괄호 제거, 내부 공백 1칸 축약) 후 `item.name`과 매칭.
  1차 정확일치 → 실패 시 공백 무시 일치 시도. 최종 실패 라인은 **매칭 실패 목록**에 모아 보고(코드/이름/거래처)하고 그 라인은 건너뛴다.
- **tax_mode**: 라인 `부가세 > 0`이면 `과세`, `== 0`이면 `면세`(전표 단위로 라인들의 다수결 대신, 전표 내 라인별 계산은 `calcAmounts`로 재계산).
  금액(공급가액/부가세)은 엑셀 값을 신뢰하지 않고 `calcAmounts(qty, price, tax_mode, vat_round)`로 **서버 규칙 재계산**(Phase 1 불변식 유지).
- **원장**: 라인마다 `stock_ledger (io_type='판매', qty=-qty, warehouse_id=기본 판매창고)`. 기본 창고 = `wh_type='창고'` 첫 번째(`본사창고`).
- **거래처 병합 매핑(내장)**: 엑셀 `거래처명` → 대상 거래처. 아래 표대로 병합/신규. 병합 대상은 **기존 partner를 이름으로 조회**해 그 id 사용.
  정확히 일치하는 기존 거래처가 있으면 그대로 사용. 매핑에도 없고 기존에도 없으면 **매칭 실패**로 보고(생성하지 않음, 안전).

  | 엑셀 거래처명 | 처리 | 대상(기존 DB) |
  |---|---|---|
  | 카페엘리스 | 병합 | `카페앨리스` (code 3022001053) |
  | 카페앨리스 | 그대로 | `카페앨리스` |
  | 전미용 | 병합 | `전미옥님 빨래방` (code 00010) |
  | 어울림센터 | 병합 | `어울림센터(둔포)` (code 1858702732) |
  | 카페 권곡 | **신규 생성** | code `IMP-0001`, 이름 `카페 권곡` |
  | 아산시 먹거리재단 | **신규 생성** | code `IMP-0002`, 이름 `아산시 먹거리재단` |
  | 청담 르엘 스카이 라운지 | **신규 생성** | code `IMP-0003`, 이름 `청담 르엘 스카이 라운지` |
  | (그 외) | 이름 정확일치 | 기존 partner 그대로 |

  - 신규 거래처는 `partner(code, name, partner_type='매출', pay_cycle='당일', active=1)`. code는 이름별 결정적 `IMP-000N`(재실행 시 이름으로 먼저 조회하므로 중복 생성 없음).
- **재실행 안전(idempotent)**: 각 전표 생성 전 `SELECT 1 FROM doc WHERE doc_type='sale' AND doc_no=?` → 이미 있으면 **그 전표(라인·원장 포함) 통째로 건너뜀**.
- **실행 전 출력**: 거래처 매핑표, 전표 건수/라인 건수, 품목 매칭 성공/실패 수, 기간(min~max 일자), 총 공급가액 합계. `--dry-run`은 여기까지만.
- **트랜잭션**: 실제 실행은 `db.transaction(() => { …전표 루프… })()` 한 번으로 원자적. 대량이면 500건 단위 배치 커밋도 허용(재실행 안전하므로 중단돼도 재개 가능).

---

## 4. 화면별 스펙 (클라이언트)

공통: 기존 `screen`/`screen-bar`/`screen-grid` 레이아웃, `DataGrid`, `CodeHelp`, `Modal`/`Confirm`, `useToast`,
`api`, `fmtWon`/`fmtQty`/`todayISO`/`monthStartISO` 재사용. 기간 기본값 = 이번달 1일~오늘.

### 4.0 VoucherForm 확장 (`client/src/components/VoucherForm.tsx` 수정)
견적/주문/발주가 재사용할 수 있게 소폭 확장(기존 props·동작 유지):
```ts
headerExtra?: ReactNode;   // vh-fields 안(적요 앞)에 렌더되는 추가 헤더 필드 슬롯 (주문/발주의 '납기일자' 등)
```
- `headerExtra`는 `<div className="vh-fields">` 내부, 거래유형(select) 다음·적요(grow) 앞에 렌더. 없으면 아무것도 안 그림.
- 기존 `headerActions`/`priceResolver`/`warehouseLabel`/`saveLabel`/`footerActions`는 그대로.

### 4.1 견적서·주문서·발주서 입력 — `client/src/screens/DocChainScreen.tsx` (신규)
exports: `QuoteInput`, `OrderInput`, `PurchaseOrderInput`. 내부 `DocChainScreen({ kind, mode='create', docId?, onSaved?, onDeleted?, onCancel? })`
하나로 신규·수정 겸용. `kind` = `quote|order|purchase_order`.

- **구조**: 판매입력(`VoucherScreen`)과 동일한 `VoucherForm` 기반. 헤더(일자/거래처/창고/거래유형/적요) + 라인 그리드 + [저장(연속입력)].
- **거래처 단가 자동적용**: 판매입력과 동일(`GET /api/price-special?partner_id=` → `priceResolver`). 발주(purchase_order)는 특별단가 대신 품목 입고단가/출고단가 사용(판매와 동일 로직 재사용해도 무방).
- **납기일자(order/purchase_order만)**: `headerExtra`로 `<label>납기일자<input type="date" …/></label>` 렌더. 저장 시 `time_date`로 전송. 견적(quote)은 없음.
- **끌어오기 버튼**:
  - `order` 화면: `headerActions`에 **[견적 불러오기]** → `PullSourceModal(target='order')`.
  - `quote` 화면: 끌어오기 없음.
  - `purchase_order` 화면: 끌어오기 없음(발주가 체인의 시작).
  - 선택 시 원본 헤더(거래처/창고/거래유형)+라인을 폼에 로드하고 `sourceDocId` state에 원본 id 저장.
- **저장**: `POST /api/docs`(신규) / `PUT /api/docs/:id`(수정). body에 `type=kind`, `time_date`, `source_doc_id`(있으면) 포함.
  성공 토스트 `저장되었습니다. (전표 {doc_no})`. 신규는 **라인만 초기화, 헤더 유지**(연속입력). `sourceDocId`는 저장 후 리셋.
- **수정 모드**: `GET /api/docs/:id` 로딩 → 하단 [저장] [삭제] [목록으로]. 삭제는 `Confirm` → `DELETE /api/docs/:id`.

### 4.2 견적조회·주문조회·발주조회 — `client/src/screens/DocChainList.tsx` (신규)
exports: `QuoteList`, `OrderList`, `PurchaseOrderList`. 내부 `DocChainListScreen({ kind })`.
`VoucherList`와 동일 패턴(검색조건 바 + `DataGrid` + 행 더블클릭 → `DocChainScreen(mode='edit')` 교체).

- 검색조건: 기간 `from~to`(이번달) + 거래처(코드도움, 옵션) + **진행상태 select(전체/대기/완료)** + [검색] + [엑셀].
- 그리드 컬럼: 일자 / 전표번호 / 거래처 / 품목요약 / (order·po만 **납기일자** `time_date`) / 수량(우) / 공급가액(우) / 부가세(우) / 합계(우) /
  **진행상태 `status`**(대기=강조) / 적요 / **[완료처리]**(status=대기 행에만, `<span class="link">완료처리</span>` cellClick → `PUT /api/docs/:id/status {status:'완료'}` → 재조회).
- 호출: `GET /api/docs?type={kind}&from&to&partner_id&status`. 하단 합계 `bottomCalc:'sum'`.

### 4.3 끌어오기 팝업 — `client/src/components/PullSourceModal.tsx` (신규)
```ts
interface Props {
  target: 'sale' | 'order' | 'purchase';   // 저장하려는 전표 종류
  partnerId?: number | null;                // 있으면 그 거래처만, 없으면 전체
  onPick: (docId: number) => void;          // 선택된 원본 doc id
  onClose: () => void;
}
```
- 열릴 때 `GET /api/docs/pullable?target=&partner_id=` 로 후보 목록 로딩(`status='대기'` 원본).
- `Modal`(width 720) 안에 `mini-table`: 일자 / 전표번호 / 거래처 / 품목요약 / (있으면 납기 `time_date`) / 합계. 행 클릭 → `onPick(row.id)` 후 닫힘.
- 상단에 검색 input 없이 목록만(1인·소량 전제). 빈 목록이면 `대기 중인 {대상}이 없습니다.` 안내 행.
- **호출부 동작(중요)**: `onPick(docId)` → 호출 화면이 `GET /api/docs/:id`로 헤더·라인을 로드해 폼을 채우고 `sourceDocId=docId` 저장.
  거래처가 폼에 이미 있으면 유지, 없으면 원본 거래처로 세팅. 저장 시 `source_doc_id`로 전송 → 서버가 원본을 완료 처리.

### 4.4 판매입력/구매입력에 끌어오기 추가 (`client/src/screens/VoucherScreen.tsx` 수정)
기존 판매/구매입력에 원본 끌어오기 버튼을 붙인다(파일은 클라 담당).
- **판매입력(sale)**: `headerActions`에 기존 [지난 주문 복사] 옆에 **[주문서 불러오기]** 추가 → `PullSourceModal(target='sale', partnerId=header.partner_id)`.
- **구매입력(purchase)**: `headerActions`에 **[발주서 불러오기]** 추가 → `PullSourceModal(target='purchase', partnerId=header.partner_id)`.
- 선택 시 라인 로드 + `sourceDocId` 저장. 저장 body에 `source_doc_id` 포함(있을 때만). 저장 성공(연속입력 초기화) 시 `sourceDocId` 리셋.
- **[인쇄] 버튼**(수정 모드): 4.7 참조.

### 4.5 기타이동 4종 화면 — `client/src/screens/MoveScreens.tsx` (신규)
exports: `StockMove`(창고이동) / `SelfUse`(자가사용) / `Defect`(불량처리) / `StockAdjust`(재고조정).
공통: `VoucherForm`이 아닌 **자체 간이 라인 테이블**(RoastInput의 `voucher-*`/`voucher-lines` 클래스 재사용). 상단 헤더 + 라인 그리드 + [저장] + 하단 최근 이력 `DataGrid`(더블클릭→수정).

#### 4.5.1 창고이동 (`StockMove`)
- 헤더: 일자 / **보내는창고**(코드도움) / **받는창고**(코드도움) / 적요.
- 라인 그리드: No / 품목코드(코드도움) / 품목명 / 단위 / 수량(kg) / 삭제 + [+ 라인 추가].
- 저장: `POST /api/moves { type:'move', warehouse_id:보내는, wh_to_id:받는, lines:[{item_id,qty}] }`. 연속입력(라인 초기화, 창고 유지).
- 이력: `GET /api/moves?type=move&from&to`. 컬럼: 일자/전표번호/보내는창고(warehouse_name)/받는창고(wh_to_name)/품목요약/수량/적요.

#### 4.5.2 자가사용 (`SelfUse`)
- 헤더: 일자 / 창고(코드도움) / **사유**(=적요, text). 라인 그리드 동일(품목/수량).
- 저장: `POST /api/moves { type:'self_use', warehouse_id, memo:사유, lines }`.
- 이력: `GET /api/moves?type=self_use`. 컬럼: 일자/전표번호/창고/품목요약/수량/사유.

#### 4.5.3 불량처리 (`Defect`)
- 헤더: 일자 / 창고 / **처리방법 select**(현재 `폐기`만, disabled 상태로 고정 노출) / 적요. 라인 동일.
- 저장: `POST /api/moves { type:'defect', warehouse_id, method:'폐기', memo, lines }`.
- 이력: `GET /api/moves?type=defect`. 컬럼: 일자/전표번호/창고/처리방법/품목요약/수량/적요.

#### 4.5.4 재고조정 (`StockAdjust`) — 2단계(실사→조정)
- 헤더: 실사일자(기본 오늘) / 창고(코드도움) / [재고불러오기] / 적요.
- **[재고불러오기]**: `GET /api/stock/status?warehouse_id={창고}&as_of={실사일자}` → 응답 품목들을 라인으로 채움.
  라인 그리드 컬럼: 품목코드 / 품목명 / 단위 / **장부수량**(qty, 읽기전용) / **실사수량**(입력) / **조정수량**(= 실사−장부, 실시간 자동계산·읽기전용, 부호색).
  (품목 수가 많으면 장부수량≠0 품목만 보이도록 필터 토글 제공 권장.)
- 저장: `POST /api/moves { type:'adjust', warehouse_id, memo, lines:[{item_id, real_qty}] }`.
  실사수량을 입력한 라인만 전송. **조정수량(차이)은 서버가 재계산**(클라 계산은 표시용). 저장 성공 후 재고불러오기 재실행 권장.
- 이력: `GET /api/moves?type=adjust`. 컬럼: 일자/전표번호/창고/품목요약/조정건수/적요. 더블클릭 → 상세(라인의 remarks에 "장부→실사(조정)" 표시).

> 4종 모두 저장 응답 `warnings`(음수재고)를 error 토스트로 표시. 창고이동은 총재고 불변이라 통상 경고 없음.

### 4.6 지불입력·미지급현황 — `client/src/screens/PaymentScreen.tsx` (신규)
`ReceiptScreen.tsx`(수금/미수금)와 **동일 패턴, 매입 기준**. 공용화 대신 별도 파일로 두어 겹침 0 유지.
- exports: `PaymentScreen`(지불입력) / `PayableScreen`(미지급현황).
- 내부 `PayablesGrid`(자체): `GET /api/payables?as_of=` → 컬럼 거래처코드 / 거래처명 / 입금주기(월별 강조) / **매입합계**(purchase_total) / **지불합계**(payment_total) / **미지급잔액**(balance, 양수 강조) / (지불 화면만) **[지불]** 버튼.
- **PaymentScreen**: 상단 [기준일자][새로고침] + `PayablesGrid onPay=…`. [지불] 클릭 → `Modal`(일자/거래처 고정/지불구분 select 5종/금액(기본=미지급잔액)/적요) → `POST /api/receipts { kind:'지불', … }` → 재조회.
- **PayableScreen**: 조회 전용(지불 버튼 없음) + [엑셀] + 하단 합계행.
- 타입: `Payable`(= `Receivable`에서 `sales_total/receipt_total` → `purchase_total/payment_total`).

### 4.7 거래명세서 / 견적서 인쇄 — `client/src/components/PrintDoc.tsx` (신규) + `styles.css`(클라)
브라우저 인쇄(@media print) 방식. jsPDF 등 미사용(02 문서 "(5) 인쇄" 근거).

- **진입점**: 판매조회/판매수정 화면(`VoucherScreen` 수정 모드)의 `footerActions`에 **[인쇄]** 버튼. 견적입력/조회에도 동일 [인쇄](양식만 "견적서").
- **PrintDoc props**:
  ```ts
  interface PrintDocProps {
    variant: '거래명세서' | '견적서';
    company: { name: string; ceo: string; biz_no: string; address: string; phone: string }; // GET /api/settings
    doc: Doc;   // GET /api/docs/:id 확장형(partner_* 포함, lines[].spec 포함)
  }
  ```
  - 클릭 시 `GET /api/settings` + `GET /api/docs/:id`(확장형)를 로드 → `PrintDoc` 렌더 → `window.print()`.
- **레이아웃(A4 세로, 자체 디자인)**:
  1. 상단 중앙 제목: **거래명세서**(또는 **견적서**). 우측 상단 작게 `일자 {io_date} / 전표번호 {doc_no}`(견적서는 "견적일자").
  2. **공급자 | 공급받는자 2단 박스**(각 박스: 등록번호(사업자번호) / 상호 / 대표자 / 주소 / 전화). 공급자=회사정보(settings), 공급받는자=거래처(doc.partner_*).
  3. **품목 표**: 컬럼 `No / 품명(item_name) / 규격(spec) / 수량(qty, fmtQty) / 단가(price, fmtWon) / 공급가액(supply_amt, fmtWon) / 부가세(vat_amt, fmtWon)`. 라인 반복.
  4. **합계행**: 공급가액계(total_supply) / 부가세계(total_vat) / **총액(total_amount)**. (선택) 총액 한글표기 병기.
  5. 하단: 비고(memo) + **인수자 서명란**(거래명세서만, 빈 밑줄 `인수자 (서명)`). 견적서는 서명란 대신 "유효기간/결제조건" 문구(옵션, 비워도 됨).
- **CSS(styles.css에 추가)**:
  ```css
  @media screen { .print-only { display: none; } }
  @media print {
    body * { visibility: hidden; }
    .print-only, .print-only * { visibility: visible; }
    .print-only { position: absolute; inset: 0; padding: 12mm; }
    @page { size: A4 portrait; margin: 12mm; }
    .print-sheet { font-size: 12px; color: #000; }
    .print-parties { display: flex; gap: 8px; }
    .print-party { flex: 1; border: 1px solid #000; padding: 6px 8px; }
    .print-items { width: 100%; border-collapse: collapse; }
    .print-items th, .print-items td { border: 1px solid #000; padding: 4px 6px; }
    .print-items td.num { text-align: right; }
    .print-items tr, .print-party { page-break-inside: avoid; }
    .print-sign { margin-top: 24px; text-align: right; }
  }
  ```
  `PrintDoc`는 `<div className="print-only"><div className="print-sheet">…</div></div>`를 렌더. 화면에는 숨김, 인쇄 시에만 표시.

### 4.8 타입 추가 — `client/src/types.ts` (클라 수정)
`Doc`에 `partner_biz_no?/partner_ceo?/partner_address?/partner_phone?/status?/time_date?/source_doc_id?`, `DocLine`에 `spec?`,
`DocListRow`에 `status?/time_date?` 추가. 신규 인터페이스: `MoveDetail`, `MoveListRow`, `MoveLine`(book_qty?/real_qty?/remarks), `Payable`, `PullRow`.

### 4.9 menus.tsx 연결 (`client/src/menus.tsx` 수정 — 클라 전용)
아래 항목의 `m(...)` 4번째 인자에 컴포넌트를 넣는다(phase는 그대로 1). 상단 import 추가:
```tsx
import { QuoteInput, OrderInput, PurchaseOrderInput } from './screens/DocChainScreen';
import { QuoteList, OrderList, PurchaseOrderList } from './screens/DocChainList';   // 조회는 리스트에서 입력화면 교체
import { StockMove, SelfUse, Defect, StockAdjust } from './screens/MoveScreens';
import { PaymentScreen, PayableScreen } from './screens/PaymentScreen';
```
| id | 현재 name | component |
|---|---|---|
| `quote` | 견적서입력/조회 | `QuoteList` (조회 진입 → 더블클릭/신규 버튼으로 `QuoteInput` 교체) |
| `order` | 주문서입력/조회 | `OrderList` |
| `po` | 발주서입력/조회 | `PurchaseOrderList` |
| `payment` | 지불입력 | `PaymentScreen` |
| `payable` | 미지급금현황 | `PayableScreen` |
| `move` | 창고이동 | `StockMove` |
| `self-use` | 자가사용 | `SelfUse` |
| `defect` | 불량처리 | `Defect` |
| `adjust` | 재고조정 | `StockAdjust` |

> `implemented`는 component 유무로 자동 판정 → 위 항목 자동 true(Phase 태그 사라짐).
> 견적/주문/발주는 "입력/조회"를 한 화면(리스트 진입 + 신규버튼/더블클릭으로 입력폼 교체, `VoucherList`와 동일 UX)으로 통합한다.
> 리스트 상단 `screen-bar`에 **[신규]** 버튼을 두어 빈 `DocChainScreen(mode='create')`로 교체.

---

## 5. 구현 분담 명세 (파일 겹침 0)

경계 규칙: **`server/**`·`scripts/**` = 서버 소넷**, **`client/src/**`(menus.tsx·styles.css 포함) = 클라 소넷**.
서버·클라가 공유하는 유일한 계약은 **3장 API JSON**. 필드명을 글자 그대로 맞춘다.

### [서버 소넷] — `server/`·`scripts/` 만
| 파일 | 작업 | 내용 |
|---|---|---|
| `server/migrations/004_doc_chain_moves.sql` | 신규 | 1.2 DDL 그대로 |
| `server/ledger.mjs` | **수정** | doc_type 규칙 헬퍼 추가: `DOC_EMITS_LEDGER`(집합), 기타이동 원장 빌더, adjust 장부수량 계산 `bookQty(itemId, whId, asOf)`. 기존 export 유지 |
| `server/vouchers.mjs` | **수정** | `/api/docs`에 quote/order/purchase_order 확장(원장 미발생 분기·status·time_date·source_doc_id), `GET /api/docs/pullable`(:id보다 먼저), `PUT /api/docs/:id/status`, DELETE 시 원본 status 원복, `GET /api/docs/:id`에 partner 상세+spec 추가 |
| `server/moves.mjs` | 신규 | `GET/POST /api/moves`, `GET/PUT/DELETE /api/moves/:id` (move/self_use/defect/adjust 4종) |
| `server/index.mjs` | **수정** | `import { moves }` + `app.route('/api', moves)` 한 줄 추가(vouchers 다음, 404 앞) |
| `scripts/import-sales-excel.mjs` | 신규 | 3.6 판매내역 이관(거래처 병합 내장, --dry-run, 재실행 안전) |

> `masters.mjs`·`receipts.mjs`·`reports.mjs`·`ecount.mjs`·`db.mjs`는 **수정하지 않는다**(지불/미지급/재고불러오기는 기존 엔드포인트 재사용).

### [클라 소넷] — `client/src/` 만
| 파일 | 작업 | 내용 |
|---|---|---|
| `client/src/components/VoucherForm.tsx` | **수정** | 4.0 `headerExtra` 슬롯 추가(기존 props 유지) |
| `client/src/components/PullSourceModal.tsx` | 신규 | 4.3 끌어오기 팝업 |
| `client/src/components/PrintDoc.tsx` | 신규 | 4.7 거래명세서/견적서 인쇄 양식 |
| `client/src/screens/DocChainScreen.tsx` | 신규 | `QuoteInput`/`OrderInput`/`PurchaseOrderInput` (입력·수정) |
| `client/src/screens/DocChainList.tsx` | 신규 | `QuoteList`/`OrderList`/`PurchaseOrderList` (조회 + 완료처리) |
| `client/src/screens/MoveScreens.tsx` | 신규 | `StockMove`/`SelfUse`/`Defect`/`StockAdjust` |
| `client/src/screens/PaymentScreen.tsx` | 신규 | `PaymentScreen`/`PayableScreen` (+자체 `PayablesGrid`) |
| `client/src/screens/VoucherScreen.tsx` | **수정** | [주문서/발주서 불러오기] 버튼(PullSourceModal), [인쇄] 버튼(PrintDoc) |
| `client/src/screens/VoucherList.tsx` | **수정**(선택) | 판매조회 행에서 [인쇄] 진입이 필요하면 편집모드 재사용(신규 로직 없음) |
| `client/src/types.ts` | **수정** | 4.8 타입 추가 |
| `client/src/menus.tsx` | **수정** | 4.9 연결 |
| `client/src/styles.css` | **수정** | 4.7 @media print + 기타이동/재고조정 보조 스타일 |

> `App.tsx`·`api.ts`·`format.ts`·`DataGrid`/`CodeHelp`/`Modal`/`Toast`·`ReceiptScreen.tsx`는 수정 불필요.

---

## 6. 자가검증 시나리오 (Phase 1.5 DoD)

1. **전표 체인**: 견적 `카페그래비티 / 00010 10kg @12,000 과세` 저장(status 대기) → 주문입력에서 [견적 불러오기]로 그 견적 선택 저장 →
   견적 status **완료**로 바뀜. 판매입력에서 [주문서 불러오기]로 그 주문 선택 저장 → 주문 status **완료**. 재고현황 `00010` −10, 미수금 +132,000.
   견적/주문은 재고·미수금에 **영향 없음**(원장 미발생) 확인.
2. **역전환**: 방금 판매 전표 삭제 → 주문 status **대기**로 원복. 재고·미수금 원복.
3. **창고이동**: `본사창고→로스팅공장 / 00010 5kg` → 재고현황(전체) 총량 불변, 창고별 재고는 본사 −5·공장 +5(수불부 기타출고/기타입고 2행).
4. **자가사용/불량**: `00010 0.5kg 자가사용`, `00010 0.3kg 폐기` → 재고 −0.8, 수불부 기타출고 2행.
5. **재고조정**: 창고 [재고불러오기] → `00010` 장부수량 표시 → 실사 `4.0` 입력 저장 → 저장 후 `00010` 재고가 **정확히 4.0**(차이만큼 원장 ±).
6. **지불/미지급**: 구매 저장 후 미지급현황에 잔액 → [지불] 저장 → 잔액 감소(수금/미수금과 대칭).
7. **인쇄**: 판매 수정화면 [인쇄] → 거래명세서 A4 미리보기에 회사(공급자)·거래처(공급받는자)·품목표·합계·서명란 표시.
8. **이관**: `node scripts/import-sales-excel.mjs --dry-run` → 매핑표·건수·품목매칭 실패목록 출력. 실제 실행 후 판매조회에 원본 전표번호 그대로 표시, 재실행 시 전량 건너뜀.

→ 위 숫자가 손계산과 일치하면 Phase 1.5 정상.
